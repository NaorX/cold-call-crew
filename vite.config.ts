import { defineConfig } from 'vite';

const API = 'http://localhost:8787';

export default defineConfig({
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
      '/live': { target: API.replace('http', 'ws'), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
