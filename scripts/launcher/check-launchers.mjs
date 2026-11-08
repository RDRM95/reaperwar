// Runs this system's Play launcher the way a player does and checks what it hands the browser.
//
// 1. Unzips the release zip with the system's own tool (Expand-Archive on Windows, like Explorer;
//    ditto on macOS, like Archive Utility; unzip on Linux) into a folder whose name has spaces,
//    accents, Cyrillic, an apostrophe and # % & ! ( ) - plus ? and \ on macOS and Linux.
// 2. Starts the launcher (on Windows through the shell, like a double-click) with a stand-in browser
//    (REAPERWAR_BROWSER) that records its arguments, and checks: the game's own browser profile, the
//    GPU flags, the uncapped frame rate (and that --vsync keeps the cap), and that --app is a
//    plain-ASCII file:// address of game/index.html (Chromium ignores a non-ASCII --app).
//    On Linux it also runs the Flathub fallback with a stand-in flatpak and no browser on PATH.
// 3. Opens that exact address in a real browser (Edge on Windows, Playwright's Chromium elsewhere)
//    and checks the menu says Local Edition, with no page errors and no endless animation.
//
// Usage: node scripts/launcher/check-launchers.mjs [path/to/ReaperWar-v<version>.zip]
// (default: release/ReaperWar-v<version>.zip from `npm run package:launcher`).
import { chromium } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const zip = path.resolve(process.argv[2] ?? path.join(root, 'release', `ReaperWar-v${version}.zip`));
const win = process.platform === 'win32';
const mac = process.platform === 'darwin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  throw new Error(`launcher check (${process.platform}): ${msg}`);
};
if (!existsSync(zip)) fail(`no zip at ${zip}; run npm run package:launcher first`);

const work = mkdtempSync(path.join(os.tmpdir(), 'rw-launcher-'));
const tricky = win ? "Zoë & Co's (1) #1 100% ! Игры" : "Zoë & Co's (1) #1 100% ! ?x \\ Игры";
const dest = path.join(work, tricky);
mkdirSync(dest, { recursive: true });

/** Windows PowerShell 5.1 (what the launcher itself calls), with every value passed in the environment. */
const powershell = (script, env = {}) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

// 1. Unzip the way players do.
if (win) powershell('$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:RW_ZIP -DestinationPath $env:RW_DEST -Force', { RW_ZIP: zip, RW_DEST: dest });
else if (mac) execFileSync('ditto', ['-x', '-k', zip, dest]);
else execFileSync('unzip', ['-q', zip, '-d', dest]);
const pkg = path.join(dest, path.basename(zip, '.zip'));
const game = path.join(pkg, 'game', 'index.html');
if (!existsSync(game)) fail(`the zip did not unpack to ${game}`);
const launcher = path.join(pkg, win ? 'Play Reaper War (Windows).cmd' : mac ? 'Play Reaper War (macOS).command' : 'play-reaper-war-linux.sh');
if (!win && (statSync(launcher).mode & 0o111) === 0) fail(`${path.basename(launcher)} lost its executable bit in the zip`);

// 2. A stand-in browser that writes its arguments, one per line, to $REAPERWAR_STUB_OUT.
let stub;
if (win) {
  stub = path.join(work, 'stub-browser.exe');
  const cs = path.join(work, 'stub-browser.cs');
  writeFileSync(
    cs,
    'using System; using System.IO; using System.Text;\n' +
      'public static class StubBrowser { public static void Main(string[] args) {\n' +
      '  string o = Environment.GetEnvironmentVariable("REAPERWAR_STUB_OUT");\n' +
      '  File.WriteAllText(o + ".tmp", string.Join("\\n", args) + "\\n", new UTF8Encoding(false));\n' +
      '  File.Move(o + ".tmp", o);\n} }\n',
  );
  powershell('$ErrorActionPreference = "Stop"; Add-Type -Path $env:RW_CS -OutputAssembly $env:RW_EXE -OutputType ConsoleApplication', { RW_CS: cs, RW_EXE: stub });
} else {
  stub = path.join(work, 'stub-browser');
  writeFileSync(stub, '#!/bin/sh\n: > "$REAPERWAR_STUB_OUT.tmp"\nfor a in "$@"; do printf \'%s\\n\' "$a" >> "$REAPERWAR_STUB_OUT.tmp"; done\nmv "$REAPERWAR_STUB_OUT.tmp" "$REAPERWAR_STUB_OUT"\n');
  chmodSync(stub, 0o755);
}

