import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Form, FormStatus, FormField, FormLayout } from '../../entities/form.entity';
import { FormVersion } from '../../entities/form-version.entity';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

export interface CreateFormDto {
  name: string;
  description?: string;
  fields?: FormField[];
  layout?: FormLayout;
}

export interface UpdateFormDto {
  name?: string;
  description?: string;
  fields?: FormField[];
  layout?: FormLayout;
}

@Injectable()
export class FormService {
  constructor(
    @InjectRepository(Form)
    private formRepository: Repository<Form>,
    @InjectRepository(FormVersion)
    private formVersionRepository: Repository<FormVersion>,
  ) {}

  async getForms(currentUser: CurrentUserPayload): Promise<Form[]> {
    return this.formRepository.find({
      where: { tenantId: currentUser.tenantId },
      select: ['id', 'name', 'description', 'status', 'currentVersion', 'createdAt', 'updatedAt', 'createdById'],
      order: { updatedAt: 'DESC' },
    });
  }

  async getPublishedForms(currentUser: CurrentUserPayload): Promise<Form[]> {
    return this.formRepository.find({
      where: {
        tenantId: currentUser.tenantId,
        status: FormStatus.PUBLISHED,
      },
      select: ['id', 'name', 'description', 'currentVersion', 'createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
  }

  async getFormById(currentUser: CurrentUserPayload, formId: string): Promise<Form> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    return form;
  }

  async createForm(currentUser: CurrentUserPayload, createFormDto: CreateFormDto): Promise<Form> {
    const form = this.formRepository.create({
      ...createFormDto,
      tenantId: currentUser.tenantId,
      createdById: currentUser.id,
      status: FormStatus.DRAFT,
      currentVersion: 1,
      layout: createFormDto.layout || { columns: 1, spacing: 16 },
    });

    await this.formRepository.save(form);

    if (createFormDto.fields && createFormDto.fields.length > 0) {
      const version = this.formVersionRepository.create({
        formId: form.id,
        version: 1,
        fields: createFormDto.fields,
        layout: form.layout,
        createdById: currentUser.id,
        changeNote: '初始版本',
      });
      await this.formVersionRepository.save(version);
    }

    return form;
  }

  async updateForm(
    currentUser: CurrentUserPayload,
    formId: string,
    updateFormDto: UpdateFormDto,
  ): Promise<Form> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id) {
      throw new ForbiddenException('只有表单创建者可以修改表单');
    }

    const hasContentChanges = updateFormDto.fields !== undefined || updateFormDto.layout !== undefined;

    if (updateFormDto.name) form.name = updateFormDto.name;
    if (updateFormDto.description !== undefined) form.description = updateFormDto.description;
    if (updateFormDto.fields) form.fields = updateFormDto.fields;
    if (updateFormDto.layout) form.layout = updateFormDto.layout;

    await this.formRepository.save(form);

    if (hasContentChanges && form.status === FormStatus.PUBLISHED) {
      const newVersion = form.currentVersion + 1;
      form.currentVersion = newVersion;
      await this.formRepository.save(form);

      const version = this.formVersionRepository.create({
        formId: form.id,
        version: newVersion,
        fields: form.fields,
        layout: form.layout,
        createdById: currentUser.id,
        changeNote: '内容更新',
      });
      await this.formVersionRepository.save(version);
    }

    return form;
  }

