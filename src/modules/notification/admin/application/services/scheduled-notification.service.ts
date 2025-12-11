import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Announcement,
  AnnouncementDocument,
} from '../../../../../infrastructure/database/schemas/announcement.schema';
import {
  UserNotification,
  UserNotificationDocument,
} from '../../../../../infrastructure/database/schemas/user-notification.schema';
import { AuthServiceClient } from '../../../../../infrastructure/external/auth-service/auth-service.client';
import { CircuitBreakerService } from '../../../../../infrastructure/external/circuit-breaker/circuit-breaker.service';

@Injectable()
export class ScheduledNotificationService {
  private readonly logger = new Logger(ScheduledNotificationService.name);

  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<AnnouncementDocument>,
    @InjectModel(UserNotification.name)
    private readonly userNotificationModel: Model<UserNotificationDocument>,
    private readonly authServiceClient: AuthServiceClient,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledNotifications(): Promise<void> {
    this.logger.log('Processing scheduled notifications');

    try {
      const now = new Date();
      const scheduledAnnouncements = await this.announcementModel.find({
        status: 'scheduled',
        scheduledAt: { $lte: now },
      });

      this.logger.log(`Found ${scheduledAnnouncements.length} scheduled announcements to process`);

      for (const announcement of scheduledAnnouncements) {
        await this.processScheduledAnnouncement(announcement);
      }
    } catch (error) {
      this.logger.error('Error processing scheduled notifications', error);
    }
  }

  private async processScheduledAnnouncement(announcement: AnnouncementDocument): Promise<void> {
    try {
      this.logger.log('Processing scheduled announcement', { announcementId: announcement._id });

      // Get target users
      const targetUsers = await this.getTargetUsers(announcement);

      // Create user notifications
      // ✅ REMOVED: Không tạo user notifications vào database nữa, Novu tự quản lý
      this.logger.log(`User notifications not created (managed by Novu) for scheduled announcement: ${announcement.id}`);

      // Update announcement status
      await this.announcementModel.findByIdAndUpdate(announcement._id, {
        status: 'active',
        updatedAt: new Date(),
      });

      this.logger.log('Scheduled announcement processed successfully', {
        announcementId: announcement._id,
        targetUserCount: targetUsers.length,
      });
    } catch (error) {
      this.logger.error('Error processing scheduled announcement', error);
      // Mark as failed
      await this.announcementModel.findByIdAndUpdate(announcement._id, {
        status: 'failed',
        errorMessage: error.message,
        updatedAt: new Date(),
      });
    }
  }

  private async getTargetUsers(announcement: AnnouncementDocument): Promise<any[]> {
    const targetUsers: any[] = [];

    try {
      // Get users by roles
      if (announcement.targetRoles.length > 0) {
        const usersByRoles = await this.circuitBreakerService.execute('auth-service', () =>
          this.authServiceClient.getUsersByRoles(announcement.targetRoles),
        );
        targetUsers.push(...(usersByRoles as any[]));
      }

      // Get specific users
      if (announcement.targetUsers.length > 0) {
        const specificUsers = await Promise.all(
          announcement.targetUsers.map((userId) =>
            this.circuitBreakerService.execute('auth-service', () =>
              this.authServiceClient.getUserById(userId),
            ),
          ),
        );
        targetUsers.push(...(specificUsers as any[]));
      }

      // Remove duplicates
      const uniqueUsers = targetUsers.filter(
        (user, index, self) => index === self.findIndex((u) => u.id === user.id),
      );

      return uniqueUsers;
    } catch (error) {
      this.logger.error('Error getting target users for scheduled announcement', error);
      throw error;
    }
  }

  private async createUserNotifications(
    announcement: AnnouncementDocument,
    targetUsers: any[],
  ): Promise<void> {
    const userNotifications = targetUsers.map((user) => ({
      userId: user.id,
      announcementId: announcement._id,
      title: announcement.title,
      body: announcement.body,
      type: 'announcement',
      channel: announcement.channels[0], // Use first channel for now
      priority: announcement.priority,
      status: 'pending',
      data: announcement.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await this.userNotificationModel.insertMany(userNotifications);

    this.logger.log('User notifications created for scheduled announcement', {
      count: userNotifications.length,
      announcementId: announcement._id,
    });
  }

  async cancelScheduledNotification(announcementId: string): Promise<void> {
    this.logger.log('Canceling scheduled notification', { announcementId });

    try {
      const announcement = await this.announcementModel.findById(announcementId);
      if (!announcement) {
        throw new Error('Announcement not found');
      }

      if (announcement.status !== 'scheduled') {
        throw new Error('Announcement is not scheduled');
      }

      await this.announcementModel.findByIdAndUpdate(announcementId, {
        status: 'cancelled',
        updatedAt: new Date(),
      });

      this.logger.log('Scheduled notification cancelled successfully', { announcementId });
    } catch (error) {
      this.logger.error('Error cancelling scheduled notification', error);
      throw error;
    }
  }
}
