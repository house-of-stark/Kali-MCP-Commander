# PowerShell build script for Kali MCP Commander
# Usage: ./build.ps1 [minimal|full]

param(
    [string]$Profile = "minimal"
)

function Show-Usage {
    Write-Host "Usage: ./build.ps1 [minimal|full]"
    Write-Host "  minimal: Build with minimal Kali Linux installation (default)"
    Write-Host "  full:    Build with full Kali Linux toolset (very large)"
    exit 1
}

if ($Profile -ne "minimal" -and $Profile -ne "full") {
    Write-Host "Error: Invalid profile '$Profile'"
    Show-Usage
}

Write-Host "Building $Profile profile..."

if ($Profile -eq "minimal") {
    Write-Host "Building minimal Kali Linux with MCP server..."
    docker build -t kali-mcp-commander:minimal -f Dockerfile .
    Write-Host "`nMinimal build complete. To run: docker-compose up -d"
    Write-Host "Image tag: kali-mcp-commander:minimal"
} else {
    Write-Host "Building full Kali Linux with all tools and MCP server..."
    Write-Host "This will take a while and require significant disk space..."
    docker build -t kali-mcp-commander:full -f Dockerfile.full .
    Write-Host "`nFull build complete. To run: docker-compose -f docker-compose.full.yml up -d"
    Write-Host "Image tag: kali-mcp-commander:full"
}

Write-Host "`nBuild complete. Check the output above for any errors."
