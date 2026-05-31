import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Form } from './form.entity';
import { User } from './user.entity';

export enum SyncTargetType {
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  WECHAT_WORK = 'wechat_work',
  FEISHU = 'feishu',
}

export enum SyncStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  FAILED = 'failed',
}

export interface DatabaseSyncConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  tableName: string;
}

export interface WechatWorkSyncConfig {
  agentId: string;
  secret: string;
  corpid: string;
  sheetId: string;
  range: string;
}

export interface FeishuSyncConfig {
  appId: string;
  appSecret: string;
  bitableToken: string;
  tableId: string;
}

export type SyncConfig = DatabaseSyncConfig | WechatWorkSyncConfig | FeishuSyncConfig;

export interface SyncLog {
  id: string;
  timestamp: Date;
  status: 'success' | 'error';
  recordCount?: number;
  errorMessage?: string;
}

@Entity('sync_tasks')
export class SyncTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  formId: string;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: SyncTargetType,
  })
  targetType: SyncTargetType;

  @Column({ type: 'jsonb' })
  config: SyncConfig;

  @Column({ length: 50 })
  schedule: string;

  @Column({
    type: 'enum',
    enum: SyncStatus,
    default: SyncStatus.ACTIVE,
  })
  status: SyncStatus;

  @Column({ nullable: true })
  lastSyncAt: Date;

  @Column({ nullable: true, type: 'jsonb' })
  lastSyncResult: SyncLog;

  @Column({ type: 'jsonb', nullable: true })
  recentLogs: SyncLog[];

  @Column({ nullable: true })
  createdById: string;

  @Column({ default: 0 })
  syncCount: number;

  @ManyToOne(() => Tenant, (tenant) => tenant.syncTasks, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @ManyToOne(() => Form, (form) => form.syncTasks, { onDelete: 'CASCADE' })
  form: Form;

  @ManyToOne(() => User, (user) => user.syncTasks)
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
