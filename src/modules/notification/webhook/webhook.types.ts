export enum WebhookEventType {
  NOTIFICATION_SENT = 'notification.sent',
  NOTIFICATION_DELIVERED = 'notification.delivered',
  NOTIFICATION_FAILED = 'notification.failed',
  NOTIFICATION_READ = 'notification.read',
  NOTIFICATION_STATUS_UPDATE = 'notification.status-update',
  NOTIFICATION_BOUNCED = 'notification.bounced',
  NOTIFICATION_CLICKED = 'notification.clicked',
  NOTIFICATION_DISMISSED = 'notification.dismissed',
  USER_REGISTERED = 'user.registered',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
}

export enum WebhookStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum DeliveryMethod {
  HTTP_POST = 'http_post',
  HTTP_PUT = 'http_put',
  HTTP_PATCH = 'http_patch',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying',
}
