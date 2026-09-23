FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# منفذ 7860 هو الافتراضي لـ Hugging Face Spaces (ويعمل مع أي منصة عبر PORT env)
ENV PORT=7860
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data/uploads && chmod -R 777 /app
EXPOSE 7860
CMD ["node", "server.js"]
