# syntax=docker/dockerfile:1

########## BUILD STAGE ##########
# node:22-bookworm with build toolchain is required to compile the
# better-sqlite3 native module (N-API native binding built from source).
FROM node:22-bookworm AS build

ARG JWT_SECRET
RUN : "${JWT_SECRET:?JWT_SECRET build argument is required}"

WORKDIR /app

# Native module build prerequisites (better-sqlite3).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      python3 \
      libsqlite3-dev \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching.
# The repo is package-managed from the root (web-app/ is the Next.js project),
# so a single `npm ci` at the root installs next, react and better-sqlite3.
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source and schema.
COPY web-app web-app

# Rebuild the native module so its compiled .node binary ships with this image.
RUN npm rebuild better-sqlite3

# Build the Next.js production bundle.
RUN npm run build

########## RUNTIME STAGE ##########
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# curl is required by the HEALTHCHECK; libsqlite3-0 is the shared library the
# better-sqlite3 native binding links against at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl \
      libsqlite3-0 \
 && rm -rf /var/lib/apt/lists/*

# Production dependencies from build stage (devDeps included — typescript is
# needed at runtime for next.config.ts; pruned image is still much smaller
# than a single-stage equivalent thanks to stripped build toolchain).
COPY --from=build /app/node_modules ./node_modules

# Manifest + application source + the Next.js production build output.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/web-app ./web-app
COPY --from=build /app/web-app/.next ./web-app/.next

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Production start command per root package.json ("start": "next start web-app").
CMD ["npm", "start"]
