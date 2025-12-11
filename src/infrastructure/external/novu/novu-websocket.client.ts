import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import socketIOClient from 'socket.io-client';
import { Subject } from 'rxjs';

const io = socketIOClient;
type Socket = ReturnType<typeof io>;

export interface NovuNotificationPayload {
  id: string;
  subscriberId: string;
  title: string;
  content: string;
  payload?: Record<string, any>;
  read: boolean;
  seen: boolean;
  createdAt: string;
}

/**
 * Client for connecting to Novu WebSocket server
 */
@Injectable()
export class NovuWebSocketClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NovuWebSocketClient.name);
  private socket: Socket | null = null;
  private readonly notificationSubject = new Subject<NovuNotificationPayload>();
  private readonly connectedSubscribers = new Set<string>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private lastReconnectAttempt = 0;
  private readonly minReconnectInterval = 5000; // Minimum 5 seconds between reconnect attempts

  constructor(private readonly configService: ConfigService) {}

  /**
   * Observable for receiving notifications
   */
  get notifications$() {
    return this.notificationSubject.asObservable();
  }

  async onModuleInit() {
    const novuConfig = this.configService.get('novu');
    const mockMode = novuConfig?.wsMockMode || false;
    if (mockMode) {
      this.logger.warn('Novu WebSocket is in MOCK MODE - using mock service');
      return;
    }

    const wsEnabled = novuConfig?.wsEnabled !== false;
    if (!wsEnabled) {
      this.logger.log('Novu WebSocket is disabled');
      return;
    }

    await this.connect();
  }

  async onModuleDestroy() {
    this.disconnect();
  }

  /**
   * Connect to Novu WebSocket server
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      this.logger.log('Already connected to Novu WebSocket');
      return;
    }

    const novuConfig = this.configService.get('novu');
    const wsUrl = novuConfig?.wsUrl || 'wss://ws.cudanso.net';
    const apiKey = novuConfig?.apiKey;

    if (!apiKey) {
      this.logger.warn('NOVU_API_KEY not configured, cannot connect to WebSocket');
      return;
    }

    try {
      this.logger.log(`Connecting to Novu WebSocket: ${wsUrl}`);

      // Novu uses Socket.IO with authentication via query params or headers
      this.socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        auth: {
          apiKey: apiKey,
        },
        query: {
          apiKey: apiKey,
        },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 2000, // Start with 2s delay
        reconnectionDelayMax: 10000, // Max 10s delay
        timeout: 20000, // Connection timeout
      });

      this.setupEventHandlers();
    } catch (error) {
      this.logger.error(`Failed to connect to Novu WebSocket: ${error.message}`, error.stack);
      this.scheduleReconnect();
    }
  }

  /**
   * Setup event handlers for Socket.IO events
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.logger.log('Connected to Novu WebSocket');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.lastReconnectAttempt = 0;
    });

    this.socket.on('disconnect', (reason: string) => {
      // Only log if not already reconnecting to avoid log spam
      if (!this.isReconnecting) {
        this.logger.warn(`Disconnected from Novu WebSocket: ${reason}`);
      }
      
      if (reason === 'io server disconnect') {
        // Server disconnected - use exponential backoff instead of immediate reconnect
        // Socket.IO will handle reconnection automatically, but we add rate limiting
        const now = Date.now();
        if (now - this.lastReconnectAttempt < this.minReconnectInterval) {
          // Too soon, skip this reconnect attempt
          return;
        }
        this.lastReconnectAttempt = now;
        
        // Let Socket.IO handle reconnection with its built-in retry logic
        // Don't manually call connect() to avoid duplicate connection attempts
      }
    });

    this.socket.on('connect_error', (error: Error) => {
      this.logger.error(`Novu WebSocket connection error: ${error.message}`);
      this.scheduleReconnect();
    });

    // Novu specific events
    this.socket.on('notification_received', (data: NovuNotificationPayload) => {
      this.logger.log(`Received notification from Novu: ${data.id}`);
      this.notificationSubject.next(data);
    });

    this.socket.on('unread_count_changed', (data: { count: number; subscriberId: string }) => {
      this.logger.log(`Unread count changed for subscriber ${data.subscriberId}: ${data.count}`);
      this.notificationSubject.next({
        id: 'unread_count',
        subscriberId: data.subscriberId,
        title: '',
        content: '',
        read: false,
        seen: false,
        createdAt: new Date().toISOString(),
        payload: { count: data.count },
      } as NovuNotificationPayload);
    });

    // Generic message handler
    this.socket.on('message', (data: any) => {
      this.logger.debug('Received message from Novu:', data);
      if (data.type === 'notification') {
        this.notificationSubject.next(data.payload);
      }
    });
  }

  /**
   * Subscribe to notifications for a specific subscriber
   */
  subscribe(subscriberId: string): void {
    if (!this.socket?.connected) {
      this.logger.warn('Socket not connected, cannot subscribe');
      return;
    }

    if (this.connectedSubscribers.has(subscriberId)) {
      this.logger.debug(`Already subscribed to notifications for subscriber: ${subscriberId}`);
      return;
    }

    this.logger.log(`Subscribing to notifications for subscriber: ${subscriberId}`);
    this.socket.emit('subscribe', { subscriberId });
    this.connectedSubscribers.add(subscriberId);
  }

  /**
   * Unsubscribe from notifications for a specific subscriber
   */
  unsubscribe(subscriberId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    if (!this.connectedSubscribers.has(subscriberId)) {
      return;
    }

    this.logger.log(`Unsubscribing from notifications for subscriber: ${subscriberId}`);
    this.socket.emit('unsubscribe', { subscriberId });
    this.connectedSubscribers.delete(subscriberId);
  }

  /**
   * Disconnect from Novu WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectedSubscribers.clear();
      this.logger.log('Disconnected from Novu WebSocket');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.isReconnecting) {
      // Already reconnecting, skip
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached. WebSocket will not reconnect automatically.');
      this.isReconnecting = false;
      return;
    }

    // Rate limiting: don't reconnect too frequently
    const now = Date.now();
    if (now - this.lastReconnectAttempt < this.minReconnectInterval) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    this.lastReconnectAttempt = now;

    // Only log every 5th attempt to reduce log spam
    if (this.reconnectAttempts % 5 === 1 || this.reconnectAttempts <= 3) {
      this.logger.log(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.isReconnecting = false;
      this.connect();
    }, delay);
  }
}

