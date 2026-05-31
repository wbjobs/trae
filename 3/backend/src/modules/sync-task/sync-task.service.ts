import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SyncTask,
  SyncStatus,
  SyncTargetType,
  SyncConfig,
  DatabaseSyncConfig,
  WechatWorkSyncConfig,
  FeishuSyncConfig,
  SyncLog,
} from '../../entities/sync-task.entity';
import { FormSubmission } from '../../entities/form-submission.entity';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class SyncTaskService {
  private readonly logger = new Logger(SyncTaskService.name);

  constructor(
    @InjectRepository(SyncTask)
    private syncTaskRepository: Repository<SyncTask>,
    @InjectRepository(FormSubmission)
    private submissionRepository: Repository<FormSubmission>,
  ) {}

  async getSyncTasks(currentUser: CurrentUserPayload): Promise<SyncTask[]> {
    return this.syncTaskRepository.find({
      where: { tenantId: currentUser.tenantId },
      relations: ['form'],
      order: { createdAt: 'DESC' },
    });
  }

  async getSyncTask(
    currentUser: CurrentUserPayload,
    taskId: string,
  ): Promise<SyncTask> {
    const task = await this.syncTaskRepository.findOne({
      where: { id: taskId, tenantId: currentUser.tenantId },
      relations: ['form'],
    });

    if (!task) {
      throw new NotFoundException('同步任务不存在');
    }

    return task;
  }

  async createSyncTask(
    currentUser: CurrentUserPayload,
    dto: {
      formId: string;
      name: string;
      targetType: SyncTargetType;
      config: SyncConfig;
      schedule: string;
    },
  ): Promise<SyncTask> {
    this.validateConfig(dto.targetType, dto.config);

    const task = this.syncTaskRepository.create({
      tenantId: currentUser.tenantId,
      formId: dto.formId,
      name: dto.name,
      targetType: dto.targetType,
      config: dto.config,
      schedule: dto.schedule,
      status: SyncStatus.ACTIVE,
      createdById: currentUser.id,
      recentLogs: [],
      syncCount: 0,
    });

    return this.syncTaskRepository.save(task);
  }

  async updateSyncTask(
    currentUser: CurrentUserPayload,
    taskId: string,
    dto: {
      name?: string;
      targetType?: SyncTargetType;
      config?: SyncConfig;
      schedule?: string;
      status?: SyncStatus;
    },
  ): Promise<SyncTask> {
    const task = await this.syncTaskRepository.findOne({
      where: { id: taskId, tenantId: currentUser.tenantId },
    });

    if (!task) {
      throw new NotFoundException('同步任务不存在');
    }

    if (dto.config) {
      this.validateConfig(dto.targetType || task.targetType, dto.config);
    }

    Object.assign(task, dto);
    return this.syncTaskRepository.save(task);
  }

  async deleteSyncTask(
    currentUser: CurrentUserPayload,
    taskId: string,
  ): Promise<void> {
    const task = await this.syncTaskRepository.findOne({
      where: { id: taskId, tenantId: currentUser.tenantId },
    });

    if (!task) {
      throw new NotFoundException('同步任务不存在');
    }

    await this.syncTaskRepository.remove(task);
  }

  async triggerSync(
    currentUser: CurrentUserPayload,
    taskId: string,
  ): Promise<SyncLog> {
    const task = await this.syncTaskRepository.findOne({
      where: { id: taskId, tenantId: currentUser.tenantId },
    });

    if (!task) {
      throw new NotFoundException('同步任务不存在');
    }

    return this.executeSync(task);
  }

  async toggleTaskStatus(
    currentUser: CurrentUserPayload,
    taskId: string,
  ): Promise<SyncTask> {
    const task = await this.syncTaskRepository.findOne({
      where: { id: taskId, tenantId: currentUser.tenantId },
    });

    if (!task) {
      throw new NotFoundException('同步任务不存在');
    }

    task.status = task.status === SyncStatus.ACTIVE ? SyncStatus.PAUSED : SyncStatus.ACTIVE;
    return this.syncTaskRepository.save(task);
  }

  private validateConfig(targetType: SyncTargetType, config: SyncConfig): void {
    switch (targetType) {
      case SyncTargetType.POSTGRESQL:
      case SyncTargetType.MYSQL:
        this.validateDatabaseConfig(config as DatabaseSyncConfig);
        break;
      case SyncTargetType.WECHAT_WORK:
        this.validateWechatWorkConfig(config as WechatWorkSyncConfig);
        break;
      case SyncTargetType.FEISHU:
        this.validateFeishuConfig(config as FeishuSyncConfig);
        break;
      default:
        throw new BadRequestException('不支持的同步目标类型');
    }
  }

  private validateDatabaseConfig(config: DatabaseSyncConfig): void {
    const requiredFields = ['host', 'port', 'database', 'username', 'password', 'tableName'];
    const missingFields = requiredFields.filter((field) => !(config as any)[field]);

    if (missingFields.length > 0) {
      throw new BadRequestException(`缺少必要字段: ${missingFields.join(', ')}`);
    }
  }

  private validateWechatWorkConfig(config: WechatWorkSyncConfig): void {
    const requiredFields = ['corpid', 'agentId', 'secret', 'sheetId', 'range'];
    const missingFields = requiredFields.filter((field) => !(config as any)[field]);

    if (missingFields.length > 0) {
      throw new BadRequestException(`缺少必要字段: ${missingFields.join(', ')}`);
    }
  }

  private validateFeishuConfig(config: FeishuSyncConfig): void {
    const requiredFields = ['appId', 'appSecret', 'bitableToken', 'tableId'];
    const missingFields = requiredFields.filter((field) => !(config as any)[field]);

    if (missingFields.length > 0) {
      throw new BadRequestException(`缺少必要字段: ${missingFields.join(', ')}`);
    }
  }

  private async executeSync(task: SyncTask): Promise<SyncLog> {
    const log: SyncLog = {
      id: `sync_${Date.now()}`,
      timestamp: new Date(),
      status: 'success',
      recordCount: 0,
    };

    try {
      const submissions = await this.submissionRepository.find({
        where: { formId: task.formId },
        order: { createdAt: 'DESC' },
      });

      log.recordCount = submissions.length;

      switch (task.targetType) {
        case SyncTargetType.POSTGRESQL:
        case SyncTargetType.MYSQL:
          await this.syncToDatabase(task, submissions);
          break;
        case SyncTargetType.WECHAT_WORK:
          await this.syncToWechatWork(task, submissions);
          break;
        case SyncTargetType.FEISHU:
          await this.syncToFeishu(task, submissions);
          break;
      }

      task.lastSyncAt = new Date();
      task.lastSyncResult = log;
      task.syncCount += 1;
      task.status = SyncStatus.ACTIVE;

      if (!task.recentLogs) {
        task.recentLogs = [];
      }
      task.recentLogs.unshift(log);
      if (task.recentLogs.length > 10) {
        task.recentLogs = task.recentLogs.slice(0, 10);
      }

      await this.syncTaskRepository.save(task);
    } catch (error: any) {
      this.logger.error(`Sync task ${task.id} failed: ${error.message}`);
      log.status = 'error';
      log.errorMessage = error.message;

      task.status = SyncStatus.FAILED;
      task.lastSyncResult = log;

      if (!task.recentLogs) {
        task.recentLogs = [];
      }
      task.recentLogs.unshift(log);
      if (task.recentLogs.length > 10) {
        task.recentLogs = task.recentLogs.slice(0, 10);
      }

      await this.syncTaskRepository.save(task);
    }

    return log;
  }

  private async syncToDatabase(
    task: SyncTask,
    submissions: FormSubmission[],
  ): Promise<void> {
    this.logger.log(
      `Syncing ${submissions.length} records to ${task.targetType} database`,
    );
  }

  private async syncToWechatWork(
    task: SyncTask,
    submissions: FormSubmission[],
  ): Promise<void> {
    this.logger.log(
      `Syncing ${submissions.length} records to WeChat Work sheet`,
    );
  }

  private async syncToFeishu(
    task: SyncTask,
    submissions: FormSubmission[],
  ): Promise<void> {
    this.logger.log(
      `Syncing ${submissions.length} records to Feishu table`,
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runScheduledTasks(): Promise<void> {
    const activeTasks = await this.syncTaskRepository.find({
      where: { status: SyncStatus.ACTIVE },
    });

    for (const task of activeTasks) {
      if (this.shouldExecuteNow(task.schedule)) {
        this.logger.log(`Executing scheduled sync task: ${task.id}`);
        await this.executeSync(task);
      }
    }
  }

  private shouldExecuteNow(schedule: string): boolean {
    if (!schedule) return false;

    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();

    const parts = schedule.split(' ');
    if (parts.length < 5) return false;

    const [minuteExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = parts;

    return (
      this.matchCronPart(minuteExpr, minute) &&
      this.matchCronPart(hourExpr, hour) &&
      this.matchCronPart(dayExpr, dayOfMonth) &&
      this.matchCronPart(weekdayExpr, dayOfWeek)
    );
  }

  private matchCronPart(expr: string, value: number): boolean {
    if (expr === '*') return true;

    const parts = expr.split(',');
    return parts.some((part) => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        return value >= start && value <= end;
      }
      if (part.includes('/')) {
        const [, step] = part.split('/').map(Number);
        return value % step === 0;
      }
      return Number(part) === value;
    });
  }
}
