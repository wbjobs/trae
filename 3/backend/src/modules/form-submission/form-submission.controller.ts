import { Controller, Get, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus, Query, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { FormSubmissionService } from './form-submission.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubmitFormDto } from './dto/submit-form.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubmissionStatus } from '../../entities/form-submission.entity';

@Controller('form-submissions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FormSubmissionController {
  constructor(private readonly formSubmissionService: FormSubmissionService) {}

  @Get('mine')
  async getMySubmissions(@CurrentUser() user) {
    return this.formSubmissionService.getMySubmissions(user);
  }

  @Get('form/:formId')
  async getFormSubmissions(
    @CurrentUser() user,
    @Param('formId') formId: string,
    @Query('status') status?: SubmissionStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.formSubmissionService.getFormSubmissions(user, formId, {
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  async getSubmission(@CurrentUser() user, @Param('id') submissionId: string) {
    return this.formSubmissionService.getSubmissionById(user, submissionId);
  }

  @Get('form/:formId/view')
  async getFormForSubmission(@CurrentUser() user, @Param('formId') formId: string) {
    return this.formSubmissionService.getFormForSubmission(user, formId);
  }

  @Post('form/:formId/submit')
  async submitForm(
    @CurrentUser() user,
    @Param('formId') formId: string,
    @Body() submitDto: SubmitFormDto,
  ) {
    return this.formSubmissionService.submitForm(user, formId, submitDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubmission(@CurrentUser() user, @Param('id') submissionId: string) {
    await this.formSubmissionService.deleteSubmission(user, submissionId);
  }

  @Post('form/:formId/batch-delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async batchDeleteSubmissions(
    @CurrentUser() user,
    @Param('formId') formId: string,
    @Body('ids') ids: string[],
  ) {
    await this.formSubmissionService.batchDeleteSubmissions(user, formId, ids);
  }

  @Get('form/:formId/export/excel')
  async exportToExcel(
    @CurrentUser() user,
    @Param('formId') formId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.formSubmissionService.exportToExcel(user, formId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=form_data_${formId}.xlsx`,
    );
    res.send(buffer);
  }

  @Get('form/:formId/export/csv')
  async exportToCsv(
    @CurrentUser() user,
    @Param('formId') formId: string,
    @Res() res: Response,
  ) {
    const csv = await this.formSubmissionService.exportToCsv(user, formId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=form_data_${formId}.csv`,
    );
    res.send(csv);
  }

  @Get('stats/tenant')
  async getTenantStats(@CurrentUser() user) {
    return this.formSubmissionService.getTenantStats(user);
  }

  @Get('stats/tenant/trend')
  async getTenantSubmissionTrend(
    @CurrentUser() user,
    @Query('days') days?: string,
  ) {
    return this.formSubmissionService.getTenantSubmissionTrend(
      user,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('stats/form/:formId/trend')
  async getFormSubmissionTrend(
    @CurrentUser() user,
    @Param('formId') formId: string,
    @Query('days') days?: string,
  ) {
    return this.formSubmissionService.getFormSubmissionTrend(
      user,
      formId,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('stats/form/:formId/field-distribution')
  async getFormFieldDistribution(
    @CurrentUser() user,
    @Param('formId') formId: string,
  ) {
    return this.formSubmissionService.getFormFieldDistribution(user, formId);
  }

  @Get('stats/form/:formId/status-distribution')
  async getFormStatusDistribution(
    @CurrentUser() user,
    @Param('formId') formId: string,
  ) {
    return this.formSubmissionService.getFormStatusDistribution(user, formId);
  }
}
