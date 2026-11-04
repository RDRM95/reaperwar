#!/usr/bin/env node
/**
 * Local Edition static server.
 *
 * Serves the production build (dist/) to this machine only: it binds the
 * loopback address 127.0.0.1 and nothing else. Every response carries the
 * cross-origin isolation headers, so the page runs with
 * self.crossOriginIsolated === true (SharedArrayBuffer is available for the
 * planned multi-threaded simulation).
 *
 * Zero dependencies: Node built-ins only, so it runs straight after a clone.
 *
 *   node scripts/local/serve.mjs [--port 4180] [--root dist]
 *
 * --port 0 picks a free port; the first line printed is always
 * "Local Edition server: http://127.0.0.1:<port>/".
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, promises as fsp, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 4180;
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEFAULT_ROOT = path.join(REPO_ROOT, 'dist');
/** Response header that identifies this server (the launcher uses it to recognise an instance that is already running). */
export const SERVER_ID_HEADER = 'X-Local-Edition';
export const SERVER_ID = 'reaperwar';

/** Content types by file extension (lower case, with the dot). */
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
});

/** @param {string} filePath */
export function contentTypeFor(filePath) {
  return MIME_TYPES[/** @type {keyof typeof MIME_TYPES} */ (path.extname(filePath).toLowerCase())] ?? 'application/octet-stream';
}

/**
 * Cross-origin isolation. COOP same-origin plus COEP make the document
 * cross-origin isolated. COEP is require-corp rather than credentialless
 * because neither index.html nor src loads a cross-origin resource (no web
 * fonts, CDN scripts or remote images; tests/localEdition.test.ts keeps it
 * that way). If one is ever added, switch to 'credentialless', which Chrome
 * and Edge also accept for isolation.
 */
export const ISOLATION_HEADERS = Object.freeze({
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const COMMON_HEADERS = Object.freeze({
  ...ISOLATION_HEADERS,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  [SERVER_ID_HEADER]: SERVER_ID,
});

/** Windows device names: never files, refused so a request cannot open a device. */
const DEVICE_NAME = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i;
/** Vite's content-hashed output names (index-AbC123xy.js): safe to cache for good. */
const HASHED_ASSET = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/**
 * Map a request target to a path under `root`. Pure (no file-system access).
 *
 * Returns { status: 200, file, assetLike } when the target names a location
 * inside root, 400 for a malformed target and 403 for any attempt to leave
 * root: '..' segments (plain or percent-encoded), absolute paths ('//etc',
 * '/%2Fetc'), backslashes, drive letters and NUL bytes. `assetLike` is true
 * when the last segment has a file extension: a missing asset is a 404, any
 * other missing path falls back to index.html.
 *
 * @param {string} root
 * @param {string | undefined} rawUrl request target as received (req.url)
 * @returns {{ status: 200, file: string, assetLike: boolean } | { status: 400 | 403 }}
 */
export function resolveRequest(root, rawUrl) {
  // Origin-form only ("/path?query"): browsers never send anything else to an origin server.
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/')) return { status: 400 };
  const end = rawUrl.search(/[?#]/);
  const rawPath = end >= 0 ? rawUrl.slice(0, end) : rawUrl;
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { status: 400 };
  }
  if (decoded.includes('\0')) return { status: 400 };
  // Backslashes are separators on Windows; colons name drives and alternate data streams.
  // Neither ever appears in a built asset path.
  if (/[\\:]/.test(decoded)) return { status: 403 };
  const segments = decoded.slice(1).split('/');
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s === '..') return { status: 403 };
    // An empty segment before the end is an absolute path after the leading slash ("//etc/passwd").
    if (s === '' && i < segments.length - 1) return { status: 403 };
    if (DEVICE_NAME.test(s)) return { status: 403 };
  }
  const rootAbs = path.resolve(root);
  const file = path.resolve(rootAbs, ...segments.filter((s) => s !== '' && s !== '.'));
  if (file !== rootAbs && !file.startsWith(rootAbs + path.sep)) return { status: 403 };
  const last = segments[segments.length - 1];
  return { status: 200, file, assetLike: /\.[A-Za-z0-9]+$/.test(last) };
}

/**
 * @param {string} rootAbs
 * @param {string} file
 */
function cacheControlFor(rootAbs, file) {
  const rel = path.relative(rootAbs, file).split(path.sep);
  if (rel.length === 2 && rel[0] === 'assets' && HASHED_ASSET.test(rel[1])) return 'public, max-age=31536000, immutable';
  // index.html and anything unhashed: always revalidate, so a rebuild shows up on reload.
  return 'no-cache';
}

/** @param {string} p */
async function statOrUndefined(p) {
  try {
    return await fsp.stat(p);
  } catch {
    return undefined;
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} text
 * @param {Record<string, string>} [extra]
 * @param {boolean} [head]
 */
function sendText(res, status, text, extra = {}, head = false) {
  const body = Buffer.from(`${text}\n`, 'utf8');
  res.writeHead(status, { ...COMMON_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(body.length), 'Cache-Control': 'no-store', ...extra });
  res.end(head ? undefined : body);
}

const STATUS_TEXT = { 400: 'Bad request', 403: 'Forbidden', 404: 'Not found', 405: 'Method not allowed', 500: 'Internal server error' };

/**
 * Create (but do not start) the static server for `root`.
 * @param {{ root?: string }} [options]
 */
export function createStaticServer({ root = DEFAULT_ROOT } = {}) {
  const rootAbs = path.resolve(root);
  /** @type {string | undefined} */
  let realRoot;

  /** @param {string} file */
  const insideRoot = async (file) => {
    // Symbolic links must not lead out of root either.
    realRoot ??= await fsp.realpath(rootAbs);
    const real = await fsp.realpath(file);
    return real === realRoot || real.startsWith(realRoot + path.sep);
  };

  return createServer(async (req, res) => {
    const head = req.method === 'HEAD';
    try {
      if (req.method !== 'GET' && !head) {
        sendText(res, 405, STATUS_TEXT[405], { Allow: 'GET, HEAD' });
        return;
      }
      const target = resolveRequest(rootAbs, req.url);
      if (target.status !== 200) {
        sendText(res, target.status, STATUS_TEXT[target.status], {}, head);
        return;
      }
      let file = target.file;
      let stat = await statOrUndefined(file);
      if (!stat?.isFile()) {
        if (target.assetLike) {
          sendText(res, 404, STATUS_TEXT[404], {}, head);
          return;
        }
        // "/" and every unknown non-asset path get the app shell.
        file = path.join(rootAbs, 'index.html');
        stat = await statOrUndefined(file);
        if (!stat?.isFile()) {
          sendText(res, 404, 'dist/index.html not found: run "npm run build" first', {}, head);
          return;
        }
      }
      if (!(await insideRoot(file))) {
        sendText(res, 403, STATUS_TEXT[403], {}, head);
        return;
      }
      const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      const headers = {
        ...COMMON_HEADERS,
        'Content-Type': contentTypeFor(file),
        'Cache-Control': cacheControlFor(rootAbs, file),
        'Last-Modified': stat.mtime.toUTCString(),
        ETag: etag,
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Length': String(stat.size) });
      if (head) {
        res.end();
        return;
      }
      createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch {
      if (!res.headersSent) sendText(res, 500, STATUS_TEXT[500], {}, head);
      else res.destroy();
    }
  });
}

/**
 * Start the server on 127.0.0.1. Resolves once it is listening.
 * @param {{ root?: string, port?: number }} [options]
 */
export function startServer({ root = DEFAULT_ROOT, port = DEFAULT_PORT } = {}) {
  const server = createStaticServer({ root });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: HOST, port }, () => {
      server.off('error', reject);
      const address = /** @type {import('node:net').AddressInfo} */ (server.address());
      const close = () =>
        new Promise((done) => {
          server.close(() => done(undefined));
          server.closeAllConnections?.();
        });
      resolve({ server, host: address.address, port: address.port, url: `http://${HOST}:${address.port}/`, close });
    });
  });
}

