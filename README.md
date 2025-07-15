# Kali-MCP-Commander

A powerful implementation of Kali Linux MCP (Model Context Protocol) integration, providing secure access to Kali Linux tools through an MCP interface. This project enables seamless execution of security tools and commands within an isolated Docker container.

## Features

- 🐳 **Docker-based** - Containerized environment for consistent execution
- 🔒 **Isolated Environment** - Kali Linux tools in a secure sandbox
- 🔄 **Automatic Health Checks** - Ensures service reliability and availability
- 📡 **MCP Server** - Standard protocol integration with MCP-compatible clients
- 🚀 **Quick Setup** - Get started with minimal configuration
- 🔧 **Configurable** - Customizable ports and settings
- 🔍 **Security-First** - Isolated execution environment for security tools
- 📊 **Monitoring** - Built-in health checks and status endpoints

## MCP Client Compatibility

Kali-MCP-Commander is designed to work with any MCP (Model Context Protocol) server client, including:

- **Claude Desktop** - Full compatibility with Claude's MCP integration (v2.0+)
- **Other MCP Clients** - Works with any client that implements the MCP protocol
- **Standard Compliance** - Implements the latest MCP specification for broad compatibility

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20.10.0+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0.0+)
- [Git](https://git-scm.com/downloads) (for cloning the repository)
- [Node.js](https://nodejs.org/) (v16+ for development and testing)

## Networking Note

By default, the provided `docker-compose.yml` and `docker-compose.full.yml` files use **host networking** (`network_mode: host`). This gives the containers full access to the host network, which is required for some advanced networking tools and scenarios.

**Security Note:**
- Host networking provides less isolation between your host and the containers. All network interfaces and ports are shared.
- If you prefer more isolation, you can switch to Docker's default `bridge` network by removing the `network_mode: host` lines and adding a `ports:` mapping (e.g., `8081:8080`) to the relevant service(s). See the commented examples in the compose files and documentation below for details.

## Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/house-of-stark/Kali-MCP-Commander
   cd Kali-MCP-Commander
   ```

---

## 🛠️ Build & Run Instructions

**Note:** `sudo` is enabled inside the Kali container for tools like `nmap` and others that require elevated privileges. If you want to restrict the use of `sudo`, edit the `blockedCommands` list in `config.json`.

### Windows (PowerShell)

**Note:** If you see a script signing or execution policy error, run the script with ExecutionPolicy Bypass:

1. **Minimal build (recommended):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\build.ps1
   docker-compose up -d
   ```

2. **Full Kali tools build:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\build.ps1 -Profile full
   docker-compose -f docker-compose.full.yml up -d
   ```

### Linux / macOS (Bash)

1. **Minimal build (recommended):**
   ```bash
   ./build.sh minimal
   docker-compose up -d
   ```

2. **Full Kali tools build:**
   ```bash
   ./build.sh full
   docker-compose -f docker-compose.full.yml up -d
   ```

### Start & Monitor Services

- **Quick start script (Linux/macOS):**
  ```bash
  chmod +x start.sh
  ./start.sh
  ```
  This builds and starts the containers, waits for readiness, and shows status.

- **Check health endpoint:**
  ```bash
  curl http://localhost:8080/health
  ```
  Should return: `{"status":"ok"}`

- **View running containers:**
  ```bash
  docker ps --filter "name=kali-mcp-commander"
  ```

### Configure MCP Client

- Set MCP Server URL to: `http://localhost:8080`
- (Optional) Set Project Path to your local repo directory

---

2. **Choose your build profile**:

   - **Minimal (Default)**: Small image with just the MCP server (recommended for most users)
     ```bash
     ./build.sh minimal
     docker-compose up -d
     ```

   - **Full**: Complete Kali Linux with all tools (very large image)
     ```bash
     ./build.sh full
     docker-compose -f docker-compose.full.yml up -d
     ```

   The minimal build is much faster and smaller, while the full build includes all Kali Linux tools but requires significant disk space.

3. **Verify the installation**:
   ```bash
   curl http://localhost:8081/health
   ```
   Should return: `{"status":"ok"}`

4. **Configure Your MCP Client**:
   - Open your MCP client (e.g., Claude Desktop) settings
   - Go to the MCP Servers section
   - Set Project Path to the full path of this repository (e.g., `/path/to/Kali-MCP-Commander`)
   - Restart your MCP client

## Project Structure

```
.
├── .gitignore           # Git ignore file
├── CONTRIBUTING.md      # Contribution guidelines
├── Dockerfile           # Kali Linux container setup with MCP server
├── LICENSE              # MIT License
├── README.md            # This file
├── config/              # Configuration files
│   └── mcp_client_config.json  # MCP client configuration
├── docker-compose.yml   # Service definitions and orchestration
├── health-server.js     # Health check server implementation
├── package.json         # Node.js dependencies
└── start.sh             # Helper script to start services
```

## Testing the Integration

After starting the services, you can test the MCP integration:

1. **Basic Health Check**: (If using bridging to Docker)
   ```bash
   curl http://localhost:8081/health
   ```
   Should return: `{"status":"ok"}`

2. **Verify Container Status**:
   ```bash
   docker ps --filter "name=kali-mcp-commander-minimal"
   ```
   Should show the container as "healthy"

3. **View Container Logs**:
   ```bash
   docker logs kali-mcp-commander
   ```
   Check for any error messages or warnings

## Configuration

### MCP Client Configuration

To use this MCP server with an MCP-compatible client (like Claude Desktop), you'll need to configure the following in your client settings:


1. **Kali Linux MCP (Required)**: Runs commands inside the Docker container with Kali Linux tools
2. **Host OS Commander (Optional)**: Can be used to run commands directly on the host OS where your MCP client is installed. You can remove this section if you only need the Kali Linux environment.

Example single MCP Server `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kali-mcp": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "kali-mcp-commander-minimal",
        "npx",
        "@wonderwhy-er/desktop-commander"
      ],
      "name": "Kali Linux MCP",
      "description": "Access Kali Linux security tools via MCP"
    }
  },
  "defaultMcpServerId": "kali-mcp"
}
```

Example MCP Commander Desktop OS and Kali MCP Server `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kali-mcp": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "kali-mcp-commander-minimal",
        "npx",
        "@wonderwhy-er/desktop-commander"
      ],
      "name": "Kali Linux MCP",
      "description": "Access Kali Linux security tools via MCP"
    },
    "desktop-commander": {
      "command": "npx",
      "args": [
        "@wonderwhy-er/desktop-commander@latest"
      ],
      "name": "Host OS Commander",
      "description": "Access commands on the host OS where your MCP client is installed"
    }
  },
  "defaultMcpServerId": "kali-mcp"
}
```

### Environment Variables

You can customize the following environment variables in the `docker-compose.yml` file:

- `MCP_SERVER_PORT`: Port for the MCP server (default: 8080)
- `NODE_ENV`: Environment mode (development/production)
- `LOG_LEVEL`: Logging verbosity (debug, info, warn, error)

### Port Configuration (if not using host networking)

To change the default ports, modify the `ports` section in `docker-compose.yml`:

```yaml
ports:
  - "8081:8080"  # HostPort:ContainerPort
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   - **Symptom**: Container fails to start with port binding errors
   - **Solution**: Change the host port in `docker-compose.yml`

2. **Container Health Check Fails**
   - **Symptom**: Container restarts continuously
   - **Solution**: Check logs with `docker logs kali-mcp-commander-minimal`

3. **MCP Server Not Responding**
   - **Symptom**: MCP client can't connect to the server
   - **Solution**:
     - Verify the server is running: `curl http://localhost:8081/health`
     - Check Docker network settings
     - Ensure no firewall is blocking port 8081

### Debugging

For detailed debugging, you can modify the `docker-compose.yml` to include additional logging:

```yaml
environment:
  - NODE_ENV=development
  - DEBUG=*
```

## Security Considerations

- The container runs with minimal privileges
- Network access is restricted to localhost by default
- Regular security updates are recommended for the base Kali Linux image
- Review the Dockerfile for any custom configurations

## Performance

- The container is optimized for minimal resource usage
- Health checks ensure service availability
- Resource limits can be configured in `docker-compose.yml`

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on how to contribute to this project.

When contributing, please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Chris Stark. Maintained by Chris Stark.

## Credits

- Original work by [Eduard Ruzga](https://github.com/wonderwhy-er) (2024)

## Support

For support, please [open an issue](https://github.com/house-of-stark/Kali-MCP-Commander/issues) on GitHub.
