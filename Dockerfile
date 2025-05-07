# Minimal Kali Linux container with just the essentials for MCP server
FROM kalilinux/kali-rolling

# Install only the minimal required packages
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install desktop-commander globally
RUN npm install -g @wonderwhy-er/desktop-commander@latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose MCP server port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start both the health server and MCP server
CMD ["sh", "-c", "node health-server.js & npx @wonderwhy-er/desktop-commander --port 8080 && tail -f /dev/null"]
