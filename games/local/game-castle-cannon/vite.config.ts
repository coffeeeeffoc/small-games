import { defineConfig } from 'vite';
import { alias } from './scripts/workspace-inputs.mjs';
export default defineConfig({
  base: './',
  resolve: { alias },
  server: { proxy: { '/duel': 'http://127.0.0.1:4179' } },
  preview: { proxy: { '/duel': 'http://127.0.0.1:4179' } },
});
