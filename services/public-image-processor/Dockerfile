FROM node:22.15.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    CHAINED_MAX_DECODED_PIXELS=60000000 \
    VIPS_CONCURRENCY=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY assets ./assets
COPY bin ./bin
COPY lib ./lib
COPY scripts ./scripts
RUN node scripts/materialize-profile.mjs && useradd --system --uid 10001 --create-home processor
USER 10001
ENTRYPOINT ["node", "bin/process-image.mjs"]
