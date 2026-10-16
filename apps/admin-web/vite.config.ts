import { defineConfig } from 'vite';
export default defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:43001', changeOrigin: false } } },
  build: { target: 'es2022', sourcemap: false },
});
