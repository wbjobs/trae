import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { ApprovalFlow } from './approval-flow.entity';
import { FormSubmission } from './form-submission.entity';
import { ApprovalTask } from './approval-task.entity';

export enum InstanceStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Entity('approval_instances')
export class ApprovalInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  flowId: string;

  @Column()
  submissionId: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  currentNodeId: string;

  @Column({
    type: 'enum',
    enum: InstanceStatus,
    default: InstanceStatus.PENDING,
  })
  status: InstanceStatus;

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, any>;

  @ManyToOne(() => ApprovalFlow, (flow) => flow.instances, { onDelete: 'CASCADE' })
  flow: ApprovalFlow;

  @ManyToOne(() => FormSubmission, (submission) => submission.approvalInstances, { onDelete: 'CASCADE' })
  submission: FormSubmission;

  @OneToMany(() => ApprovalTask, (task) => task.instance)
  tasks: ApprovalTask[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
