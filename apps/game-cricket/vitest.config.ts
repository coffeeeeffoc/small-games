import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@coffeeeeffoc/game-cricket/content': fileURLToPath(
        new URL('./src/content/index.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'jsdom' },
});
