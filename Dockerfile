# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl ca-certificates && \
    update-ca-certificates

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma/ ./prisma/

# Generate the Prisma client code without downloading the engine binary.
# The engine binary will be provided at runtime via PRISMA_QUERY_ENGINE_LIBRARY.
ENV PRISMA_GENERATE_SKIP_AUTO_DOWNLOAD=true
RUN ./node_modules/.bin/prisma generate

COPY scripts/ ./scripts/
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl postgresql-client ca-certificates && \
    update-ca-certificates

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma schema (needed for prisma db push at runtime)
COPY prisma/ ./prisma/

# Copy pre-generated Prisma client artifacts from the builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy the pre-downloaded engine binary to a known location and tell
# @prisma/client exactly where it is via its native env var.
# This avoids any engine download at runtime.
COPY .prisma-build/ /app/engine/
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/engine/libquery_engine.so.node

# Copy the download script (fallback if engine is missing at startup)
COPY --from=builder /app/scripts/download-engine.cjs ./scripts/download-engine.cjs

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/app.js"]
