import { CronJob } from 'cron';
import { commandHistoryManager } from './command-history.js';
import { auditLogger } from '../security/audit-logger.js';
import { capture } from '../utils/capture.js';
import { kaliToolManager } from '../tools/kali-tools.js';

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  command: string;
  args?: Record<string, any>;
  enabled: boolean;
  userId: string;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export class TaskScheduler {
  private static instance: TaskScheduler;
  private jobs: Map<string, CronJob> = new Map();
  private tasks: Map<string, ScheduledTask> = new Map();
  private savePath: string;
  private saveDebounce: NodeJS.Timeout | null = null;
  private saveQueue: Promise<void> = Promise.resolve();

  private constructor() {
    this.savePath = process.env.SCHEDULED_TASKS_FILE || './data/scheduled-tasks.json';
    this.loadTasks().catch(console.error);
  }

  public static getInstance(): TaskScheduler {
    if (!TaskScheduler.instance) {
      TaskScheduler.instance = new TaskScheduler();
    }
    return TaskScheduler.instance;
  }

  private async ensureDataDirectory(): Promise<void> {
    const { mkdir } = await import('fs/promises');
    const { dirname } = await import('path');
    
    try {
      await mkdir(dirname(this.savePath), { recursive: true });
    } catch (error) {
      capture('create_scheduler_dir_error', { error: error.message });
      throw error;
    }
  }

  private async loadTasks(): Promise<void> {
    const { readFile } = await import('fs/promises');
    
    try {
      await this.ensureDataDirectory();
      const data = await readFile(this.savePath, 'utf-8');
      const tasks = JSON.parse(data) as ScheduledTask[];
      
      // Convert string dates back to Date objects
      tasks.forEach(task => {
        task.createdAt = new Date(task.createdAt);
        task.updatedAt = new Date(task.updatedAt);
        if (task.lastRun) task.lastRun = new Date(task.lastRun);
        if (task.nextRun) task.nextRun = new Date(task.nextRun);
        
        this.tasks.set(task.id, task);
        if (task.enabled) {
          this.scheduleTask(task);
        }
      });
      
      capture('scheduler_tasks_loaded', { count: tasks.length });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty tasks
        this.tasks = new Map();
      } else {
        capture('load_tasks_error', { error: error.message });
        console.error('Failed to load scheduled tasks:', error);
        this.tasks = new Map();
      }
    }
  }

  private async saveTasks(): Promise<void> {
    const { writeFile } = await import('fs/promises');
    
    try {
      await this.ensureDataDirectory();
      const tasks = Array.from(this.tasks.values());
      const data = JSON.stringify(tasks, null, 2);
      await writeFile(this.savePath, data, 'utf-8');
    } catch (error) {
      capture('save_tasks_error', { error: error.message });
      console.error('Failed to save scheduled tasks:', error);
      throw error;
    }
  }

  private queueSave(): void {
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
    }

    this.saveDebounce = setTimeout(() => {
      this.saveQueue = this.saveQueue.then(() => this.saveTasks());
    }, 1000); // Debounce for 1 second
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private scheduleTask(task: ScheduledTask): void {
    // Remove existing job if it exists
    if (this.jobs.has(task.id)) {
      this.jobs.get(task.id)!.stop();
      this.jobs.delete(task.id);
    }

    try {
      const job = new CronJob(
        task.cronExpression,
        () => this.executeTask(task),
        null, // onComplete
        false, // start immediately
        'UTC' // timezone
      );

      // Update next run time
      task.nextRun = job.nextDate().toDate();
      this.tasks.set(task.id, task);
      this.queueSave();

      // Start the job if it's enabled
      if (task.enabled) {
        job.start();
      }

      this.jobs.set(task.id, job);
    } catch (error) {
      capture('schedule_task_error', { 
        taskId: task.id, 
        error: error.message,
        cronExpression: task.cronExpression 
      });
      
      console.error(`Failed to schedule task ${task.id}:`, error);
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    const startTime = Date.now();
    const historyId = commandHistoryManager.addEntry({
      userId: task.userId,
      command: task.command,
      arguments: task.args || {},
      status: 'running',
      toolName: task.name,
      metadata: {
        scheduledTaskId: task.id,
        scheduledTaskName: task.name,
      },
    });

    try {
      // Execute the command using the Kali tool manager
      const result = await kaliToolManager.executeTool(
        task.command,
        task.args || {},
        task.userId
      );

      // Update task with last run time
      task.lastRun = new Date();
      this.tasks.set(task.id, task);
      this.queueSave();

      // Update history with results
      commandHistoryManager.updateEntry(historyId, {
        status: 'success',
        output: result.content[0].text,
        duration: Date.now() - startTime,
      });

      // Log successful execution
      await auditLogger.log({
        action: 'scheduled_task_completed',
        status: 'success',
        userId: task.userId,
        resource: `scheduled-task:${task.id}`,
        metadata: {
          taskName: task.name,
          command: task.command,
          duration: Date.now() - startTime,
        },
      });
    } catch (error) {
      // Update task with last run time and error
      task.lastRun = new Date();
      this.tasks.set(task.id, task);
      this.queueSave();

      // Update history with error
      commandHistoryManager.updateEntry(historyId, {
        status: 'failed',
        error: error.message,
        duration: Date.now() - startTime,
      });

      // Log error
      await auditLogger.log({
        action: 'scheduled_task_failed',
        status: 'failure',
        userId: task.userId,
        resource: `scheduled-task:${task.id}`,
        metadata: {
          taskName: task.name,
          command: task.command,
          error: error.message,
          stack: error.stack,
        },
      });
    }
  }

  public createTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>): ScheduledTask {
    const now = new Date();
    const newTask: ScheduledTask = {
      ...task,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
      lastRun: undefined,
      nextRun: undefined,
    };

    this.tasks.set(newTask.id, newTask);
    
    if (newTask.enabled) {
      this.scheduleTask(newTask);
    }
    
    this.queueSave();
    
    // Audit log
    auditLogger.log({
      action: 'scheduled_task_created',
      status: 'success',
      userId: task.userId,
      resource: `scheduled-task:${newTask.id}`,
      metadata: {
        taskName: task.name,
        command: task.command,
        cronExpression: task.cronExpression,
      },
    }).catch(console.error);

    return newTask;
  }

  public updateTask(
    taskId: string, 
    updates: Partial<Omit<ScheduledTask, 'id' | 'createdAt' | 'userId'>>
  ): ScheduledTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updatedTask: ScheduledTask = {
      ...task,
      ...updates,
      updatedAt: new Date(),
    };

    this.tasks.set(taskId, updatedTask);
    
    if (updates.enabled || updates.cronExpression) {
      this.scheduleTask(updatedTask);
    }
    
    this.queueSave();
    
    // Audit log
    auditLogger.log({
      action: 'scheduled_task_updated',
      status: 'success',
      userId: task.userId,
      resource: `scheduled-task:${taskId}`,
      metadata: {
        taskName: task.name,
        updates: Object.keys(updates),
      },
    }).catch(console.error);

    return updatedTask;
  }

  public deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // Stop the job if it's running
    if (this.jobs.has(taskId)) {
      this.jobs.get(taskId)!.stop();
      this.jobs.delete(taskId);
    }

    this.tasks.delete(taskId);
    this.queueSave();
    
    // Audit log
    auditLogger.log({
      action: 'scheduled_task_deleted',
      status: 'success',
      userId: task.userId,
      resource: `scheduled-task:${taskId}`,
      metadata: {
        taskName: task.name,
      },
    }).catch(console.error);

    return true;
  }

  public getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  public listTasks(userId?: string): ScheduledTask[] {
    let tasks = Array.from(this.tasks.values());
    
    if (userId) {
      tasks = tasks.filter(task => task.userId === userId);
    }
    
    return tasks.sort((a, b) => {
      // Sort by next run time, with nulls last
      if (!a.nextRun && !b.nextRun) return 0;
      if (!a.nextRun) return 1;
      if (!b.nextRun) return -1;
      return a.nextRun.getTime() - b.nextRun.getTime();
    });
  }

  public runTaskNow(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.executeTask(task).catch(error => {
      console.error(`Error executing task ${taskId}:`, error);
    });

    return true;
  }
}

// Export a singleton instance
export const taskScheduler = TaskScheduler.getInstance();
