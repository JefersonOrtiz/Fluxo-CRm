FROM node:24-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY shared/ /shared/
EXPOSE 3001
CMD ["npm", "start"]
