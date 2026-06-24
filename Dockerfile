# Use Node.js 24 as the base image
128	FROM node:24-slim AS base
129	
130	# Set the working directory
131	WORKDIR /app
132	
133	# Install pnpm
134	RUN npm install -g pnpm
135	
136	# Copy workspace configuration and lockfile
137	COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json ./
138	
139	# Copy library packages
140	COPY lib ./lib
141	
142	# Copy artifact packages
143	COPY artifacts ./artifacts
144	
145	# Copy scripts
146	COPY scripts ./scripts
147	
148	# Install dependencies
149	RUN pnpm install --frozen-lockfile
150	
151	# Build the project
152	# We provide default env vars for the build step to avoid failures
153	ENV PORT=5000
154	ENV BASE_PATH=/
155	RUN pnpm run build
156	
157	# Production stage
158	FROM node:24-slim AS production
159	
160	WORKDIR /app
161	
162	# Copy only the necessary files from the base stage
163	# For simplicity in this monorepo, we'll copy the built artifacts and node_modules
164	COPY --from=base /app/node_modules ./node_modules
165	COPY --from=base /app/artifacts/api-server/dist ./artifacts/api-server/dist
166	COPY --from=base /app/artifacts/algdevs-ai/dist ./artifacts/algdevs-ai/dist
167	COPY --from=base /app/package.json ./package.json
168	
169	# Set environment variables
170	ENV NODE_ENV=production
171	ENV PORT=8080
172	
173	# Expose the port
174	EXPOSE 8080
175	
176	# Start the API server
177	# Note: The frontend is served as static files by the API server if configured, 
178	# or it can be served separately. Based on the repo, the API server handles the backend.
179	CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
180	
