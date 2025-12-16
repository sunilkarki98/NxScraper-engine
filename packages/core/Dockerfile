###############################################
# OPTIMIZED MULTI-STAGE DOCKERFILE (Debian)
# - Debian-based for Playwright/Chromium support
# - Multi-stage: deps, builder, api, worker
# - Lightweight API stage
# - Full worker with Chromium installed
###############################################

###############################################
# Stage 1: Base image
###############################################
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

###############################################
# Stage 2: Dependencies (production only)
###############################################
FROM base AS deps
# Install build essentials
RUN apt-get update --allow-releaseinfo-change && apt-get install -y --no-install-recommends \
    python3 build-essential git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY packages/scrapers/google-scraper/package.json packages/scrapers/google-scraper/
COPY packages/scrapers/ultra-scraper/package.json packages/scrapers/ultra-scraper/
COPY packages/scrapers/universal-scraper/package.json packages/scrapers/universal-scraper/
COPY packages/scrapers/google-places/package.json packages/scrapers/google-places/

# Install production dependencies
RUN npm ci --omit=dev

###############################################
# Stage 3: Builder (with dev dependencies)
###############################################
FROM base AS builder
RUN apt-get update --allow-releaseinfo-change && apt-get install -y --no-install-recommends \
    python3 build-essential git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./
COPY packages packages/

# Install all dependencies including dev
RUN npm ci

# Copy tsconfig and source code
COPY tsconfig.json ./
COPY packages packages/

# Build all packages
RUN npm run build -w @nx-scraper/shared && \
    npm run build -w @nx-scraper/google-places && \
    npm run build -w @nx-scraper/google-scraper && \
    npm run build -w @nx-scraper/ultra-scraper && \
    npm run build -w @nx-scraper/universal-scraper && \
    npm run build -w @nx-scraper/core

###############################################
# Stage 4: API Gateway (Lightweight)
###############################################
FROM base AS api
ENV NODE_ENV=production

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Install wget for healthcheck and tini for zombie reaping
RUN apt-get update --allow-releaseinfo-change && apt-get install -y --no-install-recommends wget tini && rm -rf /var/lib/apt/lists/*


# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/scrapers/google-places/dist ./packages/scrapers/google-places/dist
COPY --from=builder /app/packages/scrapers/google-places/package.json ./packages/scrapers/google-places/
COPY --from=builder /app/packages/scrapers/universal-scraper/dist ./packages/scrapers/universal-scraper/dist
COPY --from=builder /app/packages/scrapers/universal-scraper/package.json ./packages/scrapers/universal-scraper/
COPY --from=builder /app/packages/scrapers/ultra-scraper/dist ./packages/scrapers/ultra-scraper/dist
COPY --from=builder /app/packages/scrapers/ultra-scraper/package.json ./packages/scrapers/ultra-scraper/
COPY --from=builder /app/packages/scrapers/google-scraper/dist ./packages/scrapers/google-scraper/dist
COPY --from=builder /app/packages/scrapers/google-scraper/package.json ./packages/scrapers/google-scraper/

# Copy API key management scripts
COPY --from=builder /app/packages/core/scripts ./packages/core/scripts

# Expose API port
EXPOSE 3000

# Non-root user
RUN addgroup --system nodejs && adduser --system --ingroup nodejs nodejs
USER nodejs

CMD ["/usr/bin/tini", "--", "node", "packages/core/dist/src/index.js"]

###############################################
# Stage 5: Worker (Full Chromium + Playwright)
###############################################
FROM base AS worker
ENV NODE_ENV=production

# Install system dependencies for Playwright and tini
RUN apt-get update --allow-releaseinfo-change && apt-get install -y --no-install-recommends \
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
    libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 lsb-release wget xdg-utils procps ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy all built artifacts (workers need all scrapers)
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/scrapers/google-places/dist ./packages/scrapers/google-places/dist
COPY --from=builder /app/packages/scrapers/google-places/package.json ./packages/scrapers/google-places/
COPY --from=builder /app/packages/scrapers/universal-scraper/dist ./packages/scrapers/universal-scraper/dist
COPY --from=builder /app/packages/scrapers/universal-scraper/package.json ./packages/scrapers/universal-scraper/
COPY --from=builder /app/packages/scrapers/ultra-scraper/dist ./packages/scrapers/ultra-scraper/dist
COPY --from=builder /app/packages/scrapers/ultra-scraper/package.json ./packages/scrapers/ultra-scraper/
COPY --from=builder /app/packages/scrapers/google-scraper/dist ./packages/scrapers/google-scraper/dist
COPY --from=builder /app/packages/scrapers/google-scraper/package.json ./packages/scrapers/google-scraper/

# Install Playwright browsers as root (with system dependencies)
RUN npx playwright install chromium --with-deps


# Create non-root user and set up home directory
RUN addgroup --system nodejs && adduser --system --ingroup nodejs nodejs

# Copy Playwright browsers from root cache to nodejs user cache
RUN mkdir -p /home/nodejs/.cache && \
    cp -r /root/.cache/ms-playwright /home/nodejs/.cache/ 2>/dev/null || true && \
    chown -R nodejs:nodejs /home/nodejs/.cache && \
    chown -R nodejs:nodejs /app

ENV HOME=/home/nodejs
USER nodejs

CMD ["/usr/bin/tini", "--", "node", "packages/core/dist/src/index.js"]