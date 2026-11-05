import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { request, type IncomingHttpHeaders } from 'node:http';
import { connect } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentTypeFor, HOST, ISOLATION_HEADERS, resolveRequest, startServer, type RunningServer } from '../scripts/local/serve.mjs';
import {
  appUrl,
  browserCandidates,
  buildBrowserArgs,
  findBrowser,
  GPU_FLAGS,
  needsBuild,
  nodeVersionOk,
  needsInstall,
  npmCommand,
  parseLaunchArgs,
  planLaunch,
  UNCAPPED_FLAGS,
  formatCommandLine,
  manualOpenCommand,
} from '../scripts/local/launch.mjs';
import { DEFAULT_PREFERENCES } from '@/core/storage';
import type { GraphicsSettings } from '@/rendering/battleView';
import { BASE_EFFECT_BUDGETS, effectBudgets } from '@/rendering/effects';
import { FIGHTER_POINT_DISTANCE, FIGHTER_REDUCED_DISTANCE, lodLevel, POINT_FACTOR, REDUCED_FACTOR } from '@/rendering/lod';
import { isLocalEdition, localEditionDetails, localEditionStatus, startupGraphics } from '@/rendering/localHardware';
import { FpsMeter, pixelRatioFor, presetFor, QUALITY_ORDER, QUALITY_PRESETS, withQuality } from '@/rendering/quality';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRET = 'TOP SECRET: outside the served root';

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** A raw HTTP request: the path is sent exactly as given (no client-side normalisation). */
function send(port: number, path: string, method = 'GET', headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path, method, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Local Edition server (scripts/local/serve.mjs)', () => {
  let tmp: string;
  let dist: string;
  let secretPath: string;
  let running: RunningServer;
  let symlinked = false;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'reaperwar-serve-'));
    dist = join(tmp, 'dist');
    secretPath = join(tmp, 'secret.txt');
    writeFileSync(secretPath, SECRET);
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>fixture shell</title><script type="module" src="/assets/app-AbCdEf12.js"></script>');
    writeFileSync(join(dist, 'assets', 'app-AbCdEf12.js'), 'export const ok = true;');
    writeFileSync(join(dist, 'assets', 'style-AbCdEf12.css'), 'body{}');
    writeFileSync(join(dist, 'assets', 'sim.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    writeFileSync(join(dist, 'assets', 'ship.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(dist, 'assets', 'font.woff2'), Buffer.from('wOF2'));
    writeFileSync(join(dist, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(join(dist, 'data.json'), '{"ok":true}');
    try {
      symlinkSync(secretPath, join(dist, 'leak.txt'));
      symlinked = true;
    } catch {
      /* symlinks need privileges on some systems: that check is skipped */
    }
    running = await startServer({ root: dist, port: 0 });
  });

  afterAll(async () => {
    await running?.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('binds 127.0.0.1 only', async () => {
    expect(running.host).toBe('127.0.0.1');
    expect((running.server.address() as { address: string }).address).toBe('127.0.0.1');
    expect(running.url).toBe(`http://127.0.0.1:${running.port}/`);
    // Another interface of this machine must not reach it.
    const external = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && !i.internal && (i.family === 'IPv4' || (i.family as unknown) === 4))?.address;
    if (!external) return;
    const outcome = await new Promise<string>((resolve) => {
      const s = connect({ host: external, port: running.port }, () => {
        s.destroy();
        resolve('connected');
      });
      s.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
      s.setTimeout(2000, () => {
        s.destroy();
        resolve('ETIMEDOUT');
      });
    });
    expect(outcome).not.toBe('connected');
  });

  it('serves index.html for "/" with both isolation headers and no-cache', async () => {
    const r = await send(running.port, '/');
    expect(r.status).toBe(200);
    expect(r.body).toContain('fixture shell');
    expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(r.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(r.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(ISOLATION_HEADERS['Cross-Origin-Embedder-Policy']).toBe('require-corp');
  });

  it('sends the right content type for each kind of asset, with the isolation headers', async () => {
    const expected: [string, string][] = [
      ['/index.html', 'text/html; charset=utf-8'],
      ['/assets/app-AbCdEf12.js', 'text/javascript; charset=utf-8'],
      ['/assets/style-AbCdEf12.css', 'text/css; charset=utf-8'],
      ['/assets/sim.wasm', 'application/wasm'],
      ['/assets/ship.png', 'image/png'],
      ['/icon.svg', 'image/svg+xml'],
      ['/assets/font.woff2', 'font/woff2'],
      ['/data.json', 'application/json; charset=utf-8'],
    ];
    for (const [path, type] of expected) {
      const r = await send(running.port, path);
      expect(r.status, path).toBe(200);
      expect(r.headers['content-type'], path).toBe(type);
      expect(r.headers['cross-origin-opener-policy'], path).toBe('same-origin');
      expect(r.headers['cross-origin-embedder-policy'], path).toBe('require-corp');
    }
    // Hashed build output may be cached for good; everything else revalidates.
    expect((await send(running.port, '/assets/app-AbCdEf12.js')).headers['cache-control']).toContain('immutable');
    expect((await send(running.port, '/data.json')).headers['cache-control']).toBe('no-cache');
    expect(contentTypeFor('x/y.MJS')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('x/unknown.xyz')).toBe('application/octet-stream');
  });

  it('answers unknown paths with the app shell, and unknown assets with 404', async () => {
    const shell = await send(running.port, '/campaign/galaxy?week=3');
    expect(shell.status).toBe(200);
    expect(shell.body).toContain('fixture shell');
    expect(shell.headers['cache-control']).toBe('no-cache');
    const missing = await send(running.port, '/assets/missing-AbCdEf12.js');
    expect(missing.status).toBe(404);
    expect(missing.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(missing.body).not.toContain('fixture shell');
  });

  it('supports HEAD and conditional requests, and refuses other methods', async () => {
    const head = await send(running.port, '/assets/app-AbCdEf12.js', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(Number(head.headers['content-length'])).toBe('export const ok = true;'.length);
    const again = await send(running.port, '/assets/app-AbCdEf12.js', 'GET', { 'If-None-Match': String(head.headers.etag) });
    expect(again.status).toBe(304);
    const post = await send(running.port, '/', 'POST');
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe('GET, HEAD');
  });

  it('refuses path traversal: plain and encoded "..", backslashes, absolute and drive paths, NUL bytes', async () => {
    const secretUrlPath = secretPath.split(sep).join('/');
    const attempts = [
      '/../secret.txt',
      '/../../../../../../etc/passwd',
      '/assets/../../secret.txt',
      '/%2e%2e/secret.txt',
      '/%2E%2E/secret.txt',
      '/.%2e/secret.txt',
      '/..%2fsecret.txt',
      '/..%2Fsecret.txt',
      '/%2e%2e%2fsecret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
      '/..%5csecret.txt',
      '/..\\secret.txt',
      '/%5c..%5csecret.txt',
      '//etc/passwd',
      '/%2Fetc%2Fpasswd',
      `/${secretUrlPath}`,
      `/${encodeURIComponent(secretPath)}`,
      '/C:/Windows/win.ini',
      '/C%3A%5CWindows%5Cwin.ini',
      '/index.html::$DATA',
      '/%00secret.txt',
      '/%E0%A4%A',
      `http://127.0.0.1:${running.port}/../secret.txt`,
    ];
    for (const path of attempts) {
      const r = await send(running.port, path);
      expect([400, 403], path).toContain(r.status);
      expect(r.body, path).not.toContain(SECRET);
      expect(r.body, path).not.toMatch(/root:.*:0:0:/);
      expect(r.headers['cross-origin-embedder-policy'], path).toBe('require-corp');
    }
    // Double encoding decodes once to a literal (missing) name inside root: a 404, never the file.
    const doubled = await send(running.port, '/%252e%252e/secret.txt');
    expect(doubled.status).toBe(404);
    expect(doubled.body).not.toContain(SECRET);
  });

  it('does not follow a symbolic link out of the served root', async () => {
    if (!symlinked) return;
    const r = await send(running.port, '/leak.txt');
    expect(r.status).toBe(403);
    expect(r.body).not.toContain(SECRET);
  });

  it('resolves request paths to files that always stay inside the root (pure check)', () => {
    const root = join(tmp, 'dist');
    const inside = (p: string) => {
      const r = resolveRequest(root, p);
      return r.status === 200 && !relative(root, r.file).startsWith('..') ? r : undefined;
    };
    expect(inside('/')?.file).toBe(root);
    expect(inside('/assets/app-AbCdEf12.js')?.assetLike).toBe(true);
    expect(inside('/campaign/galaxy')?.assetLike).toBe(false);
    expect(inside('/./index.html')?.file).toBe(join(root, 'index.html'));
    for (const p of ['/../x', '/%2e%2e/x', '/a/..%2f..%2fx', '//x', '/C:/x', '/a\\..\\x', '/CON', '/aux.txt']) expect(resolveRequest(root, p).status, p).toBe(403);
    for (const p of ['/%00', '/%E0%A4%A', 'x', '*', undefined]) expect(resolveRequest(root, p).status, String(p)).toBe(400);
  });

  it('runs as a command: --port 0 picks a free port and prints its address first', async () => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'local', 'serve.mjs'), '--port', '0', '--root', dist], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let out = '';
        const timer = setTimeout(() => reject(new Error(`serve.mjs printed: ${out}`)), 10_000);
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString();
          const m = /^Local Edition server: (http:\/\/127\.0\.0\.1:(\d+)\/)/m.exec(out);
          if (m) {
            clearTimeout(timer);
            resolve(m[1]);
          }
        });
        child.on('exit', (code) => reject(new Error(`serve.mjs exited (${code}): ${out}`)));
      });
      const port = Number(new URL(url).port);
      expect(port).toBeGreaterThan(0);
      const r = await send(port, '/');
      expect(r.status).toBe(200);
      expect(r.headers['cross-origin-opener-policy']).toBe('same-origin');
    } finally {
      child.kill();
    }
  });
});

