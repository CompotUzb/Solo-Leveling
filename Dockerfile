FROM node:22-bookworm

WORKDIR /app
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Build the monorepo on the host first, then install runtime dependencies inside Linux.
# Copying Windows pnpm junctions into the image creates broken C:/Users/... symlinks.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY web/package.json ./web/package.json

RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY migrations ./migrations
COPY server/dist ./server/dist
COPY shared/dist ./shared/dist
COPY web/dist ./web/dist

# Rebuild native SQLite bindings inside the image so they match the container Node runtime.
RUN cd server && npm_config_nodedir=/usr/local npm rebuild better-sqlite3 --build-from-source

EXPOSE 3333

CMD ["node", "server/dist/index.js"]
