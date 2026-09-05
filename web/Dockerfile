# RaziOne Eye — frontend (Vite build + nginx runtime)
# Build context: repo root.
#   docker build -f web/Dockerfile -t razione-eye-frontend .
# NOTE: VITE_API_MODE is baked in at build time. Production must be `real`
# so the app calls /api/* (proxied to the backend by nginx below).

# ─── Stage 1: build ──────────────────────────────────────────────
FROM node:22-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY web ./web

ARG VITE_API_MODE=real
ENV VITE_API_MODE=${VITE_API_MODE}

WORKDIR /app/web
RUN pnpm build

# ─── Stage 2: runtime ────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ > /dev/null || exit 1
