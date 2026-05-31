import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne } from 'typeorm';
import { ApprovalFlow } from './approval-flow.entity';

export enum NodeType {
  START = 'start',
  APPROVAL = 'approval',
  CONDITION = 'condition',
  PARALLEL = 'parallel',
  END = 'end',
}

export enum ApprovalType {
  SINGLE = 'single',
  OR = 'or',
  AND = 'and',
}

export interface ApproverConfig {
  type: 'user' | 'role' | 'form_field';
  value: string;
}

export interface NodeCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: any;
}

@Entity('approval_nodes')
export class ApprovalNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  flowId: string;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: NodeType,
  })
  type: NodeType;

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ nullable: true })
  prevNodeId: string;

  @Column({ nullable: true })
  nextNodeId: string;

  @Column({ type: 'jsonb', nullable: true })
  approvers: ApproverConfig[];

  @Column({
    type: 'enum',
    enum: ApprovalType,
    nullable: true,
    default: ApprovalType.SINGLE,
  })
  approvalType: ApprovalType;

  @Column({ type: 'jsonb', nullable: true })
  condition: NodeCondition;

  @Column({ length: 500, nullable: true })
  description: string;

  @ManyToOne(() => ApprovalFlow, (flow) => flow.nodes, { onDelete: 'CASCADE' })
  flow: ApprovalFlow;

  @CreateDateColumn()
  createdAt: Date;
}
