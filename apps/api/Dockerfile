# syntax=docker/dockerfile:1
# ── Build ─────────────────────────────────────────────────────────────────
# Contexte de build = racine du monorepo (voir docker-compose.demo.yml).
FROM node:24-slim AS build
WORKDIR /app

# Manifests d'abord : le cache npm survit à un changement de source.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY db/migrations db/migrations

RUN npm run build -w @dqa/contracts \
 && npm run build -w @dqa/api \
 && npm prune --omit=dev

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
# NODE_ENV volontairement vide : la démo tourne en HTTP, le cookie de session
# ne doit pas être `secure` (cf. apps/api/src/auth/cookies.ts). La prod le fixera.
ENV NODE_ENV=
WORKDIR /app

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/db/migrations db/migrations
COPY apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

# L'image node:* fournit déjà l'utilisateur non privilégié `node` (uid 1000).
# Le runtime n'écrit rien sur le disque : tout est en lecture seule pour lui.
USER node

WORKDIR /app/apps/api
EXPOSE 3000

# Sonde interne : `docker`/Compose relancent le conteneur s'il ne répond plus.
# Les fichiers Compose peuvent la surcharger (intervalles plus courts en démo).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "/usr/local/bin/entrypoint"]
