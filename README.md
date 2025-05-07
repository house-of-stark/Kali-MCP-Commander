# Claude Kali MCP Integration

A clean, minimal implementation of Kali Linux MCP (Model Context Protocol) integration for Claude Desktop, providing secure access to Kali Linux tools through Claude's interface. This project enables seamless execution of security tools and commands within an isolated Docker container.

## Features

- 🐳 **Docker-based** - Containerized environment for consistent execution
- 🔒 **Isolated Environment** - Kali Linux tools in a secure sandbox
- 🔄 **Automatic Health Checks** - Ensures service reliability and availability
- 📡 **MCP Server** - Standard protocol integration with Claude Desktop
- 🚀 **Quick Setup** - Get started with minimal configuration
- 🔧 **Configurable** - Customizable ports and settings
- 🔍 **Security-First** - Isolated execution environment for security tools
- 📊 **Monitoring** - Built-in health checks and status endpoints

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
   git clone https://github.com/house-of-stark/Claude-Kali-MCP-Commander
   cd Claude-Kali-MCP-Commander
   ```

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

4. **Configure Claude Desktop**:
   - Open Claude Desktop settings
   - Set MCP Server URL to: `http://localhost:8081`
   - Set Project Path to the full path of this repository (e.g., `/path/to/Claude-Kali-MCP-Commander`)
   - Restart Claude Desktop

## Project Structure

```
.
├── .gitignore           # Git ignore file
├── CONTRIBUTING.md      # Contribution guidelines
├── Dockerfile           # Kali Linux container setup with MCP server
├── LICENSE              # MIT License
├── README.md            # This file
├── config/              # Configuration files
│   └── claude_desktop_config.json  # Claude Desktop configuration
├── docker-compose.yml   # Service definitions and orchestration
├── health-server.js     # Health check server implementation
├── package.json         # Node.js dependencies
└── start.sh             # Helper script to start services
```

## Testing the Integration

After starting the services, you can test the MCP integration:

1. **Basic Health Check**:
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

### Claude Desktop Configuration

To use this MCP server with Claude Desktop, you'll need to configure the following in your Claude Desktop settings:

1. **MCP Server URL**: `http://localhost:8081`
2. **Project Path**: The full path to this repository on your system

This configuration includes two MCP server options:

1. **Kali Linux MCP (Required)**: Runs commands inside the Docker container with Kali Linux tools
2. **Host OS Commander (Optional)**: Can be used to run commands directly on the host OS where Claude Desktop is installed. You can remove this section if you only need the Kali Linux environment.

Example `claude_desktop_config.json`:

```json
{
  "mcpServerUrl": "http://localhost:8081",
  "projectPath": "/path/to/Claude-Kali-MCP-Commander",
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
      "description": "Access commands on the host OS where Claude Desktop is installed"
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

### Port Configuration

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
   - **Symptom**: Claude Desktop can't connect to the MCP server
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

## Credits

- Original work by [Eduard Ruzga](https://github.com/wonderwhy-er) (2024)

## Support

For support, please [open an issue](https://github.com/your-username/Claude-Kali-MCP-Commander/issues) on GitHub.
