# RaziOne Eye — backend (Hono + node:sqlite)
# Build context: repo root (needs pnpm workspace + packages/shared).
#   docker build -f server/Dockerfile -t razione-eye-backend .
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Workspace manifests first (better layer caching).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
COPY web/package.json ./web/

# Install workspace deps (frozen lockfile for reproducible builds).
RUN pnpm install --frozen-lockfile

# Copy sources needed at runtime.
COPY packages/shared ./packages/shared
COPY server ./server

# Emit shared declarations first (server tsconfig uses project references;
# the dist output is gitignored so a fresh clone/Docker layer lacks it).
# rm -rf makes the step hermetic: no stale dist/tsbuildinfo from any layer
# may fool tsc's incremental check into skipping declaration emit.
# Then typecheck the server (fails the build on type errors; no emit step).
RUN rm -rf /app/packages/shared/dist /app/packages/shared/tsconfig.tsbuildinfo \
 && pnpm --filter @razione-eye/shared exec tsc -p tsconfig.json \
 && pnpm --filter @razione-eye/server build \
 && CI=true pnpm prune --prod

WORKDIR /app/server

ENV NODE_ENV=production \
    PORT=8787 \
    RAZIONE_DB_PATH=/app/server/data/razione-eye.db

# Writable SQLite directory (backed by the `razione-data` volume in compose).
RUN mkdir -p /app/server/data && chown -R node:node /app

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || '8787') + '/api/health').then(r => { if (!r.ok) process.exit(1) })"

# dev.ts seeds idempotently on boot, then serves the API.
CMD ["node", "src/dev.ts"]
