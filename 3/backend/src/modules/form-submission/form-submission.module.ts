import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormSubmissionController } from './form-submission.controller';
import { FormSubmissionService } from './form-submission.service';
import { FormSubmission } from '../../entities/form-submission.entity';
import { Form } from '../../entities/form.entity';
import { FormModule } from '../form/form.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormSubmission, Form]),
    forwardRef(() => FormModule),
  ],
  controllers: [FormSubmissionController],
  providers: [FormSubmissionService],
  exports: [FormSubmissionService],
})
export class FormSubmissionModule {}
