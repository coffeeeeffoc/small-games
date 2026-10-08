import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: false,
  build: { ssr: 'src/duel-service.ts', outDir: 'server-dist', emptyOutDir: true },
});
