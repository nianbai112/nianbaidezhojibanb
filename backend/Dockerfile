# =============================================================================
# Stage 1: Builder — compiles NestJS TypeScript to JavaScript
# =============================================================================
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies (all, including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source code and Prisma schema
COPY . .

# Generate Prisma client (needed at build time for type checking)
RUN npx prisma generate

# Compile TypeScript → dist/
RUN npm run build

# =============================================================================
# Stage 2: Production — minimal runtime image
# =============================================================================
FROM node:18-alpine AS production

# Create unprivileged user/group (non-root best practice)
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

WORKDIR /app

# Copy package manifests and install ONLY production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Ensure appuser owns the application directory
RUN chown -R appuser:appgroup /app

# Drop privileges
USER appuser

# Expose the NestJS application port (3000 by default)
EXPOSE 3000

# Health check — verifies the HTTP server responds on localhost
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Start the application
CMD ["node", "dist/main"]