describe('Local Edition launcher: finding a browser (scripts/local/launch.mjs)', () => {
  const fakeFs = (...paths: string[]) => {
    const set = new Set(paths);
    return (p: string) => set.has(p);
  };

  describe('Windows', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\Shepard\\AppData\\Local',
      PATH: 'C:\\Windows\\system32;C:\\Tools',
    };
    const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const chrome86 = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
    const chromeUser = 'C:\\Users\\Shepard\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const edge64 = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';

    it('looks for Chrome, then Edge, under Program Files, Program Files (x86) and LOCALAPPDATA', () => {
      const c = browserCandidates('win32', env);
      for (const p of [chrome, chrome86, chromeUser, edge, edge64]) expect(c).toContain(p);
      expect(c.indexOf(chromeUser)).toBeLessThan(c.indexOf(edge));
    });
    it('finds Edge on a stock Windows install', () => {
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs(edge) })).toBe(edge);
    });
    it('prefers Chrome over Edge, wherever Chrome is installed', () => {
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs(edge, chrome) })).toBe(chrome);
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs(edge, chrome86) })).toBe(chrome86);
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs(edge, chromeUser) })).toBe(chromeUser);
    });
    it('reads environment variable names case-insensitively and has defaults', () => {
      expect(findBrowser({ platform: 'win32', env: { PROGRAMFILES: 'D:\\Apps', localappdata: 'E:\\Local' }, exists: fakeFs('E:\\Local\\Google\\Chrome\\Application\\chrome.exe') })).toBe('E:\\Local\\Google\\Chrome\\Application\\chrome.exe');
      expect(findBrowser({ platform: 'win32', env: {}, exists: fakeFs(edge) })).toBe(edge);
    });
    it('returns nothing when neither is installed', () => {
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs() })).toBeUndefined();
    });
    it('lets an explicit --browser win, as a path or a name on PATH', () => {
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs(chrome, 'D:\\Thorium\\thorium.exe'), explicit: 'D:\\Thorium\\thorium.exe' })).toBe('D:\\Thorium\\thorium.exe');
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs(chrome, 'C:\\Tools\\brave.exe'), explicit: 'brave' })).toBe('C:\\Tools\\brave.exe');
      expect(findBrowser({ platform: 'win32', env, exists: fakeFs(chrome), explicit: 'D:\\Nope\\chrome.exe' })).toBeUndefined();
    });
  });

  describe('macOS', () => {
    const env = { HOME: '/Users/shepard', PATH: '/usr/bin:/bin' };
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    const chromium = '/Applications/Chromium.app/Contents/MacOS/Chromium';

    it('looks in /Applications for Google Chrome, Microsoft Edge and Chromium, in that order', () => {
      expect(findBrowser({ platform: 'darwin', env, exists: fakeFs(chrome, edge, chromium) })).toBe(chrome);
      expect(findBrowser({ platform: 'darwin', env, exists: fakeFs(edge, chromium) })).toBe(edge);
      expect(findBrowser({ platform: 'darwin', env, exists: fakeFs(chromium) })).toBe(chromium);
    });
    it('also finds a browser in ~/Applications', () => {
      const user = '/Users/shepard/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      expect(findBrowser({ platform: 'darwin', env, exists: fakeFs(user) })).toBe(user);
    });
    it('returns nothing without one', () => {
      expect(findBrowser({ platform: 'darwin', env, exists: fakeFs('/usr/bin/safari') })).toBeUndefined();
    });
  });

  describe('Linux', () => {
    const env = { PATH: '/usr/local/bin:/usr/bin:/snap/bin', HOME: '/home/shepard' };

    it('searches PATH for google-chrome, google-chrome-stable, chromium, chromium-browser and microsoft-edge', () => {
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/bin/google-chrome') })).toBe('/usr/bin/google-chrome');
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/bin/google-chrome-stable') })).toBe('/usr/bin/google-chrome-stable');
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/snap/bin/chromium') })).toBe('/snap/bin/chromium');
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/bin/chromium-browser') })).toBe('/usr/bin/chromium-browser');
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/bin/microsoft-edge') })).toBe('/usr/bin/microsoft-edge');
    });
    it('prefers Chrome over Chromium even when Chromium comes first on PATH', () => {
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/local/bin/chromium', '/snap/bin/google-chrome') })).toBe('/snap/bin/google-chrome');
    });
    it('returns nothing when PATH has no Chromium browser', () => {
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/bin/firefox') })).toBeUndefined();
      expect(findBrowser({ platform: 'linux', env: {}, exists: fakeFs('/usr/bin/google-chrome') })).toBeUndefined();
    });
    it('lets an explicit --browser win', () => {
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/bin/google-chrome', '/opt/brave/brave'), explicit: '/opt/brave/brave' })).toBe('/opt/brave/brave');
      expect(findBrowser({ platform: 'linux', env, exists: fakeFs('/usr/bin/google-chrome', '/usr/bin/vivaldi'), explicit: 'vivaldi' })).toBe('/usr/bin/vivaldi');
    });
  });
});

