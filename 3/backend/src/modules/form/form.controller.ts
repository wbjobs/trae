import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FormService } from './form.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('forms')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Get()
  async getForms(@CurrentUser() user) {
    return this.formService.getForms(user);
  }

  @Get('published')
  async getPublishedForms(@CurrentUser() user) {
    return this.formService.getPublishedForms(user);
  }

  @Get(':id')
  async getForm(@CurrentUser() user, @Param('id') formId: string) {
    return this.formService.getFormById(user, formId);
  }

  @Post()
  async createForm(@CurrentUser() user, @Body() createFormDto: CreateFormDto) {
    return this.formService.createForm(user, createFormDto);
  }

  @Put(':id')
  async updateForm(
    @CurrentUser() user,
    @Param('id') formId: string,
    @Body() updateFormDto: UpdateFormDto,
  ) {
    return this.formService.updateForm(user, formId, updateFormDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteForm(@CurrentUser() user, @Param('id') formId: string) {
    await this.formService.deleteForm(user, formId);
  }

  @Post(':id/publish')
  async publishForm(@CurrentUser() user, @Param('id') formId: string) {
    return this.formService.publishForm(user, formId);
  }

  @Post(':id/unpublish')
  async unpublishForm(@CurrentUser() user, @Param('id') formId: string) {
    return this.formService.unpublishForm(user, formId);
  }

  @Get(':id/versions')
  async getFormVersions(@CurrentUser() user, @Param('id') formId: string) {
    return this.formService.getFormVersions(user, formId);
  }

  @Get(':id/versions/:version')
  async getFormVersion(
    @CurrentUser() user,
    @Param('id') formId: string,
    @Param('version') version: number,
  ) {
    return this.formService.getFormVersion(user, formId, version);
  }

  @Post(':id/versions/:version/restore')
  async restoreVersion(
    @CurrentUser() user,
    @Param('id') formId: string,
    @Param('version') version: number,
  ) {
    return this.formService.restoreVersion(user, formId, version);
  }

  @Post(':id/toggle-public')
  async togglePublic(
    @CurrentUser() user,
    @Param('id') formId: string,
    @Body() settings?: {
      requireCaptcha?: boolean;
      expireAt?: Date;
      limitPerIp?: number;
      customDomain?: string;
    },
  ) {
    return this.formService.togglePublic(user, formId, settings);
  }

  @Post(':id/refresh-token')
  async refreshPublicToken(
    @CurrentUser() user,
    @Param('id') formId: string,
  ) {
    return this.formService.refreshPublicToken(user, formId);
  }

  @Get(':id/embed-code')
  async getEmbedCode(
    @CurrentUser() user,
    @Param('id') formId: string,
  ) {
    return this.formService.getEmbedCode(user, formId);
  }
}
