#!/bin/bash

# Default to minimal build if no argument is provided
PROFILE=${1:-minimal}

# Function to display usage information
show_usage() {
    echo "Usage: $0 [minimal|full]"
    echo "  minimal: Build with minimal Kali Linux installation (default)"
    echo "  full:    Build with full Kali Linux toolset (very large)"
    exit 1
}

# Check for valid profile
if [[ "$PROFILE" != "minimal" && "$PROFILE" != "full" ]]; then
    echo "Error: Invalid profile '$PROFILE'"
    show_usage
fi

echo "Building $PROFILE profile..."

# Build based on profile
if [ "$PROFILE" = "minimal" ]; then
    echo "Building minimal Kali Linux with MCP server..."
    docker build -t kali-mcp-commander:minimal -f Dockerfile .
    echo "\nMinimal build complete. To run: docker-compose up -d"
    echo "Image tag: kali-mcp-commander:minimal"
else
    echo "Building full Kali Linux with all tools and MCP server..."
    echo "This will take a while and require significant disk space..."
    docker build -t kali-mcp-commander:full -f Dockerfile.full .
    echo "\nFull build complete. To run: docker-compose -f docker-compose.full.yml up -d"
    echo "Image tag: kali-mcp-commander:full"
fi

echo "\nBuild complete. Check the output above for any errors."