describe('Local Edition launcher: arguments and plan', () => {
  const host = { platform: 'linux', env: { PATH: '/usr/bin' }, exists: (p: string) => p === '/usr/bin/google-chrome', repoRoot: '/home/shepard/reaperwar' };

  it('opens an app window on the dedicated profile with the GPU flags and no frame-rate cap by default', () => {
    const plan = planLaunch(parseLaunchArgs([]), host);
    expect(plan.action).toBe('launch');
    expect(plan.browser).toBe('/usr/bin/google-chrome');
    expect(plan.url).toBe('http://127.0.0.1:4180/?local=1');
    expect(plan.args).toContain('--app=http://127.0.0.1:4180/?local=1');
    expect(plan.args).toContain('--user-data-dir=/home/shepard/reaperwar/.local-profile');
    for (const f of ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--force-high-performance-gpu']) expect(plan.args).toContain(f);
    expect(plan.args).toContain('--disable-gpu-vsync');
    expect(plan.args).toContain('--disable-frame-rate-limit');
    expect(plan.args).not.toContain('--start-fullscreen');
  });

  it('--vsync keeps the frame-rate cap', () => {
    const args = planLaunch(parseLaunchArgs(['--vsync']), host).args;
    for (const f of UNCAPPED_FLAGS) expect(args).not.toContain(f);
    for (const f of GPU_FLAGS) expect(args).toContain(f);
  });

  it('--fullscreen starts full screen', () => {
    expect(planLaunch(parseLaunchArgs(['--fullscreen']), host).args).toContain('--start-fullscreen');
    expect(buildBrowserArgs({ url: appUrl(4180), profileDir: '/p', vsync: true, fullscreen: true })).toEqual([
      '--app=http://127.0.0.1:4180/?local=1',
      '--user-data-dir=/p',
      '--no-first-run',
      '--no-default-browser-check',
      ...GPU_FLAGS,
      '--start-fullscreen',
    ]);
  });

  it('--gpu-info opens chrome://gpu on the same profile with the same flags instead of the game', () => {
    const args = planLaunch(parseLaunchArgs(['--gpu-info']), host).args;
    expect(args[args.length - 1]).toBe('chrome://gpu');
    expect(args.some((a) => a.startsWith('--app='))).toBe(false);
    expect(args).toContain('--user-data-dir=/home/shepard/reaperwar/.local-profile');
    for (const f of [...GPU_FLAGS, ...UNCAPPED_FLAGS]) expect(args).toContain(f);
  });

  it('--no-browser only serves', () => {
    const plan = planLaunch(parseLaunchArgs(['--no-browser', '--port', '4181']), host);
    expect(plan.action).toBe('serve-only');
    expect(plan.url).toBe('http://127.0.0.1:4181/?local=1');
  });

  it('reports a missing browser instead of guessing', () => {
    expect(planLaunch(parseLaunchArgs([]), { ...host, exists: () => false }).action).toBe('no-browser-found');
    expect(planLaunch(parseLaunchArgs(['--browser', '/opt/none/chrome']), host).action).toBe('browser-missing');
  });

  it('builds a Windows profile path with backslashes', () => {
    const plan = planLaunch(parseLaunchArgs(['--port=4190']), { platform: 'win32', env: {}, exists: (p) => p.endsWith('msedge.exe'), repoRoot: 'C:\\Games\\reaperwar' });
    expect(plan.browser).toBe('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
    expect(plan.args).toContain('--user-data-dir=C:\\Games\\reaperwar\\.local-profile');
    expect(plan.args).toContain('--app=http://127.0.0.1:4190/?local=1');
  });

  it('parses every option and rejects bad ones', () => {
    expect(parseLaunchArgs(['--rebuild', '--vsync', '--fullscreen', '--gpu-info', '--no-browser', '--browser', '/b', '--port', '5000'])).toMatchObject({ rebuild: true, vsync: true, fullscreen: true, gpuInfo: true, noBrowser: true, browser: '/b', port: 5000 });
    expect(parseLaunchArgs([])).toMatchObject({ port: 4180, rebuild: false, vsync: false, fullscreen: false, gpuInfo: false, noBrowser: false, help: false });
    expect(parseLaunchArgs(['--help']).help).toBe(true);
    expect(() => parseLaunchArgs(['--turbo'])).toThrow(/unknown option/);
    expect(() => parseLaunchArgs(['--port', 'abc'])).toThrow(/--port/);
    expect(() => parseLaunchArgs(['--port', '0'])).toThrow(/--port/);
    expect(() => parseLaunchArgs(['--port', '70000'])).toThrow(/--port/);
    expect(() => parseLaunchArgs(['--browser'])).toThrow(/needs a value/);
    expect(() => parseLaunchArgs(['--browser', '--vsync'])).toThrow(/needs a value/);
    expect(() => parseLaunchArgs(['--vsync=yes'])).toThrow(/takes no value/);
  });

  it('runs npm the way each platform needs', () => {
    expect(npmCommand('linux', {}, '/usr/bin/node', ['run', 'build'])).toEqual({ command: 'npm', args: ['run', 'build'], shell: false });
    expect(npmCommand('darwin', {}, '/usr/local/bin/node', ['ci'])).toEqual({ command: 'npm', args: ['ci'], shell: false });
    // Windows: npm.cmd needs the shell; one fixed command line, no argument list.
    expect(npmCommand('win32', {}, 'C:\\node\\node.exe', ['run', 'build'])).toEqual({ command: 'npm.cmd run build', args: [], shell: true });
    // Under "npm run local", npm's own CLI script runs without a shell.
    expect(npmCommand('win32', { npm_execpath: 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js' }, 'C:\\node\\node.exe', ['ci'])).toEqual({ command: 'C:\\node\\node.exe', args: ['C:\\node\\node_modules\\npm\\bin\\npm-cli.js', 'ci'], shell: false });
  });

  it('accepts the Node versions Vite 7 supports', () => {
    for (const v of ['20.19.0', '20.20.1', '22.12.0', '22.22.0', '23.0.0', '24.11.1', 'v25.1.0']) expect(nodeVersionOk(v), v).toBe(true);
    for (const v of ['18.20.4', '20.18.3', '21.7.3', '22.11.0', 'abc']) expect(nodeVersionOk(v), v).toBe(false);
  });
});

describe('Local Edition launcher: when to build', () => {
  let repo: string;
  const at = (path: string, seconds: number) => utimesSync(path, seconds, seconds);

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'reaperwar-build-'));
    mkdirSync(join(repo, 'src', 'ui'), { recursive: true });
    writeFileSync(join(repo, 'src', 'ui', 'app.ts'), 'export {};');
    writeFileSync(join(repo, 'index.html'), '<!doctype html>');
    for (const p of [join(repo, 'src', 'ui', 'app.ts'), join(repo, 'index.html')]) at(p, 1_000_000);
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('builds when dist/ is missing', () => {
    expect(needsBuild(repo)).toEqual({ build: true, reason: 'dist/ is missing' });
  });
  it('skips the build when dist/ is newer than every source', () => {
    mkdirSync(join(repo, 'dist'), { recursive: true });
    writeFileSync(join(repo, 'dist', 'index.html'), '<script type="module" crossorigin src="/assets/index-AbCdEf12.js"></script>');
    at(join(repo, 'dist', 'index.html'), 2_000_000);
    expect(needsBuild(repo).build).toBe(false);
    expect(needsBuild(repo, { rebuild: true })).toEqual({ build: true, reason: '--rebuild' });
  });
  it('rebuilds when a file under src/ or index.html is newer than the build', () => {
    at(join(repo, 'src', 'ui', 'app.ts'), 3_000_000);
    expect(needsBuild(repo)).toEqual({ build: true, reason: 'src/ui/app.ts changed since the last build' });
    at(join(repo, 'src', 'ui', 'app.ts'), 1_000_000);
    at(join(repo, 'index.html'), 3_000_000);
    expect(needsBuild(repo).reason).toBe('index.html changed since the last build');
    at(join(repo, 'index.html'), 1_000_000);
    expect(needsBuild(repo).build).toBe(false);
  });
  it('reinstalls dependencies when node_modules is missing or older than package-lock.json', () => {
    writeFileSync(join(repo, 'package-lock.json'), '{}');
    at(join(repo, 'package-lock.json'), 1_000_000);
    expect(needsInstall(repo)).toEqual({ install: true, reason: 'node_modules is missing' });
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    writeFileSync(join(repo, 'node_modules', '.package-lock.json'), '{}');
    at(join(repo, 'node_modules', '.package-lock.json'), 2_000_000);
    expect(needsInstall(repo).install).toBe(false);
    at(join(repo, 'package-lock.json'), 3_000_000); // a git pull changed the dependencies
    expect(needsInstall(repo)).toEqual({ install: true, reason: 'package-lock.json changed since the last install' });
  });

  it('rebuilds a dist/ made for the GitHub Pages base path', () => {
    writeFileSync(join(repo, 'dist', 'index.html'), '<script type="module" crossorigin src="/reaperwar/assets/index-AbCdEf12.js"></script>');
    at(join(repo, 'dist', 'index.html'), 2_000_000);
    expect(needsBuild(repo)).toEqual({ build: true, reason: 'dist/ was built for another base path' });
  });
});

describe('Ultra quality maths (render-side only)', () => {
  const settings = (quality: GraphicsSettings['quality']): GraphicsSettings => withQuality({ ...DEFAULT_PREFERENCES.graphics }, quality);

  it('ultra renders at min(devicePixelRatio, 3); high stays capped at 2', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.25, 3, 4]) {
      expect(pixelRatioFor(settings('ultra'), dpr), `ultra @${dpr}`).toBe(Math.min(dpr, 3));
      expect(pixelRatioFor(settings('high'), dpr), `high @${dpr}`).toBe(Math.min(dpr, 2));
      expect(pixelRatioFor(settings('medium'), dpr), `medium @${dpr}`).toBe(Math.min(dpr, 1.5));
      expect(pixelRatioFor(settings('low'), dpr), `low @${dpr}`).toBe(Math.min(dpr, 1));
    }
    expect(pixelRatioFor({ quality: 'high', pixelRatioCap: 2 }, 3)).toBe(2);
    // A stale stored cap does not hold Ultra back; a broken devicePixelRatio reads as 1.
    expect(pixelRatioFor({ quality: 'ultra', pixelRatioCap: 1 }, 2.5)).toBe(2.5);
    expect(pixelRatioFor({ quality: 'ultra', pixelRatioCap: 3 }, Number.NaN)).toBe(1);
  });

  it('ultra turns antialiasing and engine glow on, scales LOD distances by 2.5 and effect budgets by 2', () => {
    const ultra = QUALITY_PRESETS.ultra;
    expect(ultra.label).toBe('Ultra — local GPU');
    expect(ultra).toMatchObject({ antialias: true, lodDistanceScale: 2.5, effectBudgetScale: 2, maxAnisotropy: true });
    expect(ultra.envMapSize).toBeGreaterThan(QUALITY_PRESETS.high.envMapSize);
    expect(withQuality({ ...DEFAULT_PREFERENCES.graphics, showEngineGlow: false }, 'ultra')).toMatchObject({ quality: 'ultra', pixelRatioCap: 3, showEngineGlow: true });
    expect(withQuality(settings('ultra'), 'high')).toMatchObject({ quality: 'high', pixelRatioCap: 2 });
    expect(QUALITY_ORDER).toEqual(['low', 'medium', 'high', 'ultra']);
    // Low to High keep today's renderer: no LOD or effect scaling.
    for (const q of ['low', 'medium', 'high'] as const) expect(QUALITY_PRESETS[q]).toMatchObject({ lodDistanceScale: 1, effectBudgetScale: 1, maxAnisotropy: false });
    expect(QUALITY_PRESETS.low.antialias).toBe(false);
    expect(presetFor({ quality: 'bogus' as GraphicsSettings['quality'] })).toBe(QUALITY_PRESETS.high);
  });

  it('ultra keeps full detail and the hull mesh 2.5x farther, and the far point cloud only beyond that', () => {
    const L = 5.2;
    const s = QUALITY_PRESETS.ultra.lodDistanceScale;
    expect(lodLevel(L * REDUCED_FACTOR + 1, L, 'cruiser', true, s)).toBe('full');
    expect(lodLevel(L * REDUCED_FACTOR * s - 1, L, 'cruiser', true, s)).toBe('full');
    expect(lodLevel(L * REDUCED_FACTOR * s + 1, L, 'cruiser', true, s)).toBe('reduced');
    expect(lodLevel(L * POINT_FACTOR + 1, L, 'cruiser', true, s)).toBe('reduced');
    expect(lodLevel(L * POINT_FACTOR * s - 1, L, 'cruiser', true, s)).toBe('reduced');
    expect(lodLevel(L * POINT_FACTOR * s + 1, L, 'cruiser', true, s)).toBe('point');
    expect(lodLevel(FIGHTER_REDUCED_DISTANCE * s - 1, 0.36, 'fighter', true, s)).toBe('full');
    expect(lodLevel(FIGHTER_POINT_DISTANCE * s - 1, 0.36, 'fighter', true, s)).toBe('reduced');
    expect(lodLevel(FIGHTER_POINT_DISTANCE * s + 1, 0.36, 'fighter', true, s)).toBe('point');
    // Scale 1 is exactly today's policy.
    expect(lodLevel(L * REDUCED_FACTOR + 1, L, 'cruiser', true, 1)).toBe(lodLevel(L * REDUCED_FACTOR + 1, L, 'cruiser'));
  });

  it('doubles every effect pool and cap at Ultra and leaves them alone below it', () => {
    expect(effectBudgets(1)).toEqual(BASE_EFFECT_BUDGETS);
    const doubled = effectBudgets(QUALITY_PRESETS.ultra.effectBudgetScale);
    for (const k of Object.keys(BASE_EFFECT_BUDGETS) as (keyof typeof BASE_EFFECT_BUDGETS)[]) expect(doubled[k], k).toBe(BASE_EFFECT_BUDGETS[k] * 2);
    expect(effectBudgets(Number.NaN)).toEqual(BASE_EFFECT_BUDGETS);
  });

  it('measures frames per second over real time', () => {
    const m = new FpsMeter(500);
    expect(m.tick(0)).toBe(0);
    for (let t = 4; t <= 1000; t += 4) m.tick(t);
    expect(m.fps).toBeCloseTo(250, 0);
  });
});

