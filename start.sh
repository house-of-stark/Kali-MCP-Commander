#!/bin/bash
set -e

# Build and start the containers
echo "Building and starting Docker containers..."
docker-compose up -d --build

# Wait for services to be ready
echo -n "Waiting for services to be ready"
for i in {1..10}; do
  if docker ps | grep -q "kali-mcp-commander" && \
     docker ps | grep -q "desktop-commander-mcp"; then
    echo -e "\n✅ Containers are running!"
    break
  fi
  echo -n "."
  sleep 2
done

echo -e "\n🚀 Claude Desktop with Kali MCP is ready to use!"
echo "Configure Claude Desktop to use MCP server at: http://localhost:8080"

# Show container status
echo -e "\nContainer Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=kali-mcp-commander|desktop-commander-mcp"
