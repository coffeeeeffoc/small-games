import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { proxy: { '/duel': 'http://127.0.0.1:4179' } },
  preview: { proxy: { '/duel': 'http://127.0.0.1:4179' } },
});
