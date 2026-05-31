import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { Form } from './form.entity';
import { User } from './user.entity';
import { ApprovalInstance } from './approval-instance.entity';

export enum SubmissionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

@Entity('form_submissions')
export class FormSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  formId: string;

  @Column({ nullable: true })
  submittedById: string;

  @Column({ length: 45, nullable: true })
  submittedByIp: string;

  @Column({ type: 'int', nullable: true })
  formVersion: number;

  @Column({ type: 'jsonb' })
  data: Record<string, any>;

  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.DRAFT,
  })
  status: SubmissionStatus;

  @Column({ nullable: true })
  approvalInstanceId: string;

  @ManyToOne(() => Form, (form) => form.submissions, { onDelete: 'CASCADE' })
  form: Form;

  @ManyToOne(() => User, (user) => user.submissions)
  submittedBy: User;

  @OneToMany(() => ApprovalInstance, (instance) => instance.submission)
  approvalInstances: ApprovalInstance[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
