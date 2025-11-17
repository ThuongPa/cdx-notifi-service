import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: any = null;
  private channel: any = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const rabbitmqConfig = this.configService.get('rabbitmq');

    if (!rabbitmqConfig?.uri) {
      this.logger.warn('RabbitMQ URI not configured, skipping connection');
      return;
    }

    try {
      this.connection = await amqp.connect(rabbitmqConfig.uri);
      this.channel = await this.connection.createChannel();

      this.connection.on('error', (error: Error) => {
        this.logger.error('RabbitMQ connection error:', error);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
      });

      // Setup exchanges and queues
      this.logger.log('Setting up RabbitMQ exchanges...');
      await this.setupExchanges();
      this.logger.log('Setting up RabbitMQ queues...');
      await this.setupQueues();
      this.logger.log('RabbitMQ setup completed successfully');

      this.logger.log('RabbitMQ connection established');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      this.logger.warn('Application will continue without RabbitMQ connection');
      // Don't throw error to prevent app crash
    }
  }

  async onModuleDestroy() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    this.logger.log('RabbitMQ connection closed');
  }

  private async setupExchanges() {
    const rabbitmqConfig = this.configService.get('rabbitmq');

    // Setup notification exchange
    this.logger.log(`Creating exchange: ${rabbitmqConfig.exchanges.notifications.name}`);
    await this.channel?.assertExchange(
      rabbitmqConfig.exchanges.notifications.name,
      rabbitmqConfig.exchanges.notifications.type,
      { durable: rabbitmqConfig.exchanges.notifications.durable },
    );

    // Setup events exchange
    this.logger.log(`Creating exchange: ${rabbitmqConfig.exchanges.events.name}`);
    await this.channel?.assertExchange(
      rabbitmqConfig.exchanges.events.name,
      rabbitmqConfig.exchanges.events.type,
      { durable: rabbitmqConfig.exchanges.events.durable },
    );

    // Setup auth exchange (for user synchronization)
    this.logger.log('Creating exchange: auth.exchange');
    await this.channel?.assertExchange('auth.exchange', 'topic', { durable: true });
  }

  private async setupQueues() {
    const rabbitmqConfig = this.configService.get('rabbitmq');

    // Setup notification queue
    this.logger.log(`Setting up queue: ${rabbitmqConfig.queues.notificationQueue.name}`);
    await this.setupQueueSafely(
      rabbitmqConfig.queues.notificationQueue.name,
      rabbitmqConfig.queues.notificationQueue.durable,
      rabbitmqConfig.queues.notificationQueue.arguments,
    );

    // Setup retry queue
    this.logger.log(`Setting up queue: ${rabbitmqConfig.queues.retryQueue.name}`);
    await this.setupQueueSafely(
      rabbitmqConfig.queues.retryQueue.name,
      rabbitmqConfig.queues.retryQueue.durable,
      rabbitmqConfig.queues.retryQueue.arguments,
    );

    // Setup dead letter queue
    this.logger.log(`Setting up queue: ${rabbitmqConfig.queues.deadLetterQueue.name}`);
    await this.setupQueueSafely(
      rabbitmqConfig.queues.deadLetterQueue.name,
      rabbitmqConfig.queues.deadLetterQueue.durable,
      rabbitmqConfig.queues.deadLetterQueue.arguments,
    );

    // Bind queues to exchanges
    this.logger.log(
      `Binding queue ${rabbitmqConfig.queues.notificationQueue.name} to ${rabbitmqConfig.exchanges.notifications.name} with routing key notification.*`,
    );
    await this.channel?.bindQueue(
      rabbitmqConfig.queues.notificationQueue.name,
      rabbitmqConfig.exchanges.notifications.name,
      'notification.*',
    );

    // Bind loaphuong events to notification queue
    this.logger.log(
      `Binding queue ${rabbitmqConfig.queues.notificationQueue.name} to ${rabbitmqConfig.exchanges.notifications.name} with routing key loaphuong.*`,
    );
    await this.channel?.bindQueue(
      rabbitmqConfig.queues.notificationQueue.name,
      rabbitmqConfig.exchanges.notifications.name,
      'loaphuong.*',
    );

    // Bind to auth events (for user synchronization)
    this.logger.log(
      `Binding queue ${rabbitmqConfig.queues.notificationQueue.name} to auth.exchange with routing key auth.*`,
    );
    await this.channel?.bindQueue(
      rabbitmqConfig.queues.notificationQueue.name,
      'auth.exchange', // Bind to auth exchange
      'auth.*', // Listen to all auth events
    );
  }

  private async setupQueueSafely(queueName: string, durable: boolean, queueArguments: any) {
    try {
      // First, try to check if queue exists
      const queueInfo = await this.channel?.checkQueue(queueName);
      if (queueInfo) {
        this.logger.log(`Queue ${queueName} already exists, skipping creation`);
        return;
      }
    } catch (error) {
      // Queue doesn't exist, create it
      this.logger.log(`Queue ${queueName} doesn't exist, creating new queue`);
    }

    try {
      // Create the queue
      await this.channel?.assertQueue(queueName, {
        durable,
        arguments: queueArguments,
      });
      this.logger.log(`Queue ${queueName} created successfully`);
    } catch (error) {
      this.logger.error(`Failed to create queue ${queueName}:`, error);
      // If it's a precondition failed error, the queue exists with different config
      if (error.code === 406) {
        this.logger.warn(
          `Queue ${queueName} exists with different configuration, using existing queue`,
        );
      } else {
        throw error;
      }
    }
  }

  async publish(a: string, b: string | any, c?: any): Promise<void> {
    if (!this.channel) {
      this.logger.debug('RabbitMQ channel not available, message not published');
      return;
    }

    const hasThreeArgs = typeof c !== 'undefined';
    const exchange = hasThreeArgs
      ? a
      : this.configService.get('rabbitmq').exchanges.notifications.name;
    const routingKey = hasThreeArgs ? (b as string) : (a as string);
    const message = hasThreeArgs ? c : b;

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      await this.channel.publish(exchange, routingKey, messageBuffer);
      this.logger.log(`Message published to ${exchange} with routing key ${routingKey}`);
    } catch (error) {
      this.logger.error('Error publishing message:', error);
      throw error;
    }
  }

  async consumeMessage(
    queue: string,
    callback: (message: any) => Promise<void>,
    options?: { consumerTag?: string; prefetch?: number },
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ channel not available, cannot consume messages');
      throw new Error('RabbitMQ channel not available');
    }

    try {
      // Set prefetch if provided to control message distribution
      if (options?.prefetch !== undefined) {
        await this.channel.prefetch(options.prefetch);
        this.logger.log(`Set prefetch to ${options.prefetch} for queue: ${queue}`);
      }

      // Generate unique consumer tag if not provided
      const consumerTag =
        options?.consumerTag ||
        `consumer-${queue}-${process.pid}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      this.logger.log(`Starting to consume messages from queue: ${queue}`, {
        consumerTag,
        prefetch: options?.prefetch,
      });

      await this.channel.consume(
        queue,
        async (msg: any) => {
          if (msg) {
            try {
              const message = JSON.parse(msg.content.toString());
              this.logger.debug(`Processing message from queue ${queue}:`, {
                eventType: message.eventType,
                eventId: message.eventId,
                consumerTag,
              });
              await callback(message);
              this.channel.ack(msg);
            } catch (error) {
              this.logger.error('Error processing message:', {
                error: error.message,
                queue,
                consumerTag,
              });
              this.channel.nack(msg, false, false); // Reject and don't requeue
            }
          }
        },
        {
          consumerTag, // ⭐ Unique consumer tag để tránh conflict với consumer khác
          noAck: false,
        },
      );

      this.logger.log(`Successfully started consuming from queue: ${queue}`, {
        consumerTag,
      });
    } catch (error) {
      this.logger.error('Error consuming messages:', error);
      throw error;
    }
  }

  getChannel(): any {
    return this.channel;
  }

  getConnection(): any {
    return this.connection;
  }

  isChannelAvailable(): boolean {
    return this.channel !== null && this.channel !== undefined;
  }

  getChannelStatus() {
    return {
      hasConnection: !!this.connection,
      hasChannel: !!this.channel,
      isAvailable: this.isChannelAvailable(),
    };
  }
}
