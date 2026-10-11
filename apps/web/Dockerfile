# Build context: repo root (see infra/docker-compose.yml)
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- dev target (used by compose; source is bind-mounted) ----
FROM base AS dev
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@exploreai/web", "dev", "--hostname", "0.0.0.0"]

# ---- production build ----
FROM dev AS build
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAP_STYLE_URL
RUN pnpm --filter @exploreai/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
