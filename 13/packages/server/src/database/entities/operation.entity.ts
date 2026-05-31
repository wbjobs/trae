import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { Operation } from '@collaborative-graph/shared';

@Entity('operations')
@Index(['graphId', 'sequenceNumber'], { unique: true })
@Index(['graphId', 'version'])
export class OperationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  graphId: string;

  @Column()
  @Index()
  operationId: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  type: Operation['type'];

  @Column({ type: 'jsonb' })
  payload: Operation;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'integer' })
  sequenceNumber: number;

  @Column({ type: 'bigint' })
  timestamp: number;

  @CreateDateColumn()
  createdAt: Date;
}
