import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  ForbiddenException,
  Ip,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Form, FormStatus } from '../../entities/form.entity';
import { FormSubmission, SubmissionStatus } from '../../entities/form-submission.entity';
import { SubmitFormDto } from '../form-submission/dto/submit-form.dto';

@Controller('public/forms')
export class PublicFormController {
  constructor(
    @InjectRepository(Form)
    private formRepository: Repository<Form>,
    @InjectRepository(FormSubmission)
    private submissionRepository: Repository<FormSubmission>,
  ) {}

  @Get('token/:token')
  async getPublicForm(@Param('token') token: string) {
    const form = await this.formRepository.findOne({
      where: { publicToken: token, isPublic: true, status: FormStatus.PUBLISHED },
      select: ['id', 'name', 'description', 'fields', 'layout', 'publicSettings'],
    });

    if (!form) {
      throw new NotFoundException('表单不存在或已过期');
    }

    if (form.publicSettings?.expireAt) {
      if (new Date(form.publicSettings.expireAt) < new Date()) {
        throw new ForbiddenException('表单已过期');
      }
    }

    return {
      id: form.id,
      name: form.name,
      description: form.description,
      fields: form.fields,
      layout: form.layout,
    };
  }

  @Post('token/:token/submit')
  async submitPublicForm(
    @Param('token') token: string,
    @Body() submitDto: SubmitFormDto,
    @Ip() ip: string,
  ) {
    const form = await this.formRepository.findOne({
      where: { publicToken: token, isPublic: true, status: FormStatus.PUBLISHED },
    });

    if (!form) {
      throw new NotFoundException('表单不存在或已过期');
    }

    if (form.publicSettings?.expireAt) {
      if (new Date(form.publicSettings.expireAt) < new Date()) {
        throw new ForbiddenException('表单已过期');
      }
    }

    if (form.publicSettings?.limitPerIp) {
      const count = await this.submissionRepository
        .createQueryBuilder('submission')
        .where('submission.formId = :formId', { formId: form.id })
        .andWhere('submission.submittedByIp = :ip', { ip })
        .andWhere('submission.createdAt >= CURRENT_DATE')
        .getCount();

      if (count >= form.publicSettings.limitPerIp) {
        throw new ForbiddenException('今日提交次数已达上限');
      }
    }

    const submission = this.submissionRepository.create({
      formId: form.id,
      data: submitDto.data,
      status: SubmissionStatus.SUBMITTED,
      submittedByIp: ip,
    });

    await this.submissionRepository.save(submission);

    return {
      id: submission.id,
      message: '提交成功',
    };
  }

  @Post('token/:token/generate-iframe')
  async generateIframeCode(@Param('token') token: string) {
    const form = await this.formRepository.findOne({
      where: { publicToken: token, isPublic: true },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const iframeUrl = `${baseUrl}/public/form/${token}`;

    const iframeCode = `<iframe 
  src="${iframeUrl}" 
  width="100%" 
  height="800px" 
  frameborder="0" 
  style="border: 1px solid #e4e7ed; border-radius: 8px;"
></iframe>`;

    const scriptCode = `<script src="${baseUrl}/embed.js" async></script>
<div class="lowcode-form" data-token="${token}"></div>`;

    return {
      iframeUrl,
      iframeCode,
      scriptCode,
      form: {
        id: form.id,
        name: form.name,
      },
    };
  }
}
