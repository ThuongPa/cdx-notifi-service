import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import { NotificationCacheService } from '../../../infrastructure/cache/notification-cache.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { GetNotificationHistoryHandler } from './application/queries/get-notification-history.handler';
import { GetNotificationHandler } from './application/queries/get-notification.handler';
import { GetNotificationByCorrelationIdHandler } from './application/queries/get-notification-by-correlation-id.handler';
import { GetUnreadCountHandler } from './application/queries/get-unread-count.handler';
import { GetUserStatisticsHandler } from './application/queries/get-user-statistics.handler';
import { MarkAsReadHandler } from './application/commands/mark-as-read.handler';
import { MarkAllAsReadHandler } from './application/commands/mark-all-read.handler';
import { BulkMarkReadHandler } from './application/commands/bulk-mark-read.handler';
import { BulkArchiveHandler } from './application/commands/bulk-archive.handler';
import { NotificationController } from './interface/notification.controller';
import { TemplatesModule } from '../templates/templates.module';
import { PreferencesModule } from '../preferences/preferences.module';
import { PriorityQueueModule } from '../priority-queue/priority-queue.module';
import { AuthServiceModule } from '../../../infrastructure/external/auth-service/auth-service.module';
import { NovuModule } from '../../../infrastructure/external/novu/novu.module';
import { CircuitBreakerModule } from '../../../infrastructure/external/circuit-breaker/circuit-breaker.module';

// Schemas
import {
  Notification,
  NotificationSchema,
} from '../../../infrastructure/database/schemas/notification.schema';
import {
  UserNotification,
  UserNotificationSchema,
} from '../../../infrastructure/database/schemas/user-notification.schema';
import { User, UserSchema } from '../../../infrastructure/database/schemas/user.schema';

// Infrastructure
import { NotificationRepositoryImpl } from './infrastructure/notification.repository.impl';
import { NovuNotificationRepository } from './infrastructure/novu-notification.repository';
import { NotificationProcessingService } from './application/services/notification-processing.service';
import { NovuNotificationService } from './application/services/novu-notification.service';

@Module({
  imports: [
    CqrsModule,
    ConfigModule,
    TemplatesModule,
    PreferencesModule, // ⭐ For UserPreferencesRepository
    forwardRef(() => PriorityQueueModule), // ⭐ For PriorityQueueService (forwardRef để tránh circular dependency)
    AuthServiceModule, // ⭐ For AuthServiceClient
    NovuModule, // ⭐ For NovuWorkflowService
    CircuitBreakerModule, // ⭐ For CircuitBreakerService
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: UserNotification.name, schema: UserNotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationController],
  providers: [
    // Infrastructure Services
    RedisService,
    NotificationCacheService,

    // Repository
    {
      provide: 'NotificationRepository',
      useClass: NotificationRepositoryImpl,
    },
    NotificationRepositoryImpl,
    NovuNotificationRepository, // ⭐ Repository để query từ Novu API

    // Query Handlers
    GetNotificationHistoryHandler,
    GetNotificationHandler,
    GetNotificationByCorrelationIdHandler, // ⭐ Handler for correlationId queries
    GetUnreadCountHandler,
    GetUserStatisticsHandler,

    // Command Handlers
    MarkAsReadHandler,
    MarkAllAsReadHandler,
    BulkMarkReadHandler,
    BulkArchiveHandler,

    // Application Services
    NotificationProcessingService, // ⭐ Service để process notification events
    NovuNotificationService, // ⭐ Service để handle Novu webhooks
  ],
  exports: [
    RedisService,
    NotificationCacheService,
    'NotificationRepository',
    NotificationRepositoryImpl,
    GetNotificationHistoryHandler,
    GetNotificationHandler,
    GetUnreadCountHandler,
    GetUserStatisticsHandler,
    MarkAsReadHandler,
    MarkAllAsReadHandler,
    BulkMarkReadHandler,
    BulkArchiveHandler,

    // Application Services
    NotificationProcessingService, // ⭐ Export để các module khác có thể dùng
  ],
})
export class NotificationModule {}
