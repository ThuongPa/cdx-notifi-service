import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocketConnectionManager } from './websocket-connection.manager';
import { NovuWebSocketClient } from '../../../infrastructure/external/novu/novu-websocket.client';
import { NovuWebSocketMock } from '../../../infrastructure/external/novu/novu-websocket.mock';
import { InAppService } from './in-app.service';

/**
 * WebSocket Gateway for In-App Notifications
 * Handles client connections and proxies notifications from Novu
 */
@WebSocketGateway({
  namespace: '/in-app',
  cors: {
    origin: '*', // Configure based on your CORS policy
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class InAppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(InAppGateway.name);
  private readonly userSocketMap = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly connectionManager: WebSocketConnectionManager,
    private readonly configService: ConfigService,
    private readonly inAppService: InAppService,
    @Optional() private readonly novuWsClient: NovuWebSocketClient | null,
    @Optional() private readonly novuWsMock: NovuWebSocketMock | null,
  ) {}

  afterInit(server: Server) {
    this.logger.log('InApp WebSocket Gateway initialized');
    this.setupNovuWebSocketListener();
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake query or auth
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided (socket: ${client.id})`);
        client.emit('error', { message: 'Authentication required', code: 'AUTH_REQUIRED' });
        client.disconnect();
        return;
      }

      // Validate token and get user info
      const user = await this.validateToken(token);
      if (!user) {
        this.logger.warn(`Connection rejected: Invalid token (socket: ${client.id})`);
        client.emit('error', { message: 'Invalid token', code: 'INVALID_TOKEN' });
        client.disconnect();
        return;
      }

      const userId = user.id;
      this.userSocketMap.set(client.id, userId);

      // Add connection to manager
      this.connectionManager.addConnection(userId, client);

      // Subscribe to Novu WebSocket for this user
      await this.subscribeToNovu(userId);

      // Send welcome message
      client.emit('connected', {
        userId,
        message: 'Connected to in-app notifications',
        timestamp: new Date().toISOString(),
      });

      // Send current unread count
      try {
        const unreadCount = await this.inAppService.getUnreadCount(userId);
        client.emit('unread:count', {
          count: unreadCount.count,
          subscriberId: userId,
        });
      } catch (error) {
        this.logger.error(`Failed to get unread count for user ${userId}: ${error.message}`);
      }

      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`, error.stack);
      client.emit('error', { message: 'Connection failed', code: 'CONNECTION_ERROR' });
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const userId = this.userSocketMap.get(client.id);
    if (userId) {
      this.connectionManager.removeConnection(userId, client);
      this.userSocketMap.delete(client.id);

      // Unsubscribe from Novu if no more connections for this user
      const remainingConnections = this.connectionManager.getUserConnectionCount(userId);
      if (remainingConnections === 0) {
        this.unsubscribeFromNovu(userId);
      }

      this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);
    } else {
      this.logger.log(`Client disconnected: ${client.id} (unknown user)`);
    }
  }

  /**
   * Handle mark as read message from client
   */
  @SubscribeMessage('mark:read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string },
  ) {
    const userId = this.userSocketMap.get(client.id);
    if (!userId) {
      client.emit('error', { message: 'User not authenticated', code: 'AUTH_REQUIRED' });
      return;
    }

    try {
      await this.inAppService.markAsRead(userId, data.messageId);
      client.emit('marked:read', {
        messageId: data.messageId,
        success: true,
      });

      // Update unread count
      const unreadCount = await this.inAppService.getUnreadCount(userId);
      this.connectionManager.broadcastToUser(userId, 'unread:count', {
        count: unreadCount.count,
        subscriberId: userId,
      });
    } catch (error) {
      this.logger.error(`Failed to mark as read: ${error.message}`);
      client.emit('error', { message: 'Failed to mark as read', code: 'MARK_READ_ERROR' });
    }
  }

  /**
   * Handle mark all as read message from client
   */
  @SubscribeMessage('mark:read-all')
  async handleMarkAllAsRead(@ConnectedSocket() client: Socket) {
    const userId = this.userSocketMap.get(client.id);
    if (!userId) {
      client.emit('error', { message: 'User not authenticated', code: 'AUTH_REQUIRED' });
      return;
    }

    try {
      await this.inAppService.markAllAsRead(userId);
      client.emit('marked:read-all', {
        success: true,
      });

      // Update unread count
      const unreadCount = await this.inAppService.getUnreadCount(userId);
      this.connectionManager.broadcastToUser(userId, 'unread:count', {
        count: unreadCount.count,
        subscriberId: userId,
      });
    } catch (error) {
      this.logger.error(`Failed to mark all as read: ${error.message}`);
      client.emit('error', { message: 'Failed to mark all as read', code: 'MARK_READ_ALL_ERROR' });
    }
  }

  /**
   * Handle get unread count message from client
   */
  @SubscribeMessage('get:unread-count')
  async handleGetUnreadCount(@ConnectedSocket() client: Socket) {
    const userId = this.userSocketMap.get(client.id);
    if (!userId) {
      client.emit('error', { message: 'User not authenticated', code: 'AUTH_REQUIRED' });
      return;
    }

    try {
      const unreadCount = await this.inAppService.getUnreadCount(userId);
      client.emit('unread:count', {
        count: unreadCount.count,
        subscriberId: userId,
      });
    } catch (error) {
      this.logger.error(`Failed to get unread count: ${error.message}`);
      client.emit('error', { message: 'Failed to get unread count', code: 'GET_UNREAD_ERROR' });
    }
  }

  /**
   * Extract JWT token from socket handshake
   */
  private extractToken(client: Socket): string | null {
    // Try query parameter first
    const tokenFromQuery = client.handshake.query?.token as string;
    if (tokenFromQuery) {
      return tokenFromQuery;
    }

    // Try auth object
    const tokenFromAuth = client.handshake.auth?.token as string;
    if (tokenFromAuth) {
      return tokenFromAuth;
    }

    // Try Authorization header
    const authHeader = client.handshake.headers?.authorization as string;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Validate JWT token and return user info
   */
  private async validateToken(token: string): Promise<{ id: string; [key: string]: any } | null> {
    try {
      // Simple decode (same as JwtAuthGuard)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return {
        id: payload.sub || payload.id,
        email: payload.email,
        role: payload.role,
        ...payload,
      };
    } catch (error) {
      this.logger.error(`Token validation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Setup listener for Novu WebSocket notifications
   */
  private setupNovuWebSocketListener(): void {
    const novuConfig = this.configService.get('novu');
    const mockMode = novuConfig?.wsMockMode || false;
    const wsClient = mockMode ? null : this.novuWsClient;
    const mockClient = mockMode ? this.novuWsMock : null;

    if (!wsClient && !mockClient) {
      this.logger.warn('No Novu WebSocket client available');
      return;
    }

    const notifications$ = mockClient ? mockClient.notifications$ : wsClient!.notifications$;

    // Subscribe to notifications from Novu
    notifications$.subscribe((notification) => {
      const subscriberId = notification.subscriberId;
      this.logger.log(`Received notification from Novu for subscriber: ${subscriberId}`);

      // Broadcast to all connections of this user
      this.connectionManager.broadcastToUser(subscriberId, 'notification:new', {
        id: notification.id,
        title: notification.title,
        content: notification.content,
        payload: notification.payload,
        read: notification.read,
        seen: notification.seen,
        createdAt: notification.createdAt,
      });

      // Update unread count
      this.inAppService
        .getUnreadCount(subscriberId)
        .then((result) => {
          this.connectionManager.broadcastToUser(subscriberId, 'unread:count', {
            count: result.count,
            subscriberId,
          });
        })
        .catch((error) => {
          this.logger.error(`Failed to update unread count: ${error.message}`);
        });
    });
  }

  /**
   * Subscribe to Novu WebSocket for a user
   */
  private async subscribeToNovu(userId: string): Promise<void> {
    const novuConfig = this.configService.get('novu');
    const mockMode = novuConfig?.wsMockMode || false;
    const wsClient = mockMode ? null : this.novuWsClient;
    const mockClient = mockMode ? this.novuWsMock : null;

    if (mockClient) {
      mockClient.subscribe(userId);
    } else if (wsClient && wsClient.isConnected()) {
      wsClient.subscribe(userId);
    } else {
      this.logger.warn(`Cannot subscribe to Novu for user ${userId}: WebSocket not connected`);
    }
  }

  /**
   * Unsubscribe from Novu WebSocket for a user
   */
  private unsubscribeFromNovu(userId: string): void {
    const novuConfig = this.configService.get('novu');
    const mockMode = novuConfig?.wsMockMode || false;
    const wsClient = mockMode ? null : this.novuWsClient;
    const mockClient = mockMode ? this.novuWsMock : null;

    if (mockClient) {
      mockClient.unsubscribe(userId);
    } else if (wsClient) {
      wsClient.unsubscribe(userId);
    }
  }
}

