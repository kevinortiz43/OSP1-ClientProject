# Base stage with dependencies
FROM node:25.5.0-bullseye-slim AS base
WORKDIR /app

FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist

COPY --chown=appuser:nodejs ./src/server ./src/server
COPY --chown=appuser:nodejs package.json ./

USER appuser

EXPOSE 3000

CMD ["npm","run", "dev"]

FROM base AS dev
WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173
EXPOSE 3000

CMD ["npm", "run", "dev"]