# Base stage with dependencies
FROM node:25.5.0-bullseye-slim AS base
WORKDIR /app

# Builder stage for Vite frontend
FROM base AS builder
WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs appuser

# Copy built frontend from builder
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist

# Copy backend files (including your convertData.ts)
COPY --chown=appuser:nodejs ./src ./src
COPY --chown=appuser:nodejs package.json ./

USER appuser

# Expose backend port
EXPOSE 3000

CMD ["npm", "start"]

# Development stage
FROM base AS dev
WORKDIR /app

ENV NODE_ENV=development

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies 
RUN npm install

# Copy application code
# Docker automatically handles line ending normalization
COPY . .

EXPOSE 5173
EXPOSE 3000

CMD ["npm", "run", "dev"]