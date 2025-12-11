import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GetNotificationByCorrelationIdQuery,
  NotificationByCorrelationIdResult,
} from './get-notification-by-correlation-id.query';
import {
  UserNotification,
  UserNotificationDocument,
} from '../../../../../infrastructure/database/schemas/user-notification.schema';

@Injectable()
@QueryHandler(GetNotificationByCorrelationIdQuery)
export class GetNotificationByCorrelationIdHandler
  implements IQueryHandler<GetNotificationByCorrelationIdQuery>
{
  private readonly logger = new Logger(GetNotificationByCorrelationIdHandler.name);

  constructor(
    @InjectModel(UserNotification.name)
    private readonly userNotificationModel: Model<UserNotificationDocument>,
  ) {}

  async execute(
    query: GetNotificationByCorrelationIdQuery,
  ): Promise<NotificationByCorrelationIdResult> {
    try {
      this.logger.log(`Getting notification by correlationId: ${query.correlationId}`);

      // Query all UserNotifications with this correlationId
      const userNotifications = await this.userNotificationModel
        .find({
          'data.correlationId': query.correlationId,
        })
        .sort({ createdAt: -1 })
        .exec();

      if (!userNotifications || userNotifications.length === 0) {
        throw new NotFoundException(
          `Notification not found with correlationId: ${query.correlationId}`,
        );
      }

      // Group by notificationId to get unique notifications
      const notificationMap = new Map<string, any>();
      const recipientsMap = new Map<string, any>();

      for (const userNotif of userNotifications) {
        const notificationId = userNotif.notificationId;

        // Build notification object (use first occurrence)
        if (!notificationMap.has(notificationId)) {
          notificationMap.set(notificationId, {
            id: notificationId,
            correlationId: userNotif.data?.correlationId || query.correlationId,
            title: userNotif.title,
            body: userNotif.body,
            type: userNotif.type,
            priority: userNotif.priority,
            channels: [userNotif.channel],
            status: userNotif.status,
            sentBy: userNotif.data?.sentBy || userNotif.userId,
            sentAt: userNotif.sentAt,
            createdAt: userNotif.createdAt,
          });
        } else {
          // Add channel if not already present
          const notif = notificationMap.get(notificationId);
          if (!notif.channels.includes(userNotif.channel)) {
            notif.channels.push(userNotif.channel);
          }
        }

        // Build recipients list
        const recipientKey = `${notificationId}-${userNotif.userId}`;
        if (!recipientsMap.has(recipientKey)) {
          recipientsMap.set(recipientKey, {
            userId: userNotif.userId,
            status: userNotif.status,
            deliveredAt: userNotif.deliveredAt,
            error: userNotif.errorMessage,
          });
        }
      }

      // Get first notification (they should all have same notificationId for same correlationId)
      const notification = Array.from(notificationMap.values())[0];
      const recipients = Array.from(recipientsMap.values());

      // Determine target type and count
      const targetType = 'users'; // Default, can be enhanced later
      const targetCount = recipients.length;

      const result: NotificationByCorrelationIdResult = {
        notification: {
          ...notification,
          targetType,
          targetCount,
          recipients,
        },
      };

      this.logger.log(
        `Retrieved notification by correlationId: ${query.correlationId} (${recipients.length} recipients)`,
      );

      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get notification by correlationId ${query.correlationId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

