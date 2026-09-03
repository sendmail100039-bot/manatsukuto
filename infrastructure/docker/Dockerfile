# Multi-stage build for the web app (Next.js standalone) - also usable on Windows via Docker Desktop.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY modules/attendance/package.json modules/attendance/
COPY packages/core/package.json packages/core/
COPY packages/auth/package.json packages/auth/
COPY packages/security/package.json packages/security/
COPY packages/database/package.json packages/database/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @platform/web build

FROM node:22-alpine AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM deps AS worker
RUN apk add --no-cache postgresql16-client
COPY . .
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@platform/worker", "start"]
