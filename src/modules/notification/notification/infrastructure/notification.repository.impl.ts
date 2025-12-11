import { InjectModel } from '@nestjs/mongoose';
import { Model, Document, Types } from 'mongoose';
import { NotificationAggregate } from '../domain/notification.aggregate';
import { NotificationFactory } from '../domain/notification.factory';
import { Injectable, Get, Delete, Logger } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  Notification,
  NotificationDocument,
} from '../../../../infrastructure/database/schemas/notification.schema';
import {
  UserNotification,
  UserNotificationDocument,
} from '../../../../infrastructure/database/schemas/user-notification.schema';
import { NotificationRepository } from '../domain/notification.repository';
import { NovuNotificationRepository } from './novu-notification.repository';

@Injectable()
export class NotificationRepositoryImpl implements NotificationRepository {
  private readonly logger = new Logger(NotificationRepositoryImpl.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(UserNotification.name)
    private readonly userNotificationModel: Model<UserNotificationDocument>,
    private readonly novuNotificationRepository: NovuNotificationRepository,
  ) {}

  async save(notification: NotificationAggregate): Promise<void> {
    try {
      const notificationData = notification.toPlainObject();

      await this.notificationModel.findOneAndUpdate({ id: notificationData.id }, notificationData, {
        upsert: true,
        new: true,
      });

      this.logger.log(`Notification saved: ${notificationData.id}`);
    } catch (error) {
      this.logger.error(`Failed to save notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findById(id: string): Promise<NotificationAggregate | null> {
    try {
      const notificationDoc = await this.notificationModel.findOne({ id }).exec();

      if (!notificationDoc) {
        return null;
      }

      return NotificationFactory.fromDatabaseData(notificationDoc.toObject());
    } catch (error) {
      this.logger.error(`Failed to find notification by ID: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByStatus(status: string): Promise<NotificationAggregate[]> {
    try {
      const notificationDocs = await this.notificationModel
        .find({ status })
        .sort({ createdAt: -1 })
        .exec();

      return notificationDocs.map((doc) => NotificationFactory.fromDatabaseData(doc.toObject()));
    } catch (error) {
      this.logger.error(`Failed to find notifications by status: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByTargetRoles(roles: string[]): Promise<NotificationAggregate[]> {
    try {
      const notificationDocs = await this.notificationModel
        .find({ targetRoles: { $in: roles } })
        .sort({ createdAt: -1 })
        .exec();

      return notificationDocs.map((doc) => NotificationFactory.fromDatabaseData(doc.toObject()));
    } catch (error) {
      this.logger.error(
        `Failed to find notifications by target roles: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findByTargetUsers(userIds: string[]): Promise<NotificationAggregate[]> {
    try {
      const notificationDocs = await this.notificationModel
        .find({ targetUsers: { $in: userIds } })
        .sort({ createdAt: -1 })
        .exec();

      return notificationDocs.map((doc) => NotificationFactory.fromDatabaseData(doc.toObject()));
    } catch (error) {
      this.logger.error(
        `Failed to find notifications by target users: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateStatus(id: string, status: string): Promise<void> {
    try {
      await this.notificationModel
        .findOneAndUpdate({ id }, { status, updatedAt: new Date() })
        .exec();

      this.logger.log(`Notification status updated: ${id} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update notification status: ${error.message}`, error.stack);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.notificationModel.findOneAndDelete({ id }).exec();
      this.logger.log(`Notification deleted: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findForRetry(): Promise<NotificationAggregate[]> {
    try {
      const notificationDocs = await this.notificationModel
        .find({ status: 'failed' })
        .sort({ createdAt: -1 })
        .exec();

      return notificationDocs.map((doc) => NotificationFactory.fromDatabaseData(doc.toObject()));
    } catch (error) {
      this.logger.error(`Failed to find notifications for retry: ${error.message}`, error.stack);
      throw error;
    }
  }

  async batchSave(notifications: NotificationAggregate[]): Promise<void> {
    try {
      const session = await this.notificationModel.db.startSession();

      await session.withTransaction(async () => {
        const operations = notifications.map((notification) => ({
          updateOne: {
            filter: { id: notification.id },
            update: notification.toPlainObject(),
            upsert: true,
          },
        }));

        await this.notificationModel.bulkWrite(operations, { session });
      });

      await session.endSession();
      this.logger.log(`Batch saved ${notifications.length} notifications`);
    } catch (error) {
      this.logger.error(`Failed to batch save notifications: ${error.message}`, error.stack);
      throw error;
    }
  }

  async countByStatus(status: string): Promise<number> {
    try {
      return await this.notificationModel.countDocuments({ status }).exec();
    } catch (error) {
      this.logger.error(`Failed to count notifications by status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Save user notification record
   * ⭐ ANALYTICS ONLY: Lưu vào database chỉ cho mục đích analytics/statistics
   * User notification history vẫn lấy từ Novu API
   */
  async saveUserNotification(userNotification: {
    id: string;
    userId: string;
    notificationId: string;
    title: string;
    body: string;
    type: string;
    channel: string;
    priority: string;
    status: string;
    data: Record<string, any>;
    sentAt?: Date;
    deliveredAt?: Date;
    errorMessage?: string;
    errorCode?: string;
    retryCount?: number;
    deliveryId?: string;
  }): Promise<void> {
    try {
      // ⭐ Lưu vào database cho analytics/statistics
      // User notification history vẫn lấy từ Novu API
      await this.userNotificationModel.findOneAndUpdate(
        { id: userNotification.id },
        userNotification,
        { upsert: true, new: true },
      );
      this.logger.debug(`User notification saved for analytics: ${userNotification.id}`);
    } catch (error) {
      // Log error nhưng không throw để không block việc gửi notification
      this.logger.error(
        `Failed to save user notification for analytics: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Update user notification status
   * ⭐ OPTION C: Update database thực sự (Database là source of truth cho analytics)
   * - Tìm bằng deliveryId (từ webhook) hoặc id
   * - Update status và các field liên quan
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
      // ⭐ Logic: Tìm bằng deliveryId trước (cho webhook), nếu không có thì tìm bằng id
      // Build update data
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (additionalData) {
        if (additionalData.sentAt) updateData.sentAt = additionalData.sentAt;
        if (additionalData.deliveredAt) updateData.deliveredAt = additionalData.deliveredAt;
        if (additionalData.readAt) updateData.readAt = additionalData.readAt;
        if (additionalData.errorMessage) updateData.errorMessage = additionalData.errorMessage;
        if (additionalData.errorCode) updateData.errorCode = additionalData.errorCode;
        if (additionalData.retryCount !== undefined)
          updateData.retryCount = additionalData.retryCount;
      }

      // Thử tìm bằng deliveryId trước (cho webhook)
      let query: any = { deliveryId: id };
      let result = await this.userNotificationModel.updateOne(query, { $set: updateData });

      // Nếu không tìm thấy bằng deliveryId, thử tìm bằng id
      if (result.matchedCount === 0) {
        query = { id: id };
        result = await this.userNotificationModel.updateOne(query, { $set: updateData });
      }

      if (result.matchedCount === 0) {
        this.logger.warn(
          `No UserNotification found to update: deliveryId=${id} or id=${id} (status: ${status})`,
        );
      } else {
        this.logger.debug(
          `UserNotification status updated: ${JSON.stringify(query)} -> ${status}`,
        );
      }

      // Nếu là mark as read, cũng update trong Novu
      if (status === 'read') {
        // Note: Cần userId context để mark as read trong Novu
        // Handler sẽ cung cấp userId context
        await this.novuNotificationRepository.updateUserNotificationStatus(id, status, additionalData);
      }
    } catch (error) {
      this.logger.error(
        `Failed to update user notification status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get notifications by notificationId (for service-to-service calls)
   */
  async getNotificationsByNotificationId(notificationId: string): Promise<any[]> {
    try {
      const userNotifications = await this.userNotificationModel
        .find({ notificationId })
        .sort({ createdAt: -1 })
        .exec();

      return userNotifications.map((doc) => ({
        id: doc.id,
        userId: doc.userId,
        notificationId: doc.notificationId,
        title: doc.title,
        body: doc.body,
        type: doc.type,
        channel: doc.channel,
        priority: doc.priority,
        status: doc.status,
        data: doc.data || {},
        sentAt: doc.sentAt,
        deliveredAt: doc.deliveredAt,
        readAt: doc.readAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        deliveryId: doc.deliveryId,
        errorMessage: doc.errorMessage,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get notifications by notificationId: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get user notifications with optimized queries
   * ✅ DELEGATE: Delegate to NovuNotificationRepository
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
      sourceService?: string;
      sentBy?: string;
    } = {},
  ): Promise<any[]> {
    // ⭐ If sourceService or sentBy provided, query from MongoDB directly
    if (options.sourceService || options.sentBy) {
      return this.getUserNotificationsFromMongo(userId, options);
    }

    // Otherwise, use Novu repository (existing behavior)
    return this.novuNotificationRepository.getUserNotifications(userId, options);
  }

  /**
   * Query notifications from MongoDB with filters (for service-to-service calls)
   */
  private async getUserNotificationsFromMongo(
    userId: string | undefined,
    options: {
      status?: string;
      channel?: string;
      type?: string;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      sourceService?: string;
      sentBy?: string;
    } = {},
  ): Promise<any[]> {
    try {
      const query: any = {};

      // If userId provided and not empty, filter by userId (for user calls)
      if (userId && userId.trim() !== '') {
        query.userId = userId;
      }

      // Filter by sourceService
      if (options.sourceService) {
        query['data.sourceService'] = options.sourceService;
      }

      // Filter by sentBy
      if (options.sentBy) {
        query['data.sentBy'] = options.sentBy;
      }

      // Filter by status
      if (options.status) {
        query.status = options.status;
      }

      // Filter by channel
      if (options.channel) {
        query.channel = options.channel;
      }

      // Filter by type
      if (options.type) {
        query.type = options.type;
      }

      // Filter by date range
      if (options.startDate || options.endDate) {
        query.createdAt = {};
        if (options.startDate) {
          query.createdAt.$gte = options.startDate;
        }
        if (options.endDate) {
          query.createdAt.$lte = options.endDate;
        }
      }

      const limit = options.limit || 20;
      const offset = options.offset || 0;

      const notifications = await this.userNotificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec();

      return notifications.map((doc) => ({
        id: doc.id,
        userId: doc.userId,
        notificationId: doc.notificationId,
        title: doc.title,
        body: doc.body,
        type: doc.type,
        channel: doc.channel,
        priority: doc.priority,
        status: doc.status,
        data: doc.data || {},
        sentAt: doc.sentAt,
        deliveredAt: doc.deliveredAt,
        readAt: doc.readAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        deliveryId: doc.deliveryId,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get user notifications from MongoDB: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get user notification count by status with optimized query
   * ✅ DELEGATE: Delegate to NovuNotificationRepository
   */
  async getUserNotificationCount(userId: string, status?: string): Promise<number> {
    return this.novuNotificationRepository.getUserNotificationCount(userId, status);
  }

  /**
   * Get user statistics
   * ✅ DELEGATE: Delegate to NovuNotificationRepository
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
    return this.novuNotificationRepository.getUserStatistics(userId, options);
  }
}
