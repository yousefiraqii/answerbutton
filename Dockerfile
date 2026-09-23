FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/var/data
RUN mkdir -p /var/data/uploads
EXPOSE 3000
CMD ["node", "server.js"]
