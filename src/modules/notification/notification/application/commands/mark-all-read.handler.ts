import { NotificationCacheService } from '../../../../../infrastructure/cache/notification-cache.service';
import { MarkAllAsReadCommand, MarkAllAsReadResult } from './mark-all-read.command';
import { Injectable, Get, Res, Logger, Inject } from '@nestjs/common';
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { NotificationRepositoryImpl } from '../../infrastructure/notification.repository.impl';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';

@Injectable()
@CommandHandler(MarkAllAsReadCommand)
export class MarkAllAsReadHandler implements ICommandHandler<MarkAllAsReadCommand> {
  private readonly logger = new Logger(MarkAllAsReadHandler.name);

  constructor(
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepositoryImpl,
    private readonly novuClient: NovuClient,
    private readonly cacheService: NotificationCacheService,
  ) {}

  async execute(command: MarkAllAsReadCommand): Promise<MarkAllAsReadResult> {
    try {
      this.logger.log(`Marking all notifications as read for user: ${command.userId}`);

      // ✅ THAY ĐỔI: Mark all as read trong Novu API
      const readAt = new Date();
      const novuResult = await this.novuClient.markAllNotificationsAsRead(command.userId);
      const updatedCount = novuResult.updatedCount || 0;

      const result: MarkAllAsReadResult = {
        success: true,
        updatedCount,
        readAt,
      };

      this.logger.log(
        `Successfully marked ${updatedCount} notifications as read for user: ${command.userId}`,
      );

      // Invalidate cache only if notifications were actually updated
      if (updatedCount > 0) {
        await this.cacheService.invalidateAllNotificationCaches(command.userId);
      }

      // TODO: Emit bulk NotificationRead domain events
      // This will be implemented when we add event handling

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to mark all notifications as read for user ${command.userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
