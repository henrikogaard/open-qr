FROM node:24-alpine AS build

WORKDIR /app

# Native modules (better-sqlite3) still need a toolchain to build if no
# prebuilt binary matches; resvg-js and everything else ship prebuilts.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN mkdir -p /tmp/openqr-build-data && DATABASE_URL=/tmp/openqr-build-data/openqr.db npm run build
RUN npm prune --omit=dev

FROM node:24-alpine

WORKDIR /app

# curl: container health checks. font-dejavu: system font so resvg can
# rasterize the QR center-text overlay (replaces the cairo/pango stack the
# old canvas renderer needed — ~200MB fewer image deps).
RUN apk add --no-cache curl font-dejavu

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_URL=/data/openqr.db

VOLUME ["/data"]

CMD ["node", "build/index.js"]
