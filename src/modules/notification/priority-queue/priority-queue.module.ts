import { Module, Controller, forwardRef } from '@nestjs/common';
import { PriorityQueueController } from './priority-queue.controller';
import { PriorityQueueService } from './priority-queue.service';
import { RabbitMQModule } from '../../../infrastructure/messaging/rabbitmq.module';
import { RedisModule } from '../../../infrastructure/cache/redis.module';
import { MonitoringModule } from '../../../infrastructure/monitoring/monitoring.module';
import { LoggingModule } from '../../../infrastructure/logging/logging.module';
import { NovuModule } from '../../../infrastructure/external/novu/novu.module';
import { RedirectUrlModule } from '../redirect-url/redirect-url.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    RabbitMQModule,
    RedisModule,
    MonitoringModule,
    LoggingModule,
    NovuModule,
    RedirectUrlModule,
    forwardRef(() => NotificationModule), // ⭐ Import để có NotificationRepository (forwardRef để tránh circular dependency)
  ],
  controllers: [PriorityQueueController],
  providers: [PriorityQueueService],
  exports: [PriorityQueueService],
})
export class PriorityQueueModule {}
