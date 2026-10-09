FROM node:24-bookworm-slim

WORKDIR /app

# Copy runtime modules only. Secrets, SQLite files and the private question bank
# are supplied at runtime and must not become image layers or frontend assets.
COPY --chown=node:node server/*.mjs server/*.sql ./server/
RUN mkdir -p /app/server/data /app/server/private/questions /app/public \
    && chown -R node:node /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4185 \
    HISTORY_DB_PATH=/app/server/data/history.sqlite \
    HISTORY_QUESTION_DIR=/app/server/private/questions \
    HISTORY_ASSET_DIR=/app/public \
    HISTORY_COMPETITION_TIMEZONE=Asia/Shanghai

USER node
EXPOSE 4185
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || process.env.HISTORY_PORT || 4185) + '/api/history/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/index.mjs"]
