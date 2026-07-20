# 개발 모드 (Vite watch) — dev.pixel.caadiq.co.kr
FROM node:22-alpine
WORKDIR /app
ENV PORT=80 API_TARGET=http://pixel-backend:3000
EXPOSE 80
CMD ["sh", "-c", "npm install --include=dev && npm run dev"]
