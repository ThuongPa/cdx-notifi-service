import {
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';
import { InAppService } from './in-app.service';
import { InAppQueryDto } from './dto/in-app-query.dto';
import {
  InAppMessagesResponseDto,
  UnreadCountResponseDto,
  MarkAsReadResponseDto,
} from './dto/in-app-response.dto';

@ApiTags('In-App Notifications')
@Controller('in-app')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearerAuth')
export class InAppController {
  private readonly logger = new Logger(InAppController.name);

  constructor(private readonly inAppService: InAppService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Get in-app notifications for current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'In-app notifications retrieved successfully',
    type: ApiResponseDto<InAppMessagesResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getMessages(
    @Query() query: InAppQueryDto,
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<InAppMessagesResponseDto>> {
    this.logger.log(`Getting in-app messages for user: ${userId}`);

    const result = await this.inAppService.getInAppNotifications(userId, {
      page: query.page,
      limit: query.limit,
      seen: query.seen,
    });

    return {
      success: true,
      data: result,
      message: 'In-app notifications retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('messages/:messageId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark in-app notification as read' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message marked as read successfully',
    type: ApiResponseDto<MarkAsReadResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Message not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async markAsRead(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<MarkAsReadResponseDto>> {
    this.logger.log(`Marking message as read: ${messageId} for user: ${userId}`);

    const result = await this.inAppService.markAsRead(userId, messageId);

    return {
      success: true,
      data: result,
      message: 'Message marked as read successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('messages/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all in-app notifications as read' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All messages marked as read successfully',
    type: ApiResponseDto<MarkAsReadResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async markAllAsRead(
    @CurrentUser('id') userId: string,
  ): Promise<ApiResponseDto<MarkAsReadResponseDto>> {
    this.logger.log(`Marking all messages as read for user: ${userId}`);

    const result = await this.inAppService.markAllAsRead(userId);

    return {
      success: true,
      data: result,
      message: 'All messages marked as read successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread count for in-app notifications' })
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

    const result = await this.inAppService.getUnreadCount(userId);

    return {
      success: true,
      data: result,
      message: 'Unread count retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }
}

