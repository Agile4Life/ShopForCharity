FROM node:20-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ src/
USER node
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.js"]
