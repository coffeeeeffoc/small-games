import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { port: 4171, strictPort: true }, build: { chunkSizeWarningLimit: 1600 } });
