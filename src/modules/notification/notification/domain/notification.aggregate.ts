import { createId } from '@paralleldrive/cuid2';
import { NotificationType, NotificationChannel } from '../../../../common/types/notification.types';
import { NotificationCreatedEvent } from './events/notification-created.event';
import { NotificationSentEvent } from './events/notification-sent.event';
import { NotificationFailedEvent } from './events/notification-failed.event';
import { Get } from '@nestjs/common';
import { Type } from 'class-transformer';
import { NotificationTypeVO } from './value-objects/notification-type.vo';
import { NotificationPriorityVO } from './value-objects/notification-priority.vo';
import { NotificationChannelVO } from './value-objects/notification-channel.vo';
import { NotificationStatusVO } from './value-objects/notification-status.vo';

export interface NotificationData {
  id?: string;
  title: string;
  body: string;
  type: NotificationTypeVO;
  priority: NotificationPriorityVO;
  channels: NotificationChannelVO[];
  targetRoles: string[];
  targetUsers: string[];
  data: Record<string, any>;
  status?: NotificationStatusVO;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationAggregate {
  private _id: string;
  private _title: string;
  private _body: string;
  private _type: NotificationTypeVO;
  private _priority: NotificationPriorityVO;
  private _channels: NotificationChannelVO[];
  private _targetRoles: string[];
  private _targetUsers: string[];
  private _data: Record<string, any>;
  private _status: NotificationStatusVO;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _domainEvents: any[] = [];

  constructor(data: NotificationData) {
    this._id = data.id || createId();
    this._title = data.title;
    this._body = data.body;
    this._type = data.type;
    this._priority = data.priority;
    this._channels = data.channels;
    this._targetRoles = data.targetRoles;
    this._targetUsers = data.targetUsers;
    this._data = data.data;
    this._status =
      data.status || new NotificationStatusVO(NotificationStatusVO.fromString('draft').getValue());
    this._createdAt = data.createdAt || new Date();
    this._updatedAt = data.updatedAt || new Date();

    this.validate();
  }

  private validate(): void {
    if (!this._title || this._title.trim().length === 0) {
      throw new Error('Notification title is required');
    }

    if (this._title.length > 200) {
      throw new Error('Notification title cannot exceed 200 characters');
    }

    if (!this._body || this._body.trim().length === 0) {
      throw new Error('Notification body is required');
    }

    if (this._body.length > 1000) {
      throw new Error('Notification body cannot exceed 1000 characters');
    }

    if (this._channels.length === 0) {
      throw new Error('At least one notification channel is required');
    }

    // ⭐ Allow empty targets for broadcast notifications (all users from MongoDB)
    // Validation will be handled in NotificationProcessingService.getTargetUsers()
    // if (this._targetRoles.length === 0 && this._targetUsers.length === 0) {
    //   throw new Error('At least one target (roles or users) is required');
    // }
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get body(): string {
    return this._body;
  }

  get type(): NotificationTypeVO {
    return this._type;
  }

  get priority(): NotificationPriorityVO {
    return this._priority;
  }

  get channels(): NotificationChannelVO[] {
    return [...this._channels];
  }

  get targetRoles(): string[] {
    return [...this._targetRoles];
  }

  get targetUsers(): string[] {
    return [...this._targetUsers];
  }

  get data(): Record<string, any> {
    return { ...this._data };
  }

  get status(): NotificationStatusVO {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get domainEvents(): any[] {
    return [...this._domainEvents];
  }

  /**
   * Create notification from event data
   */
  static fromEventData(eventData: {
    title: string;
    body: string;
    type: string;
    priority: string;
    channels: string[];
    targetRoles?: string[];
    targetUsers?: string[];
    data?: Record<string, any>;
  }): NotificationAggregate {
    const notification = new NotificationAggregate({
      title: eventData.title,
      body: eventData.body,
      type: NotificationTypeVO.fromString(eventData.type),
      priority: NotificationPriorityVO.fromString(eventData.priority),
      channels: NotificationChannelVO.fromStrings(eventData.channels),
      targetRoles: eventData.targetRoles || [],
      targetUsers: eventData.targetUsers || [],
      data: eventData.data || {},
    });

    // Emit domain event
    notification.addDomainEvent(
      NotificationCreatedEvent.create(
        notification.id,
        notification.title,
        notification.body,
        notification.type,
        notification.priority,
        notification.channels,
        notification.targetRoles,
        notification.targetUsers,
        notification.data,
      ),
    );

    return notification;
  }

  /**
   * Mark notification as scheduled
   */
  markAsScheduled(): void {
    if (!this._status.canBeSent()) {
      throw new Error(`Cannot schedule notification in status: ${this._status.getValue()}`);
    }

    this._status = new NotificationStatusVO(
      NotificationStatusVO.fromString('scheduled').getValue(),
    );
    this._updatedAt = new Date();
  }

  /**
   * Mark notification as sent for a specific user and channel
   */
  markAsSent(userId: string, channel: NotificationChannelVO, deliveryId?: string): void {
    this.addDomainEvent(NotificationSentEvent.create(this._id, userId, channel, deliveryId));
  }

  /**
   * Mark notification as failed for a specific user and channel
   */
  markAsFailed(
    userId: string,
    channel: NotificationChannelVO,
    errorMessage: string,
    errorCode?: string,
    retryCount: number = 0,
  ): void {
    this.addDomainEvent(
      NotificationFailedEvent.create(
        this._id,
        userId,
        channel,
        errorMessage,
        errorCode,
        retryCount,
      ),
    );
  }

  /**
   * Update notification status to sent
   */
  updateStatusToSent(): void {
    this._status = new NotificationStatusVO(NotificationStatusVO.fromString('sent').getValue());
    this._updatedAt = new Date();
  }

  /**
   * Update notification status to failed
   */
  updateStatusToFailed(): void {
    this._status = new NotificationStatusVO(NotificationStatusVO.fromString('failed').getValue());
    this._updatedAt = new Date();
  }

  /**
   * Check if notification can bypass user preferences
   */
  canBypassPreferences(): boolean {
    return this._priority.canBypassPreferences();
  }

  /**
   * Check if notification should respect only critical preferences
   */
  respectCriticalPreferencesOnly(): boolean {
    return this._priority.respectCriticalPreferencesOnly();
  }

  /**
   * Get numeric priority for queue ordering
   */
  getNumericPriority(): number {
    return this._priority.getNumericPriority();
  }

  /**
   * Add domain event
   */
  private addDomainEvent(event: any): void {
    this._domainEvents.push(event);
  }

  /**
   * Clear domain events
   */
  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  /**
   * Convert to plain object
   */
  toPlainObject(): any {
    return {
      id: this._id,
      title: this._title,
      body: this._body,
      type: this._type.getValue(),
      priority: this._priority.getValue(),
      channels: this._channels.map((ch) => ch.getValue()),
      targetRoles: this._targetRoles,
      targetUsers: this._targetUsers,
      data: this._data,
      status: this._status.getValue(),
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
