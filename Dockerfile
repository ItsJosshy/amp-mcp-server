FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json eslint.config.js ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production MCP_TRANSPORT=stdio
WORKDIR /app
RUN useradd --system --uid 10001 --create-home amp-mcp
COPY --from=build --chown=amp-mcp:amp-mcp /app/package.json /app/package-lock.json ./
COPY --from=build --chown=amp-mcp:amp-mcp /app/node_modules ./node_modules
COPY --from=build --chown=amp-mcp:amp-mcp /app/dist ./dist
USER amp-mcp
ENTRYPOINT ["node", "dist/index.js"]
