import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { BranchEntity } from './branch.entity';
import { GraphSnapshotEntity } from './graph-snapshot.entity';

@Entity('commits')
@Index(['branchId', 'version'], { unique: true })
export class CommitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  branchId: string;

  @Column()
  graphId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'int' })
  sequenceNumber: number;

  @Column({ nullable: true, type: 'uuid' })
  parentCommitId: string | null;

  @Column()
  message: string;

  @Column()
  author: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'simple-array' })
  operationIds: string[];

  @Column({ nullable: true, type: 'uuid' })
  stateSnapshotId: string | null;

  @ManyToOne(() => BranchEntity, (branch) => branch.commits, { onDelete: 'CASCADE' })
  branch: BranchEntity;

  @ManyToOne(() => GraphSnapshotEntity, { nullable: true, onDelete: 'SET NULL' })
  stateSnapshot: GraphSnapshotEntity | null;
}
