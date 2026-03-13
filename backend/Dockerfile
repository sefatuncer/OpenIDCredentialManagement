FROM node:20-slim

WORKDIR /app

# Install build dependencies for native modules (aries-askar needs glibc)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Verify Askar native module compiled successfully
RUN node -e "require('@openwallet-foundation/askar-nodejs'); console.log('Askar native module OK')"

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Start server with Askar preloader
CMD ["node", "--require", "./scripts/register-askar.js", "dist/index.js"]
