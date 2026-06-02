# Wildlands backend — Docker build with Chromium for Paged.js PDF rendering.
# Railway uses Railpack by default (which ignores nixpacks.toml); a Dockerfile
# gives full control and guarantees Chromium + its system libraries are present.
FROM node:20-bookworm-slim

# Chromium + base fonts + libs so Puppeteer/Paged.js can render print PDFs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-freefont-ttf \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# render-pdf.ts resolves Chromium via CHROMIUM_PATH first.
ENV CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Dependency layer — cached unless a package.json or the lockfile changes.
COPY package.json yarn.lock ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY spikes/package.json ./spikes/
# --production=false forces devDeps (tsc/tsx) even if NODE_ENV=production is set.
RUN yarn install --frozen-lockfile --production=false

# App source + build (shared first, then backend).
COPY . .
RUN yarn workspace @wildlands/shared build \
 && yarn workspace @wildlands/backend build

# Railway injects PORT; the app reads process.env.PORT (default 8001).
CMD ["node", "backend/dist/index.js"]
