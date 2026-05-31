import cron from 'node-cron';
import chokidar from 'chokidar';
import { app, Notification } from 'electron';
import type { SyncTask, SyncProgress, SyncLog, SyncConflict, ConflictResolution } from '../shared/types';
import { getTasks, updateTaskStatus } from './database';
import { 
  createSyncEngine, 
  OnProgressCallback, 
  OnLogCallback, 
  OnConflictCallback,
  OnCompleteCallback 
} from './sync-engine';

type TaskState = {
  task: SyncTask;
  engine: ReturnType<typeof createSyncEngine> | null;
  cronJob: cron.ScheduledTask | null;
  watcher: chokidar.FSWatcher | null;
  running: boolean;
};

class TaskScheduler {
  private taskStates = new Map<string, TaskState>();
  private onProgress?: OnProgressCallback;
  private onLog?: OnLogCallback;
  private onConflict?: OnConflictCallback;

  setCallbacks(onProgress?: OnProgressCallback, onLog?: OnLogCallback, onConflict?: OnConflictCallback): void {
    this.onProgress = onProgress;
    this.onLog = onLog;
    this.onConflict = onConflict;
  }

  async initialize(): Promise<void> {
    const tasks = getTasks();
    
    for (const task of tasks) {
      this.registerTask(task);
    }
  }

  registerTask(task: SyncTask): void {
    const state: TaskState = {
      task,
      engine: null,
      cronJob: null,
      watcher: null,
      running: false
    };

    this.taskStates.set(task.id, state);
    
    if (task.enabled) {
      this.setupTaskTriggers(task.id);
    }
  }

  unregisterTask(taskId: string): void {
    const state = this.taskStates.get(taskId);
    if (!state) return;

    state.cronJob?.stop();
    state.watcher?.close();
    state.engine?.cancel();

    this.taskStates.delete(taskId);
  }

  updateTask(task: SyncTask): void {
    this.unregisterTask(task.id);
    this.registerTask(task);
  }

  private setupTaskTriggers(taskId: string): void {
    const state = this.taskStates.get(taskId);
    if (!state || !state.task.enabled) return;

    const { task } = state;

    if (task.trigger === 'schedule' && task.schedule) {
      state.cronJob = cron.schedule(task.schedule, () => {
        this.runTask(taskId).catch(console.error);
      });
    }

    if (task.trigger === 'file-change' && task.source.type === 'local') {
      state.watcher = chokidar.watch(task.source.path, {
        persistent: true,
        ignoreInitial: true,
        usePolling: false,
        useFsEvents: true,
        interval: 5000,
        binaryInterval: 10000,
        awaitWriteFinish: {
          stabilityThreshold: 3000,
          pollInterval: 200
        },
        ignored: [
          /[\/\\]\./,
          /node_modules/,
          /\.git/,
          /\.svn/,
          /\.hg/,
          /\.(tmp|temp|swp|swx|bak|~)$/i,
          /Thumbs\.db$/i,
          /desktop\.ini$/i,
          /\$RECYCLE\.BIN$/i
        ],
        ignorePermissionErrors: true
      });

      let debounceTimer: NodeJS.Timeout;
      let lastSyncTime = 0;
      const MIN_SYNC_INTERVAL = 30000;

      const triggerSync = () => {
        const now = Date.now();
        
        if (now - lastSyncTime < MIN_SYNC_INTERVAL) {
          return;
        }

        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          lastSyncTime = Date.now();
          this.runTask(taskId).catch(console.error);
        }, 5000);
      };

      state.watcher.on('add', triggerSync);
      state.watcher.on('change', triggerSync);
      state.watcher.on('unlink', triggerSync);
      state.watcher.on('error', (err) => console.error(`Watcher error: ${err}`));
    }

    if (task.trigger === 'startup') {
      setTimeout(() => {
        this.runTask(taskId).catch(console.error);
      }, 3000);
    }
  }

  private sendNotification(task: SyncTask, type: 'success' | 'error' | 'conflict', message: string): void {
    let shouldNotify = false;
    
    switch (type) {
      case 'success':
        shouldNotify = task.notifications.onSuccess;
        break;
      case 'error':
        shouldNotify = task.notifications.onError;
        break;
      case 'conflict':
        shouldNotify = task.notifications.onConflict;
        break;
    }

    if (!shouldNotify) return;

    if (Notification.isSupported()) {
      const notification = new Notification({
        title: `文件同步 - ${task.name}`,
        body: message,
        silent: false
      });
      notification.show();
    }
  }

  async runTask(taskId: string): Promise<void> {
    const state = this.taskStates.get(taskId);
    if (!state || state.running || !state.task.enabled || state.task.paused) {
      return;
    }

    state.running = true;
    updateTaskStatus(taskId, 'running');

    const task = state.task;
    let hadConflicts = false;

    try {
      state.engine = createSyncEngine(task);
      await state.engine.execute(
        (progress) => this.onProgress?.(progress),
        (log) => this.onLog?.(log),
        (conflict) => this.onConflict?.(conflict),
        (success, conflicts) => {
          hadConflicts = conflicts;
          if (success) {
            if (conflicts) {
              this.sendNotification(task, 'success', '同步完成（存在已解决的冲突）');
            } else {
              this.sendNotification(task, 'success', '同步已完成');
            }
          }
        },
        () => {
          this.sendNotification(task, 'conflict', '检测到文件冲突，等待用户处理');
        }
      );
    } catch (err: any) {
      console.error(`Task ${taskId} failed:`, err);
      this.sendNotification(task, 'error', `同步失败: ${err.message}`);
    } finally {
      state.running = false;
      state.engine = null;
    }
  }

  pauseTask(taskId: string): void {
    const state = this.taskStates.get(taskId);
    if (!state) return;

    if (state.running) {
      state.engine?.pause();
    }
    updateTaskStatus(taskId, 'paused');
  }

  resumeTask(taskId: string): void {
    const state = this.taskStates.get(taskId);
    if (!state) return;

    state.engine?.resume();
    updateTaskStatus(taskId, state.running ? 'running' : 'idle');
  }

  cancelTask(taskId: string): void {
    const state = this.taskStates.get(taskId);
    if (!state) return;

    state.engine?.cancel();
  }

  enableTask(taskId: string): void {
    const state = this.taskStates.get(taskId);
    if (!state) return;

    state.task.enabled = true;
    this.setupTaskTriggers(taskId);
  }

  disableTask(taskId: string): void {
    const state = this.taskStates.get(taskId);
    if (!state) return;

    state.task.enabled = false;
    state.cronJob?.stop();
    state.watcher?.close();
    state.engine?.cancel();
  }

  isRunning(taskId: string): boolean {
    const state = this.taskStates.get(taskId);
    return state?.running ?? false;
  }

  shutdown(): void {
    for (const [taskId] of this.taskStates) {
      this.unregisterTask(taskId);
    }
  }
}

export const taskScheduler = new TaskScheduler();
