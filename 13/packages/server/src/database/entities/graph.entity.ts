import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BranchEntity } from './branch.entity';

@Entity('graphs')
export class GraphEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'integer', default: 0 })
  currentVersion: number;

  @Column({ type: 'integer', default: 0 })
  operationCount: number;

  @Column({ type: 'integer', default: 0 })
  nodeCount: number;

  @Column({ type: 'integer', default: 0 })
  edgeCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => BranchEntity, (branch) => branch.graph)
  branches: BranchEntity[];
}
