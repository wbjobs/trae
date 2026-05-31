import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GraphEntity } from './graph.entity';
import { CommitEntity } from './commit.entity';

@Entity('branches')
@Index(['graphId', 'name'], { unique: true })
export class BranchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  graphId: string;

  @Column({ default: false })
  isMain: boolean;

  @Column({ nullable: true, type: 'uuid' })
  parentBranchId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  parentCommitId: string | null;

  @Column({ type: 'int', default: 0 })
  parentVersion: number;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'int', default: 0 })
  currentVersion: number;

  @Column({ type: 'int', default: 0 })
  operationCount: number;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @ManyToOne(() => GraphEntity, (graph) => graph.branches, { onDelete: 'CASCADE' })
  graph: GraphEntity;

  @OneToMany(() => CommitEntity, (commit) => commit.branch)
  commits: CommitEntity[];
}
