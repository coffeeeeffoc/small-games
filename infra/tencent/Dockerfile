FROM node:24.21.0-bookworm-slim
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm install --global pnpm@12.6.0 --registry="$NPM_REGISTRY" --fetch-timeout=60000 --fetch-retries=2
# The deployment script supplies only manifests, compiled services and authoritative game rules.
COPY backend/ ./
USER node
RUN node --check services/runtime-api/dist/main.js && node --check services/kart-server/src/main.ts
USER root
RUN --mount=type=cache,id=small-games-pnpm12,target=/pnpm/store,sharing=locked \
    pnpm --filter @coffeeeeffoc/runtime-api... --filter @coffeeeeffoc/kart-server... install --prod --frozen-lockfile --ignore-scripts \
    --registry="$NPM_REGISTRY" --store-dir=/pnpm/store --fetch-timeout=60000 --fetch-retries=2 \
    && mkdir -p /app/outbox && chown node:node /app/outbox
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["node", "services/runtime-api/dist/main.js"]
