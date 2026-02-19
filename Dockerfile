# Base stage
FROM oven/bun:canary-alpine AS base
WORKDIR /app

# Builder stage
FROM base AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Production stage
FROM base AS production
WORKDIR /app

ENV BUN_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:bunjs /app/dist ./dist
COPY --chown=appuser:bunjs ./src/server ./src/server
COPY --chown=appuser:bunjs package.json ./

USER appuser
EXPOSE 3000
CMD ["bun", "run", "dev"]

# Dev stage
FROM base AS dev
WORKDIR /app

ENV BUN_ENV=development

COPY package.json bun.lock ./
RUN bun install

COPY . .

EXPOSE 5173
EXPOSE 3000
CMD ["bun", "run", "dev"]