import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'import.meta.env.VITE_SHELL_ORIGIN': JSON.stringify(
      process.env.VITE_SHELL_ORIGIN ?? 'http://localhost:5173',
    ),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [react()],
  build: {
    outDir: 'dist-iframe',
    emptyOutDir: true,
    lib: {
      entry: 'src/iframe.ts',
      formats: ['es'],
      fileName: () => 'remote-entry.js',
    },
  },
});
