import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Form } from './form.entity';
import { FormSubmission } from './form-submission.entity';
import { ApprovalFlow } from './approval-flow.entity';
import { SyncTask } from './sync-task.entity';

export enum UserRole {
  TENANT_ADMIN = 'tenant_admin',
  REGULAR_USER = 'regular_user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100, unique: true })
  email: string;

  @Column({ length: 255 })
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.REGULAR_USER,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @OneToMany(() => Form, (form) => form.createdBy)
  createdForms: Form[];

  @OneToMany(() => FormSubmission, (submission) => submission.submittedBy)
  submissions: FormSubmission[];

  @OneToMany(() => ApprovalFlow, (flow) => flow.createdBy)
  approvalFlows: ApprovalFlow[];

  @OneToMany(() => SyncTask, (syncTask) => syncTask.createdBy)
  syncTasks: SyncTask[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
