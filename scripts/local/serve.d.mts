// Types for serve.mjs (plain JavaScript so it runs with Node alone; the tests import it from TypeScript).
import type { Server } from 'node:http';

export declare const HOST: '127.0.0.1';
export declare const DEFAULT_PORT: number;
export declare const REPO_ROOT: string;
export declare const DEFAULT_ROOT: string;
export declare const SERVER_ID_HEADER: string;
export declare const SERVER_ID: string;
export declare const MIME_TYPES: Readonly<Record<string, string>>;
export declare const ISOLATION_HEADERS: Readonly<{
  'Cross-Origin-Opener-Policy': string;
  'Cross-Origin-Embedder-Policy': string;
  'Cross-Origin-Resource-Policy': string;
}>;

export type ResolvedRequest = { status: 200; file: string; assetLike: boolean } | { status: 400 | 403 };

export declare function contentTypeFor(filePath: string): string;
export declare function resolveRequest(root: string, rawUrl: string | undefined): ResolvedRequest;
export declare function createStaticServer(options?: { root?: string }): Server;

export interface RunningServer {
  server: Server;
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}
export declare function startServer(options?: { root?: string; port?: number }): Promise<RunningServer>;
export declare function parseServeArgs(argv: string[]): { port: number; root: string; help: boolean };
export declare function parsePort(text: string, allowZero: boolean): number;
export declare function isMainModule(metaUrl: string): boolean;
