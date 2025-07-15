import { z } from 'zod';
import path from 'path';
import { capture } from '../utils/capture.js';
import { auditLogger } from './audit-logger.js';

export class InputValidator {
  private static readonly COMMAND_BLACKLIST = [
    'rm -rf',
    'mkfs',
    'dd if=',
    'shutdown',
    'reboot',
    'halt',
    'poweroff',
    'init',
    'killall',
    'pkill',
    'kill',
    'chmod 777',
    'chown -R',
    'mv /',
    '> /dev/sd',
    'mkfs',
    'mknod',
    'wget',
    'curl',
  ];

  private static readonly PATH_TRAVERSAL_REGEX = /(\.\.\/|\.\.\\)/;
  private static readonly DANGEROUS_CHARS_REGEX = /[|&;`$(){}[\]<>]/;
  private static readonly SAFE_PATH_REGEX = /^[\w\-./:]+$/;

  static validateCommand(command: string): { valid: boolean; reason?: string } {
    if (!command || typeof command !== 'string') {
      return { valid: false, reason: 'Command must be a non-empty string' };
    }

    // Check for blacklisted commands
    const normalizedCmd = command.toLowerCase().trim();
    if (this.COMMAND_BLACKLIST.some(badCmd => normalizedCmd.startsWith(badCmd))) {
      auditLogger.log({
        action: 'command_validation_failed',
        status: 'failure',
        metadata: { command, reason: 'blacklisted_command' },
      });
      return { valid: false, reason: 'Command contains blacklisted pattern' };
    }

    // Check for path traversal attempts
    if (this.PATH_TRAVERSAL_REGEX.test(normalizedCmd)) {
      auditLogger.log({
        action: 'command_validation_failed',
        status: 'failure',
        metadata: { command, reason: 'path_traversal_attempt' },
      });
      return { valid: false, reason: 'Path traversal detected' };
    }

    // Check for dangerous characters
    if (this.DANGEROUS_CHARS_REGEX.test(normalizedCmd)) {
      auditLogger.log({
        action: 'command_validation_failed',
        status: 'failure',
        metadata: { command, reason: 'dangerous_characters' },
      });
      return { valid: false, reason: 'Command contains potentially dangerous characters' };
    }

    // Check command length
    if (command.length > 4096) {
      return { valid: false, reason: 'Command too long' };
    }

    return { valid: true };
  }

  static validatePath(inputPath: string, baseDir: string = process.cwd()): { valid: boolean; normalizedPath?: string; reason?: string } {
    if (typeof inputPath !== 'string' || !inputPath) {
      return { valid: false, reason: 'Path must be a non-empty string' };
    }

    // Check for path traversal
    if (this.PATH_TRAVERSAL_REGEX.test(inputPath)) {
      auditLogger.log({
        action: 'path_validation_failed',
        status: 'failure',
        metadata: { path: inputPath, reason: 'path_traversal_attempt' },
      });
      return { valid: false, reason: 'Path traversal detected' };
    }

    // Normalize and resolve path
    let normalizedPath: string;
    try {
      normalizedPath = path.normalize(inputPath);
      // Resolve against base directory to prevent directory traversal
      const resolvedPath = path.resolve(baseDir, normalizedPath);
      
      // Ensure the resolved path is within the base directory
      if (!resolvedPath.startsWith(path.resolve(baseDir))) {
        throw new Error('Path outside allowed directory');
      }
      
      normalizedPath = resolvedPath;
    } catch (error) {
      capture('path_validation_error', { error: error.message, path: inputPath });
      return { valid: false, reason: 'Invalid path' };
    }

    // Check for dangerous patterns
    if (!this.SAFE_PATH_REGEX.test(normalizedPath)) {
      auditLogger.log({
        action: 'path_validation_failed',
        status: 'failure',
        metadata: { path: normalizedPath, reason: 'invalid_characters' },
      });
      return { valid: false, reason: 'Path contains invalid characters' };
    }

    return { valid: true, normalizedPath };
  }

  static validateInput<T>(
    schema: z.ZodSchema<T>,
    input: unknown
  ): { success: boolean; data?: T; error?: string } {
    try {
      const result = schema.safeParse(input);
      if (!result.success) {
        const errorMessage = result.error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join('; ');
          
        auditLogger.log({
          action: 'input_validation_failed',
          status: 'failure',
          metadata: { error: errorMessage, input },
        });
        
        return { success: false, error: errorMessage };
      }
      return { success: true, data: result.data };
    } catch (error) {
      capture('input_validation_exception', { error: error.message });
      return { success: false, error: 'Internal validation error' };
    }
  }

  static sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';
    // Remove control characters and trim
    return input
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .trim();
  }

  static sanitizeObject<T>(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = this.sanitizeString(value);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        acc[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        acc[key] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item) : item
        );
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  }
}