  async deleteForm(currentUser: CurrentUserPayload, formId: string): Promise<void> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id) {
      throw new ForbiddenException('只有表单创建者可以删除表单');
    }

    await this.formRepository.remove(form);
  }

  async publishForm(currentUser: CurrentUserPayload, formId: string): Promise<Form> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id) {
      throw new ForbiddenException('只有表单创建者可以发布表单');
    }

    if (!form.fields || form.fields.length === 0) {
      throw new BadRequestException('表单至少需要一个字段才能发布');
    }

    if (form.status !== FormStatus.PUBLISHED) {
      const version = this.formVersionRepository.create({
        formId: form.id,
        version: form.currentVersion,
        fields: form.fields,
        layout: form.layout,
        createdById: currentUser.id,
        changeNote: '首次发布',
      });
      await this.formVersionRepository.save(version);
    }

    form.status = FormStatus.PUBLISHED;
    await this.formRepository.save(form);

    return form;
  }

  async unpublishForm(currentUser: CurrentUserPayload, formId: string): Promise<Form> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id) {
      throw new ForbiddenException('只有表单创建者可以取消发布表单');
    }

    form.status = FormStatus.DRAFT;
    await this.formRepository.save(form);

    return form;
  }

  async getFormVersions(currentUser: CurrentUserPayload, formId: string): Promise<FormVersion[]> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    return this.formVersionRepository.find({
      where: { formId },
      order: { version: 'DESC' },
    });
  }

  async getFormVersion(
    currentUser: CurrentUserPayload,
    formId: string,
    version: number,
  ): Promise<FormVersion> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    const formVersion = await this.formVersionRepository.findOne({
      where: { formId, version },
    });

    if (!formVersion) {
      throw new NotFoundException('版本不存在');
    }

    return formVersion;
  }

  async restoreVersion(
    currentUser: CurrentUserPayload,
    formId: string,
    version: number,
  ): Promise<Form> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id) {
      throw new ForbiddenException('只有表单创建者可以恢复版本');
    }

    const formVersion = await this.formVersionRepository.findOne({
      where: { formId, version },
    });

    if (!formVersion) {
      throw new NotFoundException('版本不存在');
    }

    form.fields = formVersion.fields;
    form.layout = formVersion.layout;

    if (form.status === FormStatus.PUBLISHED) {
      const newVersion = form.currentVersion + 1;
      form.currentVersion = newVersion;

      const newVersionRecord = this.formVersionRepository.create({
        formId: form.id,
        version: newVersion,
        fields: form.fields,
        layout: form.layout,
        createdById: currentUser.id,
        changeNote: `从版本 ${version} 恢复`,
      });
      await this.formVersionRepository.save(newVersionRecord);
    }

    await this.formRepository.save(form);

    return form;
  }

  async isFormOwner(currentUser: CurrentUserPayload, formId: string): Promise<boolean> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });
    return form && form.createdById === currentUser.id;
  }

  private generatePublicToken(): string {
    return 'pub_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
  }

  async togglePublic(
    currentUser: CurrentUserPayload,
    formId: string,
    settings?: {
      requireCaptcha?: boolean;
      expireAt?: Date;
      limitPerIp?: number;
      customDomain?: string;
    },
  ): Promise<{ form: Form; iframeUrl: string; iframeCode: string }> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id) {
      throw new ForbiddenException('只有表单创建者可以设置公开状态');
    }

    if (form.status !== FormStatus.PUBLISHED) {
      throw new BadRequestException('只有已发布的表单才能设置为公开');
    }

    form.isPublic = !form.isPublic;

    if (form.isPublic && !form.publicToken) {
      form.publicToken = this.generatePublicToken();
    }

    if (settings) {
      form.publicSettings = {
        ...form.publicSettings,
        ...settings,
      };
    }

    await this.formRepository.save(form);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const iframeUrl = `${baseUrl}/public/form/${form.publicToken}`;
    const iframeCode = `<iframe 
  src="${iframeUrl}" 
  width="100%" 
  height="800px" 
  frameborder="0" 
  style="border: 1px solid #e4e7ed; border-radius: 8px;"
></iframe>`;

    return { form, iframeUrl, iframeCode };
  }

  async refreshPublicToken(
    currentUser: CurrentUserPayload,
    formId: string,
  ): Promise<{ form: Form; iframeUrl: string; iframeCode: string }> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id) {
      throw new ForbiddenException('只有表单创建者可以刷新 token');
    }

    if (!form.isPublic) {
      throw new BadRequestException('表单不是公开状态');
    }

    form.publicToken = this.generatePublicToken();
    await this.formRepository.save(form);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const iframeUrl = `${baseUrl}/public/form/${form.publicToken}`;
    const iframeCode = `<iframe 
  src="${iframeUrl}" 
  width="100%" 
  height="800px" 
  frameborder="0" 
  style="border: 1px solid #e4e7ed; border-radius: 8px;"
></iframe>`;

    return { form, iframeUrl, iframeCode };
  }

  async getEmbedCode(
    currentUser: CurrentUserPayload,
    formId: string,
  ): Promise<{
    isPublic: boolean;
    publicToken?: string;
    iframeUrl?: string;
    iframeCode?: string;
    publicSettings?: any;
  }> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (!form.isPublic || !form.publicToken) {
      return {
        isPublic: false,
      };
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const iframeUrl = `${baseUrl}/public/form/${form.publicToken}`;
    const iframeCode = `<iframe 
  src="${iframeUrl}" 
  width="100%" 
  height="800px" 
  frameborder="0" 
  style="border: 1px solid #e4e7ed; border-radius: 8px;"
></iframe>`;

    return {
      isPublic: true,
      publicToken: form.publicToken,
      iframeUrl,
      iframeCode,
      publicSettings: form.publicSettings,
    };
  }
}
