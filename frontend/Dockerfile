# 개발 모드 (Vite watch) — dev.pixel.caadiq.co.kr
FROM node:22-alpine
WORKDIR /app
# 컨테이너 볼륨 마운트에서 inotify가 간헐적으로 어긋나는 것 대비 폴링 감시
ENV PORT=80 API_TARGET=http://pixel-backend:3000 CHOKIDAR_USEPOLLING=1 CHOKIDAR_INTERVAL=400
EXPOSE 80
CMD ["sh", "-c", "npm install --include=dev && npm run dev"]
