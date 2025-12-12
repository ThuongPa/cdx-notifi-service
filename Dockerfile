# ================================
# Notification Service Dockerfile (NestJS)
# Optimized for Coolify Deployment
# ================================

# Multi-stage build for production
FROM node:20.11.0-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Build the application
FROM base AS builder
WORKDIR /app

# Copy package files first
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
# Note: Do NOT set NODE_ENV=production here, as it will skip devDependencies
# We need @nestjs/cli (devDependency) to build the application
RUN npm install --legacy-peer-deps --include=dev

# Verify @nestjs/cli is installed and nest CLI exists
RUN npm list @nestjs/cli || echo "WARNING: @nestjs/cli not found in node_modules"
RUN ls -la node_modules/.bin/ | grep nest || echo "WARNING: nest not found in node_modules/.bin"
RUN which nest || echo "WARNING: nest not in PATH"

# Copy source code (tsconfig files needed for build)
COPY . .

# Ensure config and scripts directories exist (create empty if they don't exist)
RUN mkdir -p config scripts

# Build using full path to nest CLI to ensure it's found
RUN ./node_modules/.bin/nest build --config tsconfig.build.json || npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force && \
    rm -rf /tmp/*

# Copy the built application
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copy config and scripts (directories are created in builder stage, so they always exist)
COPY --from=builder --chown=nestjs:nodejs /app/config ./config/
COPY --from=builder --chown=nestjs:nodejs /app/scripts ./scripts/

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs && \
    chown -R nestjs:nodejs /app

# Health check (using /api/v1/health as per global prefix)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
