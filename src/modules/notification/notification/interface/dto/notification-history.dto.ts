import { IsOptional, IsString, IsDateString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Query, Res } from '@nestjs/common';

export class NotificationHistoryQueryDto {
  @ApiProperty({ description: 'Page number', required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Items per page',
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by notification type',
    required: false,
    enum: ['payment', 'booking', 'announcement', 'emergency'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['payment', 'booking', 'announcement', 'emergency'])
  type?: string;

  @ApiProperty({
    description: 'Filter by notification channel',
    required: false,
    enum: ['push', 'email', 'inApp'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['push', 'email', 'inApp'])
  channel?: string;

  @ApiProperty({
    description: 'Filter by notification status',
    required: false,
    enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'sent', 'delivered', 'failed', 'read'])
  status?: string;

  @ApiProperty({ description: 'Filter by start date (ISO string)', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ description: 'Filter by end date (ISO string)', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filter by source service (e.g., "loaphuong")',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceService?: string;

  @ApiProperty({
    description: 'Filter by sender user ID (sentBy)',
    required: false,
  })
  @IsOptional()
  @IsString()
  sentBy?: string;

  @ApiProperty({
    description: 'Sort by field',
    required: false,
    default: 'createdAt',
    enum: ['createdAt', 'sentAt', 'readAt'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'sentAt', 'readAt'])
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order',
    required: false,
    default: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: string = 'desc';
}

export class NotificationHistoryItemDto {
  @ApiProperty({ description: 'Notification ID' })
  id: string;

  @ApiProperty({ description: 'Correlation ID to track notification request', required: false })
  correlationId?: string;

  @ApiProperty({ description: 'Notification title' })
  title: string;

  @ApiProperty({ description: 'Notification body' })
  body: string;

  @ApiProperty({ description: 'Notification type' })
  type: string;

  @ApiProperty({ description: 'Notification channel' })
  channel: string;

  @ApiProperty({ description: 'Notification priority' })
  priority: string;

  @ApiProperty({ description: 'Notification status' })
  status: string;

  @ApiProperty({ description: 'User ID of the notification sender (BẮT BUỘC)' })
  sentBy: string;

  @ApiProperty({ description: 'Additional notification data' })
  data: Record<string, any>;

  @ApiProperty({ description: 'When notification was sent', required: false })
  sentAt?: Date;

  @ApiProperty({ description: 'When notification was delivered', required: false })
  deliveredAt?: Date;

  @ApiProperty({ description: 'When notification was read', required: false })
  readAt?: Date;

  @ApiProperty({ description: 'When notification was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When notification was last updated' })
  updatedAt: Date;
}

export class NotificationHistoryResponseDto {
  @ApiProperty({ description: 'List of notifications', type: [NotificationHistoryItemDto] })
  notifications: NotificationHistoryItemDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
