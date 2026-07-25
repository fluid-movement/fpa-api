# Multi-stage build.
#
# We use a Dockerfile rather than a build pack because the pnpm version must be
# pinned: this project's pnpm-workspace.yaml uses the pnpm 11 `allowBuilds`
# field, and an older pnpm treats that file as a workspace root and fails with
# "packages field missing or empty". Corepack reads the `packageManager` field
# in package.json, so the build always uses exactly the version the lockfile
# was written by.

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

# Copy manifests first so dependency installation is cached independently of
# source changes. pnpm-workspace.yaml is required here — it carries the
# build-script allowlist esbuild needs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm build

# Drop dev dependencies so they are not carried into the runtime stage.
RUN pnpm prune --prod

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Default inside the container; back this with a Coolify volume so the
# last-good corpus survives restarts.
ENV SNAPSHOT_PATH=/app/data/snapshot.json

# wget is used by the container healthcheck below.
RUN apk add --no-cache wget

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# The snapshot directory must be writable by the runtime user. `node` is an
# unprivileged user that ships with the base image.
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

# Liveness only — deliberately /healthz and not /health, so an upstream outage
# does not restart a container that is otherwise perfectly healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "dist/index.js"]
