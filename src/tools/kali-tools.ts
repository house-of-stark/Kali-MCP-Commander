import { execSync } from 'child_process';
import { capture } from '../utils/capture.js';
import { auditLogger } from '../security/audit-logger.js';
import { InputValidator } from '../security/input-validator.js';
import { ServerResult } from '../types.js';

export type ToolDefinition = {
  name: string;
  description: string;
  command: string;
  args: Array<{
    name: string;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'file' | 'directory';
    default?: any;
    validation?: (value: any) => { valid: boolean; error?: string };
  }>;
  validateOutput?: (output: string) => { valid: boolean; error?: string };
  timeout?: number;
  allowedUsers?: string[];
  allowedGroups?: string[];
};

const KALI_TOOLS: Record<string, ToolDefinition> = {
  // Project Discovery Tools
  subfinder: {
    name: 'subfinder',
    description: 'Subdomain discovery tool that discovers valid subdomains for websites',
    command: 'subfinder',
    args: [
      {
        name: 'domain',
        description: 'Target domain to enumerate subdomains for',
        required: true,
        type: 'string',
        validation: (value: string) => ({
          valid: /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(value),
          error: 'Invalid domain format',
        }),
      },
      {
        name: 'all',
        description: 'Use all sources (slow) for enumeration',
        required: false,
        type: 'boolean',
        default: false,
      },
      {
        name: 'output',
        description: 'Output file to write results to',
        required: false,
        type: 'file',
      },
    ],
    timeout: 300000, // 5 minutes
  },
  naabu: {
    name: 'naabu',
    description: 'Fast port scanner for network discovery and security auditing',
    command: 'naabu',
    args: [
      {
        name: 'host',
        description: 'Host to scan (comma-separated for multiple hosts)',
        required: true,
        type: 'string',
      },
      {
        name: 'ports',
        description: 'Ports to scan (e.g., 80,443,8080 or 1-1000)',
        required: false,
        type: 'string',
        default: '80,443,8080,8443',
      },
      {
        name: 'top-ports',
        description: 'Top ports to scan (e.g., 100, 1000)',
        required: false,
        type: 'string',
      },
      {
        name: 'output',
        description: 'Output file to write results to',
        required: false,
        type: 'file',
      },
    ],
    timeout: 600000, // 10 minutes
  },
  httpx: {
    name: 'httpx',
    description: 'Fast and multi-purpose HTTP toolkit',
    command: 'httpx',
    args: [
      {
        name: 'target',
        description: 'Target URL, host, or file containing targets',
        required: true,
        type: 'string',
      },
      {
        name: 'title',
        description: 'Extract page title',
        required: false,
        type: 'boolean',
        default: true,
      },
      {
        name: 'status-code',
        description: 'Display response status-code',
        required: false,
        type: 'boolean',
        default: true,
      },
      {
        name: 'tech-detect',
        description: 'Detect website technologies',
        required: false,
        type: 'boolean',
        default: false,
      },
      {
        name: 'output',
        description: 'Output file to write results to',
        required: false,
        type: 'file',
      },
    ],
    timeout: 300000, // 5 minutes
  },
  nuclei: {
    name: 'nuclei',
    description: 'Fast vulnerability scanner based on simple YAML based DSL',
    command: 'nuclei',
    args: [
      {
        name: 'target',
        description: 'Target URL, host, or file containing targets',
        required: true,
        type: 'string',
      },
      {
        name: 'templates',
        description: 'Template or template directory to run (comma-separated)',
        required: false,
        type: 'string',
      },
      {
        name: 'severity',
        description: 'Filter templates by severity (info,low,medium,high,critical)',
        required: false,
        type: 'string',
        validation: (value: string) => ({
          valid: ['info', 'low', 'medium', 'high', 'critical', ''].includes(value.toLowerCase()),
          error: 'Invalid severity level',
        }),
      },
      {
        name: 'output',
        description: 'Output file to write results to',
        required: false,
        type: 'file',
      },
    ],
    timeout: 1200000, // 20 minutes
  },
  dnsx: {
    name: 'dnsx',
    description: 'Fast and multi-purpose DNS toolkit',
    command: 'dnsx',
    args: [
      {
        name: 'target',
        description: 'Target domain or file containing domains',
        required: true,
        type: 'string',
      },
      {
        name: 'a',
        description: 'Query A record (default: true)',
        required: false,
        type: 'boolean',
        default: true,
      },
      {
        name: 'cname',
        description: 'Query CNAME record',
        required: false,
        type: 'boolean',
        default: false,
      },
      {
        name: 'output',
        description: 'Output file to write results to',
        required: false,
        type: 'file',
      },
    ],
    timeout: 300000, // 5 minutes
  },
  
  // Original Kali Tools
  nmap: {
    name: 'nmap',
    description: 'Network exploration tool and security/port scanner',
    command: 'nmap',
    args: [
      {
        name: 'target',
        description: 'Target host or network range',
        required: true,
        type: 'string',
        validation: (value: string) => ({
          valid: /^[a-zA-Z0-9.-]+(?:\/[0-9]{1,2})?$/.test(value),
          error: 'Invalid target format. Use hostname, IP, or CIDR notation',
        }),
      },
      {
        name: 'scan_type',
        description: 'Type of scan to perform',
        required: false,
        type: 'string',
        default: '-sS',
        validation: (value: string) => ({
          valid: ['-sS', '-sT', '-sU', '-sV', '-A'].includes(value),
          error: 'Invalid scan type',
        }),
      },
      {
        name: 'ports',
        description: 'Ports to scan (e.g., 80,443,8080 or 1-1024)',
        required: false,
        type: 'string',
        default: '1-1024',
        validation: (value: string) => ({
          valid: /^([0-9]+(-[0-9]+)?)(,[0-9]+(-[0-9]+)?)*$/.test(value),
          error: 'Invalid port range format',
        }),
      },
    ],
    timeout: 300000, // 5 minutes
  },
  sqlmap: {
    name: 'sqlmap',
    description: 'Automatic SQL injection and database takeover tool',
    command: 'sqlmap',
    args: [
      {
        name: 'url',
        description: 'Target URL',
        required: true,
        type: 'string',
        validation: (value: string) => ({
          valid: value.startsWith('http'),
          error: 'URL must start with http:// or https://',
        }),
      },
      {
        name: 'risk',
        description: 'Risk of tests to perform (1-3)',
        required: false,
        type: 'number',
        default: 1,
        validation: (value: number) => ({
          valid: value >= 1 && value <= 3,
          error: 'Risk must be between 1 and 3',
        }),
      },
    ],
    timeout: 600000, // 10 minutes
  },
  metasploit: {
    name: 'msfconsole',
    description: 'Metasploit Framework console',
    command: 'msfconsole',
    args: [
      {
        name: 'command',
        description: 'Metasploit command to execute',
        required: true,
        type: 'string',
        validation: (value: string) => ({
          valid: !/rm\s|mv\s|>\s*\//.test(value),
          error: 'Potentially dangerous command detected',
        }),
      },
    ],
    timeout: 300000,
  },
  nikto: {
    name: 'nikto',
    description: 'Web server scanner',
    command: 'nikto',
    args: [
      {
        name: 'host',
        description: 'Target host',
        required: true,
        type: 'string',
      },
      {
        name: 'port',
        description: 'Port to scan',
        required: false,
        type: 'number',
        default: 80,
      },
    ],
    timeout: 300000,
  },
  john: {
    name: 'john',
    description: 'Password cracker',
    command: 'john',
    args: [
      {
        name: 'hash_file',
        description: 'Path to file containing password hashes',
        required: true,
        type: 'file',
      },
      {
        name: 'wordlist',
        description: 'Path to wordlist',
        required: false,
        type: 'file',
        default: '/usr/share/wordlists/rockyou.txt',
      },
    ],
    timeout: 1800000, // 30 minutes
  },
};

