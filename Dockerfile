FROM node:24-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++ cairo-dev pango-dev giflib-dev jpeg-dev

COPY package*.json ./
RUN npm ci

COPY . .
RUN mkdir -p /tmp/openqr-build-data && DATABASE_URL=/tmp/openqr-build-data/openqr.db npm run build
RUN npm prune --omit=dev

FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache cairo pango giflib jpeg curl

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# Migration SQL is read at runtime via fs.readdirSync(cwd + '/src/lib/db/migrations').
COPY --from=build /app/src/lib/db/migrations ./src/lib/db/migrations

EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_URL=/data/openqr.db

VOLUME ["/data"]

CMD ["node", "build/index.js"]
