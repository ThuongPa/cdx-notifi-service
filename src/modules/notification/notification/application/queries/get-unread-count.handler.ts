import { NotificationCacheService } from '../../../../../infrastructure/cache/notification-cache.service';
import { GetUnreadCountQuery, UnreadCountResult } from './get-unread-count.query';
import { Injectable, Get, Query, Res, Logger, Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotificationRepositoryImpl } from '../../infrastructure/notification.repository.impl';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';

@Injectable()
@QueryHandler(GetUnreadCountQuery)
export class GetUnreadCountHandler implements IQueryHandler<GetUnreadCountQuery> {
  private readonly logger = new Logger(GetUnreadCountHandler.name);

  constructor(
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepositoryImpl,
    private readonly novuClient: NovuClient,
    private readonly cacheService: NotificationCacheService,
  ) {}

  async execute(query: GetUnreadCountQuery): Promise<UnreadCountResult> {
    try {
      this.logger.log(`Getting unread count for user: ${query.userId}`);

      // Check cache first
      const cached = await this.cacheService.getCachedUnreadCount(query.userId);
      if (cached) {
        this.logger.log(`Returning cached unread count for user: ${query.userId}`);
        return {
          count: cached.count,
          lastUpdated: cached.lastUpdated,
        };
      }

      // ✅ THAY ĐỔI: Get unread count từ Novu API
      const novuResult = await this.novuClient.getUnreadCount(query.userId);
      const count = novuResult.count || 0;

      const result: UnreadCountResult = {
        count,
        lastUpdated: new Date(),
      };

      // Cache the result
      await this.cacheService.cacheUnreadCount(query.userId, count);

      this.logger.log(`Retrieved unread count for user ${query.userId}: ${count}`);

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get unread count for user ${query.userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
