FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
RUN npm install --workspace server --include-workspace-root=false || npm install --prefix server
COPY server/tsconfig.json server/
COPY server/src server/src
RUN npm run build --prefix server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/server/dist ./dist
EXPOSE 4000
# Runs inside the container's own network namespace, so this always hits
# 127.0.0.1 regardless of API_HOST (which only controls the external bind).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/api/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/index.js"]
