import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InAppGateway } from '../../../../../src/modules/notification/in-app/in-app.gateway';
import { WebSocketConnectionManager } from '../../../../../src/modules/notification/in-app/websocket-connection.manager';
import { InAppService } from '../../../../../src/modules/notification/in-app/in-app.service';
import { NovuWebSocketClient } from '../../../../../src/infrastructure/external/novu/novu-websocket.client';
import { NovuWebSocketMock } from '../../../../../src/infrastructure/external/novu/novu-websocket.mock';
import { Server, Socket } from 'socket.io';

describe('InAppGateway', () => {
  let gateway: InAppGateway;
  let connectionManager: WebSocketConnectionManager;
  let inAppService: InAppService;
  let mockSocket: Partial<Socket>;
  let mockServer: Partial<Server>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InAppGateway,
        {
          provide: WebSocketConnectionManager,
          useValue: {
            addConnection: jest.fn(),
            removeConnection: jest.fn(),
            getUserConnections: jest.fn(() => new Set()),
            getUserConnectionCount: jest.fn(() => 0),
            broadcastToUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'novu') {
                return {
                  wsMockMode: true,
                  wsEnabled: true,
                  wsUrl: 'wss://ws.cudanso.net',
                };
              }
              return null;
            }),
          },
        },
        {
          provide: InAppService,
          useValue: {
            getUnreadCount: jest.fn().mockResolvedValue({ count: 0 }),
            markAsRead: jest.fn().mockResolvedValue({ success: true }),
            markAllAsRead: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: NovuWebSocketClient,
          useValue: null,
        },
        {
          provide: NovuWebSocketMock,
          useValue: {
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            isConnected: jest.fn(() => true),
            notifications$: {
              subscribe: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    gateway = module.get<InAppGateway>(InAppGateway);
    connectionManager = module.get<WebSocketConnectionManager>(WebSocketConnectionManager);
    inAppService = module.get<InAppService>(InAppService);

    mockSocket = {
      id: 'test-socket-id',
      handshake: {
        time: new Date().toISOString(),
        address: '127.0.0.1',
        xdomain: false,
        secure: true,
        issued: Date.now(),
        url: '/in-app',
        query: {},
        auth: {},
        headers: {},
      } as any,
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    } as Partial<Socket>;

    mockServer = {
      emit: jest.fn(),
    };

    gateway.server = mockServer as Server;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should reject connection without token', async () => {
      await gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should accept connection with valid token', async () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIn0.test';
      mockSocket.handshake!.query = { token };

      await gateway.handleConnection(mockSocket as Socket);

      expect(connectionManager.addConnection).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('connected', expect.any(Object));
    });
  });

  describe('handleDisconnect', () => {
    it('should remove connection on disconnect', () => {
      (gateway as any).userSocketMap.set('test-socket-id', 'user123');
      gateway.handleDisconnect(mockSocket as Socket);

      expect(connectionManager.removeConnection).toHaveBeenCalled();
    });
  });

  describe('handleMarkAsRead', () => {
    it('should mark message as read', async () => {
      (gateway as any).userSocketMap.set('test-socket-id', 'user123');
      const data = { messageId: 'msg123' };

      await gateway.handleMarkAsRead(mockSocket as Socket, data);

      expect(inAppService.markAsRead).toHaveBeenCalledWith('user123', 'msg123');
      expect(mockSocket.emit).toHaveBeenCalledWith('marked:read', expect.any(Object));
    });
  });
});

