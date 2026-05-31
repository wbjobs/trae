import request from '@/utils/request';
import { Notification, NotificationType } from '@/types';

export const notificationApi = {
  getNotifications(params?: {
    isRead?: boolean;
    type?: NotificationType;
    limit?: number;
  }): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    return request.get('/notifications', { params });
  },

  getUnreadCount(): Promise<{ count: number }> {
    return request.get('/notifications/unread-count');
  },

  markAsRead(id: string): Promise<{ success: boolean }> {
    return request.put(`/notifications/${id}/read`);
  },

  markAllAsRead(): Promise<{ success: boolean }> {
    return request.put('/notifications/read-all');
  },

  deleteNotification(id: string): Promise<{ success: boolean }> {
    return request.delete(`/notifications/${id}`);
  },
};