describe('Local Edition detection and first-run default', () => {
  it('is on with ?local=1, or when cross-origin isolated on 127.0.0.1 or localhost', () => {
    expect(isLocalEdition({ search: '?local=1', hostname: 'example.github.io' }, false)).toBe(true);
    expect(isLocalEdition({ search: '?seed=4&local=1', hostname: '127.0.0.1' }, false)).toBe(true);
    expect(isLocalEdition({ search: '', hostname: '127.0.0.1' }, true)).toBe(true);
    expect(isLocalEdition({ search: '', hostname: 'localhost' }, true)).toBe(true);
    expect(isLocalEdition({ search: '', hostname: '127.0.0.1' }, false)).toBe(false);
    expect(isLocalEdition({ search: '', hostname: 'example.github.io' }, true)).toBe(false);
    expect(isLocalEdition({ search: '?local=0', hostname: 'localhost' }, false)).toBe(false);
    expect(isLocalEdition(undefined, true)).toBe(false);
    // Node has no location: not the Local Edition.
    expect(isLocalEdition()).toBe(false);
  });

  it('starts the Local Edition at Ultra until the player makes a graphics choice', () => {
    const defaults = { ...DEFAULT_PREFERENCES.graphics };
    expect(defaults.chosen).toBeUndefined(); // storage.ts keeps its defaults; the flag is read with a default
    expect(startupGraphics(defaults, true)).toMatchObject({ quality: 'ultra', pixelRatioCap: 3, showEngineGlow: true, lod: true });
    expect(startupGraphics({ ...defaults, quality: 'medium', pixelRatioCap: 1.5, chosen: true }, true)).toMatchObject({ quality: 'medium', pixelRatioCap: 1.5 });
    expect(startupGraphics({ ...defaults, quality: 'ultra', pixelRatioCap: 3, showEngineGlow: false, chosen: true }, true).showEngineGlow).toBe(false);
    // The web build is unchanged.
    expect(startupGraphics(defaults, false)).toBe(defaults);
    expect(startupGraphics(defaults)).toBe(defaults);
  });

  it('describes the GPU and the machine', () => {
    expect(localEditionStatus('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe("Local Edition: running on this machine's GPU (ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11))");
    expect(localEditionStatus(undefined)).toBe("Local Edition: running on this machine's GPU");
    expect(localEditionDetails(true, 32)).toBe('Cross-origin isolated (ready for a multi-threaded simulation) · 32 CPU threads; the simulation uses one for now.');
    expect(localEditionDetails(false, 0)).toBe('Not cross-origin isolated.');
  });
});

describe('Local Edition packaging', () => {
  /** Every file below a directory. */
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };

  it('loads no cross-origin resource, so COEP require-corp breaks nothing', () => {
    // If this fails, serve the resource from dist/ or switch serve.mjs to Cross-Origin-Embedder-Policy: credentialless.
    const files = [join(ROOT, 'index.html'), ...walk(join(ROOT, 'src')).filter((f) => /\.(ts|css|html)$/.test(f))];
    const external: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
        if (!m[0].startsWith('http://www.w3.org/')) external.push(`${relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(external).toEqual([]);
  });

  it('ships the one-click wrappers, the npm script and the ignored profile directory', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.local).toBe('node scripts/local/launch.mjs');
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toMatch(/^\.local-profile\/$/m);
    const cmd = readFileSync(join(ROOT, 'run-local.cmd'), 'utf8');
    expect(cmd).toContain('where node');
    expect(cmd).toContain('https://nodejs.org/');
    // Dependencies are installed by launch.mjs after its Node version check, never by the wrappers first.
    expect(cmd).not.toContain('npm ci');
    expect(cmd).toContain('node scripts\\local\\launch.mjs %*');
    const sh = readFileSync(join(ROOT, 'run-local.sh'), 'utf8');
    expect(sh.startsWith('#!/bin/sh')).toBe(true);
    expect(sh).toContain('exec node scripts/local/launch.mjs "$@"');
    expect(sh).not.toContain('npm ci');
    let mode = '';
    try {
      mode = execFileSync('git', ['ls-files', '-s', 'run-local.sh'], { cwd: ROOT, encoding: 'utf8' });
    } catch {
      return; // no git here: the executable bit is checked where the repository is
    }
    if (mode) expect(mode.startsWith('100755')).toBe(true);
  });
});

describe('Local Edition review fixes', () => {
  it('a lockfile-only change triggers a rebuild', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rw-lock-'));
    try {
      mkdirSync(join(repo, 'dist'), { recursive: true });
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'main.ts'), '');
      writeFileSync(join(repo, 'index.html'), '');
      writeFileSync(join(repo, 'package.json'), '{}');
      writeFileSync(join(repo, 'vite.config.ts'), '');
      writeFileSync(join(repo, 'dist', 'index.html'), '<script src="/assets/a.js"></script>');
      const old = new Date(Date.now() - 60_000);
      const built = new Date(Date.now() - 30_000);
      for (const f of ['src/main.ts', 'src', 'index.html', 'package.json', 'vite.config.ts']) utimesSync(join(repo, f), old, old);
      utimesSync(join(repo, 'dist', 'index.html'), built, built);
      expect(needsBuild(repo).build).toBe(false);
      writeFileSync(join(repo, 'package-lock.json'), '{}');
      expect(needsBuild(repo)).toEqual({ build: true, reason: 'package-lock.json changed since the last build' });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('pasted command lines survive the platform shell', () => {
    const args = ['--app=http://127.0.0.1:4180/?local=1', '--user-data-dir=/Users/a b/.local-profile'];
    expect(formatCommandLine('google-chrome', args, 'linux')).toBe("google-chrome '--app=http://127.0.0.1:4180/?local=1' '--user-data-dir=/Users/a b/.local-profile'");
    expect(formatCommandLine('x', ["it's"], 'darwin')).toBe("x 'it'\\''s'");
    expect(manualOpenCommand(undefined, args, 'darwin')).toBe("open -na 'Google Chrome' --args '--app=http://127.0.0.1:4180/?local=1' '--user-data-dir=/Users/a b/.local-profile'");
    expect(manualOpenCommand('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--app=http://127.0.0.1:4180/?local=1'], 'win32')).toBe('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --app=http://127.0.0.1:4180/?local=1');
    expect(manualOpenCommand(undefined, ['--app=http://127.0.0.1:4180/?local=1&x=1'], 'win32')).toBe('start "" chrome "--app=http://127.0.0.1:4180/?local=1&x=1"');
  });

  it('a software renderer is never reported as the GPU', () => {
    for (const r of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver']) {
      expect(localEditionStatus(r)).toMatch(/^Local Edition: software rendering \(.+\)\. The GPU is not in use/);
    }
    expect(localEditionStatus('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toMatch(/^Local Edition: running on this machine's GPU/);
  });
});
