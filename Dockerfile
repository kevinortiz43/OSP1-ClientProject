# Base stage with dependencies
FROM node:25.5.0-bullseye-slim AS base
WORKDIR /app

# Builder stage for Vite frontend
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy built frontend from builder
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist

# Copy backend files
COPY --chown=appuser:nodejs ./src/server ./src/server
COPY --chown=appuser:nodejs package.json ./

USER appuser

# Expose backend port
EXPOSE 3000

CMD ["npm","run", "dev"]

# Development stage
FROM base AS dev
WORKDIR /app

ENV NODE_ENV=development

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

EXPOSE 5173
EXPOSE 3000

CMD ["npm", "run", "dev"]