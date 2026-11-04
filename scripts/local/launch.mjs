#!/usr/bin/env node
/**
 * Local Edition launcher (Windows, macOS, Linux).
 *
 *   node scripts/local/launch.mjs [--port 4180] [--rebuild] [--browser <path>]
 *                                 [--vsync] [--fullscreen] [--no-browser]
 *
 * 1. Builds the game (npm run build) when dist/ is missing or older than the
 *    sources; --rebuild forces it.
 * 2. Serves dist/ on http://127.0.0.1:<port>/ with serve.mjs (this machine
 *    only, cross-origin isolated).
 * 3. Opens Chrome or Edge as an app window on a dedicated profile
 *    (.local-profile/ in the repository, so the GPU flags apply and the
 *    player's own browser profile is untouched), with the GPU blocklist
 *    ignored, GPU rasterisation and zero-copy on, the high-performance GPU
 *    preferred and, unless --vsync, the frame-rate cap removed.
 *
 * Ctrl+C stops the server. Closing the game window stops it too when the
 * launcher started the browser.
 *
 * The decisions (which browser, which flags, whether to build) are pure
 * exported functions with the platform, environment and file system
 * injected, so tests/localEdition.test.ts covers them on any OS.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PORT, HOST, REPO_ROOT, SERVER_ID, SERVER_ID_HEADER, isMainModule, parsePort, startServer } from './serve.mjs';

export { DEFAULT_PORT, HOST, REPO_ROOT };

/** Browser profile directory, relative to the repository root (gitignored). */
export const PROFILE_DIR_NAME = '.local-profile';
/** Vite 7 needs Node 20.19+ on the 20 line and 22.12+ from 22 on. */
export const MIN_NODE = Object.freeze({ 20: 19, 22: 12 });
/** Flags that let Chrome/Edge use the dedicated GPU fully. */
export const GPU_FLAGS = Object.freeze(['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--force-high-performance-gpu']);
/** Flags that remove the vsync frame-rate cap (left out with --vsync). */
export const UNCAPPED_FLAGS = Object.freeze(['--disable-gpu-vsync', '--disable-frame-rate-limit']);
/** Keep a fresh dedicated profile from showing first-run and default-browser prompts. */
export const PROFILE_FLAGS = Object.freeze(['--no-first-run', '--no-default-browser-check']);
/** What a build depends on: dist/ is stale when any of these is newer than dist/index.html. */
export const BUILD_INPUTS = Object.freeze(['src', 'index.html', 'package.json', 'vite.config.ts']);
/** A browser that exits sooner than this handed its window to a copy already running on the same profile. */
export const HANDOFF_MS = 5000;

export const USAGE = `Usage: node scripts/local/launch.mjs [options]
   or: npm run local -- [options]
   or: run-local.cmd [options] (Windows), ./run-local.sh [options] (macOS, Linux)

Builds the game when needed, serves it on http://${HOST}:${DEFAULT_PORT}/ (this machine
only) and opens it in Chrome or Edge as an app window that uses your GPU fully.

Options:
  --port <n>        Port to serve on (default ${DEFAULT_PORT}). Saves are stored per
                    address, so use the same port every time.
  --rebuild         Rebuild even when dist/ is up to date.
  --browser <path>  Chrome, Edge or Chromium executable to use.
  --vsync           Keep the frame rate locked to the monitor's refresh rate
                    (default: uncapped).
  --fullscreen      Start full screen (F11 toggles it).
  --gpu-info        Open chrome://gpu on the game's browser profile, with the same
                    flags, to check which GPU it uses (works while the game runs).
  --no-browser      Only serve, and print the address to open.
  --help            Show this help.

Ctrl+C stops the server; closing the game window stops it too.`;

/** Page --gpu-info opens (Edge maps chrome:// pages to edge://). */
export const GPU_INFO_PAGE = 'chrome://gpu';

/**
 * @typedef {{ port: number, rebuild: boolean, browser?: string, vsync: boolean, fullscreen: boolean, gpuInfo: boolean, noBrowser: boolean, help: boolean }} LaunchOptions
 */

/**
 * Parse launcher arguments. Throws on an unknown option or a bad value.
 * @param {string[]} argv
 * @returns {LaunchOptions}
 */
