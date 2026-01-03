FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.json ./
COPY apps/server-api ./apps/server-api
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm exec tsc -p tsconfig.build.json

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
CMD ["node", "dist/apps/server-api/src/index.js"]
