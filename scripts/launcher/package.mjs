// Builds the stand-alone launcher package: release/ReaperWar-v<version>/ with the whole game in
// one self-contained game/index.html (opened straight from disk, no server, no install), the
// Play launchers for Windows, macOS and Linux, a README, and release/ReaperWar-v<version>.zip.
// Usage: npm run package:launcher
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `ReaperWar-v${version}`;
const outRoot = path.join(root, 'release');
const pkgDir = path.join(outRoot, name);
const zipPath = path.join(outRoot, `${name}.zip`);

rmSync(pkgDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(pkgDir, { recursive: true });

// 1. The single-file build (vite.launcher.config.ts).
execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.launcher.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, npm_package_version: version, LAUNCHER_OUT_DIR: path.join(pkgDir, 'game') },
});

// 2. It must be self-contained: no script or stylesheet loaded from another file.
const gameHtml = path.join(pkgDir, 'game', 'index.html');
const html = readFileSync(gameHtml, 'utf8');
const external = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(?!data:)([^"]+)"/g)].map((m) => m[1]);
if (external.length) throw new Error(`the launcher build is not self-contained; it loads ${external.join(', ')}`);

// 3. Launchers and README: Windows files with CRLF line ends; the Unix scripts with LF whatever the
// checkout did to them (a CRLF shebang cannot run) and executable.
const template = (file) => readFileSync(path.join(root, 'scripts', 'launcher', 'templates', file), 'utf8').replaceAll('{{VERSION}}', version);
const crlf = (text) => text.replace(/\r?\n/g, '\r\n');
const lf = (text) => text.replace(/\r\n?/g, '\n');
writeFileSync(path.join(pkgDir, 'Play Reaper War (Windows).cmd'), crlf(template('play-windows.cmd')));
const mac = path.join(pkgDir, 'Play Reaper War (macOS).command');
writeFileSync(mac, lf(template('play-macos.command')));
chmodSync(mac, 0o755);
const linux = path.join(pkgDir, 'play-reaper-war-linux.sh');
writeFileSync(linux, lf(template('play-linux.sh')));
chmodSync(linux, 0o755);
writeFileSync(path.join(pkgDir, 'README.txt'), crlf(template('README.txt')));

// 4. The zip keeps the Unix permissions, so the macOS and Linux launchers stay executable. Windows
// cannot store them (and has no zip command): there the folder is the result; the release zip is
// built on Linux (the Launcher package workflow) or macOS.
const done = `Launcher folder: ${path.relative(root, pkgDir)} (play it from there)`;
if (process.platform === 'win32') {
  console.log(`${done}. The release zip is built on Linux or macOS, which keep the macOS and Linux launchers executable.`);
  process.exit(0);
}
try {
  execFileSync('zip', ['-r', '-X', '-q', `${name}.zip`, name], { cwd: outRoot, stdio: 'inherit' });
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  console.log(`${done}. No zip command was found, so no zip was made.`);
  process.exit(0);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(`Launcher package: ${path.relative(root, zipPath)} (${mb(statSync(zipPath).size)}); game/index.html ${mb(statSync(gameHtml).size)}`);
