import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { ApprovalInstance } from './approval-instance.entity';

export enum TaskStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  TRANSFERRED = 'transferred',
}

@Entity('approval_tasks')
export class ApprovalTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  instanceId: string;

  @Column()
  nodeId: string;

  @Column()
  assigneeId: string;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({ length: 1000, nullable: true })
  comment: string;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @ManyToOne(() => ApprovalInstance, (instance) => instance.tasks, { onDelete: 'CASCADE' })
  instance: ApprovalInstance;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
