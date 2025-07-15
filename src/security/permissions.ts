import { capture } from '../utils/capture.js';
import { auditLogger } from './audit-logger.js';

interface PermissionRule {
  command: string | RegExp;
  allowed: boolean;
  roles?: string[];
  maxConcurrent?: number;
  rateLimit?: {
    tokens: number;
    interval: number;
  };
}

export class PermissionManager {
  private rules: PermissionRule[] = [];
  private activeCommands: Map<string, Set<string>> = new Map();

  constructor(rules: PermissionRule[] = []) {
    this.rules = [
      // Default deny all
      { command: /.*/, allowed: false },
      // Add default rules
      ...rules,
    ];
  }

  private matchCommand(command: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return command === pattern;
    }
    return pattern.test(command);
  }

  async checkPermission(
    command: string,
    userId: string,
    userRoles: string[] = []
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Normalize command
    const normalizedCmd = command.trim().split(' ')[0];
    
    // Find matching rules (last matching rule wins)
    const matchingRules = this.rules.filter(rule => 
      this.matchCommand(normalizedCmd, rule.command)
    );

    const rule = matchingRules[matchingRules.length - 1];
    
    if (!rule) {
      return { allowed: false, reason: 'No matching permission rule found' };
    }

    // Check if command is allowed
    if (!rule.allowed) {
      return { allowed: false, reason: 'Command not allowed by policy' };
    }

    // Check role-based access
    if (rule.roles && rule.roles.length > 0) {
      const hasRole = userRoles.some(role => rule.roles!.includes(role));
      if (!hasRole) {
        return { allowed: false, reason: 'Insufficient permissions' };
      }
    }

    // Check concurrent execution limit
    if (rule.maxConcurrent) {
      const userCommands = this.activeCommands.get(userId) || new Set();
      if (userCommands.size >= rule.maxConcurrent) {
        return { 
          allowed: false, 
          reason: 'Maximum concurrent command limit reached' 
        };
      }
    }

    // Log permission check
    auditLogger.log({
      action: 'permission_check',
      status: 'success',
      userId,
      resource: command,
      metadata: {
        rule: rule.command.toString(),
        roles: userRoles,
      },
    });

    return { allowed: true };
  }

  trackCommandStart(userId: string, command: string) {
    if (!this.activeCommands.has(userId)) {
      this.activeCommands.set(userId, new Set());
    }
    this.activeCommands.get(userId)!.add(command);
  }

  trackCommandEnd(userId: string, command: string) {
    const userCommands = this.activeCommands.get(userId);
    if (userCommands) {
      userCommands.delete(command);
      if (userCommands.size === 0) {
        this.activeCommands.delete(userId);
      }
    }
  }

  addRule(rule: PermissionRule, index?: number) {
    if (index !== undefined) {
      this.rules.splice(index, 0, rule);
    } else {
      this.rules.push(rule);
    }
  }

  removeRule(index: number) {
    if (index >= 0 && index < this.rules.length) {
      this.rules.splice(index, 1);
    }
  }

  getRules() {
    return [...this.rules];
  }
}

// Default permission rules
const defaultRules: PermissionRule[] = [
  // Allow basic system commands
  { 
    command: /^(ls|pwd|whoami|id|date|echo|cat|grep|find|file|stat|du|df|free|uptime|w|who|last|history)$/, 
    allowed: true,
    roles: ['user'],
    maxConcurrent: 5,
  },
  // Allow network tools with rate limiting
  { 
    command: /^(ping|traceroute|dig|nslookup|host|curl|wget)$/, 
    allowed: true,
    roles: ['user'],
    maxConcurrent: 2,
    rateLimit: {
      tokens: 10,
      interval: 60000, // 1 minute
    },
  },
  // Allow package management
  { 
    command: /^(apt|apt-get|dpkg|snap)$/, 
    allowed: true,
    roles: ['admin'],
    maxConcurrent: 1,
  },
];

// Export a default instance
export const permissionManager = new PermissionManager(defaultRules);
