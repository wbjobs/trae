import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApprovalService } from './approval.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('approval')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Get('flows')
  async getFlows(@CurrentUser() user) {
    return this.approvalService.getFlows(user);
  }

  @Get('flows/:id')
  async getFlow(@CurrentUser() user, @Param('id') flowId: string) {
    return this.approvalService.getFlowById(user, flowId);
  }

  @Get('flows/form/:formId')
  async getFlowByFormId(@CurrentUser() user, @Param('formId') formId: string) {
    return this.approvalService.getFlowByFormId(user, formId);
  }

  @Post('flows')
  async createFlow(@CurrentUser() user, @Body() dto: CreateFlowDto) {
    return this.approvalService.createFlow(user, dto);
  }

  @Put('flows/:id')
  async updateFlow(
    @CurrentUser() user,
    @Param('id') flowId: string,
    @Body() dto: UpdateFlowDto,
  ) {
    return this.approvalService.updateFlow(user, flowId, dto);
  }

  @Delete('flows/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFlow(@CurrentUser() user, @Param('id') flowId: string) {
    await this.approvalService.deleteFlow(user, flowId);
  }

  @Post('flows/:id/activate')
  async activateFlow(@CurrentUser() user, @Param('id') flowId: string) {
    return this.approvalService.activateFlow(user, flowId);
  }

  @Post('flows/:id/deactivate')
  async deactivateFlow(@CurrentUser() user, @Param('id') flowId: string) {
    return this.approvalService.deactivateFlow(user, flowId);
  }

  @Post('start/:submissionId')
  async startApproval(@CurrentUser() user, @Param('submissionId') submissionId: string) {
    return this.approvalService.startApproval(user, submissionId);
  }

  @Get('tasks')
  async getMyTasks(@CurrentUser() user) {
    return this.approvalService.getMyTasks(user);
  }

  @Get('tasks/history')
  async getMyTaskHistory(@CurrentUser() user) {
    return this.approvalService.getMyTaskHistory(user);
  }

  @Get('tasks/:id')
  async getTask(@CurrentUser() user, @Param('id') taskId: string) {
    return this.approvalService.getTaskById(user, taskId);
  }

  @Post('tasks/:id/approve')
  async approveTask(
    @CurrentUser() user,
    @Param('id') taskId: string,
    @Body() dto: { comment?: string },
  ) {
    return this.approvalService.approveTask(user, taskId, dto);
  }

  @Post('tasks/:id/reject')
  async rejectTask(
    @CurrentUser() user,
    @Param('id') taskId: string,
    @Body() dto: { comment?: string },
  ) {
    return this.approvalService.rejectTask(user, taskId, dto);
  }

  @Get('instances/:id')
  async getInstance(@CurrentUser() user, @Param('id') instanceId: string) {
    return this.approvalService.getInstanceById(user, instanceId);
  }
}
