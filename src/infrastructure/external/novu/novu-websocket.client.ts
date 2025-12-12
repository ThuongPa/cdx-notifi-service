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
    let wsUrl = novuConfig?.wsUrl || process.env.NOVU_WS_URL || 'wss://ws.cudanso.net';
    const apiKey = novuConfig?.apiKey;

    // Validate URL - must be full URL, not just path
    if (!wsUrl || (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://'))) {
      this.logger.error(
        `Invalid NOVU_WS_URL: ${wsUrl}. Must be full URL starting with ws:// or wss://`,
      );
      this.logger.error('Example: wss://novu-service-ws.cudanso.net');
      this.logger.error('NOT just a path like: /socket.io/');
      return;
    }

    if (!apiKey) {
      this.logger.warn('NOVU_API_KEY not configured, cannot connect to WebSocket');
      return;
    }

    try {
      this.logger.log(`Connecting to Novu WebSocket: ${wsUrl}`);
      this.logger.debug(`Using API Key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'NOT SET'}`);

      // Novu uses Socket.IO with authentication via query params or headers
      // Try polling first if websocket fails (better for self-hosted with SSL issues)
      const forcePolling = process.env.NOVU_WS_FORCE_POLLING === 'true';
      // Socket.IO path: 
      // - If not set or empty: Socket.IO will use default '/socket.io/'
      // - If set to '/': use root path
      // - If set to '/socket.io/': use standard Socket.IO path
      const socketPath = process.env.NOVU_WS_PATH?.trim() || undefined; // undefined = use Socket.IO default

      const effectivePath = socketPath || '/socket.io/'; // Socket.IO default is '/socket.io/'
      this.logger.debug(`Socket.IO path: ${effectivePath} (configured: ${socketPath || 'default'}), Force polling: ${forcePolling}`);
      this.logger.debug(`Full connection URL will be: ${wsUrl}${effectivePath}`);

      const socketOptions: any = {
        transports: forcePolling ? ['polling'] : ['polling', 'websocket'], // Try polling first for better compatibility
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
        upgrade: true,
        rememberUpgrade: false,
        forceNew: false,
      };

      // Only set path if explicitly configured (Socket.IO default is '/socket.io/')
      if (socketPath) {
        socketOptions.path = socketPath;
      }
      // If socketPath is undefined, Socket.IO will use its default '/socket.io/'

      // Handle SSL/TLS for wss:// connections (self-hosted may have self-signed certs)
      if (wsUrl.startsWith('wss://')) {
        // Allow self-signed certificates for self-hosted Novu
        // In production, you may want to set this to true and use proper certificates
        socketOptions.rejectUnauthorized = process.env.NOVU_WS_REJECT_UNAUTHORIZED !== 'false';

        if (!socketOptions.rejectUnauthorized) {
          this.logger.warn(
            'SSL certificate validation is disabled for Novu WebSocket (self-hosted)',
          );
        }
      }

      this.socket = io(wsUrl, socketOptions);

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

    this.socket.on('connect_error', (error: any) => {
      this.logger.error(`Novu WebSocket connection error: ${error.message || 'Unknown error'}`);
      this.logger.error(`Error type: ${error.type || 'Unknown'}`);

      // Check for HTTP status codes in error response
      const statusCode = error.context?.status || error.status || error.response?.status;
      if (statusCode) {
        this.logger.error(`HTTP Status Code: ${statusCode}`);

        if (statusCode === 502) {
          this.logger.error('502 Bad Gateway - Coolify cannot reach Novu WS service backend');
        } else if (statusCode === 404) {
          this.logger.error('404 Not Found - Check if the WebSocket path is correct');
          this.logger.error(`  Current path: ${process.env.NOVU_WS_PATH || '/'}`);
          this.logger.error('  Try: NOVU_WS_PATH=/socket.io/ or NOVU_WS_PATH=/');
        } else if (statusCode === 503) {
          this.logger.error(
            '503 Service Unavailable - Novu WebSocket server is down or overloaded',
          );
        }
      }

      // Handle specific error types
      if (error.message?.includes('websocket error')) {
        this.logger.error('WebSocket upgrade failed. Try:');
        this.logger.error('  1. Set NOVU_WS_PATH=/ or NOVU_WS_PATH=/socket.io/');
        this.logger.error('  2. Set NOVU_WS_REJECT_UNAUTHORIZED=false (for self-hosted)');
        this.logger.error('  3. Set NOVU_WS_FORCE_POLLING=true (use polling only)');
        this.logger.error('  4. Check Traefik WebSocket middleware in Coolify');
      }

      if (
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('getaddrinfo') ||
        error.context?.hostname === 'undefined'
      ) {
        this.logger.error('❌ DNS lookup failed - hostname is undefined!');
        this.logger.error('NOVU_WS_URL must be full URL (e.g., wss://novu-service-ws.cudanso.net)');
        this.logger.error('NOT just a path (e.g., /socket.io/)');
        this.logger.error(`Current NOVU_WS_URL: ${process.env.NOVU_WS_URL || 'NOT SET'}`);
      }

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
      this.logger.error(
        'Max reconnection attempts reached. WebSocket will not reconnect automatically.',
      );
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
      this.logger.log(
        `Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
      );
    }

    this.reconnectTimeout = setTimeout(() => {
      this.isReconnecting = false;
      this.connect();
    }, delay);
  }
}
