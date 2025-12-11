import { GetNotificationQuery, NotificationDetail } from './get-notification.query';
import {
  NotFoundException,
  BadRequestException,
  Injectable,
  ForbiddenException,
  Get,
  Query,
  Logger,
  Inject,
} from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotificationRepositoryImpl } from '../../infrastructure/notification.repository.impl';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';

@Injectable()
@QueryHandler(GetNotificationQuery)
export class GetNotificationHandler implements IQueryHandler<GetNotificationQuery> {
  private readonly logger = new Logger(GetNotificationHandler.name);

  constructor(
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepositoryImpl,
    private readonly novuClient: NovuClient,
  ) {}

  async execute(query: GetNotificationQuery): Promise<NotificationDetail> {
    try {
      this.logger.log(
        `Getting notification detail: ${query.notificationId} for user: ${query.userId}`,
      );

      // ✅ THAY ĐỔI: Query từ Novu API thay vì database
      const notificationData = await this.novuClient.getNotificationDetail(
        query.userId,
        query.notificationId,
      );

      if (!notificationData) {
        this.logger.warn(
          `Notification not found: ${query.notificationId} for user: ${query.userId}`,
        );
        throw new NotFoundException('Notification not found');
      }

      // Map Novu response to our format
      const result: NotificationDetail = {
        id: notificationData.id || notificationData._id,
        userId: query.userId,
        notificationId: notificationData.notificationId || notificationData.id,
        title: notificationData.title || notificationData.payload?.title || '',
        body: notificationData.body || notificationData.content || notificationData.payload?.body || '',
        type: notificationData.type || notificationData.payload?.type || 'announcement',
        channel: notificationData.channel || 'in-app',
        priority: notificationData.priority || notificationData.payload?.priority || 'normal',
        status: notificationData.read || notificationData.seen ? 'read' : 'delivered',
        data: notificationData.payload?.data || notificationData.data || {},
        sentAt: notificationData.sentAt ? new Date(notificationData.sentAt) : undefined,
        deliveredAt: notificationData.deliveredAt ? new Date(notificationData.deliveredAt) : undefined,
        readAt: notificationData.readAt || (notificationData.seen ? new Date(notificationData.seen) : undefined),
        errorMessage: notificationData.errorMessage,
        errorCode: notificationData.errorCode,
        retryCount: notificationData.retryCount,
        deliveryId: notificationData.deliveryId || notificationData.id,
        createdAt: notificationData.createdAt ? new Date(notificationData.createdAt) : new Date(),
        updatedAt: notificationData.updatedAt ? new Date(notificationData.updatedAt) : new Date(),
      };

      this.logger.log(
        `Retrieved notification detail: ${query.notificationId} for user: ${query.userId}`,
      );

      return result;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Failed to get notification detail ${query.notificationId} for user ${query.userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
