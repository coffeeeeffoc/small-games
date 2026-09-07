import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Scene media is imported by URL so embedded shells receive the same bundled files.
export default defineConfig({ plugins: [react()], publicDir: false });