export function parseLaunchArgs(argv) {
  /** @type {LaunchOptions} */
  const out = { port: DEFAULT_PORT, rebuild: false, browser: undefined, vsync: false, fullscreen: false, gpuInfo: false, noBrowser: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v === '' || (inline === undefined && v.startsWith('--'))) throw new Error(`${name} needs a value`);
      return v;
    };
    const flag = () => {
      if (inline !== undefined) throw new Error(`${name} takes no value`);
      return true;
    };
    switch (name) {
      case '--port':
        out.port = parsePort(value(), false);
        break;
      case '--browser':
        out.browser = value();
        break;
      case '--rebuild':
        out.rebuild = flag();
        break;
      case '--vsync':
        out.vsync = flag();
        break;
      case '--fullscreen':
        out.fullscreen = flag();
        break;
      case '--gpu-info':
        out.gpuInfo = flag();
        break;
      case '--no-browser':
        out.noBrowser = flag();
        break;
      case '--help':
      case '-h':
        out.help = true;
        break;
      default:
        throw new Error(`unknown option ${arg}`);
    }
  }
  return out;
}

/** @param {number} port */
export function appUrl(port) {
  return `http://${HOST}:${port}/?local=1`;
}

/**
 * Case-insensitive environment lookup (Windows variable names are case-insensitive).
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
function envGet(env, name) {
  if (env[name]) return env[name];
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key !== undefined && env[key] ? env[key] : undefined;
}

/** @param {string} platform */
const pathApi = (platform) => (platform === 'win32' ? path.win32 : path.posix);

/** @param {string[]} list */
const unique = (list) => [...new Set(list)];

