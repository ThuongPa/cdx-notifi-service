import { NotificationAggregate } from '../../domain/notification.aggregate';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
} from '../../../../../common/types/notification.types';
import { NotificationFactory } from '../../domain/notification.factory';
import { AuthServiceClient } from '../../../../../infrastructure/external/auth-service/auth-service.client';
import { NovuWorkflowService } from '../../../../../infrastructure/external/novu/novu-workflow.service';
import { CircuitBreakerService } from '../../../../../infrastructure/external/circuit-breaker/circuit-breaker.service';
import { EmergencyOverridePolicy } from '../../../preferences/domain/policies/emergency-override.policy';
import { TemplateSelectionService } from '../../../templates/application/services/template-selection.service';
import { Injectable, Get, Param, Res, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Type } from 'class-transformer';
import { NotificationRepository } from '../../domain/notification.repository';
import { UserPreferencesRepository } from '../../../preferences/domain/user-preferences.repository';
import { UserPreferences } from '../../../preferences/domain/user-preferences.entity';
import { NotificationChannelVO } from '../../domain/value-objects/notification-channel.vo';
import { ConfigService } from '@nestjs/config';
import { PriorityQueueService } from '../../../priority-queue/priority-queue.service';
import { User, UserDocument } from '../../../../../infrastructure/database/schemas/user.schema';

export interface ProcessNotificationEventParams {
  title: string;
  body: string;
  type: string;
  priority: string;
  channels: string[];
  targetRoles?: string[];
  targetUsers?: string[];
  data?: Record<string, any>;
  language?: string;
  useTemplate?: boolean;
}

export interface UserTargetingResult {
  userIds: string[];
  userPreferences: Map<string, UserPreferences>;
}

@Injectable()
export class NotificationProcessingService {
  private readonly logger = new Logger(NotificationProcessingService.name);

  constructor(
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepository,
    @Inject('UserPreferencesRepository')
    private readonly userPreferencesRepository: UserPreferencesRepository,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly authServiceClient: AuthServiceClient,
    private readonly novuWorkflowService: NovuWorkflowService,
    private readonly circuitBreakerService: CircuitBreakerService,
    @Inject('TemplateSelectionService')
    private readonly templateSelectionService: TemplateSelectionService,
    private readonly configService: ConfigService,
    private readonly priorityQueueService: PriorityQueueService,
  ) {}

