FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy source
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY ecosystem.config.js ./
COPY .env.example ./

# Create data directory
RUN mkdir -p data/backtest-results data/snapshots data/candles data/reports

EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3008/api/status || exit 1

# Run with PM2 for process management
RUN npm install -g pm2

CMD ["pm2-runtime", "ecosystem.config.js"]
