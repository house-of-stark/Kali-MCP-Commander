import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { capture } from '../utils/capture.js';
import { auditLogger } from '../security/audit-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CommandHistoryEntry {
  id: string;
  timestamp: Date;
  userId: string;
  command: string;
  arguments: Record<string, unknown>;
  status: 'success' | 'failed' | 'running';
  output?: string;
  error?: string;
  duration?: number;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

export class CommandHistoryManager {
  private static instance: CommandHistoryManager;
  private history: CommandHistoryEntry[] = [];
  private maxHistory: number = 1000;
  private historyFile: string;
  private saveQueue: Promise<void> = Promise.resolve();
  private saveDebounce: NodeJS.Timeout | null = null;

  private constructor() {
    this.historyFile = path.join(process.cwd(), 'data', 'command-history.json');
    this.loadHistory().catch(console.error);
  }

  public static getInstance(): CommandHistoryManager {
    if (!CommandHistoryManager.instance) {
      CommandHistoryManager.instance = new CommandHistoryManager();
    }
    return CommandHistoryManager.instance;
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.historyFile), { recursive: true });
    } catch (error) {
      capture('create_data_dir_error', { error: error.message });
      throw error;
    }
  }

  private async loadHistory(): Promise<void> {
    try {
      await this.ensureDataDirectory();
      const data = await fs.readFile(this.historyFile, 'utf-8');
      this.history = JSON.parse(data).map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      }));
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty history
        this.history = [];
      } else {
        capture('load_history_error', { error: error.message });
        console.error('Failed to load command history:', error);
        this.history = [];
      }
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      await this.ensureDataDirectory();
      const data = JSON.stringify(
        this.history.map((entry) => ({
          ...entry,
          timestamp: entry.timestamp.toISOString(),
        })),
        null,
        2
      );
      await fs.writeFile(this.historyFile, data, 'utf-8');
    } catch (error) {
      capture('save_history_error', { error: error.message });
      console.error('Failed to save command history:', error);
    }
  }

  private queueSave(): void {
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
    }

    this.saveDebounce = setTimeout(() => {
      this.saveQueue = this.saveQueue.then(() => this.saveHistory());
    }, 1000); // Debounce for 1 second
  }

  public addEntry(entry: Omit<CommandHistoryEntry, 'id' | 'timestamp'>): string {
    const newEntry: CommandHistoryEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date(),
    };

    this.history.unshift(newEntry);

    // Trim history if needed
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }

    // Log to audit log
    auditLogger.log({
      action: 'command_executed',
      status: newEntry.status,
      userId: newEntry.userId,
      resource: newEntry.toolName || 'unknown',
      metadata: {
        command: newEntry.command,
        arguments: newEntry.arguments,
        duration: newEntry.duration,
      },
    }).catch(console.error);

    // Save to disk
    this.queueSave();

    return newEntry.id;
  }

  public updateEntry(
    id: string,
    updates: Partial<Omit<CommandHistoryEntry, 'id' | 'timestamp' | 'userId'>>
  ): boolean {
    const entryIndex = this.history.findIndex((entry) => entry.id === id);
    if (entryIndex === -1) return false;

    this.history[entryIndex] = {
      ...this.history[entryIndex],
      ...updates,
    };

    // Save to disk
    this.queueSave();

    return true;
  }

  public getHistory(
    userId?: string,
    limit: number = 100,
    offset: number = 0
  ): CommandHistoryEntry[] {
    let filtered = this.history;
    
    if (userId) {
      filtered = filtered.filter((entry) => entry.userId === userId);
    }

    return filtered.slice(offset, offset + limit);
  }

  public getEntry(id: string): CommandHistoryEntry | undefined {
    return this.history.find((entry) => entry.id === id);
  }

  public searchHistory(
    query: string,
    userId?: string,
    limit: number = 50
  ): CommandHistoryEntry[] {
    const searchTerm = query.toLowerCase();
    let results = this.history.filter(
      (entry) =>
        entry.command.toLowerCase().includes(searchTerm) ||
        (entry.output && entry.output.toLowerCase().includes(searchTerm)) ||
        (entry.toolName && entry.toolName.toLowerCase().includes(searchTerm))
    );

    if (userId) {
      results = results.filter((entry) => entry.userId === userId);
    }

    return results.slice(0, limit);
  }

  public async clearHistory(userId?: string): Promise<void> {
    if (userId) {
      this.history = this.history.filter((entry) => entry.userId !== userId);
    } else {
      this.history = [];
    }
    
    await this.saveHistory();
    
    // Log the clear action
    auditLogger.log({
      action: 'history_cleared',
      status: 'success',
      userId: userId || 'system',
      metadata: { clearedBy: userId || 'system' },
    }).catch(console.error);
  }

  public async replayCommand(entryId: string, userId: string): Promise<CommandHistoryEntry> {
    const entry = this.getEntry(entryId);
    if (!entry) {
      throw new Error('Command not found in history');
    }

    // Create a new entry for the replayed command
    const replayId = this.addEntry({
      userId,
      command: entry.command,
      arguments: entry.arguments,
      status: 'running',
      toolName: entry.toolName,
      metadata: {
        replayedFrom: entryId,
        originalUser: entry.userId,
      },
    });

    try {
      // TODO: Actually execute the command using the appropriate tool
      // This would involve calling the relevant tool's execute method
      // For now, we'll just simulate execution
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      const result = {
        status: 'success' as const,
        output: `[REPLAY] ${entry.output || 'Command executed successfully'}`,
        duration: 1000,
      };

      this.updateEntry(replayId, result);
      return this.getEntry(replayId)!;
    } catch (error) {
      this.updateEntry(replayId, {
        status: 'failed',
        error: error.message,
        duration: 1000,
      });
      throw error;
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Export a singleton instance
export const commandHistoryManager = CommandHistoryManager.getInstance();
