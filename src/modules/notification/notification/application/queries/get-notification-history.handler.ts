import { NotificationCacheService } from '../../../../../infrastructure/cache/notification-cache.service';
import { Injectable, Get, Query, Res, Logger, Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotificationRepositoryImpl } from '../../infrastructure/notification.repository.impl';
import {
  GetNotificationHistoryQuery,
  NotificationHistoryItem,
  NotificationHistoryResult,
} from './get-notification-history.query';

@Injectable()
@QueryHandler(GetNotificationHistoryQuery)
export class GetNotificationHistoryHandler implements IQueryHandler<GetNotificationHistoryQuery> {
  private readonly logger = new Logger(GetNotificationHistoryHandler.name);

  constructor(
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepositoryImpl,
    private readonly cacheService: NotificationCacheService,
  ) {}

  async execute(query: GetNotificationHistoryQuery): Promise<NotificationHistoryResult> {
    try {
      const logContext =
        query.sourceService || query.sentBy
          ? `sourceService: ${query.sourceService}, sentBy: ${query.sentBy}`
          : `user: ${query.userId}`;
      this.logger.log(`Getting notification history for ${logContext}`);

      // Validate pagination parameters
      const page = Math.max(1, query.page || 1);
      const limit = Math.min(100, Math.max(1, query.limit || 20)); // Max 100 per page
      const offset = (page - 1) * limit;

      // ⭐ Skip cache if sourceService or sentBy filters are used (service-to-service calls)
      const useCache = !query.sourceService && !query.sentBy;

      if (useCache && query.userId) {
        // Check cache first (only for user calls)
        const cacheFilters = {
          type: query.type,
          channel: query.channel,
          status: query.status,
          startDate: query.startDate?.toISOString(),
          endDate: query.endDate?.toISOString(),
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        };

        const cached = await this.cacheService.getCachedNotificationHistory(
          query.userId,
          page,
          limit,
          cacheFilters,
        );

        if (cached) {
          this.logger.log(`Returning cached notification history for user: ${query.userId}`);
          return {
            notifications: cached.notifications,
            pagination: cached.pagination,
          };
        }
      }

      // Build filter options
      const filterOptions: any = {
        status: query.status,
        channel: query.channel,
        type: query.type,
        limit,
        offset,
        startDate: query.startDate,
        endDate: query.endDate,
        // ⭐ Add sourceService and sentBy filters
        sourceService: query.sourceService,
        sentBy: query.sentBy,
      };

      // Get notifications from repository
      // ⭐ If sourceService or sentBy provided, userId is optional (query all notifications)
      const userNotifications = await this.notificationRepository.getUserNotifications(
        query.userId || '', // Pass empty string if userId not provided (will be ignored in MongoDB query)
        filterOptions,
      );

      // Notifications are already filtered by repository
      const filteredNotifications = userNotifications;

      // Apply sorting
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';

      filteredNotifications.sort((a, b) => {
        const aValue = new Date(a[sortBy] || a.createdAt).getTime();
        const bValue = new Date(b[sortBy] || b.createdAt).getTime();

        if (sortOrder === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      });

      // ⭐ For MongoDB queries, we need to get total count separately
      // For now, use the length of filtered results (will be improved with count query)
      const total = filteredNotifications.length;
      const paginatedNotifications = filteredNotifications.slice(0, limit); // Already paginated by repository

      // Transform to response format
      const notifications: NotificationHistoryItem[] = paginatedNotifications.map(
        (notification) => ({
          id: notification.id,
          correlationId: notification.data?.correlationId, // ⭐ Include correlationId
          title: notification.title,
          body: notification.body,
          type: notification.type,
          channel: notification.channel,
          priority: notification.priority,
          status: notification.status,
          sentBy: notification.data?.sentBy || notification.userId, // ⭐ Include sentBy (fallback to userId)
          data: notification.data || {},
          sentAt: notification.sentAt,
          deliveredAt: notification.deliveredAt,
          readAt: notification.readAt,
          createdAt: notification.createdAt,
          updatedAt: notification.updatedAt,
        }),
      );

      const totalPages = Math.ceil(total / limit);

      const result: NotificationHistoryResult = {
        notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };

      this.logger.log(
        `Retrieved ${notifications.length} notifications for ${logContext} (page ${page}/${totalPages})`,
      );

      // Cache the result (only for user calls without service filters)
      if (useCache && query.userId) {
        const cacheFilters = {
          type: query.type,
          channel: query.channel,
          status: query.status,
          startDate: query.startDate?.toISOString(),
          endDate: query.endDate?.toISOString(),
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        };
        await this.cacheService.cacheNotificationHistory(query.userId, page, limit, cacheFilters, {
          notifications: result.notifications,
          pagination: result.pagination,
          cachedAt: new Date(),
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to get notification history: ${error.message}`, error.stack);
      throw error;
    }
  }
}