/** Executable names searched on PATH on Linux and other Unix systems, in order of preference. */
export const LINUX_BROWSER_NAMES = Object.freeze(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']);

/**
 * Directories on PATH.
 * @param {string} platform
 * @param {Record<string, string | undefined>} env
 */
function pathDirs(platform, env) {
  const raw = envGet(env, 'PATH') ?? '';
  return raw.split(platform === 'win32' ? ';' : ':').map((d) => d.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
}

/**
 * Every place a Chromium browser is looked for, most preferred first.
 * Windows: Chrome, then Edge, under Program Files, Program Files (x86) and
 * LOCALAPPDATA. macOS: Google Chrome, Microsoft Edge and Chromium in
 * /Applications (then ~/Applications). Linux: google-chrome,
 * google-chrome-stable, chromium, chromium-browser and microsoft-edge on PATH.
 * @param {string} platform
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function browserCandidates(platform, env) {
  if (platform === 'win32') {
    const w = path.win32;
    const programFiles = envGet(env, 'ProgramFiles') ?? 'C:\\Program Files';
    const programW6432 = envGet(env, 'ProgramW6432');
    const programFilesX86 = envGet(env, 'ProgramFiles(x86)') ?? 'C:\\Program Files (x86)';
    const userProfile = envGet(env, 'USERPROFILE');
    const localAppData = envGet(env, 'LOCALAPPDATA') ?? (userProfile ? w.join(userProfile, 'AppData', 'Local') : undefined);
    const bases = (/** @type {(string | undefined)[]} */ list) => /** @type {string[]} */ (list.filter(Boolean));
    const chrome = bases([programFiles, programW6432, programFilesX86, localAppData]).map((b) => w.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    const edge = bases([programFilesX86, programFiles, programW6432, localAppData]).map((b) => w.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    return unique([...chrome, ...edge]);
  }
  if (platform === 'darwin') {
    const apps = [
      ['Google Chrome.app', 'Google Chrome'],
      ['Microsoft Edge.app', 'Microsoft Edge'],
      ['Chromium.app', 'Chromium'],
    ];
    const home = envGet(env, 'HOME');
    const roots = ['/Applications', ...(home ? [path.posix.join(home, 'Applications')] : [])];
    return unique(roots.flatMap((root) => apps.map(([app, bin]) => path.posix.join(root, app, 'Contents', 'MacOS', bin))));
  }
  const dirs = pathDirs(platform, env);
  return unique(LINUX_BROWSER_NAMES.flatMap((name) => dirs.map((d) => path.posix.join(d, name))));
}

/**
 * Find the browser to launch. An explicit path (--browser) wins: it is used
 * when it exists, or looked up on PATH when it is a bare command name;
 * otherwise undefined is returned rather than falling back to another browser.
 * @param {{ platform: string, env: Record<string, string | undefined>, exists: (p: string) => boolean, explicit?: string }} args
 * @returns {string | undefined}
 */
export function findBrowser({ platform, env, exists, explicit }) {
  if (explicit) {
    const p = pathApi(platform);
    const bare = !explicit.includes('/') && !(platform === 'win32' && explicit.includes('\\'));
    if (!bare || p.isAbsolute(explicit)) return exists(explicit) ? explicit : undefined;
    const names = platform === 'win32' && !/\.exe$/i.test(explicit) ? [explicit, `${explicit}.exe`] : [explicit];
    for (const dir of pathDirs(platform, env)) for (const n of names) if (exists(p.join(dir, n))) return p.join(dir, n);
    return exists(explicit) ? explicit : undefined;
  }
  return browserCandidates(platform, env).find((c) => exists(c));
}

/**
 * Browser command-line arguments for the game window, or with `gpuInfo` for
 * an ordinary window on chrome://gpu (same profile and flags).
 * @param {{ url: string, profileDir: string, vsync?: boolean, fullscreen?: boolean, gpuInfo?: boolean }} args
 * @returns {string[]}
 */
export function buildBrowserArgs({ url, profileDir, vsync = false, fullscreen = false, gpuInfo = false }) {
  const flags = [`--user-data-dir=${profileDir}`, ...PROFILE_FLAGS, ...GPU_FLAGS, ...(vsync ? [] : UNCAPPED_FLAGS), ...(fullscreen ? ['--start-fullscreen'] : [])];
  return gpuInfo ? [...flags, GPU_INFO_PAGE] : [`--app=${url}`, ...flags];
}

/**
 * Decide what the launcher does, without doing it.
 *   'launch'           open `browser` with `args`
 *   'serve-only'       --no-browser: serve and print the address (and, when a
 *                      browser was found, the command line that opens it)
 *   'no-browser-found' no Chrome or Edge in the usual places
 *   'browser-missing'  the --browser path does not exist
 * @param {LaunchOptions} options
 * @param {{ platform: string, env: Record<string, string | undefined>, exists: (p: string) => boolean, repoRoot: string }} host
 * @returns {{ action: 'launch' | 'serve-only' | 'no-browser-found' | 'browser-missing', url: string, profileDir: string, args: string[], browser?: string }}
 */
export function planLaunch(options, { platform, env, exists, repoRoot }) {
  const url = appUrl(options.port);
  const profileDir = pathApi(platform).join(repoRoot, PROFILE_DIR_NAME);
  const args = buildBrowserArgs({ url, profileDir, vsync: options.vsync, fullscreen: options.fullscreen, gpuInfo: options.gpuInfo });
  const browser = findBrowser({ platform, env, exists, explicit: options.browser });
  if (options.noBrowser) return { action: 'serve-only', url, profileDir, args, browser };
  if (!browser) return { action: options.browser ? 'browser-missing' : 'no-browser-found', url, profileDir, args };
  return { action: 'launch', url, profileDir, args, browser };
}

/**
 * How to run "npm run build" on this platform. Under "npm run local" npm's
 * own CLI script is reused; on Windows npm is a .cmd file, which Node can only
 * start through the shell (the arguments are fixed, nothing user-supplied).
 * @param {string} platform
 * @param {Record<string, string | undefined>} env
 * @param {string} nodePath
 */
export function npmBuildCommand(platform, env, nodePath) {
  const execPath = envGet(env, 'npm_execpath');
  if (execPath && /\.[cm]?js$/i.test(execPath)) return { command: nodePath, args: [execPath, 'run', 'build'], shell: false };
  if (platform === 'win32') return { command: 'npm.cmd', args: ['run', 'build'], shell: true };
  return { command: 'npm', args: ['run', 'build'], shell: false };
}

/**
 * Newest modification time (ms) of a file or anything below a directory.
 * @param {string} p
 * @returns {{ mtimeMs: number, path: string }}
 */
export function newestMtime(p) {
  let best = { mtimeMs: 0, path: p };
  if (!existsSync(p)) return best;
  const st = statSync(p);
  if (!st.isDirectory()) return { mtimeMs: st.mtimeMs, path: p };
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    const n = newestMtime(path.join(p, entry.name));
    if (n.mtimeMs > best.mtimeMs) best = n;
  }
  return best;
}

