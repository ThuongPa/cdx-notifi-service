import { Injectable, OnModuleInit, Res } from '@nestjs/common';
import { RabbitMQConsumerService } from '../../../../infrastructure/messaging/rabbitmq-consumer.service';
import {
  FeedbackCreatedEventHandler,
  FeedbackSubmittedEventHandler,
  StatusChangedEventHandler,
  FeedbackAssignedEventHandler,
  AssignmentCreatedEventHandler,
  CommentAddedEventHandler,
  SLABreachedEventHandler,
  SLAWarningEventHandler,
  FeedbackResolvedEventHandler,
  FeedbackClosedEventHandler,
} from './event-handlers/feedback-event.handler';
import {
  UserRoleChangedEventHandler,
  UserUpdatedEventHandler,
  UserCreatedEventHandler,
  UserDeletedEventHandler,
} from './event-handlers/auth-event.handler';
import {
  LoaphuongContentPublishedEventHandler,
  LoaphuongSendNotificationEventHandler,
  LoaphuongGenericEventHandler,
} from './event-handlers/loaphuong-event.handler';

@Injectable()
export class NotificationEventConsumer implements OnModuleInit {
  constructor(
    private readonly rabbitMQConsumerService: RabbitMQConsumerService,
    // Feedback event handlers
    private readonly feedbackCreatedHandler: FeedbackCreatedEventHandler,
    private readonly feedbackSubmittedHandler: FeedbackSubmittedEventHandler,
    private readonly statusChangedHandler: StatusChangedEventHandler,
    private readonly feedbackAssignedHandler: FeedbackAssignedEventHandler,
    private readonly assignmentCreatedHandler: AssignmentCreatedEventHandler,
    private readonly commentAddedHandler: CommentAddedEventHandler,
    private readonly slaBreachedHandler: SLABreachedEventHandler,
    private readonly slaWarningHandler: SLAWarningEventHandler,
    private readonly feedbackResolvedHandler: FeedbackResolvedEventHandler,
    private readonly feedbackClosedHandler: FeedbackClosedEventHandler,
    // Auth event handlers
    private readonly userRoleChangedHandler: UserRoleChangedEventHandler,
    private readonly userUpdatedHandler: UserUpdatedEventHandler,
    private readonly userCreatedHandler: UserCreatedEventHandler,
    private readonly userDeletedHandler: UserDeletedEventHandler,
    // Loa phường event handlers
    private readonly loaphuongContentPublishedHandler: LoaphuongContentPublishedEventHandler,
    private readonly loaphuongSendNotificationHandler: LoaphuongSendNotificationEventHandler,
    private readonly loaphuongGenericHandler: LoaphuongGenericEventHandler,
  ) {}

  async onModuleInit() {
    await this.registerEventHandlers();
  }

  private async registerEventHandlers() {
    // Register feedback event handlers
    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.FeedbackCreatedEvent',
      this.feedbackCreatedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.FeedbackSubmittedEvent',
      this.feedbackSubmittedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.StatusChangedEvent',
      this.statusChangedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.FeedbackAssignedEvent',
      this.feedbackAssignedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.AssignmentCreatedEvent',
      this.assignmentCreatedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.CommentAddedEvent',
      this.commentAddedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.SLABreachedEvent',
      this.slaBreachedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.SLAWarningEvent',
      this.slaWarningHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.FeedbackResolvedEvent',
      this.feedbackResolvedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'feedback.FeedbackClosedEvent',
      this.feedbackClosedHandler,
    );

    // Register auth event handlers
    this.rabbitMQConsumerService.registerEventHandler(
      'auth.UserRoleChangedEvent',
      this.userRoleChangedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'auth.UserUpdatedEvent',
      this.userUpdatedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'auth.UserCreatedEvent',
      this.userCreatedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'auth.UserDeletedEvent',
      this.userDeletedHandler,
    );

    // Register loa phường event handlers
    this.rabbitMQConsumerService.registerEventHandler(
      'loaphuong.contentPublished',
      this.loaphuongContentPublishedHandler,
    );

    this.rabbitMQConsumerService.registerEventHandler(
      'loaphuong.sendNotification',
      this.loaphuongSendNotificationHandler,
    );

    // Register generic handler for other loaphuong events (optional)
    // You can register more specific handlers for other event types:
    // this.rabbitMQConsumerService.registerEventHandler(
    //   'loaphuong.contentUpdated',
    //   this.loaphuongGenericHandler,
    // );
    // this.rabbitMQConsumerService.registerEventHandler(
    //   'loaphuong.contentDeleted',
    //   this.loaphuongGenericHandler,
    // );
  }
}
