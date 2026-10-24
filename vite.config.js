import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: resolve(root, 'web'),
  base: './',
  publicDir: resolve(root, 'web/public'),
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    sourcemap: false
  }
});
