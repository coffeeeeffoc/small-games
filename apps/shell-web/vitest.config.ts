import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Script tests use node:test and run through the Pages validation workflow.
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
});
