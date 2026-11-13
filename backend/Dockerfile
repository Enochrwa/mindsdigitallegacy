# syntax=docker/dockerfile:1
#
# Multi-stage build. The runtime image contains only compiled JS and production dependencies,
# runs as the unprivileged `node` user, and has no build tools or test files.
#
# Hardening to add when the base image is chosen for production: pin the base image by digest
# (Dependabot's docker ecosystem keeps the digest current) and scan the image in CI.

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# --ignore-scripts: dependency install scripts are a supply-chain attack path; none are required.
RUN npm ci --ignore-scripts

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM deps AS prod-deps
RUN npm prune --omit=dev --ignore-scripts

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
