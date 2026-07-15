FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.json ./
COPY apps/server-api/package.json ./apps/server-api/package.json
COPY apps/web-ui/package.json ./apps/web-ui/package.json
COPY scripts/install-hooks.ts ./scripts/install-hooks.ts
COPY apps/server-api ./apps/server-api
COPY apps/web-ui ./apps/web-ui
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN CI=true pnpm prune --prod --ignore-scripts

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/apps/web-ui/index.html ./web-ui/index.html
COPY --from=build /app/apps/web-ui/dist ./web-ui/dist
CMD ["node", "dist/apps/server-api/src/index.js"]
