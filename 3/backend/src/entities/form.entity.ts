import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { FormVersion } from './form-version.entity';
import { FormSubmission } from './form-submission.entity';
import { ApprovalFlow } from './approval-flow.entity';
import { SyncTask } from './sync-task.entity';

export enum FormStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'file' | 'number' | 'checkbox' | 'radio';
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  validation?: FormFieldValidation;
  linkage?: FormFieldLinkage;
  defaultValue?: any;
  width?: number;
}

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  customRules?: string[];
}

export interface FormFieldLinkage {
  dependsOn: string;
  showWhen?: { value: any; operator: 'eq' | 'neq' | 'contains' };
  optionsMap?: Record<string, { label: string; value: string }[]>;
  defaultOptions?: { label: string; value: string }[];
}

export interface FormLayout {
  columns: number;
  spacing: number;
}

@Entity('forms')
export class Form {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  createdById: string;

  @Column({
    type: 'enum',
    enum: FormStatus,
    default: FormStatus.DRAFT,
  })
  status: FormStatus;

  @Column({ type: 'int', default: 1 })
  currentVersion: number;

  @Column({ type: 'jsonb', nullable: true })
  fields: FormField[];

  @Column({ type: 'jsonb', nullable: true })
  layout: FormLayout;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ length: 64, nullable: true, unique: true })
  publicToken: string;

  @Column({ type: 'jsonb', nullable: true })
  publicSettings: {
    requireCaptcha?: boolean;
    expireAt?: Date;
    limitPerIp?: number;
    customDomain?: string;
  };

  @ManyToOne(() => Tenant, (tenant) => tenant.forms, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @ManyToOne(() => User, (user) => user.createdForms)
  createdBy: User;

  @OneToMany(() => FormVersion, (version) => version.form)
  versions: FormVersion[];

  @OneToMany(() => FormSubmission, (submission) => submission.form)
  submissions: FormSubmission[];

  @OneToMany(() => ApprovalFlow, (flow) => flow.form)
  approvalFlows: ApprovalFlow[];

  @OneToMany(() => SyncTask, (syncTask) => syncTask.form)
  syncTasks: SyncTask[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
