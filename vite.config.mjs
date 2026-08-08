import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src',
  base: '/app/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4101', changeOrigin: true } },
  },
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'index.js', chunkFileNames: 'chunks/[name].js', assetFileNames: 'assets/[name][extname]' } },
  },
});
