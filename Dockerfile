# Stage 1: Build environment
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies (use install if no lock file exists)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code
COPY . .

# Build the application (with --no-lint to skip linting)
RUN npm run build -- --no-lint

# Stage 2: Production environment
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./

# Install only production dependencies
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 