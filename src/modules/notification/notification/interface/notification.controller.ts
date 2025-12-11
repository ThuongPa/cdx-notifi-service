import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { ServiceNameOrJwtGuard } from '../../../../common/guards/service-name-or-jwt.guard';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ApiResponseDto } from '../../../../common/dto/api-response.dto';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';
import { NotificationDetailDto } from './dto/notification-detail.dto';
import { GetNotificationHistoryQuery } from '../application/queries/get-notification-history.query';
import { GetNotificationQuery } from '../application/queries/get-notification.query';
import { GetNotificationByCorrelationIdQuery } from '../application/queries/get-notification-by-correlation-id.query';
import { GetUnreadCountQuery } from '../application/queries/get-unread-count.query';
import { GetUserStatisticsQuery } from '../application/queries/get-user-statistics.query';
import { MarkAsReadCommand } from '../application/commands/mark-as-read.command';
import { MarkAllAsReadCommand } from '../application/commands/mark-all-read.command';
import { BulkMarkReadCommand } from '../application/commands/bulk-mark-read.command';
import { BulkArchiveCommand } from '../application/commands/bulk-archive.command';
import { BulkIdsDto } from './dto/bulk-ids.dto';
import { NovuNotificationService } from '../application/services/novu-notification.service';
import { NotificationRepositoryImpl } from '../infrastructure/notification.repository.impl';
import {
  HttpStatus,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Logger,
  Patch,
  HttpCode,
  Headers,
  Inject,
} from '@nestjs/common';
import {
  NotificationHistoryQueryDto,
  NotificationHistoryResponseDto,
} from './dto/notification-history.dto';
import {
  MarkAsReadResponseDto,
  MarkAllAsReadResponseDto,
  UnreadCountResponseDto,
} from './dto/mark-as-read.dto';
import { Response } from 'express';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly novuNotificationService: NovuNotificationService,
    @Inject('NotificationRepository')
    private readonly notificationRepository: NotificationRepositoryImpl,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get notification history with pagination and filters (User endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification history retrieved successfully',
    type: PaginatedResponseDto<NotificationHistoryResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getNotificationHistory(
    @Query() query: NotificationHistoryQueryDto,
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<NotificationHistoryResponseDto>> {
    this.logger.log(`Getting notification history for user: ${userId}`);

    const queryCommand = new GetNotificationHistoryQuery();
    Object.assign(queryCommand, {
      userId,
      page: query.page,
      limit: query.limit,
      type: query.type,
      channel: query.channel,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const result = await this.queryBus.execute(queryCommand);

    return {
      success: true,
      data: result,
      message: 'Notification history retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('history')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({
    summary: 'Get notification history with pagination and filters (Service-to-Service or User)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification history retrieved successfully',
    type: PaginatedResponseDto<NotificationHistoryResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Missing X-Service-Name header or invalid JWT token',
  })
  async getNotificationHistoryForService(
    @Query() query: NotificationHistoryQueryDto,
    @CurrentUser('id') userId?: string,
    @Headers('x-service-name') serviceName?: string,
  ): Promise<ApiResponseDto<NotificationHistoryResponseDto>> {
    const logContext = serviceName || `user: ${userId}`;
    this.logger.log(`Getting notification history for ${logContext}`);

    const queryCommand = new GetNotificationHistoryQuery();
    Object.assign(queryCommand, {
      userId: userId, // Optional - if sourceService or sentBy provided, query all
      page: query.page,
      limit: query.limit,
      type: query.type,
      channel: query.channel,
      status: query.status,
      sourceService: query.sourceService, // ⭐ Filter by source service
      sentBy: query.sentBy, // ⭐ Filter by sender user ID
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const result = await this.queryBus.execute(queryCommand);

    return {
      success: true,
      data: result,
      message: 'Notification history retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('history/correlation/:correlationId')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Get notification by correlationId (Service-to-Service or User)' })
  @ApiParam({ name: 'correlationId', description: 'Correlation ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Missing X-Service-Name header or invalid JWT token',
  })
  async getNotificationByCorrelationId(
    @Param('correlationId') correlationId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Getting notification by correlationId: ${correlationId}`);

    const queryCommand = new GetNotificationByCorrelationIdQuery();
    queryCommand.correlationId = correlationId;

    const result = await this.queryBus.execute(queryCommand);

    return {
      success: true,
      data: result,
      message: 'Notification retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('history/:notificationId')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Get notification by notificationId (Service-to-Service or User)' })
  @ApiParam({ name: 'notificationId', description: 'Notification ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Missing X-Service-Name header or invalid JWT token',
  })
  async getNotificationByIdForService(
    @Param('notificationId') notificationId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Getting notification by ID: ${notificationId}`);

    try {
      // Query from MongoDB directly
      const userNotifications = await this.notificationRepository.getNotificationsByNotificationId(
        notificationId,
      );

      if (!userNotifications || userNotifications.length === 0) {
        return {
          success: false,
          data: null,
          message: 'Notification not found',
          timestamp: new Date().toISOString(),
        };
      }

      // Group by notificationId and build response
      const firstNotification = userNotifications[0];
      const recipients = userNotifications.map((un) => ({
        userId: un.userId,
        status: un.status,
        deliveredAt: un.deliveredAt,
        error: un.errorMessage,
      }));

      // Get unique channels
      const channels = [...new Set(userNotifications.map((un) => un.channel))];

      const result = {
        notification: {
          id: firstNotification.notificationId || notificationId,
          correlationId: firstNotification.data?.correlationId,
          title: firstNotification.title,
          body: firstNotification.body,
          type: firstNotification.type,
          priority: firstNotification.priority,
          channels,
          targetType: 'users',
          targetCount: recipients.length,
          status: firstNotification.status,
          sentBy: firstNotification.data?.sentBy || firstNotification.userId,
          sentAt: firstNotification.sentAt,
          createdAt: firstNotification.createdAt,
          recipients,
        },
      };

      return {
        success: true,
        data: result,
        message: 'Notification retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get notification by ID: ${error.message}`, error.stack);
      return {
        success: false,
        data: null,
        message: 'Failed to retrieve notification',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get notification detail by ID' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification detail retrieved successfully',
    type: ApiResponseDto<NotificationDetailDto>,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - User can only view their own notifications',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getNotificationDetail(
    @Param('id') notificationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<NotificationDetailDto>> {
    this.logger.log(`Getting notification detail: ${notificationId} for user: ${userId}`);

    const queryCommand = new GetNotificationQuery();
    queryCommand.notificationId = notificationId;
    queryCommand.userId = userId;

    const result = await this.queryBus.execute(queryCommand);

    return {
      success: true,
      data: result,
      message: 'Notification detail retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification marked as read successfully',
    type: ApiResponseDto<MarkAsReadResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - User can only mark their own notifications as read',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async markAsRead(
    @Param('id') notificationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<MarkAsReadResponseDto>> {
    this.logger.log(`Marking notification as read: ${notificationId} for user: ${userId}`);

    const command = new MarkAsReadCommand();
    command.notificationId = notificationId;
    command.userId = userId;

    const result = await this.commandBus.execute(command);

    return {
      success: true,
      data: result,
      message: 'Notification marked as read successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All notifications marked as read successfully',
    type: ApiResponseDto<MarkAllAsReadResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async markAllAsRead(
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<MarkAllAsReadResponseDto>> {
    this.logger.log(`Marking all notifications as read for user: ${userId}`);

    const command = new MarkAllAsReadCommand();
    command.userId = userId;

    const result = await this.commandBus.execute(command);

    return {
      success: true,
      data: result,
      message: `${result.updatedCount} notifications marked as read successfully`,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unread count retrieved successfully',
    type: ApiResponseDto<UnreadCountResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getUnreadCount(
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<UnreadCountResponseDto>> {
    this.logger.log(`Getting unread count for user: ${userId}`);

    const queryCommand = new GetUnreadCountQuery();
    queryCommand.userId = userId;

    const result = await this.queryBus.execute(queryCommand);

    return {
      success: true,
      data: result,
      message: 'Unread count retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('me/statistics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get detailed user notification statistics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Statistics retrieved successfully' })
  async getMyStatistics(
    @CurrentUser('id') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ApiResponseDto<any>> {
    const query = new GetUserStatisticsQuery(
      userId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    const result = await this.queryBus.execute(query);

    return {
      success: true,
      data: result,
      message: 'Statistics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('bulk/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk mark notifications as read' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bulk marked as read successfully' })
  async bulkMarkAsRead(
    @Body() body: BulkIdsDto,
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<{ updatedCount: number; readAt: string }>> {
    this.logger.log(`Bulk mark as read for user ${userId}`);

    const command = new BulkMarkReadCommand(userId, body.ids);
    const result = await this.commandBus.execute(command);

    return {
      success: true,
      data: { updatedCount: result.updatedCount, readAt: result.readAt.toISOString() },
      message: `${result.updatedCount} notifications marked as read`,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('bulk/archive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk archive notifications' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bulk archived successfully' })
  async bulkArchive(
    @Body() body: BulkIdsDto,
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<{ updatedCount: number }>> {
    this.logger.log(`Bulk archive for user ${userId}`);

    const command = new BulkArchiveCommand(userId, body.ids);
    const result = await this.commandBus.execute(command);

    return {
      success: true,
      data: { updatedCount: result.updatedCount },
      message: `${result.updatedCount} notifications archived`,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('webhooks/novu')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive webhook from Novu for delivery status updates' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook processed successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid webhook payload' })
  // ⚠️ NOTE: This endpoint should be publicly accessible (no auth) for Novu to call
  // Consider adding IP whitelist or webhook signature verification
  async handleNovuWebhook(
    @Body() payload: {
      event: string;
      data: {
        deliveryId?: string;
        transactionId?: string;
        notificationId?: string;
        subscriberId?: string;
        status?: 'delivered' | 'failed';
        error?: {
          message?: string;
          code?: string;
        };
      };
    },
    @Res() res: Response,
    @Headers('x-novu-signature') signature?: string,
  ): Promise<void> {
    try {
      this.logger.log('Received webhook from Novu', { event: payload.event, data: payload.data });

      // Validate webhook payload
      if (!payload.event || !payload.data) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Invalid webhook payload',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Extract delivery status from webhook
      const { event, data } = payload;
      const deliveryId = data.deliveryId || data.transactionId;

      if (!deliveryId) {
        this.logger.warn('Webhook missing deliveryId/transactionId', payload);
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Missing deliveryId or transactionId',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Handle different webhook events
      if (event === 'notification.delivered' || data.status === 'delivered') {
        await this.novuNotificationService.updateDeliveryStatus(deliveryId, 'delivered');
      } else if (event === 'notification.failed' || data.status === 'failed') {
        const errorMessage = data.error?.message || 'Notification delivery failed';
        await this.novuNotificationService.updateDeliveryStatus(
          deliveryId,
          'failed',
          errorMessage,
        );
      } else {
        this.logger.debug(`Unhandled webhook event: ${event}`, payload);
      }

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook processed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to process Novu webhook: ${error.message}`, error.stack);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to process webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
