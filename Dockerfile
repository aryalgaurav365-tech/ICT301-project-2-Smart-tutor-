FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps apps
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
CMD ["npm", "start"]
