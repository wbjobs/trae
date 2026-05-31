import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { Form } from './form.entity';
import { User } from './user.entity';
import { ApprovalNode } from './approval-node.entity';
import { ApprovalInstance } from './approval-instance.entity';

export enum FlowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('approval_flows')
export class ApprovalFlow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column()
  formId: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  createdById: string;

  @Column({
    type: 'enum',
    enum: FlowStatus,
    default: FlowStatus.DRAFT,
  })
  status: FlowStatus;

  @ManyToOne(() => Form, (form) => form.approvalFlows, { onDelete: 'CASCADE' })
  form: Form;

  @ManyToOne(() => User, (user) => user.approvalFlows)
  createdBy: User;

  @OneToMany(() => ApprovalNode, (node) => node.flow, { cascade: true })
  nodes: ApprovalNode[];

  @OneToMany(() => ApprovalInstance, (instance) => instance.flow)
  instances: ApprovalInstance[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
