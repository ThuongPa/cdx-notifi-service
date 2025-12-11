import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

import { DatabaseConfig } from './config/database.config';
import { RedisConfig } from './config/redis.config';
import { RabbitMQConfig } from './config/rabbitmq.config';
import { NovuConfig } from './config/novu.config';
import { AuthConfig } from './config/auth.config';
import { AppConfig } from './config/app.config';

import { HealthModule } from './modules/health/health.module';
import { RabbitMQConsumerModule } from './modules/notification/integration/rabbitmq/rabbitmq-consumer.module';
import { NotificationModule } from './modules/notification/notification/notification.module';
import { AdminModule } from './modules/notification/admin/admin.module';
import { WorkersModule } from './workers/workers.module';
import { DLQModule } from './modules/notification/integration/dlq/dlq.module';
import { AnalyticsModule } from './modules/notification/integration/analytics/analytics.module';
import { MonitoringModule } from './infrastructure/monitoring/monitoring.module';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { SecurityModule } from './common/security/security.module';
import { QueueMonitoringModule } from './modules/notification/queue-monitoring/queue-monitoring.module';
import { BatchProcessingModule } from './modules/notification/batch-processing/batch-processing.module';
import { PriorityQueueModule } from './modules/notification/priority-queue/priority-queue.module';
import { PerformanceModule } from './infrastructure/performance/performance.module';
import { DatabaseModule } from './infrastructure/database/mongoose.module';
import { CategoryModule } from './modules/notification/category/category.module';
import { DeviceTokenModule } from './modules/notification/device-token/device-token.module';
import { SchedulingModule } from './modules/notification/scheduling/scheduling.module';
import { WebhookModule } from './modules/notification/webhook/webhook.module';
import { AuthModule } from './modules/auth/auth.module';
import { PreferencesModule } from './modules/notification/preferences/preferences.module';
import { InAppModule } from './modules/notification/in-app/in-app.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['config/development.env', '.env'],
      load: [DatabaseConfig, RedisConfig, RabbitMQConfig, NovuConfig, AuthConfig, AppConfig],
    }),

    // Logging
    WinstonModule.forRoot({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    }),

    // Database
    MongooseModule.forRootAsync({
      useFactory: () => {
        const databaseConfig = DatabaseConfig();
        return {
          uri: databaseConfig.uri,
        };
      },
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Health checks
    TerminusModule,

    // Infrastructure modules
    DatabaseModule, // ⭐ Database initialization (collections & indexes)
    LoggingModule,
    MonitoringModule,
    SecurityModule,

    // Feature modules
    HealthModule,
    RabbitMQConsumerModule,
    NotificationModule,
    AdminModule,
    WorkersModule,
    DLQModule,
    AnalyticsModule,
    QueueMonitoringModule,
    BatchProcessingModule,
    PriorityQueueModule,
    PerformanceModule,
    CategoryModule,
    DeviceTokenModule,
    SchedulingModule,
    WebhookModule,
    AuthModule,
    PreferencesModule,
    InAppModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
