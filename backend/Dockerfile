# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for building)
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

# Install exiftool, ffmpeg, and other dependencies
RUN apk add --no-cache \
    exiftool \
    ffmpeg \
    perl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create thumbnails directory
RUN mkdir -p /app/thumbnails

EXPOSE 4000

CMD ["node", "dist/index.js"]
