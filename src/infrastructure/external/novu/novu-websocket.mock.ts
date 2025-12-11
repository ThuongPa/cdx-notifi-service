import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { NovuNotificationPayload } from './novu-websocket.client';

/**
 * Mock Novu WebSocket service for development and testing
 */
@Injectable()
export class NovuWebSocketMock implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NovuWebSocketMock.name);
  private readonly notificationSubject = new Subject<NovuNotificationPayload>();
  private mockInterval: NodeJS.Timeout | null = null;
  private readonly connectedSubscribers = new Set<string>();

  /**
   * Observable for receiving notifications
   */
  get notifications$() {
    return this.notificationSubject.asObservable();
  }

  async onModuleInit() {
    this.logger.log('Novu WebSocket Mock service initialized');
    this.startMockNotifications();
  }

  async onModuleDestroy() {
    this.stopMockNotifications();
  }

  /**
   * Subscribe to notifications for a specific subscriber
   */
  subscribe(subscriberId: string): void {
    this.connectedSubscribers.add(subscriberId);
    this.logger.log(`Mock: Subscribed to notifications for subscriber: ${subscriberId}`);
  }

  /**
   * Unsubscribe from notifications for a specific subscriber
   */
  unsubscribe(subscriberId: string): void {
    this.connectedSubscribers.delete(subscriberId);
    this.logger.log(`Mock: Unsubscribed from notifications for subscriber: ${subscriberId}`);
  }

  /**
   * Check if connected (always true for mock)
   */
  isConnected(): boolean {
    return true;
  }

  /**
   * Start emitting mock notifications
   */
  private startMockNotifications(): void {
    // Emit a mock notification every 30 seconds for testing
    this.mockInterval = setInterval(() => {
      if (this.connectedSubscribers.size === 0) {
        return;
      }

      // Emit to a random subscriber for testing
      const subscribers = Array.from(this.connectedSubscribers);
      const randomSubscriber = subscribers[Math.floor(Math.random() * subscribers.length)];

      const mockNotification: NovuNotificationPayload = {
        id: `mock_${Date.now()}`,
        subscriberId: randomSubscriber,
        title: 'Mock Notification',
        content: `This is a mock notification sent at ${new Date().toISOString()}`,
        read: false,
        seen: false,
        createdAt: new Date().toISOString(),
        payload: {
          type: 'test',
          mock: true,
        },
      };

      this.logger.log(`Mock: Emitting notification to subscriber ${randomSubscriber}`);
      this.notificationSubject.next(mockNotification);
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop emitting mock notifications
   */
  private stopMockNotifications(): void {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  /**
   * Manually emit a mock notification (for testing)
   */
  emitMockNotification(subscriberId: string, notification?: Partial<NovuNotificationPayload>): void {
    const mockNotification: NovuNotificationPayload = {
      id: `mock_${Date.now()}`,
      subscriberId,
      title: notification?.title || 'Mock Notification',
      content: notification?.content || 'This is a manually triggered mock notification',
      read: notification?.read || false,
      seen: notification?.seen || false,
      createdAt: new Date().toISOString(),
      payload: notification?.payload || { type: 'test', mock: true },
      ...notification,
    };

    this.logger.log(`Mock: Manually emitting notification to subscriber ${subscriberId}`);
    this.notificationSubject.next(mockNotification);
  }
}