/**
 * Parse serve.mjs arguments.
 * @param {string[]} argv
 */
export function parseServeArgs(argv) {
  const out = { port: DEFAULT_PORT, root: DEFAULT_ROOT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v === '') throw new Error(`${name} needs a value`);
      return v;
    };
    if (name === '--help' || name === '-h') out.help = true;
    else if (name === '--port') out.port = parsePort(value(), true);
    else if (name === '--root') out.root = path.resolve(value());
    else throw new Error(`unknown option ${arg}`);
  }
  return out;
}

/**
 * @param {string} text
 * @param {boolean} allowZero
 */
export function parsePort(text, allowZero) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1) || n > 65535) throw new Error(`--port must be a whole number from ${allowZero ? 0 : 1} to 65535 (got "${text}")`);
  return n;
}

/**
 * True when this module is the script node was started with.
 * @param {string} metaUrl import.meta.url of the calling module
 */
export function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    const self = realpathSync(fileURLToPath(metaUrl));
    const main = realpathSync(path.resolve(process.argv[1]));
    return process.platform === 'win32' ? self.toLowerCase() === main.toLowerCase() : self === main;
  } catch {
    return false;
  }
}

const SERVE_USAGE = `Usage: node scripts/local/serve.mjs [--port ${DEFAULT_PORT}] [--root dist]

Serves the production build on http://${HOST}:<port>/ (this machine only) with
the cross-origin isolation headers. --port 0 picks a free port.`;

async function main() {
  let opts;
  try {
    opts = parseServeArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`serve.mjs: ${/** @type {Error} */ (e).message}\n\n${SERVE_USAGE}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(SERVE_USAGE);
    return;
  }
  if (!existsSync(path.join(opts.root, 'index.html'))) {
    console.error(`No index.html in ${opts.root}. Run "npm run build" first, or start the game with "node scripts/local/launch.mjs", which builds when needed.`);
    process.exit(1);
  }
  let running;
  try {
    running = await startServer({ root: opts.root, port: opts.port });
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException} */ (e);
    console.error(err.code === 'EADDRINUSE' ? `Port ${opts.port} on ${HOST} is already in use. Pass --port <n> to use another.` : `Could not start the server: ${err.message}`);
    process.exit(1);
  }
  console.log(`Local Edition server: ${running.url}`);
  console.log(`Serving ${opts.root} to this machine only. Press Ctrl+C to stop.`);
  const stop = () => {
    void running.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try {
      process.on(sig, stop);
    } catch {
      /* signal not supported on this platform */
    }
  }
}

if (isMainModule(import.meta.url)) void main();
