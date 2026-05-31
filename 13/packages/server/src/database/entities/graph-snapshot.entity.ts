import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { SerializedGraphState } from '@collaborative-graph/shared';

@Entity('graph_snapshots')
@Index(['graphId', 'version'], { unique: true })
export class GraphSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  graphId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'jsonb' })
  state: SerializedGraphState;

  @Column({ type: 'integer' })
  nodeCount: number;

  @Column({ type: 'integer' })
  edgeCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
