# syntax=docker/dockerfile:1
# ── Build ─────────────────────────────────────────────────────────────────
# Contexte de build = racine du monorepo (voir docker-compose.demo.yml).
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web

RUN npm run build -w @dqa/contracts \
 && npm run build -w @dqa/web

# ── Runtime ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# `@angular/build:application` émet le SPA dans dist/browser/.
COPY --from=build /app/apps/web/dist/browser /usr/share/nginx/html
EXPOSE 8080
