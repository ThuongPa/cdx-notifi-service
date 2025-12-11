import { NotificationCacheService } from '../../../../../infrastructure/cache/notification-cache.service';
import {
  NotFoundException,
  BadRequestException,
  Injectable,
  ForbiddenException,
  Get,
  Res,
  Logger,
  Inject,
} from '@nestjs/common';
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { MarkAsReadCommand, MarkAsReadResult } from './mark-as-read.command';
import { NotificationRepositoryImpl } from '../../infrastructure/notification.repository.impl';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';

@Injectable()
@CommandHandler(MarkAsReadCommand)
export class MarkAsReadHandler implements ICommandHandler<MarkAsReadCommand> {
  private readonly logger = new Logger(MarkAsReadHandler.name);

  constructor(
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepositoryImpl,
    private readonly novuClient: NovuClient,
    private readonly cacheService: NotificationCacheService,
  ) {}

  async execute(command: MarkAsReadCommand): Promise<MarkAsReadResult> {
    try {
      this.logger.log(
        `Marking notification as read: ${command.notificationId} for user: ${command.userId}`,
      );

      // ✅ THAY ĐỔI: Mark as read trong Novu API
      const readAt = new Date();
      
      try {
        await this.novuClient.markNotificationAsRead(command.userId, command.notificationId);
      } catch (error) {
        // Check if notification not found
        if (error.message.includes('404') || error.message.includes('not found')) {
          throw new NotFoundException('Notification not found');
        }
        throw error;
      }

      const result: MarkAsReadResult = {
        success: true,
        notificationId: command.notificationId,
        readAt,
      };

      this.logger.log(
        `Successfully marked notification as read: ${command.notificationId} for user: ${command.userId}`,
      );

      // Invalidate cache
      await this.cacheService.invalidateAllNotificationCaches(command.userId);

      // TODO: Emit NotificationRead domain event
      // This will be implemented when we add event handling

      return result;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Failed to mark notification as read ${command.notificationId} for user ${command.userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
