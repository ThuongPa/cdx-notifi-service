import { BaseEventDto } from '../event-handlers/base-event.handler';

/**
 * Normalize event to standardized structure
 * Only supports optimized format (no backward compatibility)
 */
export class EventNormalizer {
  /**
   * Normalize event payload to standardized structure
   * Only supports optimized format with target object
   */
  static normalizeEvent(event: BaseEventDto): {
    title: string;
    body: string;
    type: string;
    priority: string;
    channels: string[];
    targetUsers: string[];
    targetRoles: string[];
    data: Record<string, any>;
  } {
    const { payload } = event;

    if (!payload.notification) {
      throw new Error('Event payload must contain notification data');
    }

    const { notification } = payload;

    // Extract target information - only support new structure with target object
    let targetUsers: string[] = [];
    let targetRoles: string[] = [];

    if (notification.target) {
      // New structure: notification.target
      targetUsers = notification.target.users || [];
      targetRoles = notification.target.roles || [];
    } else {
      // If target is not provided, use empty arrays (will broadcast to all users)
      targetUsers = [];
      targetRoles = [];
    }

    // Use only notification.data (payload.data is removed in optimized format)
    const notificationData = notification.data || {};

    // Build data object with required fields
    const mergedData = {
      ...notificationData,
      // Ensure required fields are present
      sourceService: payload.sourceService,
      contentId: payload.contentId,
      contentType: payload.contentType || notification.type,
      redirectUrl: payload.redirectUrl,
    };

    return {
      title: notification.title,
      body: notification.body,
      type: notification.type,
      priority: notification.priority,
      channels: notification.channels,
      targetUsers,
      targetRoles,
      data: mergedData,
    };
  }

  /**
   * Validate required fields in event (optimized format only)
   */
  static validateEvent(event: BaseEventDto): void {
    if (!event.eventType) {
      throw new Error('eventType is required');
    }

    if (!event.payload) {
      throw new Error('payload is required');
    }

    if (!event.payload.notification) {
      throw new Error('payload.notification is required');
    }

    const { notification } = event.payload;

    if (!notification.title) {
      throw new Error('notification.title is required');
    }

    if (!notification.body) {
      throw new Error('notification.body is required');
    }

    if (!notification.type) {
      throw new Error('notification.type is required');
    }

    if (!notification.priority) {
      throw new Error('notification.priority is required');
    }

    if (!notification.channels || notification.channels.length === 0) {
      throw new Error('notification.channels is required and must have at least one channel');
    }

    if (!event.payload.sourceService) {
      throw new Error('payload.sourceService is required');
    }

    if (!event.payload.contentId) {
      throw new Error('payload.contentId is required');
    }

    // Validate that old format fields are not used
    if (notification.targetUsers !== undefined || notification.targetRoles !== undefined) {
      throw new Error(
        'Old format detected: targetUsers and targetRoles are deprecated. Use notification.target object instead.',
      );
    }

    // Validate that payload.data is not used (should be in notification.data only)
    if (event.payload.data !== undefined) {
      throw new Error(
        'Old format detected: payload.data is deprecated. Use notification.data instead.',
      );
    }
  }
}
