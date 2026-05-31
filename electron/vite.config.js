/**
 * Vite Renderer Config
 *
 * Purpose:
 * - Build and serve the Electron-owned React renderer.
 *
 * Key features:
 * - Uses the React plugin for TSX renderer source.
 * - Roots Vite at electron/renderer and emits electron/renderer/dist.
 * - Keeps built asset paths relative for Electron file loading.
 *
 * Recent changes:
 * - 2026-05-31: Added initial Vite config for the layered React renderer.
 */
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: path.resolve(__dirname, 'renderer'),
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5182,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'renderer/dist'),
    emptyOutDir: true,
  },
});