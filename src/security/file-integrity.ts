import { watch, FSWatcher, WatchEventType } from 'chokidar';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { capture } from '../utils/capture.js';
import { auditLogger } from './audit-logger.js';
import { InputValidator } from './input-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FileIntegrityCheck {
  path: string;
  hash: string;
  lastChecked: Date;
  lastModified: Date;
  size: number;
  mode: number;
  uid: number;
  gid: number;
}

interface FileIntegrityConfig {
  baselineFile: string;
  watchPaths: string[];
  excludePatterns: string[];
  checkInterval: number; // in milliseconds
  alertOnChange: boolean;
  alertOnDeletion: boolean;
  alertOnNewFile: boolean;
}

export class FileIntegrityMonitor {
  private static instance: FileIntegrityMonitor;
  private watcher: FSWatcher | null = null;
  private baseline: Map<string, FileIntegrityCheck> = new Map();
  private config: FileIntegrityConfig;
  private isMonitoring: boolean = false;
  private checkIntervalId: NodeJS.Timeout | null = null;

  private constructor(config?: Partial<FileIntegrityConfig>) {
    this.config = {
      baselineFile: path.join(process.cwd(), 'data', 'file-integrity-baseline.json'),
      watchPaths: ['/etc', '/usr/bin', '/usr/sbin', '/bin', '/sbin'],
      excludePatterns: ['**/.*', '**/*.log', '**/tmp/**', '**/temp/**'],
      checkInterval: 3600000, // 1 hour
      alertOnChange: true,
      alertOnDeletion: true,
      alertOnNewFile: true,
      ...config,
    };
  }

