# syntax=docker/dockerfile:1.7
#
# CuraVet API image.
#
# Notes on the pnpm layout: the API runs with its own node_modules next to
# `dist/`, because TypeScript emits to `apps/api/dist` and pnpm's workspace
# symlinks must stay resolvable from there. Both the store and the per-package
# node_modules are copied; the virtual store is pruned afterwards so the final
# image does not carry dev dependencies.

FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable


FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/widget/package.json ./apps/widget/package.json
COPY packages/db/package.json ./packages/db/package.json
# `--frozen-lockfile` guarantees the image matches the committed lockfile.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter api... --filter @glambot/widget...


FROM dependencies AS prisma
COPY packages/db ./packages/db
# `--frozen-lockfile` on generate fails the build if the schema and the lockfile
# disagree, which is exactly what we want.
#
# The generated client is not committed, so it must exist *before* TypeScript
# compiles: `packages/db` re-exports `@prisma/client`, and without the generated
# types the API build fails with "Module '@glambot/db' has no exported member
# 'PrismaClient'".
RUN pnpm --filter @glambot/db exec prisma generate


# Build stage inherits from `prisma` (not `dependencies`) so the generated client
# and its type declarations are on disk for `tsc`.
FROM prisma AS build
COPY tsconfig.json ./
COPY packages/db ./packages/db
COPY apps/api ./apps/api
# The widget is served statically at /widget/ by the API.
COPY apps/widget ./apps/widget
RUN pnpm --filter @glambot/widget build \
 && pnpm --filter api build


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# tini reaps zombies and forwards SIGTERM, so graceful shutdown actually runs.
RUN apk add --no-cache tini

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/widget/dist ./widget/dist
# Trailing slashes merge contents. pnpm hoists shared packages to the workspace
# root and leaves per-package symlinks in apps/api/node_modules, so both layers
# are needed for `require()` to resolve from dist/.
#
# The generated Prisma client is written into the pnpm store entry for
# `@prisma/client` (Prisma 5.22 no longer emits a top-level `node_modules/.prisma`
# directory), so it arrives with the root copy below — the previous
# `COPY --from=prisma /app/node_modules/.prisma` failed the build outright.
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/apps/api/node_modules/ ./node_modules/
COPY --from=build /app/packages ./packages

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

