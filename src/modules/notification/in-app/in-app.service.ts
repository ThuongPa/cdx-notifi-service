import { Injectable, Logger } from '@nestjs/common';
import { NovuClient } from '../../../infrastructure/external/novu/novu.client';

@Injectable()
export class InAppService {
  private readonly logger = new Logger(InAppService.name);

  constructor(private readonly novuClient: NovuClient) {}

  /**
   * Get in-app notifications for a user
   * @param userId - The user ID (used as subscriber ID)
   * @param options - Query options
   */
  async getInAppNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      seen?: boolean;
    } = {},
  ) {
    this.logger.log(`Getting in-app notifications for user: ${userId}`);
    return this.novuClient.getInAppMessages(userId, options);
  }

  /**
   * Mark in-app notification as read
   * @param userId - The user ID
   * @param messageId - The message ID
   */
  async markAsRead(userId: string, messageId: string) {
    this.logger.log(`Marking in-app notification as read: ${messageId} for user: ${userId}`);
    return this.novuClient.markInAppMessageAsRead(userId, messageId);
  }

  /**
   * Mark all in-app notifications as read for a user
   * @param userId - The user ID
   */
  async markAllAsRead(userId: string) {
    this.logger.log(`Marking all in-app notifications as read for user: ${userId}`);
    return this.novuClient.markAllInAppMessagesAsRead(userId);
  }

  /**
   * Get unread count for in-app notifications
   * @param userId - The user ID
   */
  async getUnreadCount(userId: string) {
    this.logger.log(`Getting unread count for user: ${userId}`);
    return this.novuClient.getInAppUnreadCount(userId);
  }
}