  public static getInstance(config?: Partial<FileIntegrityConfig>): FileIntegrityMonitor {
    if (!FileIntegrityMonitor.instance) {
      FileIntegrityMonitor.instance = new FileIntegrityMonitor(config);
    }
    return FileIntegrityMonitor.instance;
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.config.baselineFile), { recursive: true });
    } catch (error) {
      capture('create_integrity_dir_error', { error: error.message });
      throw error;
    }
  }

  public async loadBaseline(): Promise<void> {
    try {
      await this.ensureDataDirectory();
      const data = await fs.readFile(this.config.baselineFile, 'utf-8');
      const baseline = JSON.parse(data) as FileIntegrityCheck[];
      
      this.baseline = new Map(
        baseline.map(check => [
          check.path, 
          { ...check, lastChecked: new Date(check.lastChecked), lastModified: new Date(check.lastModified) }
        ])
      );
      
      capture('integrity_baseline_loaded', { count: this.baseline.size });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Baseline file doesn't exist yet
        this.baseline = new Map();
      } else {
        capture('load_baseline_error', { error: error.message });
        throw error;
      }
    }
  }

  private async saveBaseline(): Promise<void> {
    try {
      await this.ensureDataDirectory();
      const baseline = Array.from(this.baseline.values());
      const data = JSON.stringify(baseline, null, 2);
      await fs.writeFile(this.config.baselineFile, data, 'utf-8');
    } catch (error) {
      capture('save_baseline_error', { error: error.message });
      throw error;
    }
  }

  public async createBaseline(paths: string[] = this.config.watchPaths): Promise<void> {
    try {
      capture('baseline_creation_started', { paths });
      this.baseline = new Map();
      
      for (const watchPath of paths) {
        await this.scanDirectory(watchPath);
      }
      
      await this.saveBaseline();
      capture('baseline_creation_completed', { fileCount: this.baseline.size });
      
      await auditLogger.log({
        action: 'baseline_created',
        status: 'success',
        metadata: {
          fileCount: this.baseline.size,
          pathsScanned: paths,
        },
      });
    } catch (error) {
      capture('baseline_creation_failed', { error: error.message });
      await auditLogger.log({
        action: 'baseline_creation_failed',
        status: 'failure',
        metadata: {
          error: error.message,
          stack: error.stack,
        },
      });
      throw error;
    }
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      // Skip excluded paths
      if (this.config.excludePatterns.some(pattern => 
        path.normalize(dirPath).includes(path.normalize(pattern.replace(/\*\*\//g, '')))
      )) {
        return;
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        try {
          if (entry.isDirectory()) {
            await this.scanDirectory(fullPath);
          } else if (entry.isFile()) {
            await this.addFileToBaseline(fullPath);
          }
        } catch (error) {
          // Skip files we can't access
          capture('file_scan_error', { path: fullPath, error: error.message });
        }
      }
    } catch (error) {
      // Skip directories we can't access
      if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
        capture('directory_scan_error', { path: dirPath, error: error.message });
      }
    }
  }

  private async addFileToBaseline(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const fileContent = await fs.readFile(filePath);
      const hash = createHash('sha256').update(fileContent).digest('hex');
      
      const check: FileIntegrityCheck = {
        path: filePath,
        hash,
        lastChecked: new Date(),
        lastModified: stats.mtime,
        size: stats.size,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
      };
      
      this.baseline.set(filePath, check);
    } catch (error) {
      capture('add_file_to_baseline_error', { 
        path: filePath, 
        error: error.message 
      });
      throw error;
    }
  }

  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;
    
    if (this.baseline.size === 0) {
      throw new Error('No baseline exists. Create a baseline first.');
    }
    
    try {
      // Initialize watcher
      this.watcher = watch(this.config.watchPaths, {
        ignored: this.config.excludePatterns,
        ignoreInitial: true,
        persistent: true,
        followSymlinks: false,
        usePolling: false,
        interval: 100,
        binaryInterval: 300,
        alwaysStat: true,
        depth: 99,
        ignorePermissionErrors: true,
        atomic: true,
      });
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Schedule periodic full checks
      this.checkIntervalId = setInterval(
        () => this.performFullCheck(),
        this.config.checkInterval
      );
      
      this.isMonitoring = true;
      capture('file_integrity_monitoring_started', { 
        watchPaths: this.config.watchPaths,
        baselineSize: this.baseline.size,
      });
      
      await auditLogger.log({
        action: 'file_integrity_monitoring_started',
        status: 'success',
        metadata: {
          watchPaths: this.config.watchPaths,
          baselineSize: this.baseline.size,
        },
      });
    } catch (error) {
      capture('start_monitoring_error', { error: error.message });
      await this.stopMonitoring();
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher
      .on('add', async (filePath, stats) => {
        if (!this.config.alertOnNewFile) return;
        
        const check = this.baseline.get(filePath);
        if (!check) {
          await this.handleFileEvent('new_file', filePath, stats);
        }
      })
      .on('change', async (filePath, stats) => {
        if (!this.config.alertOnChange) return;
        
        const check = this.baseline.get(filePath);
        if (check) {
          const currentHash = await this.calculateFileHash(filePath);
          if (currentHash !== check.hash) {
            await this.handleFileEvent('file_modified', filePath, stats, check);
          }
        }
      })
      .on('unlink', async (filePath) => {
        if (!this.config.alertOnDeletion) return;
        
        const check = this.baseline.get(filePath);
        if (check) {
          await this.handleFileEvent('file_deleted', filePath, null, check);
        }
      });
  }

  private async handleFileEvent(
    eventType: 'new_file' | 'file_modified' | 'file_deleted',
    filePath: string,
    stats: any,
    baselineCheck?: FileIntegrityCheck
  ): Promise<void> {
    const event = {
      type: eventType,
      path: filePath,
      timestamp: new Date(),
      details: {
        size: stats?.size,
        mtime: stats?.mtime,
        baseline: baselineCheck ? {
          size: baselineCheck.size,
          lastModified: baselineCheck.lastModified,
        } : undefined,
      },
    };

    // Log to audit log
    await auditLogger.log({
      action: `file_integrity_${eventType}`,
      status: 'warning',
      metadata: event,
    });

    // Capture analytics
    capture(`file_${eventType}`, {
      path: filePath,
      size: stats?.size,
      mtime: stats?.mtime,
    });

    console.warn(`File integrity alert [${eventType}]: ${filePath}`);
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const fileContent = await fs.readFile(filePath);
      return createHash('sha256').update(fileContent).digest('hex');
    } catch (error) {
      capture('file_hash_calculation_error', { 
        path: filePath, 
        error: error.message 
      });
      throw error;
    }
  }

  public async performFullCheck(): Promise<{
    changed: FileIntegrityCheck[];
    missing: string[];
    newFiles: string[];
  }> {
    const changed: FileIntegrityCheck[] = [];
    const missing: string[] = [];
    const newFiles: string[] = [];
    const checkedPaths = new Set<string>();

    try {
      // Check all files in the baseline
      for (const [filePath, check] of this.baseline.entries()) {
        try {
          const stats = await fs.stat(filePath);
          const currentHash = await this.calculateFileHash(filePath);
          checkedPaths.add(filePath);
          
          if (currentHash !== check.hash) {
            changed.push({
              ...check,
              lastModified: stats.mtime,
              size: stats.size,
              lastChecked: new Date(),
            });
            
            await this.handleFileEvent('file_modified', filePath, stats, check);
          }
          
          // Update last checked time
          this.baseline.set(filePath, { ...check, lastChecked: new Date() });
        } catch (error) {
          if (error.code === 'ENOENT') {
            missing.push(filePath);
            await this.handleFileEvent('file_deleted', filePath, null, check);
          } else {
            capture('file_check_error', { 
              path: filePath, 
              error: error.message 
            });
          }
        }
      }

      // Save updated baseline
      await this.saveBaseline();

      // Log the check results
      capture('file_integrity_check_completed', {
        totalChecked: checkedPaths.size,
        changed: changed.length,
        missing: missing.length,
        newFiles: newFiles.length,
      });

      return { changed, missing, newFiles };
    } catch (error) {
      capture('full_check_error', { error: error.message });
      throw error;
    }
  }

  public async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) return;
    
    try {
      // Stop the watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }
      
      // Clear the check interval
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
      
      this.isMonitoring = false;
      
      capture('file_integrity_monitoring_stopped');
      
      await auditLogger.log({
        action: 'file_integrity_monitoring_stopped',
        status: 'success',
      });
    } catch (error) {
      capture('stop_monitoring_error', { error: error.message });
      throw error;
    }
  }

  public getStatus(): {
    isMonitoring: boolean;
    baselineSize: number;
    watchPaths: string[];
    lastCheck?: Date;
  } {
    return {
      isMonitoring: this.isMonitoring,
      baselineSize: this.baseline.size,
      watchPaths: this.config.watchPaths,
    };
  }
}

// Export a singleton instance
export const fileIntegrityMonitor = FileIntegrityMonitor.getInstance();