/**
 * Whether dist/ must be (re)built: missing, built for another base path
 * (the GitHub Pages build uses /reaperwar/), or older than the newest
 * file under src/, index.html, package.json or vite.config.ts.
 * @param {string} repoRoot
 * @param {{ rebuild?: boolean }} [options]
 * @returns {{ build: boolean, reason: string }}
 */
export function needsBuild(repoRoot, { rebuild = false } = {}) {
  if (rebuild) return { build: true, reason: '--rebuild' };
  const indexFile = path.join(repoRoot, 'dist', 'index.html');
  if (!existsSync(indexFile)) return { build: true, reason: 'dist/ is missing' };
  if (!/(?:src|href)="\/assets\//.test(readFileSync(indexFile, 'utf8'))) return { build: true, reason: 'dist/ was built for another base path' };
  const builtAt = statSync(indexFile).mtimeMs;
  let newest = { mtimeMs: 0, path: '' };
  for (const input of BUILD_INPUTS) {
    const n = newestMtime(path.join(repoRoot, input));
    if (n.mtimeMs > newest.mtimeMs) newest = n;
  }
  if (newest.mtimeMs > builtAt) return { build: true, reason: `${path.relative(repoRoot, newest.path).split(path.sep).join('/')} changed since the last build` };
  return { build: false, reason: 'dist/ is up to date' };
}

/**
 * Node versions Vite 7 runs on: 20.19+, 22.12+, 23 and later.
 * @param {string} version process.versions.node
 */
export function nodeVersionOk(version) {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  if (major === 20) return minor >= MIN_NODE[20];
  if (major === 22) return minor >= MIN_NODE[22];
  return major >= 23;
}

/**
 * A copy-and-paste command line (arguments with spaces quoted).
 * @param {string} command
 * @param {string[]} args
 */
export function formatCommandLine(command, args) {
  const q = (/** @type {string} */ s) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  return [command, ...args].map(q).join(' ');
}

// ---------------------------------------------------------------- runtime

/** @param {number} port */
async function isOurServer(port) {
  try {
    const res = await fetch(`http://${HOST}:${port}/`, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    return res.headers.get(SERVER_ID_HEADER) === SERVER_ID;
  } catch {
    return false;
  }
}

function runBuild() {
  const cmd = npmBuildCommand(process.platform, process.env, process.execPath);
  return new Promise((resolve) => {
    // The local server serves dist/ at the root, so the build always uses base "/".
    const child = spawn(cmd.command, cmd.args, { cwd: REPO_ROOT, stdio: 'inherit', shell: cmd.shell, env: { ...process.env, VITE_BASE: '/' } });
    child.on('error', (e) => {
      console.error(`Could not run npm: ${e.message}`);
      resolve(false);
    });
    child.on('exit', (code) => resolve(code === 0));
  });
}

/** @param {ReturnType<typeof planLaunch>} plan */
function printManualOpen(plan) {
  console.log(`Open ${plan.url} in Chrome or Edge. For the GPU and frame-rate flags, start the browser like this:`);
  console.log(`  ${formatCommandLine(plan.browser ?? (process.platform === 'win32' ? 'chrome.exe' : 'google-chrome'), plan.args)}`);
}

async function main() {
  if (!nodeVersionOk(process.versions.node)) {
    console.error(`Node.js ${process.versions.node} is too old: the Local Edition needs Node.js 20.19 or newer (22.12 or newer on the 22 line). Download it from https://nodejs.org/en/download`);
    process.exit(1);
  }
  /** @type {LaunchOptions} */
  let opts;
  try {
    opts = parseLaunchArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`launch.mjs: ${/** @type {Error} */ (e).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  console.log('Reaper War Simulator - Local Edition');
  const check = needsBuild(REPO_ROOT, { rebuild: opts.rebuild });
  if (check.build) {
    console.log(`Building the game (${check.reason}). This takes a minute the first time...`);
    if (!(await runBuild()) || !existsSync(path.join(REPO_ROOT, 'dist', 'index.html'))) {
      console.error('The build failed; see the messages above.');
      process.exit(1);
    }
  } else {
    console.log('Build is up to date.');
  }

  const plan = planLaunch(opts, { platform: process.platform, env: process.env, exists: existsSync, repoRoot: REPO_ROOT });
  /** @type {Awaited<ReturnType<typeof startServer>>} */
  let running;
  try {
    running = await startServer({ root: path.join(REPO_ROOT, 'dist'), port: opts.port });
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException} */ (e);
    if (err.code !== 'EADDRINUSE') throw err;
    if (await isOurServer(opts.port)) {
      console.log(`The Local Edition is already being served at ${plan.url}`);
      if (plan.action === 'launch' && plan.browser) {
        spawn(plan.browser, plan.args, { stdio: 'ignore', detached: true }).on('error', () => printManualOpen(plan)).unref();
        console.log(opts.gpuInfo ? `Opened ${GPU_INFO_PAGE} on the game's browser profile.` : 'Opened another game window.');
      } else {
        console.log(`Open ${plan.url}`);
      }
      return;
    }
    console.error(`Port ${opts.port} on ${HOST} is in use by another program. Close it, or pass --port <n> (saves are kept per port, so keep using the one you pick).`);
    process.exit(1);
  }

  console.log(`Serving dist/ at ${plan.url} (this machine only, cross-origin isolated).`);
  let closing = false;
  /** @param {string} message */
  const shutdown = async (message) => {
    if (closing) return;
    closing = true;
    console.log(message);
    await Promise.race([running.close(), new Promise((r) => setTimeout(r, 2000))]);
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try {
      process.on(sig, () => void shutdown('Stopping the Local Edition server.'));
    } catch {
      /* signal not supported on this platform */
    }
  }

  if (plan.action === 'serve-only') {
    console.log('--no-browser: not opening a window.');
    printManualOpen(plan);
    console.log('Press Ctrl+C to stop the server.');
    return;
  }
  if (plan.action === 'browser-missing') {
    console.error(`No browser at --browser ${opts.browser}.`);
    printManualOpen(plan);
    console.log('Press Ctrl+C to stop the server.');
    return;
  }
  if (plan.action === 'no-browser-found') {
    console.log('No Chrome or Edge found in the usual places. Install Google Chrome or Microsoft Edge, or pass --browser <path to chrome or msedge>.');
    printManualOpen(plan);
    console.log('Press Ctrl+C to stop the server.');
    return;
  }

  console.log(opts.gpuInfo ? `Opening ${GPU_INFO_PAGE} on the game's browser profile: ${plan.browser}` : `Opening the game window: ${plan.browser}`);
  console.log(`  ${plan.args.join(' ')}`);
  console.log(
    process.platform === 'darwin'
      ? 'Quit the browser (Cmd+Q) or press Ctrl+C here to stop the server.'
      : 'Close the browser window or press Ctrl+C here to stop the server.',
  );
  const started = Date.now();
  let failed = false;
  const child = spawn(/** @type {string} */ (plan.browser), plan.args, { stdio: 'ignore' });
  child.on('error', (e) => {
    failed = true;
    console.error(`Could not start the browser: ${e.message}`);
    printManualOpen(plan);
    console.log('Press Ctrl+C to stop the server.');
  });
  child.on('exit', (code) => {
    if (closing || failed) return;
    if (Date.now() - started < HANDOFF_MS) {
      if (code === 0) {
        console.log('The browser handed the window to a copy of itself that was already running on the Local Edition profile. The server keeps running; press Ctrl+C to stop it.');
      } else {
        console.error(`The browser exited straight away (exit code ${code}).`);
        printManualOpen(plan);
        console.log('Press Ctrl+C to stop the server.');
      }
      return;
    }
    void shutdown('Game window closed; stopping the Local Edition server.');
  });
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exit(1);
  });
}