const home = path.join(work, 'home');
const xdg = path.join(work, 'xdg');
mkdirSync(home, { recursive: true });
const profile = win
  ? `${process.env.LOCALAPPDATA}\\ReaperWarSimulator\\browser-profile`
  : mac
    ? path.join(home, 'Library', 'Application Support', 'ReaperWarSimulator', 'browser-profile')
    : path.join(xdg, 'ReaperWarSimulator', 'browser-profile');

/** Starts the launcher and returns the arguments the stand-in received. */
async function runLauncher(label, extra = [], envOver = {}) {
  const out = path.join(work, `args-${label}.txt`);
  const env = { ...process.env, REAPERWAR_BROWSER: stub, REAPERWAR_STUB_OUT: out, ...(win ? {} : { HOME: home, XDG_DATA_HOME: xdg }), ...envOver };
  if (win) {
    // Start-Process opens the .cmd through the shell, exactly like a double-click in Explorer.
    powershell(
      '$ErrorActionPreference = "Stop"; $a = @{ FilePath = $env:RW_LAUNCHER; PassThru = $true }; if ($env:RW_ARGS) { $a.ArgumentList = $env:RW_ARGS }; ' +
        '$p = Start-Process @a; $null = $p.Handle; if (-not $p.WaitForExit(90000)) { Stop-Process -Id $p.Id -Force; throw "the launcher did not finish (it is probably waiting at an error message)" }; ' +
        'if ($p.ExitCode -ne 0) { throw "the launcher exited with $($p.ExitCode)" }',
      { ...env, RW_LAUNCHER: launcher, RW_ARGS: extra.join(' ') },
    );
  } else {
    const r = spawnSync(launcher, extra, { env, encoding: 'utf8', timeout: 90_000 });
    if (r.error) fail(`${label}: could not start ${path.basename(launcher)}: ${r.error.message}`);
    if (r.status !== 0) fail(`${label}: ${path.basename(launcher)} exited with ${r.status}:\n${r.stdout}${r.stderr}`);
  }
  // The browser is started asynchronously (start on Windows, setsid on Linux).
  for (let i = 0; i < 300 && !existsSync(out); i++) await sleep(100);
  if (!existsSync(out)) fail(`${label}: the launcher never started the browser`);
  return readFileSync(out, 'utf8').split('\n').filter((a) => a !== '');
}

// realpath also expands Windows 8.3 short names (C:\Users\RUNNER~1\...), which TEMP can contain.
const samePath = (a, b) => (win ? realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase() : realpathSync(a) === realpathSync(b));
const GPU_FLAGS = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--no-first-run', '--no-default-browser-check', ...(win || mac ? ['--force-high-performance-gpu'] : [])];
const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

/** Checks one recorded command line and returns its --app address. */
function checkArgs(label, args, { vsync, profileDir = profile }) {
  const has = (a) => args.includes(a);
  if (!has(`--user-data-dir=${profileDir}`)) fail(`${label}: expected --user-data-dir=${profileDir}, got:\n${args.join('\n')}`);
  for (const f of GPU_FLAGS) if (!has(f)) fail(`${label}: missing ${f}`);
  for (const f of UNCAPPED) if (has(f) === vsync) fail(`${label}: ${f} should be ${vsync ? 'absent with --vsync' : 'present'}`);
  const app = args.filter((a) => a.startsWith('--app=')).map((a) => a.slice('--app='.length));
  if (app.length !== 1) fail(`${label}: expected one --app, got ${app.length}`);
  const url = app[0];
  if (!/^[\x21-\x7e]+$/.test(url)) fail(`${label}: --app is not plain ASCII, so Chromium would ignore it: ${url}`);
  if (!url.startsWith('file:')) fail(`${label}: --app is not a file URL: ${url}`);
  if (!samePath(fileURLToPath(url), game)) fail(`${label}: --app points at ${fileURLToPath(url)}, not ${game}`);
  return url;
}

const first = await runLauncher('default');
const url = checkArgs('default', first, { vsync: false });
checkArgs('--vsync', await runLauncher('vsync', ['--vsync']), { vsync: true });
const checked = ['default flags', '--vsync'];