export class KaliToolManager {
  private static instance: KaliToolManager;
  private tools: Record<string, ToolDefinition>;

  private constructor() {
    this.tools = { ...KALI_TOOLS };
  }

  public static getInstance(): KaliToolManager {
    if (!KaliToolManager.instance) {
      KaliToolManager.instance = new KaliToolManager();
    }
    return KaliToolManager.instance;
  }

  public listTools(): Array<{
    name: string;
    description: string;
    args: Array<{ name: string; description: string; required: boolean; type: string }>;
  }> {
    return Object.values(this.tools).map(({ name, description, args }) => ({
      name,
      description,
      args: args.map(({ name, description, required, type }) => ({
        name,
        description,
        required,
        type,
      })),
    }));
  }

  public async executeTool(
    toolName: string,
    args: Record<string, any>,
    userId: string
  ): Promise<ServerResult> {
    const tool = this.tools[toolName];
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
        isError: true,
      };
    }

    // Log tool execution
    await auditLogger.log({
      action: 'tool_execution_started',
      status: 'success',
      userId,
      resource: toolName,
      metadata: { args },
    });

    try {
      // Validate arguments
      const validationResult = this.validateArguments(tool, args);
      if (!validationResult.valid) {
        return {
          content: [
            { type: 'text', text: `Invalid arguments: ${validationResult.error}` },
          ],
          isError: true,
        };
      }

      // Build command
      const command = this.buildCommand(tool, args);
      
      // Execute the command
      const output = await this.executeCommand(command, tool.timeout || 300000);

      // Validate output if validator is defined
      if (tool.validateOutput) {
        const validationResult = tool.validateOutput(output);
        if (!validationResult.valid) {
          throw new Error(`Output validation failed: ${validationResult.error}`);
        }
      }

      // Log successful execution
      await auditLogger.log({
        action: 'tool_executed',
        status: 'success',
        resource: toolName,
        metadata: { 
          args: JSON.stringify(args), 
          executionTime: new Date().toISOString() 
        },
        userId: userId || 'system',
      });

      // Add to analytics - don't await since we don't need to block on this
      void capture('tool_executed', {
        tool: toolName,
        timestamp: new Date().toISOString()
      });

      return {
        content: [{ type: 'text', text: output }],
        isError: false,
        _meta: {
          tool: toolName,
          executionTime: new Date().toISOString(),
          status: 'success'
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const timestamp = new Date().toISOString();
      console.error(`Error executing ${toolName}:`, errorMessage);
      
      // Log to audit log
      await auditLogger.log({
        action: 'tool_execution_failed',
        status: 'failure',
        resource: toolName,
        metadata: { 
          error: errorMessage, 
          args: JSON.stringify(args),
          timestamp
        },
        userId: userId || 'system',
      });
      
      // Add to analytics - don't await since we don't need to block on this
      void capture('tool_execution_failed', {
        tool: toolName,
        error: errorMessage,
        timestamp
      });
      
      return {
        content: [
          { 
            type: 'text', 
            text: `Error executing ${toolName}: ${errorMessage}` 
          },
        ],
        isError: true,
        _meta: {
          tool: toolName,
          executionTime: timestamp,
          status: 'error',
          error: errorMessage
        }
      };
    }
  }

  private validateArguments(
    tool: ToolDefinition,
    args: Record<string, any>
  ): { valid: boolean; error?: string } {
    // Check required arguments
    for (const argDef of tool.args) {
      if (argDef.required && args[argDef.name] === undefined) {
        return { valid: false, error: `Missing required argument: ${argDef.name}` };
      }

      // Validate argument value if provided
      if (args[argDef.name] !== undefined && argDef.validation) {
        const validation = argDef.validation(args[argDef.name]);
        if (!validation.valid) {
          return {
            valid: false,
            error: `Invalid value for ${argDef.name}: ${validation.error}`,
          };
        }
      }
    }

    return { valid: true };
  }

  private buildCommand(tool: ToolDefinition, args: Record<string, any>): string {
    let commandParts = [tool.command];
    const isProjectDiscovery = [
      'subfinder', 'naabu', 'httpx', 'nuclei', 'dnsx'
    ].includes(tool.name);

    // Special handling for nmap
    if (tool.name === 'nmap') {
      // Add scan type if provided
      if (args.scan_type) {
        commandParts.push(args.scan_type);
      }
      
      // Add ports if provided
      if (args.ports) {
        commandParts.push(`-p ${args.ports}`);
      }
      
      // Add target (required)
      if (args.target) {
        commandParts.push(args.target);
      }
      
      return commandParts.join(' ');
    }
    
    // Special handling for Project Discovery tools
    if (isProjectDiscovery) {
      // Handle Project Discovery tools with their specific argument formats
      for (const [argName, argValue] of Object.entries(args)) {
        if (argValue === undefined || argValue === null || argValue === '') {
          continue;
        }

        const argDef = tool.args.find(a => a.name === argName);
        if (!argDef) continue;

        // Handle boolean flags
        if (argDef.type === 'boolean') {
          if (argValue === true) {
            commandParts.push(`-${argName.length === 1 ? argName[0] : `-${argName}`}`);
          }
          continue;
        }

        // Handle key-value arguments
        const prefix = argName.length === 1 ? '-' : '--';
        commandParts.push(`${prefix}${argName}`);
        
        // For Project Discovery tools, don't escape file paths that are meant to be written to
        if (argName === 'output' && typeof argValue === 'string') {
          commandParts.push(argValue);
        } else if (argValue !== undefined && argValue !== null && argValue !== '') {
          commandParts.push(this.escapeShellArg(String(argValue)));
        }
      }
    } else {
      // Original handling for non-Project Discovery tools
      for (const argDef of tool.args) {
        const argValue = args[argDef.name];
        
        if (argValue === undefined || argValue === null || argValue === '') {
          if (argDef.required) {
            throw new Error(`Missing required argument: ${argDef.name}`);
          }
          continue;
        }

        if (argDef.type === 'boolean') {
          if (argValue === true) {
            commandParts.push(`--${argDef.name}`);
          }
          continue;
        }

        commandParts.push(`--${argDef.name}`);
        if (argValue !== undefined && argValue !== null && argValue !== '') {
          commandParts.push(this.escapeShellArg(String(argValue)));
        }
      }
    }

    return commandParts.join(' ');
  }

  private escapeShellArg(arg: string): string {
    // Return empty quoted string for empty input
    if (!arg || arg.length === 0) {
      return "''";
    }
    
    // If it's already quoted, return as is
    if ((arg.startsWith("'") && arg.endsWith("'")) || 
        (arg.startsWith('"') && arg.endsWith('"'))) {
      return arg;
    }
    
    // Simple escape for shell arguments - allow common URL characters
    if (/^[a-zA-Z0-9_\-\/\.\:\?\=\&\%\@\+\~\,]+$/.test(arg)) {
      return arg;
    }
    
    // Escape single quotes and wrap in single quotes
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  private async executeCommand(
    command: string,
    timeout: number
  ): Promise<string> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);
    
    try {
      const { stdout } = await execPromise(command, { 
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });
      
      // Log command execution for audit
      await auditLogger.log({
        action: 'command_executed',
        status: 'success',
        resource: command.split(' ')[0],
        metadata: {
          executionTime: new Date().toISOString()
        },
        userId: 'system'
      });
      
      // Add to analytics - don't await since we don't need to block on this
      void capture('command_executed', {
        command: command.split(' ')[0],
        executionTime: new Date().toISOString()
      });
      
      return stdout;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const commandName = command.split(' ')[0];
      const timestamp = new Date().toISOString();
      
      // Log command failure for audit
      await auditLogger.log({
        action: 'command_failed',
        status: 'failure',
        resource: commandName,
        metadata: {
          error: errorMessage,
          executionTime: timestamp
        },
        userId: 'system'
      });
      
      // Add to analytics - don't await since we don't need to block on this
      void capture('command_failed', {
        command: commandName,
        error: errorMessage,
        executionTime: timestamp
      });
      
      throw new Error(`Command failed: ${errorMessage}`);
    }
  }
}

// Export a singleton instance
export const kaliToolManager = KaliToolManager.getInstance();
