import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5173);
const shared = path.resolve(root, '..', 'shared');

const server = await createServer({
  root,
  configFile: false,
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': shared,
    },
  },
  optimizeDeps: {
    force: true,
  },
  server: {
    host: process.env.VITE_DEV_HOST || '127.0.0.1',
    port,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});

await server.listen();
server.printUrls();

await new Promise(() => {});
