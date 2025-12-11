import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Announcement,
  AnnouncementDocument,
} from '../../../../../infrastructure/database/schemas/announcement.schema';
import {
  UserNotification,
  UserNotificationDocument,
} from '../../../../../infrastructure/database/schemas/user-notification.schema';
import { User, UserDocument } from '../../../../../infrastructure/database/schemas/user.schema';
import { AuthServiceClient } from '../../../../../infrastructure/external/auth-service/auth-service.client';
import { CircuitBreakerService } from '../../../../../infrastructure/external/circuit-breaker/circuit-breaker.service';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';
import { PriorityQueueService } from '../../../priority-queue/priority-queue.service';
import {
  BroadcastNotificationDto,
  BroadcastNotificationResponseDto,
} from '../../interface/dto/broadcast-notification.dto';
import {
  NotificationPriority,
  NotificationType,
} from '../../../../../common/types/notification.types';
import { NotificationStatus } from '../../../../../common/enums/notification-status.enum';
import { UserRole } from '../../../../../common/enums/user-role.enum';
import { CuidUtil } from '../../../../../common/utils/cuid.util';

@Injectable()
export class BroadcastNotificationService {
  private readonly logger = new Logger(BroadcastNotificationService.name);

  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<AnnouncementDocument>,
    @InjectModel(UserNotification.name)
    private readonly userNotificationModel: Model<UserNotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly authServiceClient: AuthServiceClient,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly novuClient: NovuClient,
    private readonly priorityQueueService: PriorityQueueService,
  ) {}

  async createBroadcast(
    broadcastDto: BroadcastNotificationDto,
  ): Promise<BroadcastNotificationResponseDto> {
    this.logger.log('Creating broadcast notification', { broadcastDto });

    try {
      // Get target users
      const targetUsers = await this.getTargetUsers(broadcastDto);

      // Create announcement record
      const announcement = new this.announcementModel({
        _id: CuidUtil.generate(), // Generate CUID for _id
        title: broadcastDto.title,
        body: broadcastDto.body,
        type: NotificationType.ANNOUNCEMENT, // Set type as ANNOUNCEMENT
        targetRoles: broadcastDto.targetRoles,
        targetUsers: broadcastDto.targetUsers || [],
        channels: broadcastDto.channels,
        priority: broadcastDto.priority,
        scheduledAt: broadcastDto.scheduledAt ? new Date(broadcastDto.scheduledAt) : null,
        status: broadcastDto.scheduledAt
          ? NotificationStatus.SCHEDULED
          : NotificationStatus.PENDING,
        data: broadcastDto.data || {},
        createdBy: 'admin', // This should come from the authenticated user
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedAnnouncement = await announcement.save();

      // Create user notifications if not scheduled
      if (!broadcastDto.scheduledAt) {
        // ✅ REMOVED: Không tạo user notifications vào database nữa, Novu tự quản lý
        this.logger.log(`User notifications not created (managed by Novu) for announcement: ${savedAnnouncement.id}`);

        // Queue notifications for processing
        await this.queueNotificationsForSending(savedAnnouncement, targetUsers);
      }

      this.logger.log('Broadcast notification created successfully', {
        announcementId: savedAnnouncement._id,
        targetUserCount: targetUsers.length,
      });

      return {
        success: true,
        broadcastId: savedAnnouncement._id.toString(),
        targetUserCount: targetUsers.length,
        message: 'Broadcast notification created successfully',
      };
    } catch (error) {
      this.logger.error('Error creating broadcast notification', error);
      throw error;
    }
  }

  private async getTargetUsers(broadcastDto: BroadcastNotificationDto): Promise<any[]> {
    try {
      let query: any = { isActive: true };

      // Get users by roles
      if (broadcastDto.targetRoles.length > 0) {
        query.roles = { $in: broadcastDto.targetRoles };
      }

      // Get specific users
      if (broadcastDto.targetUsers && broadcastDto.targetUsers.length > 0) {
        query.userId = { $in: broadcastDto.targetUsers };
      }

      // If no specific targeting, get all active users
      if (
        broadcastDto.targetRoles.length === 0 &&
        (!broadcastDto.targetUsers || broadcastDto.targetUsers.length === 0)
      ) {
        this.logger.log('No specific targeting, getting all active users');
        query = { isActive: true };
      }

      const users = await this.userModel.find(query).exec();
      this.logger.log(`Found ${users.length} target users from local database`);

      // Debug: Check user data
      if (users.length > 0) {
        this.logger.log('User data debug:', {
          userId: users[0].userId,
          _id: users[0]._id,
          hasUserId: !!users[0].userId,
        });
      }

      return users;
    } catch (error) {
      this.logger.error('Error getting target users', error);
      throw error;
    }
  }

  private async createUserNotifications(
    announcement: AnnouncementDocument,
    targetUsers: any[],
  ): Promise<void> {
    const userNotifications = targetUsers.map((user) => {
      const notificationId = CuidUtil.generate();
      return {
        id: notificationId,
        _id: notificationId,
        userId: user._id, // Use _id instead of user.userId
        notificationId: announcement._id,
        title: announcement.title,
        body: announcement.body,
        type: 'announcement',
        channel: announcement.channels[0], // Use first channel for now
        priority: announcement.priority,
        status: 'pending',
        data: announcement.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    await this.userNotificationModel.insertMany(userNotifications);

    this.logger.log('User notifications created', {
      count: userNotifications.length,
      announcementId: announcement._id,
    });
  }

  private async queueNotificationsForSending(
    announcement: AnnouncementDocument,
    targetUsers: any[],
  ): Promise<void> {
    try {
      this.logger.log(`Queueing ${targetUsers.length} notifications for processing`);

      for (const user of targetUsers) {
        try {
          // Create notification message
          const notificationMessage = {
            id: CuidUtil.generate(),
            userId: user._id, // Use _id instead of user.userId
            type: 'announcement',
            title: announcement.title,
            body: announcement.body,
            data: {
              channels: announcement.channels,
              data: announcement.data,
              announcementId: announcement._id,
            },
            priority: announcement.priority,
            scheduledAt: undefined,
            retryCount: 0,
            maxRetries: 3,
          };

          // Enqueue notification using PriorityQueueService
          await this.priorityQueueService.enqueueNotification(notificationMessage);

          this.logger.log(
            `Notification queued for user: ${user.email} (priority: ${announcement.priority})`,
          );
        } catch (error) {
          this.logger.error(`Failed to queue notification for user ${user.email}:`, error);
        }
      }

      this.logger.log(`Notifications queued for ${targetUsers.length} users`);
    } catch (error) {
      this.logger.error('Error queueing notifications', error);
      throw error;
    }
  }
}
