import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT ?? 5173),
    // dev.pixel.caadiq.co.kr 로 접근 허용 (Vite 6 allowedHosts)
    allowedHosts: ['.caadiq.co.kr'],
    proxy: {
      // 컨테이너에선 API_TARGET=http://pixel-backend:3000, 로컬은 :3100
      '/api': { target: process.env.API_TARGET ?? 'http://localhost:3100', changeOrigin: true },
    },
  },
});