if (!win && !mac) {
  // The Flathub fallback: no browser on PATH, only flatpak with com.google.Chrome installed.
  const bin = path.join(work, 'flatpak-bin');
  mkdirSync(bin);
  for (const tool of ['dirname', 'od', 'awk', 'sed', 'setsid', 'mkdir', 'mv', 'basename', 'sleep', 'tail']) {
    const at = execFileSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim();
    symlinkSync(at, path.join(bin, tool));
  }
  writeFileSync(
    path.join(bin, 'flatpak'),
    '#!/bin/sh\ncase "$1" in\n  info) [ "$2" = com.google.Chrome ] ;;\n  run) shift; exec "$REAPERWAR_STUB" "$@" ;;\n  *) exit 1 ;;\nesac\n',
  );
  chmodSync(path.join(bin, 'flatpak'), 0o755);
  const args = await runLauncher('flatpak', [], { PATH: bin, REAPERWAR_BROWSER: '', REAPERWAR_STUB: stub });
  const i = args.indexOf('com.google.Chrome');
  if (i < 0) fail(`flatpak: com.google.Chrome was not run:\n${args.join('\n')}`);
  const grants = args.slice(0, i);
  // flatpak reads "\" as an escape and ends the path at the first ":": the launcher escapes both (this folder has a \).
  const fsEscaped = (p) => p.replace(/[\\:]/g, '\\$&');
  if (!grants.includes(`--filesystem=${fsEscaped(pkg)}:ro`) || !grants.includes(`--filesystem=${fsEscaped(profile)}`)) fail(`flatpak: the sandbox was not given the game folder and the profile (escaped for flatpak):\n${grants.join('\n')}`);
  if (checkArgs('flatpak', args.slice(i + 1), { vsync: false }) !== url) fail('flatpak: a different --app address');
  if (!existsSync(profile)) fail('flatpak: the profile folder was not created for the sandbox');
  checked.push('Flathub fallback');
}

// 2b. With RW_REAL_BROWSER=1 on Windows or macOS (the CI runners have Edge and Chrome): the launcher's own
// browser lookup, with no override, must start a real Edge or Chrome on the game's profile and address.
if (process.env.RW_REAL_BROWSER === '1' && (win || mac)) {
  const env = { ...process.env, ...(mac ? { HOME: home } : {}) };
  delete env.REAPERWAR_BROWSER;
  if (win) {
    powershell(
      '$ErrorActionPreference = "Stop"; $p = Start-Process -FilePath $env:RW_LAUNCHER -PassThru; $null = $p.Handle; ' +
        'if (-not $p.WaitForExit(90000)) { Stop-Process -Id $p.Id -Force; throw "the launcher did not finish" }; if ($p.ExitCode -ne 0) { throw "the launcher exited with $($p.ExitCode)" }',
      { ...env, RW_LAUNCHER: launcher },
    );
  } else {
    const r = spawnSync(launcher, [], { env, encoding: 'utf8', timeout: 90_000 });
    if (r.status !== 0) fail(`real browser: ${path.basename(launcher)} exited with ${r.status}:\n${r.stdout}${r.stderr}`);
  }
  /** Command lines of running processes: [pid, command line]. */
  const processes = () =>
    win
      ? JSON.parse(powershell('$a = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; cmd = $_.CommandLine } }); ConvertTo-Json -InputObject $a -Compress') || '[]').map((x) => [x.pid, x.cmd])
      : execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter(Boolean).map((l) => { const m = /^\s*(\d+)\s+(.*)$/.exec(l); return [Number(m[1]), m[2]]; });
  let mine = [];
  for (let i = 0; i < 60 && !mine.some(([, c]) => c.includes(url) && !/--type=/.test(c)); i++) {
    await sleep(500);
    mine = processes().filter(([, c]) => c.includes(profile));
  }
  const main = mine.find(([, c]) => c.includes(url) && !/--type=/.test(c));
  for (const [pid] of mine) { try { process.kill(pid); } catch { /* already gone */ } }
  if (!main) fail(`real browser: no Edge or Chrome started with the game's profile and address within 30 s (found ${mine.length} process(es) on the profile)`);
  checked.push(`real browser: ${/msedge|Microsoft Edge/i.test(main[1]) ? 'Edge' : /chrome/i.test(main[1]) ? 'Chrome' : 'a browser'} started by the launcher's own lookup`);
}

// 3. The exact address in a real browser.
const browser = await chromium.launch(win ? { channel: 'msedge' } : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(url);
  await page.waitForSelector('[data-menu="quick-battle"]', { timeout: 60_000 });
  const tag = page.locator('[data-local-edition]');
  if ((await tag.count()) === 0 || !/Local Edition/.test(await tag.first().innerText())) fail('the menu does not show the Local Edition tag');
  await page.waitForTimeout(1500);
  const endless = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length);
  if (endless) fail(`${endless} endless animation(s) still run on the menu; with the frame-rate cap off they keep the GPU busy`);
  if (errors.length) fail(errors.join('\n'));
} finally {
  await browser.close();
}

const ok = `Launcher check passed on ${process.platform}: unzipped into "${tricky}", ran ${path.basename(launcher)} (${checked.join(', ')}); --app = ${url}; ${win ? 'Edge' : 'Chromium'} opened it on the Local Edition menu.`;
if (process.env.RW_KEEP) console.log(`(kept ${work})`);
else rmSync(work, { recursive: true, force: true });
console.log(ok);
