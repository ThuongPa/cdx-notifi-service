import { NotificationAggregate } from '../../domain/notification.aggregate';
import {
  NotificationType,
  NotificationChannel,
} from '../../../../../common/types/notification.types';
import { NovuWorkflowService } from '../../../../../infrastructure/external/novu/novu-workflow.service';
import { CircuitBreakerService } from '../../../../../infrastructure/external/circuit-breaker/circuit-breaker.service';
import { NotificationMapper } from '../../infrastructure/notification.mapper';
import { Injectable, Get, Param, Res, Logger, Inject } from '@nestjs/common';
import { Document, Types } from 'mongoose';
import { NotificationChannelVO } from '../../domain/value-objects/notification-channel.vo';
import { NotificationRepositoryImpl } from '../../infrastructure/notification.repository.impl';
import { Type } from 'class-transformer';
import { ConfigService } from '@nestjs/config';

export interface SendNotificationResult {
  success: boolean;
  deliveryId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface SendNotificationParams {
  notification: NotificationAggregate;
  userIds: string[];
  channel: NotificationChannelVO;
}

@Injectable()
export class NovuNotificationService {
  private readonly logger = new Logger(NovuNotificationService.name);
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s

  constructor(
    private readonly novuWorkflowService: NovuWorkflowService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly notificationRepository: NotificationRepositoryImpl,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send notifications via Novu for a specific channel
   */
  async sendNotifications(params: SendNotificationParams): Promise<SendNotificationResult[]> {
    const { notification, userIds, channel } = params;
    const results: SendNotificationResult[] = [];

    this.logger.log(`Sending ${channel.getValue()} notifications to ${userIds.length} users`);

    try {
      // Trigger workflow via Novu
      const workflowResult = await this.circuitBreakerService.execute(
        'novu-workflow',
        () =>
          this.novuWorkflowService.triggerWorkflow({
            workflowId: this.getWorkflowId(notification.type.getValue(), channel.getValue()),
            recipients: userIds,
            payload: this.buildPayload(notification),
          }),
        {
          failureThreshold: 3,
          timeout: 30000,
          resetTimeout: 60000,
        },
      );

      // ✅ REMOVED: Không lưu user notification vào database nữa, Novu tự quản lý
      for (const userId of userIds) {
        results.push({
          success: true,
          deliveryId: workflowResult.deliveryId,
        });

        // Emit domain event
        notification.markAsSent(userId, channel, workflowResult.deliveryId);
      }

      this.logger.log(`Successfully sent ${channel.getValue()} notifications`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to send ${channel.getValue()} notifications: ${error.message}`);

      // ✅ REMOVED: Không lưu failed user notification vào database nữa
      for (const userId of userIds) {
        results.push({
          success: false,
          errorMessage: error.message,
          errorCode: error.code || 'UNKNOWN_ERROR',
        });

        // Emit domain event
        notification.markAsFailed(userId, channel, error.message, error.code);
      }

      return results;
    }
  }

  /**
   * Send notification with retry logic
   */
  async sendNotificationWithRetry(
    params: SendNotificationParams,
  ): Promise<SendNotificationResult[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const results = await this.sendNotifications(params);

        // Check if all notifications were successful
        const allSuccessful = results.every((result) => result.success);
        if (allSuccessful) {
          return results;
        }

        // If some failed, we'll retry the entire batch
        lastError = new Error('Some notifications failed');
        throw lastError;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Attempt ${attempt + 1} failed: ${error.message}`);

        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt];
          this.logger.log(`Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    // All retries failed
    this.logger.error(`All ${this.maxRetries} attempts failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('Failed to send notifications after all retries');
  }

  /**
   * Update delivery status from Novu webhook
   */
  async updateDeliveryStatus(
    deliveryId: string,
    status: 'delivered' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    try {
      this.logger.log(`Updating delivery status: ${deliveryId} -> ${status}`);

      const additionalData: any = {
        updatedAt: new Date(),
      };

      if (status === 'delivered') {
        additionalData.deliveredAt = new Date();
      } else if (status === 'failed' && errorMessage) {
        additionalData.errorMessage = errorMessage;
        additionalData.errorCode = 'NOVU_DELIVERY_FAILED';
      }

      // Update user notification status in database (for analytics)
      // Note: deliveryId is used to find the record
      await this.notificationRepository.updateUserNotificationStatus(
        deliveryId, // This will be used as deliveryId in the query
        status,
        additionalData,
      );

      this.logger.log(`Delivery status updated: ${deliveryId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update delivery status: ${error.message}`, error.stack);
      // Don't throw - webhook processing failure shouldn't block Novu
    }
  }

  /**
   * Get workflow ID based on notification type and channel
   */
  private getWorkflowId(type: string, channel: string): string {
    // Use dynamic workflow selection based on channel
    switch (channel.toLowerCase()) {
      case 'push':
        return this.configService.get('NOVU_WORKFLOW_PUSH') || 'test-push';
      case 'email':
        return this.configService.get('NOVU_WORKFLOW_EMAIL') || 'test-email';
      case 'sms':
        return this.configService.get('NOVU_WORKFLOW_SMS') || 'test-sms';
      case 'in-app':
      case 'inapp':
        return this.configService.get('NOVU_WORKFLOW_IN_APP') || 'test-in-app';
      default:
        return this.configService.get('NOVU_WORKFLOW_PUSH') || 'test-push';
    }
  }

  /**
   * Build payload for Novu workflow
   */
  private buildPayload(notification: NotificationAggregate): Record<string, any> {
    return {
      title: notification.title,
      body: notification.body,
      type: notification.type.getValue(),
      priority: notification.priority.getValue(),
      data: notification.data,
      // Add common variables that might be used in templates
      timestamp: new Date().toISOString(),
      notificationId: notification.id,
    };
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(notificationId: string): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    try {
      const [total, sent, delivered, failed, pending] = await Promise.all([
        this.notificationRepository.getUserNotificationCount(notificationId),
        this.notificationRepository.getUserNotificationCount(notificationId, 'sent'),
        this.notificationRepository.getUserNotificationCount(notificationId, 'delivered'),
        this.notificationRepository.getUserNotificationCount(notificationId, 'failed'),
        this.notificationRepository.getUserNotificationCount(notificationId, 'pending'),
      ]);

      return {
        total,
        sent,
        delivered,
        failed,
        pending,
      };
    } catch (error) {
      this.logger.error(`Failed to get notification stats: ${error.message}`, error.stack);
      throw error;
    }
  }
}
