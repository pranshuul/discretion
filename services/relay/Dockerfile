# The relay image. Build it from the repository root:
#   docker build --file services/relay/Dockerfile --tag discretion-relay .

FROM node:22-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec tsc -b services/relay
RUN pnpm --filter @discretion/relay deploy --prod /out

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
