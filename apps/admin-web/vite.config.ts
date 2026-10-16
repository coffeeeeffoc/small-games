import { defineConfig } from 'vite';
import { adminCspPlugin } from '../../scripts/admin-csp.mjs';
export default defineConfig({
  plugins: [adminCspPlugin()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:43001', changeOrigin: false } } },
  build: { target: 'es2022', sourcemap: false },
});
