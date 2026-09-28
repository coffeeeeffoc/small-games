FROM node:24.12.0-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@8.14.1
# The deployment script supplies only manifests, compiled services and authoritative game rules.
COPY backend/ ./
RUN pnpm --filter @coffeeeeffoc/runtime-api... --filter @coffeeeeffoc/kart-server... install --prod --frozen-lockfile --ignore-scripts \
    && mkdir -p /app/outbox && chown node:node /app/outbox
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["node", "services/runtime-api/dist/main.js"]
