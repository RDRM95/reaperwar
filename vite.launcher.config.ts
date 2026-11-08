import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Stand-alone launcher build: the whole game in one self-contained index.html
 * that a browser opens straight from disk (file://), with no server and no
 * install. `npm run package:launcher` builds it and adds the Play launchers.
 */
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    __LAUNCHER_BUILD__: 'true',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: process.env.LAUNCHER_OUT_DIR ?? 'release/launcher/game',
    emptyOutDir: true,
    chunkSizeWarningLimit: 10_000,
  },
});
