/**
 * Ví dụ Code: Loa Phường Service gửi Notification Event
 * 
 * File này minh họa cách loa phường service (hoặc bất kỳ service nào)
 * gửi event qua RabbitMQ để trigger push + in-app notifications
 */

import { Injectable } from '@nestjs/common';
import { RabbitMQService } from '@nestjs/microservices';

@Injectable()
export class LoaphuongNotificationService {
  constructor(private readonly rabbitMQ: RabbitMQService) {}

  /**
   * Gửi thông báo khi có announcement mới
   * 
   * ⭐ Format chung cho push và in-app - chỉ cần gửi 1 event!
   */
  async sendAnnouncementNotification(announcement: {
    id: string;
    title: string;
    content: string;
    category: string;
    buildingId?: string;
    priority?: 'urgent' | 'high' | 'normal' | 'low';
  }) {
    const event = {
      eventId: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      eventType: 'loaphuong.AnnouncementCreated',
      aggregateId: announcement.id,
      aggregateType: 'Announcement',
      timestamp: new Date().toISOString(),
      correlationId: `corr-${Date.now()}`,
      payload: {
        // ⭐ Notification data - format chung cho push và in-app
        notification: {
          title: announcement.title,
          body: announcement.content,
          type: 'announcement',
          priority: announcement.priority || 'normal',
          channels: ['push', 'in-app'], // ⭐ Quan trọng: chỉ định channels
          targetRoles: ['RESIDENT'],     // Gửi cho tất cả RESIDENT
          // Hoặc targetUsers cụ thể: ['user-123', 'user-456']
        },
        // ⭐ Service metadata - để resolve redirect URL tự động
        sourceService: 'loaphuong',      // ⭐ Quan trọng: để map redirect pattern
        contentId: announcement.id,      // ⭐ Quan trọng: để tạo redirect URL
        contentType: 'announcement',
        data: {
          announcementId: announcement.id,
          category: announcement.category,
          buildingId: announcement.buildingId,
        },
      },
      metadata: {
        source: 'loaphuong-service',
        version: '1.0.0',
      },
    };

    // Publish to RabbitMQ
    await this.rabbitMQ.publish(
      'notifications.exchange',
      'loaphuong.AnnouncementCreated',
      event,
    );

    console.log(`✅ Notification event sent for announcement: ${announcement.id}`);
    console.log(`   - Channels: push + in-app`);
    console.log(`   - Redirect URL sẽ tự động: /announcements/${announcement.id}`);
  }

  /**
   * Ví dụ: Chỉ gửi push notification (không có in-app)
   */
  async sendPushOnlyNotification(announcement: {
    id: string;
    title: string;
    content: string;
  }) {
    const event = {
      eventId: `event-${Date.now()}`,
      eventType: 'loaphuong.AnnouncementCreated',
      aggregateId: announcement.id,
      aggregateType: 'Announcement',
      timestamp: new Date().toISOString(),
      payload: {
        notification: {
          title: announcement.title,
          body: announcement.content,
          type: 'announcement',
          priority: 'normal',
          channels: ['push'], // ⭐ Chỉ push, không có in-app
          targetRoles: ['RESIDENT'],
        },
        sourceService: 'loaphuong',
        contentId: announcement.id,
        contentType: 'announcement',
      },
    };

    await this.rabbitMQ.publish(
      'notifications.exchange',
      'loaphuong.AnnouncementCreated',
      event,
    );
  }

  /**
   * Ví dụ: Chỉ gửi in-app notification (không có push)
   */
  async sendInAppOnlyNotification(announcement: {
    id: string;
    title: string;
    content: string;
  }) {
    const event = {
      eventId: `event-${Date.now()}`,
      eventType: 'loaphuong.AnnouncementCreated',
      aggregateId: announcement.id,
      aggregateType: 'Announcement',
      timestamp: new Date().toISOString(),
      payload: {
        notification: {
          title: announcement.title,
          body: announcement.content,
          type: 'announcement',
          priority: 'normal',
          channels: ['in-app'], // ⭐ Chỉ in-app, không có push
          targetRoles: ['RESIDENT'],
        },
        sourceService: 'loaphuong',
        contentId: announcement.id,
        contentType: 'announcement',
      },
    };

    await this.rabbitMQ.publish(
      'notifications.exchange',
      'loaphuong.AnnouncementCreated',
      event,
    );
  }

  /**
   * Ví dụ: Custom redirect URL (override auto-resolve)
   */
  async sendWithCustomRedirect(announcement: {
    id: string;
    title: string;
    content: string;
    customPath: string;
  }) {
    const event = {
      eventId: `event-${Date.now()}`,
      eventType: 'loaphuong.AnnouncementCreated',
      aggregateId: announcement.id,
      aggregateType: 'Announcement',
      timestamp: new Date().toISOString(),
      payload: {
        notification: {
          title: announcement.title,
          body: announcement.content,
          type: 'announcement',
          priority: 'normal',
          channels: ['push', 'in-app'],
          targetRoles: ['RESIDENT'],
        },
        sourceService: 'loaphuong',
        contentId: announcement.id,
        contentType: 'announcement',
        redirectUrl: announcement.customPath, // ⭐ Custom redirect URL
        data: {
          announcementId: announcement.id,
        },
      },
    };

    await this.rabbitMQ.publish(
      'notifications.exchange',
      'loaphuong.AnnouncementCreated',
      event,
    );
  }
}

/**
 * Usage Example:
 * 
 * ```typescript
 * // Trong AnnouncementService của loa phường service
 * async createAnnouncement(data: CreateAnnouncementDto) {
 *   const announcement = await this.announcementRepository.create(data);
 *   
 *   // Gửi notification event
 *   await this.loaphuongNotificationService.sendAnnouncementNotification({
 *     id: announcement.id,
 *     title: announcement.title,
 *     content: announcement.content,
 *     category: announcement.category,
 *     priority: 'normal',
 *   });
 *   
 *   return announcement;
 * }
 * ```
 */

