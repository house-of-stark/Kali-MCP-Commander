import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { capture } from '../utils/capture.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuditLogEntry {
  timestamp: string;
  action: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  status: 'success' | 'failure' | 'warning';
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  private logFile: string;
  private maxFileSize: number;
  private maxFiles: number;
  private logQueue: Promise<void> = Promise.resolve();

  constructor(
    logDirectory: string = path.join(process.cwd(), 'logs'),
    maxFileSize: number = 10 * 1024 * 1024, // 10MB
    maxFiles: number = 5
  ) {
    this.logFile = path.join(logDirectory, 'audit.log');
    this.maxFileSize = maxFileSize;
    this.maxFiles = maxFiles;
    this.ensureLogDirectory(logDirectory).catch(console.error);
  }

  private async ensureLogDirectory(logDir: string) {
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
      throw error;
    }
  }

  private async rotateLogs() {
    try {
      const stats = await fs.stat(this.logFile).catch(() => null);
      
      if (stats && stats.size > this.maxFileSize) {
        // Close current log file
        
        // Rotate logs
        for (let i = this.maxFiles - 1; i >= 0; i--) {
          const current = i === 0 ? this.logFile : `${this.logFile}.${i}`;
          const next = `${this.logFile}.${i + 1}`;
          
          try {
            await fs.rename(current, next);
          } catch (error: unknown) {
            if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
              throw error;
            }
            // Ignore ENOENT (file not found) errors as they're expected during log rotation
          }
        }
      }
    } catch (error: unknown) {
      console.error('Error rotating logs:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during log rotation';
      void capture('audit_log_rotation_failed', { error: errorMessage });
    }
  }

  async log(entry: Omit<AuditLogEntry, 'timestamp'>) {
    const fullEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Add to analytics
    capture('audit_event', {
      action: entry.action,
      status: entry.status,
      resource: entry.resource,
    });

    // Add to log file asynchronously
    this.logQueue = this.logQueue
      .then(() => this.rotateLogs())
      .then(() =>
        fs.appendFile(
          this.logFile,
          JSON.stringify(fullEntry) + '\n',
          'utf8'
        )
      )
      .catch((error) => {
        console.error('Failed to write to audit log:', error);
        capture('audit_log_write_failed', { error: error.message });
      });

    return this.logQueue;
  }
}

// Export a singleton instance
export const auditLogger = new AuditLogger();

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  auditLogger.log({
    action: 'uncaught_exception',
    status: 'failure',
    metadata: {
      error: error.message,
      stack: error.stack,
    },
  });});
