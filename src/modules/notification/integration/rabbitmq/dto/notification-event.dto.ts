import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Target object for notification targeting
 * Replaces separate targetUsers and targetRoles arrays
 */
export class NotificationTargetDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  users?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segments?: string[];
}

/**
 * Action button for in-app notifications
 */
export class NotificationActionButtonDto {
  @IsString()
  label: string;

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  style?: 'primary' | 'secondary';
}

/**
 * Optimized notification data structure
 */
export class OptimizedNotificationDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsString()
  type: string;

  @IsString()
  priority: string;

  @IsArray()
  @IsString({ each: true })
  channels: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTargetDto)
  target?: NotificationTargetDto;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationActionButtonDto)
  actionButtons?: NotificationActionButtonDto[];

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

/**
 * Optimized notification event payload
 */
export class OptimizedNotificationEventPayloadDto {
  @ValidateNested()
  @Type(() => OptimizedNotificationDto)
  notification: OptimizedNotificationDto;

  @IsString()
  sourceService: string;

  @IsOptional()
  @IsString()
  contentId?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

/**
 * Optimized notification event structure
 */
export class OptimizedNotificationEventDto {
  @IsOptional()
  @IsString()
  eventId?: string;

  @IsString()
  eventType: string;

  @IsOptional()
  @IsString()
  aggregateId?: string;

  @IsOptional()
  @IsString()
  aggregateType?: string;

  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;

  @ValidateNested()
  @Type(() => OptimizedNotificationEventPayloadDto)
  payload: OptimizedNotificationEventPayloadDto;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
