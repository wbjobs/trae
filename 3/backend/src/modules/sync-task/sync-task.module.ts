import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncTaskController } from './sync-task.controller';
import { SyncTaskService } from './sync-task.service';
import { SyncTask } from '../../entities/sync-task.entity';
import { FormSubmission } from '../../entities/form-submission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SyncTask, FormSubmission]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SyncTaskController],
  providers: [SyncTaskService],
  exports: [SyncTaskService],
})
export class SyncTaskModule {}
