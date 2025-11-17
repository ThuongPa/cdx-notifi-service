import { Injectable, Logger } from '@nestjs/common';
import { BaseEventHandler, BaseEventDto } from './base-event.handler';
import { NotificationProcessingService } from '../../../notification/application/services/notification-processing.service';
import { EventNormalizer } from '../utils/event-normalizer.util';

/**
 * Handler for loa phường content published events
 * Handles event: loaphuong.contentPublished
 */
@Injectable()
export class LoaphuongContentPublishedEventHandler extends BaseEventHandler {
  protected readonly logger = new Logger(LoaphuongContentPublishedEventHandler.name);

  constructor(private readonly notificationProcessingService: NotificationProcessingService) {
    super();
  }

  getEventType(): string {
    return 'loaphuong.contentPublished';
  }

  async handle(event: BaseEventDto): Promise<void> {
    this.logEventProcessing(event, 'loa phường content published');

    try {
      // Validate event structure (optimized format only)
      EventNormalizer.validateEvent(event);

      // Normalize event to standardized structure (optimized format only)
      const normalized = EventNormalizer.normalizeEvent(event);

      const notificationParams = {
        title: normalized.title,
        body: normalized.body,
        type: normalized.type,
        priority: normalized.priority,
        channels: normalized.channels,
        targetUsers: normalized.targetUsers,
        targetRoles: normalized.targetRoles,
        data: normalized.data,
      };

      this.logger.log(`Processing notification from loa phường service (contentPublished)`, {
        eventId: event.eventId,
        title: normalized.title,
        channels: normalized.channels,
        contentId: normalized.data.contentId,
      });

      // Process notification through NotificationProcessingService
      await this.notificationProcessingService.processNotificationEvent(notificationParams);

      this.logger.log(`✅ Loa phường content published notification processed successfully`, {
        eventId: event.eventId,
        contentId: normalized.data.contentId,
      });
    } catch (error) {
      this.logger.error(`Failed to handle loa phường content published event:`, error);
      throw error;
    }
  }
}

/**
 * Generic handler for all loaphuong events
 * Can be extended for other event types like AnnouncementUpdated, AnnouncementDeleted, etc.
 */
@Injectable()
export class LoaphuongGenericEventHandler extends BaseEventHandler {
  protected readonly logger = new Logger(LoaphuongGenericEventHandler.name);

  constructor(private readonly notificationProcessingService: NotificationProcessingService) {
    super();
  }

  /**
   * This handler can handle multiple event types
   * Use pattern matching to register multiple event types
   */
  getEventType(): string {
    // This will be overridden by specific handlers
    return 'loaphuong.*';
  }

  async handle(event: BaseEventDto): Promise<void> {
    this.logEventProcessing(event, `loa phường event: ${event.eventType}`);

    try {
      // Validate event structure (optimized format only)
      EventNormalizer.validateEvent(event);

      // Normalize event to standardized structure (optimized format only)
      const normalized = EventNormalizer.normalizeEvent(event);

      const notificationParams = {
        title: normalized.title,
        body: normalized.body,
        type: normalized.type,
        priority: normalized.priority,
        channels: normalized.channels,
        targetUsers: normalized.targetUsers,
        targetRoles: normalized.targetRoles,
        data: normalized.data,
      };

      this.logger.log(`Processing generic loa phường notification`, {
        eventId: event.eventId,
        eventType: event.eventType,
        title: normalized.title,
        channels: normalized.channels,
      });

      // Process notification
      await this.notificationProcessingService.processNotificationEvent(notificationParams);

      this.logger.log(`✅ Loa phường notification processed successfully`, {
        eventId: event.eventId,
        eventType: event.eventType,
      });
    } catch (error) {
      this.logger.error(`Failed to handle loa phường event:`, error);
      throw error;
    }
  }
}
