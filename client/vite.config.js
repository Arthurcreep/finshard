import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    headers: { 'Permissions-Policy': 'clipboard-read=(self), clipboard-write=(self)' },
    proxy: {
      // самые специфичные — выше
      '/api/relayer': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
      '/api/applications': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
      // 👇 ЭТО ОБЯЗАТЕЛЬНО
      '/api/withdraw': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
      // всё остальное /api → другой сервис
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
});
