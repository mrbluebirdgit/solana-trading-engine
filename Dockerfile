FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="Solana observation worker" \
      org.opencontainers.image.description="Observation-only beta worker; no paper or live trade execution"

ENV NODE_ENV=production \
    TRADING_MODE=observe \
    LIVE_TRADING_ENABLED=false \
    PORT=3000 \
    OBSERVATION_LOG_PATH=/var/lib/solana-observer/observations.jsonl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY config ./config
COPY scripts ./scripts
COPY src ./src

RUN mkdir -p /var/lib/solana-observer \
    && chown node:node /var/lib/solana-observer

USER node

EXPOSE 3000
VOLUME ["/var/lib/solana-observer"]
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/readyz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "scripts/run-observer.mjs", "--notify"]
