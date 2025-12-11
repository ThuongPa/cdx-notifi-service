export class GetNotificationByCorrelationIdQuery {
  correlationId: string;
}

export interface NotificationByCorrelationIdResult {
  notification: {
    id: string;
    correlationId: string;
    title: string;
    body: string;
    type: string;
    priority: string;
    channels: string[];
    targetType: string;
    targetCount: number;
    status: string;
    sentBy: string;
    sentAt?: Date;
    createdAt: Date;
    recipients: Array<{
      userId: string;
      status: string;
      deliveredAt?: Date;
      error?: string;
    }>;
  };
}

