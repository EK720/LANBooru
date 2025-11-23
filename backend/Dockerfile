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

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist

# Create thumbnails directory
RUN mkdir -p /app/thumbnails

EXPOSE 4000

CMD ["node", "dist/index.js"]
