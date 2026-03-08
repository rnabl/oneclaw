# Harness - OneClaw Tool Execution Engine
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install Deno (for execute-code tool)
RUN apk add --no-cache curl unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && mv /root/.deno/bin/deno /usr/local/bin/

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all packages (harness needs them)
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages
RUN pnpm --filter @oneclaw/harness build

# Create data directory
RUN mkdir -p /app/data /app/logs

# Expose port
EXPOSE 9000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start harness
WORKDIR /app/packages/harness
CMD ["node", "dist/server.js"]
