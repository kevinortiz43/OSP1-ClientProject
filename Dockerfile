# Base stage with dependencies
FROM node:iron-alpine3.22 AS base

# current-alpine3.23

WORKDIR /app
COPY package*.json ./

# Builder stage for Vite frontend
FROM base AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build

# Production stage
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
RUN npm ci --only=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S appuser -u 1001

# Copy built frontend from builder
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist

# Copy backend files
COPY --from=builder --chown=appuser:nodejs /app/server ./server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER appuser

# Expose backend port
EXPOSE 3000

CMD ["npm", "start"]

# Development stage
FROM base AS dev
ENV NODE_ENV=development
RUN npm install
COPY . .

# Expose both frontend and backend ports
EXPOSE 5173
EXPOSE 3000

CMD ["npm", "run", "dev"]