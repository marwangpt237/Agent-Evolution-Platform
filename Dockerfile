# Use Node.js 24 as the base image
FROM node:24-slim AS base

# Set the working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json ./

# Copy library packages
COPY lib ./lib

# Copy artifact packages
COPY artifacts ./artifacts

# Copy scripts
COPY scripts ./scripts

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the project
# We provide default env vars for the build step to avoid failures
ENV PORT=5000
ENV BASE_PATH=/
RUN pnpm run build

# Production stage
FROM node:24-slim AS production

WORKDIR /app

# Copy only the necessary files from the base stage
# For simplicity in this monorepo, we'll copy the built artifacts and node_modules
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=base /app/artifacts/algdevs-ai/dist ./artifacts/algdevs-ai/dist
COPY --from=base /app/package.json ./package.json

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Start the API server
# Note: The frontend is served as static files by the API server if configured, 
# or it can be served separately. Based on the repo, the API server handles the backend.
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
