FROM node:20-alpine AS builder

WORKDIR /app

# Install ALL dependencies (including dev) for building
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and config
COPY tsconfig.json ./
COPY knexfile.ts ./
COPY src ./src

# Compile TypeScript
RUN npx tsc

# Also compile knexfile.ts separately (it's outside src/)
RUN npx tsc knexfile.ts --outDir ./dist --esModuleInterop --resolveJsonModule --module commonjs --target ES2020 --skipLibCheck

# Copy compiled migrations to dist so knex can find them without ts-node
RUN mkdir -p dist/db/migrations && \
    cp -r dist/src/db/migrations/* dist/db/migrations/ 2>/dev/null || true

# --- Production image ---
FROM node:20-alpine

WORKDIR /app

# Only production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output and production knexfile
COPY --from=builder /app/dist ./dist
COPY knexfile.production.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
