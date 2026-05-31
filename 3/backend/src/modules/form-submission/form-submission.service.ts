import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { FormSubmission, SubmissionStatus } from '../../entities/form-submission.entity';
import { Form, FormStatus, FormField } from '../../entities/form.entity';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { FormService } from '../form/form.service';
import { UserRole } from '../../entities/user.entity';

export interface SubmitFormDto {
  data: Record<string, any>;
}

@Injectable()
export class FormSubmissionService {
  constructor(
    @InjectRepository(FormSubmission)
    private submissionRepository: Repository<FormSubmission>,
    @InjectRepository(Form)
    private formRepository: Repository<Form>,
    private formService: FormService,
  ) {}

  async getFormForSubmission(
    currentUser: CurrentUserPayload,
    formId: string,
  ): Promise<{ form: Form; fields: FormField[] }> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId, status: FormStatus.PUBLISHED },
    });

    if (!form) {
      throw new NotFoundException('表单不存在或未发布');
    }

    return {
      form,
      fields: form.fields || [],
    };
  }

  async submitForm(
    currentUser: CurrentUserPayload,
    formId: string,
    submitDto: SubmitFormDto,
  ): Promise<FormSubmission> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId, status: FormStatus.PUBLISHED },
    });

    if (!form) {
      throw new NotFoundException('表单不存在或未发布');
    }

    this.validateFormData(form.fields || [], submitDto.data);

    const submission = this.submissionRepository.create({
      formId,
      submittedById: currentUser.id,
      formVersion: form.currentVersion,
      data: submitDto.data,
      status: SubmissionStatus.SUBMITTED,
    });

    await this.submissionRepository.save(submission);

    return submission;
  }

  private validateFormData(fields: FormField[], data: Record<string, any>): void {
    const errors: string[] = [];

    for (const field of fields) {
      const value = data[field.name];

      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field.label} 是必填项`);
        continue;
      }

      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (field.validation) {
        const strValue = String(value);
        
        if (field.validation.minLength && strValue.length < field.validation.minLength) {
          errors.push(`${field.label} 长度不能少于 ${field.validation.minLength} 个字符`);
        }
        
        if (field.validation.maxLength && strValue.length > field.validation.maxLength) {
          errors.push(`${field.label} 长度不能超过 ${field.validation.maxLength} 个字符`);
        }
        
        if (field.type === 'number') {
          const numValue = Number(value);
          if (field.validation.min !== undefined && numValue < field.validation.min) {
            errors.push(`${field.label} 不能小于 ${field.validation.min}`);
          }
          if (field.validation.max !== undefined && numValue > field.validation.max) {
            errors.push(`${field.label} 不能大于 ${field.validation.max}`);
          }
        }
        
        if (field.validation.pattern && !new RegExp(field.validation.pattern).test(strValue)) {
          errors.push(`${field.label} 格式不正确`);
        }
      }

      if ((field.type === 'select' || field.type === 'radio') && field.options) {
        const validValues = field.options.map((opt) => opt.value);
        if (!validValues.includes(value)) {
          errors.push(`${field.label} 选项无效`);
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }
  }

  async getMySubmissions(currentUser: CurrentUserPayload): Promise<FormSubmission[]> {
    return this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoinAndSelect('submission.form', 'form')
      .where('submission.submittedById = :userId', { userId: currentUser.id })
      .andWhere('form.tenantId = :tenantId', { tenantId: currentUser.tenantId })
      .orderBy('submission.createdAt', 'DESC')
      .getMany();
  }

  async getFormSubmissions(
    currentUser: CurrentUserPayload,
    formId: string,
    filters?: {
      status?: SubmissionStatus;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{ items: FormSubmission[]; total: number; page: number; pageSize: number }> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });
    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const isOwner = form.createdById === currentUser.id || currentUser.role === UserRole.TENANT_ADMIN;
    if (!isOwner) {
      throw new ForbiddenException('只有表单创建者或管理员可以查看提交数据');
    }

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const skip = (page - 1) * pageSize;

    let query = this.submissionRepository
      .createQueryBuilder('submission')
      .innerJoin('submission.form', 'form')
      .where('submission.formId = :formId', { formId })
      .andWhere('form.tenantId = :tenantId', { tenantId: currentUser.tenantId });

    if (filters?.search) {
      query = query.andWhere('submission.data::text LIKE :search', {
        search: `%${filters.search}%`,
      });
    }

    if (filters?.status) {
      query = query.andWhere('submission.status = :status', { status: filters.status });
    }

    const [items, total] = await query
      .orderBy('submission.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .leftJoinAndSelect('submission.submittedBy', 'submittedBy')
      .select([
        'submission',
        'submittedBy.id',
        'submittedBy.name',
        'submittedBy.email',
      ])
      .getManyAndCount();

    return { items, total, page, pageSize };
  }

  async getSubmissionById(
    currentUser: CurrentUserPayload,
    submissionId: string,
  ): Promise<FormSubmission> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['form', 'submittedBy'],
    });

    if (!submission) {
      throw new NotFoundException('提交记录不存在');
    }

    const form = submission.form;
    if (form.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('无权访问该数据');
    }

    const isOwner = form.createdById === currentUser.id;
    const isSubmitter = submission.submittedById === currentUser.id;
    const isAdmin = currentUser.role === UserRole.TENANT_ADMIN;

    if (!isOwner && !isSubmitter && !isAdmin) {
      throw new ForbiddenException('无权访问该数据');
    }

    return submission;
  }

  async deleteSubmission(
    currentUser: CurrentUserPayload,
    submissionId: string,
  ): Promise<void> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['form'],
    });

    if (!submission) {
      throw new NotFoundException('提交记录不存在');
    }

    const isOwner = submission.form.createdById === currentUser.id;
    const isAdmin = currentUser.role === UserRole.TENANT_ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('无权删除该数据');
    }

    await this.submissionRepository.remove(submission);
  }

  async batchDeleteSubmissions(
    currentUser: CurrentUserPayload,
    formId: string,
    submissionIds: string[],
  ): Promise<void> {
    const isOwner = await this.formService.isFormOwner(currentUser, formId);
    if (!isOwner) {
      throw new ForbiddenException('只有表单创建者可以批量删除数据');
    }

    const submissions = await this.submissionRepository.find({
      where: { id: In(submissionIds), formId },
    });

    await this.submissionRepository.remove(submissions);
  }

  async exportToExcel(
    currentUser: CurrentUserPayload,
    formId: string,
  ): Promise<Buffer> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const isOwner = form.createdById === currentUser.id;
    const isAdmin = currentUser.role === UserRole.TENANT_ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('只有表单创建者或租户管理员可以导出数据');
    }

    const submissions = await this.submissionRepository.find({
      where: { formId },
      relations: ['submittedBy'],
      order: { createdAt: 'DESC' },
    });

    const fields = form.fields || [];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(form.name);

    const headers = ['提交时间', '提交人'];
    fields.forEach((field) => headers.push(field.label));
    headers.push('状态');

    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true };

    for (const submission of submissions) {
      const row = [
        submission.createdAt.toISOString(),
        submission.submittedBy?.name || '未知',
      ];

      fields.forEach((field) => {
        const value = submission.data[field.name];
        if (field.type === 'select' || field.type === 'radio') {
          const option = field.options?.find((opt) => opt.value === value);
          row.push(option?.label || value || '');
        } else if (field.type === 'checkbox') {
          if (Array.isArray(value)) {
            row.push(value.map((v) => {
              const option = field.options?.find((opt) => opt.value === v);
              return option?.label || v;
            }).join(', '));
          } else {
            row.push(value || '');
          }
        } else {
          row.push(value !== undefined && value !== null ? String(value) : '');
        }
      });

      row.push(this.getStatusLabel(submission.status));
      worksheet.addRow(row);
    }

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportToCsv(
    currentUser: CurrentUserPayload,
    formId: string,
  ): Promise<string> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const isOwner = form.createdById === currentUser.id;
    const isAdmin = currentUser.role === UserRole.TENANT_ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('只有表单创建者或租户管理员可以导出数据');
    }

    const submissions = await this.submissionRepository.find({
      where: { formId },
      relations: ['submittedBy'],
      order: { createdAt: 'DESC' },
    });

    const fields = form.fields || [];
    const headers = ['提交时间', '提交人', ...fields.map((f) => f.label), '状态'];
    const lines = [headers.map((h) => this.escapeCsv(h)).join(',')];

    for (const submission of submissions) {
      const row = [
        submission.createdAt.toISOString(),
        submission.submittedBy?.name || '未知',
      ];

      fields.forEach((field) => {
        const value = submission.data[field.name];
        if (field.type === 'select' || field.type === 'radio') {
          const option = field.options?.find((opt) => opt.value === value);
          row.push(option?.label || value || '');
        } else if (field.type === 'checkbox') {
          if (Array.isArray(value)) {
            row.push(value.map((v) => {
              const option = field.options?.find((opt) => opt.value === v);
              return option?.label || v;
            }).join('; '));
          } else {
            row.push(value || '');
          }
        } else {
          row.push(value !== undefined && value !== null ? String(value) : '');
        }
      });

      row.push(this.getStatusLabel(submission.status));
      lines.push(row.map((cell) => this.escapeCsv(cell)).join(','));
    }

    return '\uFEFF' + lines.join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private getStatusLabel(status: SubmissionStatus): string {
    const labels = {
      [SubmissionStatus.DRAFT]: '草稿',
      [SubmissionStatus.SUBMITTED]: '已提交',
      [SubmissionStatus.PENDING_APPROVAL]: '审批中',
      [SubmissionStatus.APPROVED]: '已通过',
      [SubmissionStatus.REJECTED]: '已拒绝',
      [SubmissionStatus.ARCHIVED]: '已归档',
    };
    return labels[status] || status;
  }

  async updateSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
  ): Promise<FormSubmission> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('提交记录不存在');
    }

    submission.status = status;
    await this.submissionRepository.save(submission);

    return submission;
  }

  async getTenantStats(
    currentUser: CurrentUserPayload,
  ): Promise<{
    totalForms: number;
    totalSubmissions: number;
    todaySubmissions: number;
    pendingApprovals: number;
  }> {
    const formCount = await this.formRepository.count({
      where: { tenantId: currentUser.tenantId },
    });

    const submissionCount = await this.submissionRepository
      .createQueryBuilder('submission')
      .innerJoin('submission.form', 'form')
      .where('form.tenantId = :tenantId', { tenantId: currentUser.tenantId })
      .getCount();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayCount = await this.submissionRepository
      .createQueryBuilder('submission')
      .innerJoin('submission.form', 'form')
      .where('form.tenantId = :tenantId', { tenantId: currentUser.tenantId })
      .andWhere('submission.createdAt BETWEEN :start AND :end', {
        start: todayStart,
        end: todayEnd,
      })
      .getCount();

    const pendingCount = await this.submissionRepository
      .createQueryBuilder('submission')
      .innerJoin('submission.form', 'form')
      .where('form.tenantId = :tenantId', { tenantId: currentUser.tenantId })
      .andWhere('submission.status = :status', { status: SubmissionStatus.PENDING_APPROVAL })
      .getCount();

    return {
      totalForms: formCount,
      totalSubmissions: submissionCount,
      todaySubmissions: todayCount,
      pendingApprovals: pendingCount,
    };
  }

  async getFormSubmissionTrend(
    currentUser: CurrentUserPayload,
    formId: string,
    days: number = 30,
  ): Promise<{ date: string; count: number }[]> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const results = await this.submissionRepository
      .createQueryBuilder('submission')
      .select('DATE(submission.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('submission.formId = :formId', { formId })
      .andWhere('submission.createdAt >= :startDate', { startDate })
      .groupBy('DATE(submission.createdAt)')
      .orderBy('DATE(submission.createdAt)', 'ASC')
      .getRawMany();

    const dateMap = new Map<string, number>();
    results.forEach((r: any) => {
      dateMap.set(r.date, parseInt(r.count));
    });

    const trend: { date: string; count: number }[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      trend.push({
        date: dateStr,
        count: dateMap.get(dateStr) || 0,
      });
    }

    return trend;
  }

  async getTenantSubmissionTrend(
    currentUser: CurrentUserPayload,
    days: number = 30,
  ): Promise<{ date: string; count: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const results = await this.submissionRepository
      .createQueryBuilder('submission')
      .innerJoin('submission.form', 'form')
      .select('DATE(submission.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('form.tenantId = :tenantId', { tenantId: currentUser.tenantId })
      .andWhere('submission.createdAt >= :startDate', { startDate })
      .groupBy('DATE(submission.createdAt)')
      .orderBy('DATE(submission.createdAt)', 'ASC')
      .getRawMany();

    const dateMap = new Map<string, number>();
    results.forEach((r: any) => {
      dateMap.set(r.date, parseInt(r.count));
    });

    const trend: { date: string; count: number }[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      trend.push({
        date: dateStr,
        count: dateMap.get(dateStr) || 0,
      });
    }

    return trend;
  }

  async getFormFieldDistribution(
    currentUser: CurrentUserPayload,
    formId: string,
  ): Promise<Record<string, { value: string; count: number }[]>> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const fields = form.fields || [];
    const optionFields = fields.filter(
      (f) => f.type === 'select' || f.type === 'radio' || f.type === 'checkbox',
    );

    const submissions = await this.submissionRepository.find({
      where: { formId },
    });

    const distribution: Record<string, { value: string; count: number }[]> = {};

    for (const field of optionFields) {
      const countMap = new Map<string, number>();

      for (const submission of submissions) {
        const value = submission.data[field.name];
        if (value === undefined || value === null || value === '') continue;

        if (Array.isArray(value)) {
          for (const v of value) {
            countMap.set(v, (countMap.get(v) || 0) + 1);
          }
        } else {
          countMap.set(String(value), (countMap.get(String(value)) || 0) + 1);
        }
      }

      distribution[field.name] = Array.from(countMap.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    }

    return distribution;
  }

  async getFormStatusDistribution(
    currentUser: CurrentUserPayload,
    formId: string,
  ): Promise<{ status: string; count: number; label: string }[]> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const results = await this.submissionRepository
      .createQueryBuilder('submission')
      .select('submission.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('submission.formId = :formId', { formId })
      .groupBy('submission.status')
      .getRawMany();

    const statusMap = new Map<string, number>();
    results.forEach((r: any) => {
      statusMap.set(r.status, parseInt(r.count));
    });

    const allStatuses = [
      { status: SubmissionStatus.DRAFT, label: '草稿' },
      { status: SubmissionStatus.SUBMITTED, label: '已提交' },
      { status: SubmissionStatus.PENDING_APPROVAL, label: '审批中' },
      { status: SubmissionStatus.APPROVED, label: '已通过' },
      { status: SubmissionStatus.REJECTED, label: '已拒绝' },
      { status: SubmissionStatus.ARCHIVED, label: '已归档' },
    ];

    return allStatuses.map((s) => ({
      status: s.status,
      label: s.label,
      count: statusMap.get(s.status) || 0,
    }));
  }
}
