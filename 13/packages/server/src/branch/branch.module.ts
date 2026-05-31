import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchService } from './branch.service';
import { BranchController } from './branch.controller';
import { BranchEntity } from '../database/entities/branch.entity';
import { CommitEntity } from '../database/entities/commit.entity';
import { GraphEntity } from '../database/entities/graph.entity';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BranchEntity, CommitEntity, GraphEntity]),
    DatabaseModule,
  ],
  providers: [BranchService],
  controllers: [BranchController],
  exports: [BranchService],
})
export class BranchModule {}
