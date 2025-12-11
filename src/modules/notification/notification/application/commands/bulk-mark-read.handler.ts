import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { BulkMarkReadCommand } from './bulk-mark-read.command';
import { NotificationCacheService } from '../../../../../infrastructure/cache/notification-cache.service';
import { Injectable, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { NotificationRepository } from '../../domain/notification.repository';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';

@Injectable()
@CommandHandler(BulkMarkReadCommand)
export class BulkMarkReadHandler implements ICommandHandler<BulkMarkReadCommand> {
  private readonly logger = new Logger(BulkMarkReadHandler.name);

  constructor(
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepository,
    private readonly novuClient: NovuClient,
    private readonly cacheService: NotificationCacheService,
  ) {}

  async execute(command: BulkMarkReadCommand): Promise<{ updatedCount: number; readAt: Date }> {
    const { userId, ids } = command;
    const readAt = new Date();
    let updatedCount = 0;

    // ✅ THAY ĐỔI: Mark từng notification as read trong Novu API
    for (const notificationId of ids) {
      try {
        await this.novuClient.markNotificationAsRead(userId, notificationId);
        updatedCount++;
      } catch (error) {
        // Skip if notification not found or already read
        this.logger.warn(
          `Failed to mark notification ${notificationId} as read: ${error.message}`,
        );
      }
    }

    if (updatedCount > 0) {
      await this.cacheService.invalidateAllNotificationCaches(userId);
    }

    return { updatedCount, readAt };
  }
}
