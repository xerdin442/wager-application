# --- Stage 1: Builder Stage ---
FROM node:22 AS builder

# Set working directory
WORKDIR /app

# Copy package.json and lock files
COPY package.json package-lock.json ./

# Copy database schema
COPY prisma ./prisma

# Install all dependencies
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate --schema ./prisma/schema.prisma

# Copy the rest of the source code
COPY . .

# Build the application
RUN npm run build admin

# --- Stage 2: Production Runner Stage ---
FROM node:22 AS runner

# Set working directory
WORKDIR /app

# Set environmen variables
ENV NODE_ENV=production

# Copy package.json and lock files
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy Prisma Client
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client /app/node_modules/@prisma/client

# Copy the built application
COPY --from=builder /app/dist/apps/admin ./dist/apps/admin

# Start the application
CMD [ "node", "dist/apps/admin/main" ]