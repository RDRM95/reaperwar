// Types for launch.mjs (plain JavaScript so it runs with Node alone; the tests import it from TypeScript).
export { DEFAULT_PORT, HOST, REPO_ROOT } from './serve.mjs';

export declare const PROFILE_DIR_NAME: string;
export declare const MIN_NODE: Readonly<{ 20: number; 22: number }>;
export declare const GPU_FLAGS: readonly string[];
export declare const UNCAPPED_FLAGS: readonly string[];
export declare const PROFILE_FLAGS: readonly string[];
export declare const BUILD_INPUTS: readonly string[];
export declare const HANDOFF_MS: number;
export declare const LINUX_BROWSER_NAMES: readonly string[];
export declare const USAGE: string;

export interface LaunchOptions {
  port: number;
  rebuild: boolean;
  browser?: string;
  vsync: boolean;
  fullscreen: boolean;
  noBrowser: boolean;
  help: boolean;
}

export type Env = Record<string, string | undefined>;

export interface LaunchPlan {
  action: 'launch' | 'serve-only' | 'no-browser-found' | 'browser-missing';
  url: string;
  profileDir: string;
  args: string[];
  browser?: string;
}

export declare function parseLaunchArgs(argv: string[]): LaunchOptions;
export declare function appUrl(port: number): string;
export declare function browserCandidates(platform: string, env: Env): string[];
export declare function findBrowser(args: { platform: string; env: Env; exists: (p: string) => boolean; explicit?: string }): string | undefined;
export declare function buildBrowserArgs(args: { url: string; profileDir: string; vsync?: boolean; fullscreen?: boolean }): string[];
export declare function planLaunch(options: LaunchOptions, host: { platform: string; env: Env; exists: (p: string) => boolean; repoRoot: string }): LaunchPlan;
export declare function npmBuildCommand(platform: string, env: Env, nodePath: string): { command: string; args: string[]; shell: boolean };
export declare function newestMtime(p: string): { mtimeMs: number; path: string };
export declare function needsBuild(repoRoot: string, options?: { rebuild?: boolean }): { build: boolean; reason: string };
export declare function nodeVersionOk(version: string): boolean;
export declare function formatCommandLine(command: string, args: string[]): string;
