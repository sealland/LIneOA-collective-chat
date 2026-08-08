import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 0.0.0.0 — accessible on LAN
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/screenshots': 'http://127.0.0.1:3000',
    },
  },
  preview: {
    host: true,
    port: 5173,
  },
});
