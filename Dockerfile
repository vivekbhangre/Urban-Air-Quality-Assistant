# Stage 1: Build the Vite frontend bundle
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src

RUN npm run build

# Stage 2: Minimal production runtime
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy built frontend and only the server runtime modules
COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY server ./server
COPY src/types/air.ts ./src/types/air.ts
COPY src/utils/normalizeAi.ts ./src/utils/normalizeAi.ts

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
