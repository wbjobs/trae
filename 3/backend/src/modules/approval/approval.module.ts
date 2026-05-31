import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { ApprovalFlow } from '../../entities/approval-flow.entity';
import { ApprovalNode } from '../../entities/approval-node.entity';
import { ApprovalInstance } from '../../entities/approval-instance.entity';
import { ApprovalTask } from '../../entities/approval-task.entity';
import { Form } from '../../entities/form.entity';
import { FormSubmission } from '../../entities/form-submission.entity';
import { User } from '../../entities/user.entity';
import { NotificationModule } from '../notification/notification.module';
import { FormSubmissionModule } from '../form-submission/form-submission.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApprovalFlow,
      ApprovalNode,
      ApprovalInstance,
      ApprovalTask,
      Form,
      FormSubmission,
      User,
    ]),
    NotificationModule,
    forwardRef(() => FormSubmissionModule),
  ],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
