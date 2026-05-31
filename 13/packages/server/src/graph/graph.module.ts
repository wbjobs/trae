import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GraphCollaborationService } from './graph-collaboration.service';
import { GraphController } from './graph.controller';

@Module({
  imports: [DatabaseModule],
  providers: [GraphCollaborationService],
  controllers: [GraphController],
  exports: [GraphCollaborationService],
})
export class GraphModule {}
