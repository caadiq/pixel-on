import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 개발 중 /api → 백엔드 (배포 시엔 Caddy가 동일 역할)
      '/api': { target: 'http://localhost:3100', changeOrigin: true },
    },
  },
});
