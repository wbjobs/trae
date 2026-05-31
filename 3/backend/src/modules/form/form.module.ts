import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormController } from './form.controller';
import { PublicFormController } from './public-form.controller';
import { FormService } from './form.service';
import { Form } from '../../entities/form.entity';
import { FormVersion } from '../../entities/form-version.entity';
import { FormSubmission } from '../../entities/form-submission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Form, FormVersion, FormSubmission])],
  controllers: [FormController, PublicFormController],
  providers: [FormService],
  exports: [FormService],
})
export class FormModule {}
