import { Controller, Get, Post, Put, Delete, Param, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService } from './notification.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationType } from '../../entities/notification.entity';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @CurrentUser() user,
    @Query('isRead') isRead?: string,
    @Query('type') type?: NotificationType,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.getNotifications(user, {
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user) {
    const count = await this.notificationService.getUnreadCount(user);
    return { count };
  }

  @Put(':id/read')
  async markAsRead(@CurrentUser() user, @Param('id') id: string) {
    await this.notificationService.markAsRead(user, id);
    return { success: true };
  }

  @Put('read-all')
  async markAllAsRead(@CurrentUser() user) {
    await this.notificationService.markAllAsRead(user);
    return { success: true };
  }

  @Delete(':id')
  async deleteNotification(@CurrentUser() user, @Param('id') id: string) {
    await this.notificationService.deleteNotification(user, id);
    return { success: true };
  }
}
