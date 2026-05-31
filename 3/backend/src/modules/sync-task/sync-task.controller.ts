import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SyncTaskService } from './sync-task.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSyncTaskDto } from './dto/create-sync-task.dto';
import { UpdateSyncTaskDto } from './dto/update-sync-task.dto';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('sync-tasks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SyncTaskController {
  constructor(private readonly syncTaskService: SyncTaskService) {}

  @Get()
  async getSyncTasks(@CurrentUser() user) {
    return this.syncTaskService.getSyncTasks(user);
  }

  @Get(':id')
  async getSyncTask(@CurrentUser() user, @Param('id') taskId: string) {
    return this.syncTaskService.getSyncTask(user, taskId);
  }

  @Post()
  async createSyncTask(
    @CurrentUser() user,
    @Body() dto: CreateSyncTaskDto,
  ) {
    return this.syncTaskService.createSyncTask(user, dto);
  }

  @Put(':id')
  async updateSyncTask(
    @CurrentUser() user,
    @Param('id') taskId: string,
    @Body() dto: UpdateSyncTaskDto,
  ) {
    return this.syncTaskService.updateSyncTask(user, taskId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSyncTask(
    @CurrentUser() user,
    @Param('id') taskId: string,
  ) {
    await this.syncTaskService.deleteSyncTask(user, taskId);
  }

  @Post(':id/trigger')
  async triggerSync(
    @CurrentUser() user,
    @Param('id') taskId: string,
  ) {
    return this.syncTaskService.triggerSync(user, taskId);
  }

  @Post(':id/toggle')
  async toggleTaskStatus(
    @CurrentUser() user,
    @Param('id') taskId: string,
  ) {
    return this.syncTaskService.toggleTaskStatus(user, taskId);
  }
}
