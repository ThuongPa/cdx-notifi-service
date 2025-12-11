import { Injectable, Logger } from '@nestjs/common';
import { NovuClient } from '../../../../infrastructure/external/novu/novu.client';

@Injectable()
export class NovuNotificationRepository {
  private readonly logger = new Logger(NovuNotificationRepository.name);

  constructor(private readonly novuClient: NovuClient) {}

  /**
   * Get user notifications with filters (replaces database query)
   */
  async getUserNotifications(
    userId: string,
    options: {
      status?: string;
      channel?: string;
      type?: string;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<any[]> {
    try {
      const page = options.offset ? Math.floor(options.offset / (options.limit || 20)) + 1 : 1;
      const limit = options.limit || 20;

      // Map status to Novu format
      let novuStatus: 'read' | 'unread' | 'all' = 'all';
      if (options.status === 'read') {
        novuStatus = 'read';
      } else if (options.status === 'delivered' || options.status === 'pending') {
        novuStatus = 'unread';
      }

      // Map channel to Novu format
      let novuChannel: 'push' | 'email' | 'in-app' | 'sms' | undefined;
      if (options.channel) {
        if (options.channel === 'inApp') {
          novuChannel = 'in-app';
        } else {
          novuChannel = options.channel as 'push' | 'email' | 'sms';
        }
      }

      const result = await this.novuClient.getNotificationHistory(userId, {
        page,
        limit,
        channel: novuChannel,
        status: novuStatus,
        startDate: options.startDate,
        endDate: options.endDate,
      });

      // Map Novu response to our format
      return (result.data || []).map((item: any) => ({
        id: item.id || item._id,
        userId: userId,
        notificationId: item.notificationId || item.id,
        title: item.title || item.payload?.title || '',
        body: item.body || item.content || item.payload?.body || '',
        type: item.type || item.payload?.type || 'announcement',
        channel: item.channel || 'in-app',
        priority: item.priority || item.payload?.priority || 'normal',
        status: this.mapNovuStatusToOurStatus(item),
        data: item.payload?.data || item.data || {},
        sentAt: item.sentAt ? new Date(item.sentAt) : undefined,
        deliveredAt: item.deliveredAt ? new Date(item.deliveredAt) : undefined,
        readAt: item.readAt || (item.seen ? new Date(item.seen) : undefined),
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
        deliveryId: item.deliveryId || item.id,
      }));
    } catch (error) {
      this.logger.error(`Failed to get user notifications: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user notification count by status
   */
  async getUserNotificationCount(userId: string, status?: string): Promise<number> {
    try {
      if (status === 'delivered' || status === 'pending' || !status) {
        // Get unread count
        const result = await this.novuClient.getUnreadCount(userId);
        return result.count || 0;
      } else if (status === 'read') {
        // Get all notifications and count read ones
        const allNotifications = await this.getUserNotifications(userId, { limit: 1000 });
        return allNotifications.filter((n) => n.status === 'read').length;
      } else {
        // Get all notifications and filter by status
        const allNotifications = await this.getUserNotifications(userId, { limit: 1000 });
        return allNotifications.filter((n) => n.status === status).length;
      }
    } catch (error) {
      this.logger.error(`Failed to get user notification count: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(
    userId: string,
    options: { startDate?: Date; endDate?: Date } = {},
  ): Promise<{
    total: number;
    unread: number;
    read: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    try {
      const stats = await this.novuClient.getNotificationStatistics(userId, options);

      return {
        total: stats.total,
        unread: stats.unread,
        read: stats.read,
        byType: stats.byType,
        byPriority: {}, // Novu doesn't provide byPriority, calculate from notifications
      };
    } catch (error) {
      this.logger.error(`Failed to get user statistics: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update user notification status (mark as read)
   */
  async updateUserNotificationStatus(
    id: string,
    status: string,
    additionalData?: {
      sentAt?: Date;
      deliveredAt?: Date;
      readAt?: Date;
      errorMessage?: string;
      errorCode?: string;
      retryCount?: number;
      deliveryId?: string;
    },
  ): Promise<void> {
    try {
      // Extract userId from notification (we need to get notification first)
      // For now, we'll use the notificationId as subscriberId
      // This should be improved to get userId from notification
      if (status === 'read') {
        // Mark as read in Novu
        // Note: We need userId to call this, but we only have notificationId
        // This will be handled by the handler that has userId context
        this.logger.log(`Marking notification as read: ${id}`);
        // The actual implementation will be in the handler
      }
    } catch (error) {
      this.logger.error(`Failed to update user notification status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Map Novu status to our status format
   */
  private mapNovuStatusToOurStatus(item: any): string {
    if (item.read || item.seen) {
      return 'read';
    }
    if (item.delivered) {
      return 'delivered';
    }
    if (item.sent) {
      return 'sent';
    }
    if (item.failed) {
      return 'failed';
    }
    return 'pending';
  }
}

