import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';
import { EventValidationService } from './event-validation.service';
import { RabbitMQRetryService } from './rabbitmq-retry.service';
import { Injectable, Res, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Type } from 'class-transformer';

export interface EventHandler {
  handle(event: any): Promise<void>;
}

@Injectable()
export class RabbitMQConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConsumerService.name);
  private readonly eventHandlers = new Map<string, EventHandler>();
  private isConsuming = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly eventValidationService: EventValidationService,
    private readonly retryService: RabbitMQRetryService,
  ) {}

  async onModuleInit() {
    await this.startConsuming();
  }

  async onModuleDestroy() {
    this.isConsuming = false;
    this.logger.log('RabbitMQ consumer stopped');
  }

  registerEventHandler(eventType: string, handler: EventHandler) {
    this.eventHandlers.set(eventType, handler);
    this.logger.log(`Registered event handler for: ${eventType}`);
  }

  async consume(
    queue: string,
    onMessage: (message: any) => Promise<any>,
    options?: { consumerTag?: string; prefetch?: number },
  ): Promise<void> {
    await this.rabbitMQService.consumeMessage(queue, onMessage, options);
  }

  async validateEvent(event: any): Promise<boolean> {
    const validation = await this.eventValidationService.validateEventMessage(event);
    return validation.isValid;
  }

  private async startConsuming() {
    const rabbitmqConfig = this.configService.get('rabbitmq');

    try {
      this.isConsuming = true;

      // Wait for RabbitMQ channel to be available with retry logic
      await this.waitForRabbitMQChannel();

      // Generate unique consumer tag for this service instance
      const consumerTag = `notification-consumer-${process.pid}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Start consuming from notification queue with unique consumer tag and prefetch
      await this.rabbitMQService.consumeMessage(
        rabbitmqConfig.queues.notificationQueue.name,
        this.handleMessage.bind(this),
        {
          consumerTag, // ⭐ Unique consumer tag để tránh conflict
          prefetch: 1, // ⭐ Set prefetch để đảm bảo fair distribution
        },
      );

      this.logger.log('RabbitMQ consumer started successfully', {
        consumerTag,
        queue: rabbitmqConfig.queues.notificationQueue.name,
      });
    } catch (error) {
      this.logger.error('Failed to start RabbitMQ consumer:', error);
      throw error;
    }
  }

  private async waitForRabbitMQChannel(maxRetries = 10, retryDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      const status = this.rabbitMQService.getChannelStatus();
      this.logger.debug(`RabbitMQ status check (attempt ${i + 1}/${maxRetries}):`, status);

      if (status.isAvailable) {
        this.logger.log(`RabbitMQ channel is available (attempt ${i + 1}/${maxRetries})`);
        return;
      }

      this.logger.debug(`Waiting for RabbitMQ channel... (attempt ${i + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    const finalStatus = this.rabbitMQService.getChannelStatus();
    this.logger.error('RabbitMQ channel not available after maximum retries:', finalStatus);
    throw new Error('RabbitMQ channel not available after maximum retries');
  }

  private async handleMessage(message: any) {
    const correlationId = this.eventValidationService.generateCorrelationId();

    try {
      this.logger.log(`Processing message with correlation ID: ${correlationId}`, {
        messageId: message.eventId,
        eventType: message.eventType,
        routingKey: message.routingKey,
      });

      // Validate message
      const validation = await this.eventValidationService.validateEventMessage(message);

      if (!validation.isValid) {
        this.logger.error(`Message validation failed for correlation ID: ${correlationId}`, {
          errors: validation.errors,
          message,
        });

        // Move to DLQ for invalid messages
        await this.moveToDeadLetterQueue(message, 'Validation failed', correlationId);
        return;
      }

      // Process event with retry logic
      const retryResult = await this.retryService.executeWithRetry(
        () => this.processEvent(validation.event!, correlationId),
        undefined,
        `Event processing for ${validation.event!.eventType}`,
      );

      if (!retryResult.success) {
        this.logger.error(
          `Event processing failed after ${retryResult.attempts} attempts for correlation ID: ${correlationId}`,
          {
            eventType: validation.event!.eventType,
            error: retryResult.error,
          },
        );

        // Move to DLQ after max retries
        await this.moveToDeadLetterQueue(
          message,
          'Processing failed after max retries',
          correlationId,
        );
        return;
      }

      this.logger.log(`Event processed successfully for correlation ID: ${correlationId}`, {
        eventType: validation.event!.eventType,
        attempts: retryResult.attempts,
      });
    } catch (error) {
      this.logger.error(
        `Unexpected error processing message for correlation ID: ${correlationId}:`,
        error,
      );

      // Move to DLQ for unexpected errors
      await this.moveToDeadLetterQueue(message, 'Unexpected error', correlationId);
    }
  }

  private async processEvent(event: any, correlationId: string): Promise<void> {
    const handler = this.eventHandlers.get(event.eventType);

    if (!handler) {
      this.logger.warn(`No handler found for event type: ${event.eventType}`, {
        correlationId,
        eventId: event.eventId,
      });
      return;
    }

    try {
      await handler.handle(event);

      this.logger.log(`Event handled successfully`, {
        correlationId,
        eventType: event.eventType,
        eventId: event.eventId,
      });
    } catch (error) {
      this.logger.error(`Event handler failed for ${event.eventType}`, {
        correlationId,
        eventId: event.eventId,
        error: error.message,
      });
      throw error;
    }
  }

  private async moveToDeadLetterQueue(message: any, reason: string, correlationId: string) {
    try {
      const rabbitmqConfig = this.configService.get('rabbitmq');
      const dlqMessage = {
        ...message,
        dlqReason: reason,
        dlqTimestamp: new Date().toISOString(),
        correlationId,
      };

      await this.rabbitMQService.publish(
        rabbitmqConfig.exchanges.notifications.name,
        'dlq.notification',
        dlqMessage,
      );

      this.logger.log(`Message moved to DLQ for correlation ID: ${correlationId}`, {
        reason,
        eventType: message.eventType,
      });
    } catch (error) {
      this.logger.error(
        `Failed to move message to DLQ for correlation ID: ${correlationId}:`,
        error,
      );
    }
  }

  getHealthStatus() {
    return {
      isConsuming: this.isConsuming,
      registeredHandlers: Array.from(this.eventHandlers.keys()),
      timestamp: new Date().toISOString(),
    };
  }
}
