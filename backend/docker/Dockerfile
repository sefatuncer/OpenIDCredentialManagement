# AI Agent Identity System - Multi-stage Dockerfile
# Stage 1: Build
FROM node:20-slim AS builder

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:20-slim AS production

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs -u 1000 nodejs

WORKDIR /app

# Copy only production files from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts

# Copy public folder if exists
COPY --from=builder --chown=nodejs:nodejs /app/public ./public 2>/dev/null || true

# Create data directories
RUN mkdir -p data/wallets logs && chown -R nodejs:nodejs data logs

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 3001 3002 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${API_PORT:-3000}/health || exit 1

# Default command
CMD ["node", "--require", "./scripts/register-askar.js", "dist/index.js"]
