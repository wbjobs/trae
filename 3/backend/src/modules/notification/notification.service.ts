import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { Notification, NotificationType, NotificationChannel } from '../../entities/notification.entity';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  content?: string;
  data?: Record<string, any>;
  sendEmail?: boolean;
}

@Injectable()
export class NotificationService {
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private configService: ConfigService,
  ) {
    this.initEmailTransport();
  }

  private initEmailTransport(): void {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  async createNotification(
    tenantId: string,
    dto: CreateNotificationDto,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      tenantId,
      userId: dto.userId,
      type: dto.type,
      channel: NotificationChannel.IN_APP,
      title: dto.title,
      content: dto.content,
      data: dto.data,
    });

    await this.notificationRepository.save(notification);

    if (dto.sendEmail && this.transporter) {
      try {
        await this.sendEmailNotification(dto);
        notification.isEmailSent = true;
        await this.notificationRepository.save(notification);
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    }

    return notification;
  }

  private async sendEmailNotification(dto: CreateNotificationDto): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || 'noreply@example.com';
    
    if (!this.transporter) {
      throw new Error('Email transport not configured');
    }

    // Note: We would need to look up the user's email
    // For now, we just log that we would send an email
    console.log(`Would send email to user ${dto.userId}: ${dto.title}`);
  }

  async getNotifications(
    currentUser: CurrentUserPayload,
    filters?: {
      isRead?: boolean;
      type?: NotificationType;
      limit?: number;
    },
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    const where: any = {
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
    };

    if (filters?.isRead !== undefined) {
      where.isRead = filters.isRead;
    }

    if (filters?.type) {
      where.type = filters.type;
    }

    const [items, total] = await this.notificationRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: filters?.limit || 50,
    });

    const unreadCount = await this.notificationRepository.count({
      where: {
        tenantId: currentUser.tenantId,
        userId: currentUser.id,
        isRead: false,
      },
    });

    return { items, total, unreadCount };
  }

  async getUnreadCount(currentUser: CurrentUserPayload): Promise<number> {
    return this.notificationRepository.count({
      where: {
        tenantId: currentUser.tenantId,
        userId: currentUser.id,
        isRead: false,
      },
    });
  }

  async markAsRead(
    currentUser: CurrentUserPayload,
    notificationId: string,
  ): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
        tenantId: currentUser.tenantId,
        userId: currentUser.id,
      },
    });

    if (notification && !notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationRepository.save(notification);
    }
  }

  async markAllAsRead(currentUser: CurrentUserPayload): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('tenantId = :tenantId AND userId = :userId AND isRead = false', {
        tenantId: currentUser.tenantId,
        userId: currentUser.id,
      })
      .execute();
  }

  async deleteNotification(
    currentUser: CurrentUserPayload,
    notificationId: string,
  ): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
        tenantId: currentUser.tenantId,
        userId: currentUser.id,
      },
    });

    if (notification) {
      await this.notificationRepository.remove(notification);
    }
  }

  async sendApprovalNotification(
    tenantId: string,
    userId: string,
    submissionId: string,
    formName: string,
    action: 'approve' | 'reject' | 'submit',
  ): Promise<void> {
    const titles = {
      submit: '新的审批申请',
      approve: '审批已通过',
      reject: '审批已拒绝',
    };

    const contents = {
      submit: `您有一个新的审批申请需要处理：${formName}`,
      approve: `您的表单 ${formName} 已通过审批`,
      reject: `您的表单 ${formName} 已被拒绝`,
    };

    await this.createNotification(tenantId, {
      userId,
      type: NotificationType.APPROVAL,
      title: titles[action],
      content: contents[action],
      data: { submissionId, formName },
      sendEmail: true,
    });
  }
}