  /**
   * Process notification event from RabbitMQ consumer
   */
  async processNotificationEvent(params: ProcessNotificationEventParams): Promise<void> {
    try {
      this.logger.log(`Processing notification event: ${params.type} - ${params.title}`);

      // 1. Create notification aggregate
      const notification = NotificationFactory.fromEventData(params);

      // 2. Get target users
      const targetingResult = await this.getTargetUsers(notification);

      if (targetingResult.userIds.length === 0) {
        this.logger.warn(`No target users found for notification: ${notification.id}`);
        return;
      }

      // 3. Filter users based on preferences
      const filteredUsers = this.filterUsersByPreferences(
        targetingResult.userIds,
        targetingResult.userPreferences,
        notification,
      );

      if (filteredUsers.length === 0) {
        this.logger.warn(
          `No users after preference filtering for notification: ${notification.id}`,
        );
        return;
      }

      // 4. Save notification to database
      await this.notificationRepository.save(notification);

      // 5. Queue notifications for priority processing
      await this.queueNotificationsForProcessing(notification, filteredUsers);

      this.logger.log(`Successfully processed notification: ${notification.id}`);
    } catch (error) {
      this.logger.error(`Failed to process notification event: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get target users based on roles and individual targeting
   * If no targetRoles and targetUsers, get all active users from MongoDB
   */
  private async getTargetUsers(notification: NotificationAggregate): Promise<UserTargetingResult> {
    const userIds: string[] = [];
    const userPreferences = new Map<string, UserPreferences>();

    // Add individual target users
    if (notification.targetUsers.length > 0) {
      userIds.push(...notification.targetUsers);
    }

    // Get users by roles
    if (notification.targetRoles.length > 0) {
      for (const role of notification.targetRoles) {
        try {
          const roleUsers = await this.circuitBreakerService.execute('auth-service', () =>
            this.authServiceClient.getUsersByRole(role),
          );

          userIds.push(...roleUsers.map((user: any) => user.id));
        } catch (error) {
          this.logger.error(`Failed to get users for role ${role}: ${error.message}`);
          // Continue with other roles
        }
      }
    }

    // ⭐ If no targetRoles and targetUsers, get all active users from MongoDB
    if (notification.targetRoles.length === 0 && notification.targetUsers.length === 0) {
      this.logger.log(
        'No targetRoles or targetUsers specified, getting all active users from MongoDB',
      );
      try {
        const allUsers = await this.userModel.find({ isActive: true }).exec();
        const allUserIds = allUsers.map((user) => user.userId || user._id);
        userIds.push(...allUserIds);
        this.logger.log(`Found ${allUsers.length} active users from MongoDB`);
      } catch (error) {
        this.logger.error(`Failed to get all users from MongoDB: ${error.message}`, error.stack);
        // Continue without users
      }
    }

    // Remove duplicates
    const uniqueUserIds = [...new Set(userIds)];

    // Get user preferences from repository
    for (const userId of uniqueUserIds) {
      const pref = await this.userPreferencesRepository.findByUserId(userId);
      if (pref) {
        userPreferences.set(userId, pref);
      }
    }

    // Create default preferences for users who don't have any
    for (const userId of uniqueUserIds) {
      if (!userPreferences.has(userId)) {
        const defaultPrefs = await this.userPreferencesRepository.createDefault(userId);
        userPreferences.set(userId, defaultPrefs);
      }
    }

    return {
      userIds: uniqueUserIds,
      userPreferences,
    };
  }

  /**
   * Filter users based on their preferences and notification priority
   */
  private filterUsersByPreferences(
    userIds: string[],
    userPreferences: Map<string, UserPreferences>,
    notification: NotificationAggregate,
  ): string[] {
    const filteredUsers: string[] = [];

    for (const userId of userIds) {
      const preferences = userPreferences.get(userId);
      if (!preferences) continue;

      // Convert notification type and priority to enums
      const notificationType = this.mapStringToNotificationType(notification.type.getValue());
      const notificationPriority = this.mapStringToNotificationPriority(
        notification.priority.getValue(),
      );

      // Check if notification should bypass preferences (emergency override)
      if (
        EmergencyOverridePolicy.shouldOverridePreferences(
          notificationType,
          notificationPriority,
          userPreferences.get(userId)!,
        )
      ) {
        filteredUsers.push(userId);
        continue;
      }

      // Check if user should receive this notification based on preferences
      const shouldSend = notification.channels.some((channel) => {
        const channelEnum = this.mapStringToNotificationChannel(channel.getValue());
        return preferences.shouldSendNotification(
          notificationType,
          channelEnum,
          notificationPriority,
        );
      });

      if (shouldSend) {
        filteredUsers.push(userId);
      }
    }

    return filteredUsers;
  }

  /**
   * Queue notifications for priority processing
   */
  private async queueNotificationsForProcessing(
    notification: NotificationAggregate,
    userIds: string[],
  ): Promise<void> {
    try {
      this.logger.log(`Queueing ${userIds.length} notifications for priority processing`);

      for (const userId of userIds) {
        try {
          // Create notification message for priority queue
          // Support sourceService, contentId, redirectUrl from notification data
          const notificationMessage = {
            id: notification.id,
            userId: userId,
            type: notification.type.getValue(),
            title: notification.title,
            body: notification.body,
            data: {
              channels: notification.channels.map((ch) => ch.getValue()),
              data: notification.data,
              notificationId: notification.id,
              // Support redirect URL resolution
              sourceService: notification.data?.sourceService,
              contentId: notification.data?.contentId,
              contentType: notification.data?.contentType,
              redirectUrl: notification.data?.redirectUrl,
              // ⭐ Include sentBy (BẮT BUỘC - User ID người gửi notification)
              sentBy: notification.data?.sentBy,
              // ⭐ Include correlationId (để track notification request)
              correlationId: notification.data?.correlationId,
              // Legacy support
              taskId: notification.data?.taskId,
              announcementId: notification.data?.announcementId,
            },
            priority: notification.priority.getValue(),
            scheduledAt: undefined,
            retryCount: 0,
            maxRetries: 3,
          };

          // Enqueue notification using PriorityQueueService
          await this.priorityQueueService.enqueueNotification(notificationMessage);

          this.logger.log(
            `Notification queued for user: ${userId} (priority: ${notification.priority.getValue()})`,
          );
        } catch (error) {
          this.logger.error(`Failed to queue notification for user ${userId}:`, error);
        }
      }

      this.logger.log(`Notifications queued for ${userIds.length} users`);
    } catch (error) {
      this.logger.error('Error queueing notifications', error);
      throw error;
    }
  }

  /**
   * Send notifications via Novu for each channel (DEPRECATED - use priority queue instead)
   */
  private async sendNotifications(
    notification: NotificationAggregate,
    userIds: string[],
    userPreferences: Map<string, UserPreferences>,
  ): Promise<void> {
    const sendPromises: Promise<void>[] = [];

    for (const channel of notification.channels) {
      const channelUsers = this.getUsersForChannel(userIds, userPreferences, channel, notification);

      if (channelUsers.length > 0) {
        sendPromises.push(this.sendChannelNotifications(notification, channelUsers, channel));
      }
    }

    // Send all channels in parallel
    await Promise.allSettled(sendPromises);
  }

  /**
   * Get users that have the specific channel enabled
   */
  private getUsersForChannel(
    userIds: string[],
    userPreferences: Map<string, UserPreferences>,
    channel: NotificationChannelVO,
    notification: NotificationAggregate,
  ): string[] {
    return userIds.filter((userId) => {
      const preferences = userPreferences.get(userId);
      if (!preferences) return false;

      const channelEnum = this.mapStringToNotificationChannel(channel.getValue());

      // Check if this is an emergency notification that should bypass preferences
      const notificationType = this.mapStringToNotificationType(notification.type.getValue());
      const notificationPriority = this.mapStringToNotificationPriority(
        notification.priority.getValue(),
      );

      if (
        EmergencyOverridePolicy.shouldOverridePreferences(
          notificationType,
          notificationPriority,
          preferences,
        )
      ) {
        return true; // Emergency notifications always go through
      }

      return preferences.isChannelEnabled(channelEnum);
    });
  }

  /**
   * Send notifications for a specific channel
   */
  private async sendChannelNotifications(
    notification: NotificationAggregate,
    userIds: string[],
    channel: NotificationChannelVO,
  ): Promise<void> {
    try {
      this.logger.log(`Sending ${channel.getValue()} notifications to ${userIds.length} users`);

      // Get rendered content from template or use raw content
      const content = await this.getNotificationContent(notification, channel);

      const result = await this.circuitBreakerService.execute('novu-workflow', () =>
        this.novuWorkflowService.triggerWorkflow({
          workflowId: this.getWorkflowId(notification.type.getValue(), channel.getValue()),
          recipients: userIds,
          payload: {
            title: content.subject || content.body,
            body: content.body,
            data: notification.data,
            type: notification.type.getValue(),
            priority: notification.priority.getValue(),
            templateId: content.templateId,
            templateName: content.templateName,
            language: content.language,
          },
        }),
      );

      // Mark notifications as sent
      for (const userId of userIds) {
        notification.markAsSent(userId, channel, result.deliveryId);
      }

      this.logger.log(`Successfully sent ${channel.getValue()} notifications`);
    } catch (error) {
      this.logger.error(`Failed to send ${channel.getValue()} notifications: ${error.message}`);

      // Mark notifications as failed
      for (const userId of userIds) {
        notification.markAsFailed(userId, channel, error.message, error.code);
      }

      throw error;
    }
  }

  /**
   * Get notification content (from template or raw)
   */
  private async getNotificationContent(
    notification: NotificationAggregate,
    channel: NotificationChannelVO,
  ): Promise<{
    subject?: string;
    body: string;
    templateId?: string;
    templateName?: string;
    language?: string;
  }> {
    try {
      // Try to get content from template
      const notificationType = this.mapStringToNotificationType(notification.type.getValue());
      const notificationChannel = this.mapStringToNotificationChannel(channel.getValue());

      const templateContent = await this.templateSelectionService.selectAndRenderTemplate(
        {
          type: notificationType,
          channel: notificationChannel,
          language: 'vi', // Default language, could be made configurable
          fallbackLanguage: 'en',
        },
        {
          title: notification.title,
          body: notification.body,
          ...notification.data,
        },
      );

      return {
        subject: templateContent.subject,
        body: templateContent.body,
        templateId: templateContent.templateId,
        templateName: templateContent.templateName,
        language: templateContent.language,
      };
    } catch (error) {
      this.logger.warn(`Failed to render template, using raw content: ${error.message}`);

      // Fallback to raw content
      return {
        body: notification.body,
      };
    }
  }

  /**
   * Get workflow ID based on notification type and channel from .env config
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
   * Map string to NotificationChannel enum
   */
  private mapStringToNotificationChannel(channel: string): NotificationChannel {
    switch (channel.toLowerCase()) {
      case 'push':
        return NotificationChannel.PUSH;
      case 'email':
        return NotificationChannel.EMAIL;
      case 'inapp':
        return NotificationChannel.IN_APP;
      default:
        throw new Error(`Unknown notification channel: ${channel}`);
    }
  }

  /**
   * Map string to NotificationType enum
   */
  private mapStringToNotificationType(type: string): NotificationType {
    switch (type.toLowerCase()) {
      case 'payment':
        return NotificationType.PAYMENT;
      case 'booking':
        return NotificationType.BOOKING;
      case 'announcement':
        return NotificationType.ANNOUNCEMENT;
      case 'emergency':
        return NotificationType.EMERGENCY;
      default:
        throw new Error(`Unknown notification type: ${type}`);
    }
  }

  /**
   * Map string to NotificationPriority enum
   */
  private mapStringToNotificationPriority(priority: string): NotificationPriority {
    switch (priority.toLowerCase()) {
      case 'urgent':
        return NotificationPriority.URGENT;
      case 'high':
        return NotificationPriority.HIGH;
      case 'normal':
        return NotificationPriority.NORMAL;
      case 'low':
        return NotificationPriority.LOW;
      default:
        throw new Error(`Unknown notification priority: ${priority}`);
    }
  }

  /**
   * Retry failed notifications
   */
  async retryFailedNotifications(): Promise<void> {
    try {
      const failedNotifications = await this.notificationRepository.findForRetry();

      for (const notification of failedNotifications) {
        await this.processNotificationEvent({
          title: notification.title,
          body: notification.body,
          type: notification.type.getValue(),
          priority: notification.priority.getValue(),
          channels: notification.channels.map((ch) => ch.getValue()),
          targetRoles: notification.targetRoles,
          targetUsers: notification.targetUsers,
          data: notification.data,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to retry notifications: ${error.message}`, error.stack);
      throw error;
    }
  }
}
