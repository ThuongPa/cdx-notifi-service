import { RabbitMQService } from '../../../infrastructure/messaging/rabbitmq.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { PrometheusService } from '../../../infrastructure/monitoring/prometheus.service';
import {
  Injectable,
  Get,
  Res,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import * as amqp from 'amqplib';
import { StructuredLoggerService } from '../shared/services/structured-logger.service';
import { NovuClient } from '../../../infrastructure/external/novu/novu.client';
import { RedirectUrlService } from '../redirect-url/redirect-url.service';
import { NotificationRepositoryImpl } from '../notification/infrastructure/notification.repository.impl';
import { createId } from '@paralleldrive/cuid2';

export interface PriorityMessage {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: any;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  scheduledAt?: Date;
  retryCount?: number;
  maxRetries?: number;
}

export interface WorkerPoolStatus {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queueLengths: Record<string, number>;
  processingRates: Record<string, number>;
}

@Injectable()
export class PriorityQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriorityQueueService.name);
  private readonly maxWorkers = parseInt(process.env.MAX_WORKERS || '5');
  private readonly workers: Map<string, amqp.Channel> = new Map();
  private readonly workerStatus = new Map<string, 'idle' | 'busy'>();
  private readonly queueNames = {
    main: 'priority.notification.queue',
    retry: 'priority.notification.retry.queue',
    dlq: 'priority.notification.dlq',
  };
  private readonly consumerTagPrefix = 'priority-queue-worker-'; // ⭐ Prefix để nhận diện consumers của service này
  private isShuttingDown = false;
  private persistenceInterval: NodeJS.Timeout;
  private readonly registeredConsumerTags = new Set<string>(); // ⭐ Lưu consumer tags đã đăng ký

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly redisService: RedisService,
    private readonly prometheusService: PrometheusService,
    private readonly structuredLogger: StructuredLoggerService,
    private readonly novuClient: NovuClient,
    private readonly redirectUrlService: RedirectUrlService,
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepositoryImpl,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Initializing Priority Queue Service...');
    await this.initializeQueues();
    // ⭐ Cancel consumers cũ trước khi khởi tạo workers mới
    await this.cancelOldConsumers();
    await this.initializeWorkerPool();
    await this.restoreQueueState();
    this.startPersistenceInterval();
    this.logger.log('✅ Priority queue service initialized successfully', {
      maxWorkers: this.maxWorkers,
      queues: Object.values(this.queueNames),
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;

    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    await this.persistQueueState();
    await this.shutdownWorkerPool();
    this.logger.log('Priority queue service destroyed');
  }

  private async initializeQueues(): Promise<void> {
    try {
      const connection = await this.rabbitMQService.getConnection();
      const channel = await connection.createChannel();

      // Initialize all queues with proper configuration
      for (const [priority, queueName] of Object.entries(this.queueNames)) {
        try {
          await channel.assertQueue(queueName, {
            durable: true,
            arguments: {
              'x-max-priority': 15, // Support priority levels 0-15 for urgent/high/normal/low
              'x-message-ttl': priority === 'dlq' ? 86400000 : undefined, // 24 hours for DLQ
            },
          });

          this.logger.log(`Initialized queue: ${queueName}`);
        } catch (error) {
          // If it's a precondition failed error, the queue exists with different config
          if (error.code === 406) {
            this.logger.warn(
              `Queue ${queueName} exists with different configuration, using existing queue`,
            );
          } else {
            this.logger.error(`Failed to create queue ${queueName}:`, error);
            throw error;
          }
        }
      }

      await channel.close();
      this.logger.log('Priority notification queues initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize priority notification queues:', error);
      throw error;
    }
  }

  /**
   * ⭐ Cancel consumers cũ từ priority queues
   * Chỉ cancel consumers có tag `amq.ctag-*` (tự động generate) từ các queue của PriorityQueueService
   * KHÔNG cancel consumers của service khác
   */
  private async cancelOldConsumers(): Promise<void> {
    try {
      this.logger.log('🔍 Checking for old consumers to cancel...');
      const connection = await this.rabbitMQService.getConnection();
      const channel = await connection.createChannel();

      // Chỉ cancel từ các queue của PriorityQueueService
      const queuesToCheck = [this.queueNames.main, this.queueNames.retry];

      for (const queueName of queuesToCheck) {
        try {
          const queueInfo = await channel.checkQueue(queueName);
          this.logger.log(`📊 Checking consumers for queue: ${queueName}`, {
            queueName,
            consumerCount: queueInfo.consumerCount,
          });

          // Nếu có consumers, thử cancel consumers cũ
          if (queueInfo.consumerCount > 0) {
            // ⭐ Sử dụng RabbitMQ Management HTTP API để lấy danh sách consumers
            // Nếu không có Management API, sẽ skip và chỉ log warning
            await this.cancelOldConsumersFromQueue(channel, queueName);
          }
        } catch (error) {
          this.logger.warn(`Could not check/cancel consumers for ${queueName}:`, error.message);
        }
      }

      await channel.close();
      this.logger.log('✅ Finished checking for old consumers');
    } catch (error) {
      this.logger.warn('Failed to cancel old consumers (non-critical):', error.message);
      // Không throw error vì đây không phải critical operation
    }
  }

  /**
   * Cancel consumers cũ từ một queue cụ thể
   * Chỉ cancel consumers có tag `amq.ctag-*` (tự động generate, không có consumerTag được set)
   * Sử dụng RabbitMQ Management HTTP API nếu có, nếu không thì skip
   */
  private async cancelOldConsumersFromQueue(
    channel: amqp.Channel,
    queueName: string,
  ): Promise<void> {
    try {
      // ⭐ Sử dụng RabbitMQ Management HTTP API để lấy danh sách consumers
      const managementApiUrl = this.getRabbitMQManagementApiUrl();
      if (!managementApiUrl) {
        this.logger.debug(
          `RabbitMQ Management API URL not configured, skipping consumer cancellation for ${queueName}`,
        );
        return;
      }

      // Lấy danh sách consumers từ Management API
      const consumers = await this.getConsumersFromManagementApi(managementApiUrl, queueName);
      if (!consumers || consumers.length === 0) {
        this.logger.debug(`No consumers found for queue ${queueName} via Management API`);
        // ⭐ Nếu Management API không hoạt động, log warning nhưng không fail
        this.logger.warn(
          `⚠️ Could not get consumers from Management API. Old consumers may still be active.`,
          {
            queueName,
            suggestion:
              'Set RABBITMQ_MANAGEMENT_URL or ensure RabbitMQ Management plugin is enabled',
          },
        );
        return;
      }

      // ⭐ Filter chỉ lấy consumers cũ (có tag `amq.ctag-*`) từ queue này
      // KHÔNG cancel consumers có tag `priority-queue-worker-*` (consumers mới)
      // KHÔNG cancel consumers có tag `notification-consumer-*` (của RabbitMQConsumerService)
      const oldConsumers = consumers.filter((consumer: any) => {
        const tag = consumer.consumer_tag || '';
        // Chỉ cancel consumers có tag `amq.ctag-*` (tự động generate)
        // Và đang consume từ queue của PriorityQueueService
        return (
          tag.startsWith('amq.ctag-') &&
          !tag.startsWith(this.consumerTagPrefix) &&
          !tag.startsWith('notification-consumer-')
        );
      });

      if (oldConsumers.length === 0) {
        this.logger.log(`✅ No old consumers to cancel for ${queueName}`);
        return;
      }

      this.logger.log(`🔍 Found ${oldConsumers.length} old consumers to cancel for ${queueName}`, {
        queueName,
        oldConsumers: oldConsumers.map((c: any) => ({
          consumerTag: c.consumer_tag,
          channelDetails: c.channel_details,
        })),
      });

      // Cancel từng consumer cũ
      let cancelledCount = 0;
      for (const consumer of oldConsumers) {
        try {
          await this.cancelConsumerViaManagementApi(
            managementApiUrl,
            consumer.channel_details?.name || '',
            consumer.consumer_tag,
          );
          cancelledCount++;
          this.logger.log(`✅ Cancelled old consumer: ${consumer.consumer_tag}`, {
            queueName,
            consumerTag: consumer.consumer_tag,
          });
        } catch (error) {
          this.logger.warn(`Failed to cancel consumer ${consumer.consumer_tag}:`, error.message);
        }
      }

      if (cancelledCount > 0) {
        this.logger.log(`✅ Cancelled ${cancelledCount} old consumers for ${queueName}`, {
          queueName,
          cancelledCount,
        });
      }
    } catch (error) {
      this.logger.warn(`Could not cancel old consumers from ${queueName}:`, error.message);
      // Không throw error vì đây không phải critical operation
    }
  }

  /**
   * Lấy RabbitMQ Management API URL từ environment variables
   */
  private getRabbitMQManagementApiUrl(): string | null {
    // Thử các cách cấu hình khác nhau
    const managementUrl = process.env.RABBITMQ_MANAGEMENT_URL;
    if (managementUrl) {
      this.logger.debug(`Using RABBITMQ_MANAGEMENT_URL: ${managementUrl}`);
      return managementUrl;
    }

    // Parse từ RABBITMQ_URI nếu có
    const rabbitmqUri = process.env.RABBITMQ_URI || '';
    if (rabbitmqUri) {
      try {
        // Parse AMQP URI: amqp://user:pass@host:port/vhost
        // Hoặc: amqp://host:port/vhost
        const url = new URL(rabbitmqUri);
        const hostname = url.hostname || 'localhost';

        // ⭐ Log để debug
        this.logger.debug(`Parsing RABBITMQ_URI for Management API:`, {
          rabbitmqUri: rabbitmqUri.replace(/:[^:@]*@/, ':****@'), // Mask password
          hostname,
          parsedUrl: url.toString(),
        });

        // Management API thường chạy trên port 15672
        // Nếu RABBITMQ_URI có port, có thể Management API chạy trên port khác
        // Nhưng thông thường là 15672
        const managementUrl = `http://${hostname}:15672`;
        this.logger.debug(`Auto-detected Management API URL: ${managementUrl}`);
        return managementUrl;
      } catch (error) {
        this.logger.warn(`Could not parse RABBITMQ_URI for Management API URL: ${rabbitmqUri}`, {
          error: error.message,
          suggestion:
            'Set RABBITMQ_MANAGEMENT_URL explicitly or ensure RABBITMQ_URI is a valid URL (e.g., amqp://user:pass@host:5672/vhost)',
        });
        // Nếu không parse được, thử localhost:15672
        return 'http://localhost:15672';
      }
    }

    // Fallback về localhost:15672 nếu không có config
    this.logger.debug(
      'No RABBITMQ_URI or RABBITMQ_MANAGEMENT_URL found, using default: http://localhost:15672',
    );
    return 'http://localhost:15672';
  }

  /**
   * Lấy danh sách consumers từ RabbitMQ Management HTTP API
   */
  private async getConsumersFromManagementApi(
    managementApiUrl: string,
    queueName: string,
  ): Promise<any[]> {
    try {
      // Parse credentials từ RABBITMQ_URI
      const rabbitmqUri = process.env.RABBITMQ_URI || '';
      let username = 'guest';
      let password = 'guest';

      if (rabbitmqUri) {
        try {
          const url = new URL(rabbitmqUri);
          username = url.username || 'guest';
          password = url.password || 'guest';

          // ⭐ Log để debug (mask password)
          this.logger.debug(`Using credentials from RABBITMQ_URI for Management API:`, {
            username,
            passwordMasked: password ? '****' : 'none',
          });
        } catch {
          // Sử dụng default credentials
          this.logger.debug('Could not parse credentials from RABBITMQ_URI, using defaults');
        }
      }

      // Lấy credentials từ env nếu có (ưu tiên hơn RABBITMQ_URI)
      const envUsername = process.env.RABBITMQ_USERNAME || process.env.RABBITMQ_USER;
      const envPassword = process.env.RABBITMQ_PASSWORD || process.env.RABBITMQ_PASS;
      if (envUsername) {
        username = envUsername;
        this.logger.debug('Using RABBITMQ_USERNAME for Management API');
      }
      if (envPassword) {
        password = envPassword;
        this.logger.debug('Using RABBITMQ_PASSWORD for Management API');
      }

      // Gọi Management API để lấy danh sách consumers của queue
      const apiUrl = `${managementApiUrl}/api/queues/%2F/${encodeURIComponent(queueName)}/consumers`;
      const auth = Buffer.from(`${username}:${password}`).toString('base64');

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Queue không tồn tại hoặc không có consumers
          return [];
        }
        throw new Error(`Management API returned ${response.status}: ${response.statusText}`);
      }

      const consumers = await response.json();
      return Array.isArray(consumers) ? consumers : [];
    } catch (error) {
      this.logger.warn(
        `Could not get consumers from Management API for ${queueName}:`,
        error.message,
      );
      return [];
    }
  }

  /**
   * Cancel một consumer cụ thể qua RabbitMQ Management HTTP API
   */
  private async cancelConsumerViaManagementApi(
    managementApiUrl: string,
    channelName: string,
    consumerTag: string,
  ): Promise<void> {
    try {
      // Parse credentials từ RABBITMQ_URI
      const rabbitmqUri = process.env.RABBITMQ_URI || '';
      let username = 'guest';
      let password = 'guest';

      if (rabbitmqUri) {
        try {
          const url = new URL(rabbitmqUri);
          username = url.username || 'guest';
          password = url.password || 'guest';
        } catch {
          // Sử dụng default credentials
        }
      }

      // Lấy credentials từ env nếu có
      const envUsername = process.env.RABBITMQ_USERNAME || process.env.RABBITMQ_USER;
      const envPassword = process.env.RABBITMQ_PASSWORD || process.env.RABBITMQ_PASS;
      if (envUsername) username = envUsername;
      if (envPassword) password = envPassword;

      // Gọi Management API để cancel consumer
      // Format: DELETE /api/consumers/{vhost}/{consumerTag}
      const apiUrl = `${managementApiUrl}/api/consumers/%2F/${encodeURIComponent(consumerTag)}`;
      const auth = Buffer.from(`${username}:${password}`).toString('base64');

      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok && response.status !== 404) {
        // 404 có nghĩa là consumer đã không tồn tại, không phải lỗi
        throw new Error(`Management API returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not cancel consumer ${consumerTag} via Management API:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Lưu consumer tag vào Redis để tracking
   */
  private async saveConsumerTag(queueName: string, consumerTag: string): Promise<void> {
    try {
      const key = `priority-queue:consumers:${queueName}`;
      const existingTags = await this.redisService.get(key);
      const tags: string[] = existingTags ? JSON.parse(existingTags) : [];

      // Thêm consumer tag mới nếu chưa có
      if (!tags.includes(consumerTag)) {
        tags.push(consumerTag);
        // Chỉ giữ lại 100 consumer tags gần nhất để tránh quá nhiều data
        if (tags.length > 100) {
          tags.shift();
        }
        await this.redisService.set(key, JSON.stringify(tags), 86400); // 24 hours TTL
      }
    } catch (error) {
      this.logger.warn(`Could not save consumer tag to Redis:`, error.message);
    }
  }

  private async initializeWorkerPool(): Promise<void> {
    try {
      this.logger.log(`🔧 Starting worker pool initialization with ${this.maxWorkers} workers...`);
      const connection = await this.rabbitMQService.getConnection();

      if (!connection) {
        throw new Error('RabbitMQ connection not available');
      }

      this.logger.log(`✅ RabbitMQ connection obtained for worker pool`);

      for (let i = 0; i < this.maxWorkers; i++) {
        const workerId = `worker-${i}`;
        this.logger.log(`🔧 Creating channel for ${workerId}...`);

        const channel = await connection.createChannel();

        // Set prefetch count to 1 for better load balancing
        await channel.prefetch(1);
        this.logger.log(`✅ Prefetch set to 1 for ${workerId}`);

        this.workers.set(workerId, channel);
        this.workerStatus.set(workerId, 'idle');

        // Start consuming from all queues
        this.logger.log(`🔧 Starting worker ${workerId}...`);
        await this.startWorker(workerId, channel);
        this.logger.log(`✅ Worker ${workerId} started successfully`);
      }

      this.logger.log(`✅ Initialized ${this.maxWorkers} workers for priority queue processing`, {
        totalWorkers: this.maxWorkers,
        workersList: Array.from(this.workers.keys()),
      });
    } catch (error) {
      this.logger.error('Failed to initialize worker pool:', error);
      throw error;
    }
  }

  private async startWorker(workerId: string, channel: amqp.Channel): Promise<void> {
    try {
      // ⭐ Assert queues trên channel của worker để đảm bảo queue tồn tại trước khi consume
      await channel.assertQueue(this.queueNames.main, {
        durable: true,
        arguments: {
          'x-max-priority': 15,
        },
      });

      await channel.assertQueue(this.queueNames.retry, {
        durable: true,
        arguments: {
          'x-max-priority': 15,
        },
      });

      // Generate unique consumer tag for this worker
      const mainConsumerTag = `priority-queue-worker-${workerId}-main-${Date.now()}`;
      const retryConsumerTag = `priority-queue-worker-${workerId}-retry-${Date.now()}`;

      // ⭐ Kiểm tra queue info trước khi consume
      try {
        const queueInfo = await channel.checkQueue(this.queueNames.main);
        this.logger.log(`📊 Queue info before consume: ${this.queueNames.main}`, {
          workerId,
          messageCount: queueInfo.messageCount,
          consumerCount: queueInfo.consumerCount,
        });

        // ⭐ Cảnh báo nếu có nhiều consumers (có thể có consumers cũ)
        if (queueInfo.consumerCount > this.maxWorkers * 2) {
          this.logger.warn(
            `⚠️ Detected ${queueInfo.consumerCount} consumers, expected ${this.maxWorkers * 2}. There may be old consumers from previous runs.`,
            {
              workerId,
              currentConsumerCount: queueInfo.consumerCount,
              expectedConsumerCount: this.maxWorkers * 2,
              suggestion: 'Cancel old consumers in RabbitMQ Management UI',
            },
          );
        }
      } catch (error) {
        this.logger.warn(`Could not check queue info for ${this.queueNames.main}:`, error.message);
      }

      // ⭐ Log trước khi consume để đảm bảo consume được đăng ký
      this.logger.log(`🔵 Registering consumer for ${this.queueNames.main}`, {
        workerId,
        consumerTag: mainConsumerTag,
        queue: this.queueNames.main,
      });

      // Consume from main notification queue (priority-based) with unique consumer tag
      const consumeResult = await channel.consume(
        this.queueNames.main,
        async (msg: amqp.ConsumeMessage | null) => {
          // ⭐ Log ngay đầu callback để đảm bảo callback được gọi
          this.logger.log(`🟢 Consume callback triggered for ${this.queueNames.main}`, {
            workerId,
            consumerTag: mainConsumerTag,
            hasMessage: !!msg,
          });

          if (msg) {
            try {
              // ⭐ Log khi message được consume để track - dùng LOG thay vì DEBUG để đảm bảo luôn thấy
              const messagePreview = msg.content.toString().substring(0, 100);
              this.logger.log(
                `📥 Worker ${workerId} received message from ${this.queueNames.main}`,
                {
                  consumerTag: mainConsumerTag,
                  messagePreview,
                  deliveryTag: msg.fields.deliveryTag,
                  queue: this.queueNames.main,
                },
              );
              await this.processMessage(workerId, channel, msg, 'main');
            } catch (error) {
              this.logger.error(
                `❌ Error in worker ${workerId} consume callback for ${this.queueNames.main}:`,
                error,
              );
              // Nack message để retry
              channel.nack(msg, false, true);
            }
          } else {
            this.logger.debug(
              `Worker ${workerId} received null message from ${this.queueNames.main}`,
            );
          }
        },
        {
          noAck: false,
          consumerTag: mainConsumerTag, // ⭐ Unique consumer tag để tránh conflict
        },
      );

      // ⭐ Log kết quả consume registration
      const actualConsumerTag = consumeResult?.consumerTag || mainConsumerTag;
      this.logger.log(`✅ Consumer registered for ${this.queueNames.main}`, {
        workerId,
        consumerTag: mainConsumerTag,
        actualConsumerTag,
      });

      // ⭐ Lưu consumer tag vào Redis và Set để tracking
      this.registeredConsumerTags.add(actualConsumerTag);
      await this.saveConsumerTag(this.queueNames.main, actualConsumerTag);

      // ⭐ Kiểm tra queue info sau khi consume registration
      try {
        const queueInfoAfter = await channel.checkQueue(this.queueNames.main);
        this.logger.log(`📊 Queue info after consume registration: ${this.queueNames.main}`, {
          workerId,
          messageCount: queueInfoAfter.messageCount,
          consumerCount: queueInfoAfter.consumerCount,
        });
      } catch (error) {
        this.logger.warn(
          `Could not check queue info after consume for ${this.queueNames.main}:`,
          error.message,
        );
      }

      // ⭐ Log trước khi consume retry queue
      this.logger.log(`🔵 Registering consumer for ${this.queueNames.retry}`, {
        workerId,
        consumerTag: retryConsumerTag,
        queue: this.queueNames.retry,
      });

      // Consume from retry queue with unique consumer tag
      const retryConsumeResult = await channel.consume(
        this.queueNames.retry,
        async (msg: amqp.ConsumeMessage | null) => {
          // ⭐ Log ngay đầu callback để đảm bảo callback được gọi
          this.logger.log(`🟢 Consume callback triggered for ${this.queueNames.retry}`, {
            workerId,
            consumerTag: retryConsumerTag,
            hasMessage: !!msg,
          });

          if (msg) {
            try {
              // ⭐ Log khi message được consume để track - dùng LOG thay vì DEBUG để đảm bảo luôn thấy
              const messagePreview = msg.content.toString().substring(0, 100);
              this.logger.log(
                `📥 Worker ${workerId} received message from ${this.queueNames.retry}`,
                {
                  consumerTag: retryConsumerTag,
                  messagePreview,
                  deliveryTag: msg.fields.deliveryTag,
                  queue: this.queueNames.retry,
                },
              );
              await this.processMessage(workerId, channel, msg, 'retry');
            } catch (error) {
              this.logger.error(
                `❌ Error in worker ${workerId} consume callback for ${this.queueNames.retry}:`,
                error,
              );
              // Nack message để retry
              channel.nack(msg, false, true);
            }
          } else {
            this.logger.debug(
              `Worker ${workerId} received null message from ${this.queueNames.retry}`,
            );
          }
        },
        {
          noAck: false,
          consumerTag: retryConsumerTag, // ⭐ Unique consumer tag để tránh conflict
        },
      );

      // ⭐ Log kết quả consume registration
      const actualRetryConsumerTag = retryConsumeResult?.consumerTag || retryConsumerTag;
      this.logger.log(`✅ Consumer registered for ${this.queueNames.retry}`, {
        workerId,
        consumerTag: retryConsumerTag,
        actualConsumerTag: actualRetryConsumerTag,
      });

      // ⭐ Lưu consumer tag vào Redis và Set để tracking
      this.registeredConsumerTags.add(actualRetryConsumerTag);
      await this.saveConsumerTag(this.queueNames.retry, actualRetryConsumerTag);

      this.logger.log(
        `✅ Worker ${workerId} started consuming messages from priority.notification.queue`,
        {
          mainConsumerTag,
          retryConsumerTag,
          mainQueue: this.queueNames.main,
          retryQueue: this.queueNames.retry,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to start worker ${workerId}:`, error);
      throw error;
    }
  }

  private async processMessage(
    workerId: string,
    channel: amqp.Channel,
    msg: amqp.ConsumeMessage,
    queueType: string,
  ): Promise<void> {
    const startTime = Date.now();
    this.workerStatus.set(workerId, 'busy');

    // ⭐ Log ngay đầu để đảm bảo thấy được message đã được consume
    this.logger.log(`🔔 Worker ${workerId} started processing message from ${queueType} queue`, {
      workerId,
      queueType,
      deliveryTag: msg.fields.deliveryTag,
    });

    try {
      const message: PriorityMessage = JSON.parse(msg.content.toString());

      this.logger.log(`🔔 Worker ${workerId} processing message from ${queueType} queue`, {
        messageId: message.id,
        userId: message.userId,
        type: message.type,
        channels: message.data?.channels,
        priority: message.priority,
      });

      // Process the notification
      await this.handleNotification(message);

      // Acknowledge the message
      channel.ack(msg);

      const processingTime = Date.now() - startTime;

      // Update metrics
      this.prometheusService.recordMessageProcessingDuration(
        queueType,
        'notification',
        processingTime / 1000,
      );
      this.prometheusService.recordNotificationSent('notification', 'queue', 'success');

      this.structuredLogger.logMessageQueueOperation('processed', queueType, message.id, {
        // workerId,
        // processingTime,
        priority: message.priority,
      });

      this.logger.log(`✅ Worker ${workerId} completed processing message`, {
        messageId: message.id,
        processingTime: `${processingTime}ms`,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.logger.error(`Worker ${workerId} failed to process message:`, error);

      // Handle retry logic
      await this.handleMessageFailure(channel, msg, error, processingTime);

      this.prometheusService.recordNotificationSent('notification', 'queue', 'failed');
    } finally {
      this.workerStatus.set(workerId, 'idle');
    }
  }

  private async handleNotification(message: PriorityMessage): Promise<void> {
    this.logger.log(`📨 Handling notification: ${message.id}`, {
      userId: message.userId,
      type: message.type,
      priority: message.priority,
      channels: message.data?.channels || ['push'],
    });

    try {
      // Send notification through Novu using dynamic workflow based on channels
      const channels = message.data?.channels || ['push'];

      // Resolve redirect URL based on source service and contentId (optimized format only)
      const sourceService = message.data?.sourceService || message.type;
      const contentId = message.data?.contentId;
      const contentType = message.data?.contentType;
      const redirectUrl =
        message.data?.redirectUrl ||
        this.redirectUrlService.resolveRedirectUrl(
          sourceService,
          contentId,
          undefined,
          contentType,
        );

      // Support legacy taskId if present in data
      const taskId = message.data?.taskId;

      // ⭐ Trigger separate workflows for each channel
      // If channels = ['push', 'in-app'], we need to trigger 2 workflows:
      // 1. test-push workflow for push notifications
      // 2. test-in-app workflow for in-app notifications
      const workflowResults: Array<{ channel: string; deliveryId: string }> = [];

      for (const channel of channels) {
        try {
          // Normalize channel name
          const normalizedChannel = this.normalizeChannelName(channel);

          // Skip if channel is not supported
          const supportedChannels = ['push', 'in-app', 'email', 'sms'];
          if (!supportedChannels.includes(normalizedChannel)) {
            this.logger.warn(
              `Skipping unsupported channel: ${channel} (normalized: ${normalizedChannel})`,
            );
            continue;
          }

          // Trigger workflow for this specific channel
          const workflowResult = await this.novuClient.triggerWorkflow({
            workflowId: this.novuClient.getWorkflowId([normalizedChannel]),
            recipients: [message.userId], // User ID as subscriber ID
            payload: {
              title: message.title,
              body: message.body,
              channels: [normalizedChannel], // Single channel for this workflow
              // Use notification.data (optimized format only)
              data: message.data || {},
              announcementId: message.data?.announcementId,
              // Support redirect URL - taskId for redirect in Novu workflow (if present)
              taskId: taskId || contentId,
              // Redirect URL - resolved from service mapping or custom
              redirectUrl: redirectUrl,
              // Content ID for reference
              contentId: contentId,
              // Source service for tracking
              sourceService: sourceService,
            },
          });

          workflowResults.push({
            channel: normalizedChannel,
            deliveryId: workflowResult.deliveryId,
          });

          this.logger.log(`✅ Workflow triggered for ${normalizedChannel} channel`, {
            workflowId: this.novuClient.getWorkflowId([normalizedChannel]),
            deliveryId: workflowResult.deliveryId,
            userId: message.userId,
          });
        } catch (error) {
          this.logger.error(`Failed to trigger workflow for channel ${channel}:`, error);
          // Track failed channel để lưu với status='failed' sau
          // Continue with other channels even if one fails
        }
      }

      // Use first workflow result as primary delivery ID for backward compatibility
      const primaryWorkflowResult = workflowResults[0] || {
        deliveryId: 'unknown',
        channel: 'unknown',
      };

      // ⭐ OPTION C: Lưu UserNotification cho analytics (Database là source of truth)
      // - Lưu khi Novu thành công (status='sent')
      // - Lưu khi Novu fail (status='failed')
      // - Webhook từ Novu sẽ update status (delivered/failed)

      // Track failed channels để lưu với status='failed'
      const failedChannels: Array<{ channel: string; error: Error }> = [];

      // 1. Lưu UserNotification cho các channel đã trigger workflow thành công
      for (const workflowResult of workflowResults) {
        try {
          const normalizedChannel = workflowResult.channel;

          // Tạo UserNotification record
          const userNotificationId = createId();
          const userNotificationData = {
            id: userNotificationId,
            _id: userNotificationId, // ⭐ Required by schema
            userId: message.userId,
            notificationId: message.id,
            title: message.title,
            body: message.body,
            type: message.type,
            channel: normalizedChannel,
            priority: message.priority,
            status: 'sent', // ✅ Novu thành công
            data: {
              // Include redirectUrl và metadata trong data
              redirectUrl: redirectUrl,
              contentId: contentId,
              sourceService: sourceService,
              contentType: contentType,
              taskId: taskId,
              announcementId: message.data?.announcementId,
              // ⭐ Include sentBy (BẮT BUỘC - User ID người gửi notification)
              sentBy: message.data?.sentBy,
              // ⭐ Include correlationId (để track notification request)
              correlationId: message.data?.correlationId,
              // Include all additional data (optimized format only)
              ...(message.data || {}),
            },
            sentAt: new Date(),
            deliveryId: workflowResult.deliveryId,
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // ⭐ OPTION C: Lưu vào database cho analytics (source of truth)
          await this.notificationRepository.saveUserNotification(userNotificationData);

          this.logger.debug(`UserNotification saved for analytics (${normalizedChannel} channel)`, {
            userNotificationId,
            userId: message.userId,
            notificationId: message.id,
            channel: normalizedChannel,
            deliveryId: workflowResult.deliveryId,
          });
        } catch (error) {
          // Log error nhưng không throw để không block việc gửi notification
          this.logger.error(
            `Failed to save UserNotification for channel ${workflowResult.channel}: ${error.message}`,
            error.stack,
          );
        }
      }

      // 2. Lưu UserNotification cho các channel đã fail (nếu có)
      // Note: Failed channels được track trong catch block của vòng lặp trigger workflow
      // Chúng ta cần track lại các channel đã fail
      const successChannels = workflowResults.map((r) => r.channel);
      for (const channel of channels) {
        const normalizedChannel = this.normalizeChannelName(channel);
        if (!successChannels.includes(normalizedChannel)) {
          // Channel này đã fail, lưu với status='failed'
          try {
            const userNotificationId = createId();
            const userNotificationData = {
              id: userNotificationId,
              _id: userNotificationId,
              userId: message.userId,
              notificationId: message.id,
              title: message.title,
              body: message.body,
              type: message.type,
              channel: normalizedChannel,
              priority: message.priority,
              status: 'failed', // ❌ Novu fail
              data: {
                redirectUrl: redirectUrl,
                contentId: contentId,
                sourceService: sourceService,
                contentType: contentType,
                taskId: taskId,
                announcementId: message.data?.announcementId,
                ...(message.data || {}),
              },
              errorMessage: `Failed to trigger workflow for channel ${normalizedChannel}`,
              errorCode: 'WORKFLOW_TRIGGER_FAILED',
              retryCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // ⭐ OPTION C: Lưu vào database cho analytics (source of truth)
            await this.notificationRepository.saveUserNotification(userNotificationData);

            this.logger.debug(
              `UserNotification saved for analytics (${normalizedChannel} channel - FAILED)`,
              {
                userNotificationId,
                userId: message.userId,
                notificationId: message.id,
                channel: normalizedChannel,
              },
            );
          } catch (error) {
            this.logger.error(
              `Failed to save failed UserNotification for channel ${normalizedChannel}: ${error.message}`,
              error.stack,
            );
          }
        }
      }

      // If in-app is in channels, log it separately
      const hasInApp =
        channels.includes('in-app') || channels.includes('inApp') || channels.includes('in_app');
      if (hasInApp) {
        this.logger.log(
          `In-app notification queued in Novu inbox and saved to database for user: ${message.userId}`,
          {
            messageId: message.id,
            priority: message.priority,
          },
        );
      }

      this.logger.log(
        `Notification sent via Novu and saved to database for user: ${message.userId}`,
        {
          messageId: message.id,
          priority: message.priority,
          channels: channels,
          workflowsTriggered: workflowResults.length,
          deliveryIds: workflowResults.map((r) => r.deliveryId),
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send notification via Novu for user ${message.userId}:`, error);
      throw error; // Re-throw to trigger retry logic
    }
  }

  /**
   * Normalize channel name to standard format
   */
  private normalizeChannelName(channel: string): string {
    const normalized = channel.toLowerCase().trim();
    if (normalized === 'in-app' || normalized === 'inapp' || normalized === 'in_app') {
      return 'in-app'; // Use 'in-app' format for Novu workflow
    }
    return normalized;
  }

  private async handleMessageFailure(
    channel: amqp.Channel,
    msg: amqp.ConsumeMessage,
    error: Error,
    processingTime: number,
  ): Promise<void> {
    try {
      const message: PriorityMessage = JSON.parse(msg.content.toString());
      const retryCount = (message.retryCount || 0) + 1;
      const maxRetries = message.maxRetries || 3;

      if (retryCount <= maxRetries) {
        // Retry the message
        const retryMessage = {
          ...message,
          retryCount,
        };

        await channel.sendToQueue(
          this.queueNames.retry,
          Buffer.from(JSON.stringify(retryMessage)),
          {
            persistent: true,
            priority: this.getPriorityValue(message.priority),
          },
        );

        channel.ack(msg);

        this.logger.warn(
          `Message ${message.id} sent to retry queue (attempt ${retryCount}/${maxRetries})`,
          {
            error: error.message,
            processingTime,
          },
        );
      } else {
        // Send to dead letter queue
        const dlqMessage = {
          ...message,
          retryCount,
          error: error.message,
          failedAt: new Date().toISOString(),
        };

        await channel.sendToQueue(this.queueNames.dlq, Buffer.from(JSON.stringify(dlqMessage)), {
          persistent: true,
        });

        channel.ack(msg);

        this.logger.error(
          `Message ${message.id} sent to dead letter queue after ${retryCount} attempts`,
          {
            error: error.message,
            processingTime,
          },
        );
      }
    } catch (retryError) {
      this.logger.error('Failed to handle message failure:', retryError);
      channel.nack(msg, false, false); // Reject and don't requeue
    }
  }

  private getPriorityValue(priority: 'urgent' | 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'urgent':
        return 15;
      case 'high':
        return 10;
      case 'normal':
        return 5;
      case 'low':
        return 1;
      default:
        return 5;
    }
  }

  /**
   * Enqueue a notification message to the priority queue
   */
  async enqueueNotification(message: PriorityMessage): Promise<void> {
    try {
      // Publish to single notification queue with priority
      const priorityValue = this.getPriorityValue(message.priority);

      // Use direct channel publish with priority
      await this.publishWithPriority(this.queueNames.main, message, priorityValue);

      this.logger.log(
        `Notification enqueued to ${this.queueNames.main} with priority ${priorityValue}`,
        {
          messageId: message.id,
          userId: message.userId,
          priority: message.priority,
          priorityValue,
        },
      );
    } catch (error) {
      this.logger.error('Failed to enqueue notification:', error);
      throw error;
    }
  }

  private async publishWithPriority(
    queueName: string,
    message: any,
    priority: number,
  ): Promise<void> {
    try {
      const connection = await this.rabbitMQService.getConnection();
      const channel = await connection.createChannel();

      const messageBuffer = Buffer.from(JSON.stringify(message));

      // ⭐ Log trước khi publish để debug
      this.logger.debug(`📤 Publishing message to queue: ${queueName}`, {
        queueName,
        priority,
        messageId: message.id,
        userId: message.userId,
      });

      // ⭐ Sử dụng sendToQueue thay vì publish với empty exchange để đảm bảo message được gửi trực tiếp vào queue
      const sent = await channel.sendToQueue(queueName, messageBuffer, {
        priority: priority,
        persistent: true,
      });

      // ⭐ Log kết quả
      if (sent) {
        this.logger.debug(`✅ Message sent successfully to ${queueName}`, {
          queueName,
          messageId: message.id,
          priority,
        });
      } else {
        this.logger.warn(`⚠️ Message may be buffered to ${queueName}`, {
          queueName,
          messageId: message.id,
        });
      }

      // ⭐ Kiểm tra queue status sau khi publish để debug
      try {
        // Đợi một chút để đảm bảo message đã được gửi vào queue
        await new Promise((resolve) => setTimeout(resolve, 100));

        const queueInfo = await channel.checkQueue(queueName);
        this.logger.debug(`📊 Queue status after publish: ${queueName}`, {
          queueName,
          messageCount: queueInfo.messageCount,
          consumerCount: queueInfo.consumerCount,
          messageId: message.id,
        });

        // ⭐ Nếu messageCount = 0 nhưng không thấy log từ callback, có thể bị consume bởi consumer cũ
        if (queueInfo.messageCount === 0 && queueInfo.consumerCount > 0) {
          this.logger.warn(
            `⚠️ Message was consumed immediately but no callback log found. Possible causes:`,
            {
              messageId: message.id,
              consumerCount: queueInfo.consumerCount,
              suggestion: 'Check RabbitMQ Management UI for old consumers',
            },
          );
        }
      } catch (error) {
        this.logger.debug(`Could not check queue status for ${queueName}:`, error.message);
      }

      await channel.close();
    } catch (error) {
      this.logger.error('Failed to publish message with priority:', error);
      throw error;
    }
  }

  async getWorkerPoolStatus(): Promise<WorkerPoolStatus> {
    try {
      const connection = await this.rabbitMQService.getConnection();
      const channel = await connection.createChannel();

      const queueLengths: Record<string, number> = {};
      const processingRates: Record<string, number> = {};

      for (const [priority, queueName] of Object.entries(this.queueNames)) {
        const queueInfo = await channel.checkQueue(queueName);
        queueLengths[queueName] = queueInfo.messageCount;

        // Get processing rate from Redis
        const rate = (await this.redisService.get(`queue:rate:${queueName}`)) || '0';
        processingRates[queueName] = parseFloat(rate);
      }

      await channel.close();

      const activeWorkers = Array.from(this.workerStatus.values()).filter(
        (status) => status === 'busy',
      ).length;
      const idleWorkers = this.maxWorkers - activeWorkers;

      return {
        totalWorkers: this.maxWorkers,
        activeWorkers,
        idleWorkers,
        queueLengths,
        processingRates,
      };
    } catch (error) {
      this.logger.error('Failed to get worker pool status:', error);
      throw error;
    }
  }

  private async restoreQueueState(): Promise<void> {
    try {
      const queueState = await this.redisService.get('queue:state:backup');
      if (queueState) {
        const state = JSON.parse(queueState);
        this.logger.log(`Restored queue state from backup`, {
          timestamp: state.timestamp,
          queues: Object.keys(state.queues),
        });
      }
    } catch (error) {
      this.logger.error('Failed to restore queue state:', error);
    }
  }

  private startPersistenceInterval(): void {
    this.persistenceInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.persistQueueState();
      }
    }, 30000); // Persist every 30 seconds
  }

  private async persistQueueState(): Promise<void> {
    try {
      const connection = await this.rabbitMQService.getConnection();
      const channel = await connection.createChannel();

      const queueState: any = {
        timestamp: new Date().toISOString(),
        queues: {},
      };

      for (const [priority, queueName] of Object.entries(this.queueNames)) {
        const queueInfo = await channel.checkQueue(queueName);
        queueState.queues[queueName] = {
          messageCount: queueInfo.messageCount,
          consumerCount: queueInfo.consumerCount,
        };
      }

      await channel.close();

      // Store in Redis with 24-hour TTL
      await this.redisService.set('queue:state:backup', JSON.stringify(queueState), 86400);

      this.logger.debug('Queue state persisted to Redis');
    } catch (error) {
      this.logger.error('Failed to persist queue state:', error);
    }
  }

  private async shutdownWorkerPool(): Promise<void> {
    try {
      for (const [workerId, channel] of this.workers) {
        await channel.close();
        this.logger.debug(`Worker ${workerId} closed`);
      }
      this.workers.clear();
      this.workerStatus.clear();
      this.logger.log('Worker pool shutdown completed');
    } catch (error) {
      this.logger.error('Failed to shutdown worker pool:', error);
    }
  }
}
