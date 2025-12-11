/**
 * WebSocket Event DTOs for In-App Notifications
 */

export interface WebSocketAuthPayload {
  token: string;
}

export interface WebSocketNotificationEvent {
  type: 'notification:new' | 'notification:read' | 'notification:unread' | 'unread:count';
  data: any;
  timestamp: string;
}

export interface NotificationNewEvent {
  id: string;
  subscriberId: string;
  title: string;
  content: string;
  payload?: Record<string, any>;
  read: boolean;
  seen: boolean;
  createdAt: string;
}

export interface NotificationReadEvent {
  messageId: string;
  subscriberId: string;
  readAt: string;
}

export interface UnreadCountEvent {
  count: number;
  subscriberId: string;
}

export interface WebSocketErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}
