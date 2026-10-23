# One image definition for the whole app, with two targets:
#   api  NestJS API. On start it creates, migrates and seeds any tenant database that is
#        missing (`db:setup`, safe to repeat), then serves on port 3000.
#   web  The built React app on nginx, which also forwards /api to the api service.
# docker-compose.yml builds both: `docker compose --profile app up --build`.

# ---- deps: workspace install shared by both targets ------------------------------------------
FROM node:24-bookworm-slim AS deps
# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Only what `npm ci` needs, so this layer is reused until dependencies change.
# `shared` builds itself and the backend runs `prisma generate` on install, so their sources
# and the Prisma schema come along.
COPY package.json package-lock.json ./
COPY shared/ shared/
COPY backend_service/package.json backend_service/
COPY backend_service/prisma/ backend_service/prisma/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund

# ---- api -------------------------------------------------------------------------------------
FROM deps AS api
COPY backend_service/ backend_service/
RUN npm run build -w backend_service
ENV NODE_ENV=production \
    API_PORT=3000
EXPOSE 3000
WORKDIR /app/backend_service
# db:setup needs the dev tools it runs with (tsx, the Prisma CLI), so they stay in the image.
CMD ["sh", "-c", "npm run db:setup && exec node dist/main.js"]

# ---- web build -------------------------------------------------------------------------------
FROM deps AS web-build
# package-lock.json was written on macOS, so it only records the macOS builds of Vite's native
# helpers (npm/cli#4828) and `npm ci` installs none for Linux. Add the Linux builds at the exact
# versions the lockfile pins, without touching the lockfile.
RUN node -e "\
  const arch = process.arch; \
  const version = (p) => require('/app/node_modules/' + p + '/package.json').version; \
  const wanted = [ \
    '@rolldown/binding-linux-' + arch + '-gnu@' + version('rolldown'), \
    'lightningcss-linux-' + arch + '-gnu@' + version('lightningcss'), \
  ]; \
  require('child_process').execSync('npm install --no-save --no-audit --no-fund ' + wanted.join(' '), { stdio: 'inherit' });"
COPY web/ web/
RUN npm run build -w web

# ---- web -------------------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/web/dist /usr/share/nginx/html
EXPOSE 80
