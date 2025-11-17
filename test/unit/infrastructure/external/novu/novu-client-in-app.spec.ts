import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NovuClient } from '../../../../../src/infrastructure/external/novu/novu.client';
import { CircuitBreakerService } from '../../../../../src/infrastructure/external/circuit-breaker/circuit-breaker.service';
import { NovuRetryService } from '../../../../../src/infrastructure/external/novu/novu-retry.service';

// Mock global fetch
global.fetch = jest.fn();

describe('NovuClient - In-App Notifications', () => {
  let service: NovuClient;
  let configService: jest.Mocked<ConfigService>;
  let circuitBreakerService: jest.Mocked<CircuitBreakerService>;
  let retryService: jest.Mocked<NovuRetryService>;

  const mockNovuConfig = {
    apiKey: 'test-api-key',
    apiUrl: 'https://novu-api.cudanso.net',
    applicationIdentifier: 'test-app',
    timeout: 30000,
    retries: 3,
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue(mockNovuConfig),
    };

    const mockCircuitBreakerService = {
      execute: jest.fn((name, fn) => fn()),
    };

    const mockRetryService = {
      executeWithRetry: jest.fn((fn) => fn()),
      logError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NovuClient,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: NovuRetryService,
          useValue: mockRetryService,
        },
      ],
    }).compile();

    service = module.get<NovuClient>(NovuClient);
    configService = module.get(ConfigService);
    circuitBreakerService = module.get(CircuitBreakerService);
    retryService = module.get(NovuRetryService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInAppMessages', () => {
    const subscriberId = 'user-123';

    it('should fetch in-app messages successfully', async () => {
      const mockMessages = {
        data: [
          {
            id: 'msg-1',
            title: 'Test Notification',
            content: 'Test content',
            read: false,
            seen: false,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessages,
      });

      const result = await service.getInAppMessages(subscriberId, {
        page: 1,
        limit: 20,
      });

      expect(result).toEqual(mockMessages);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/v1/subscribers/${subscriberId}/notifications/feeds`),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `ApiKey ${mockNovuConfig.apiKey}`,
          }),
        }),
      );
    });

    it('should handle pagination correctly', async () => {
      const mockMessages = {
        data: [],
        totalCount: 0,
        page: 2,
        pageSize: 10,
        hasMore: false,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessages,
      });

      const result = await service.getInAppMessages(subscriberId, {
        page: 2,
        limit: 10,
      });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2&limit=10'),
        expect.any(Object),
      );
    });

    it('should filter by seen status', async () => {
      const mockMessages = {
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessages,
      });

      await service.getInAppMessages(subscriberId, {
        seen: false,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('seen=false'),
        expect.any(Object),
      );
    });

    it('should return mock data when API key is not configured', async () => {
      configService.get.mockReturnValueOnce({
        ...mockNovuConfig,
        apiKey: null,
      });

      const result = await service.getInAppMessages(subscriberId);

      expect(result).toEqual({
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(
        service.getInAppMessages(subscriberId),
      ).rejects.toThrow('Novu API error: 500 - Internal Server Error');
    });
  });

  describe('markInAppMessageAsRead', () => {
    const subscriberId = 'user-123';
    const messageId = 'msg-123';

    it('should mark message as read successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await service.markInAppMessageAsRead(subscriberId, messageId);

      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockNovuConfig.apiUrl}/v1/subscribers/${subscriberId}/messages/${messageId}/read`,
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: `ApiKey ${mockNovuConfig.apiKey}`,
          }),
        }),
      );
    });

    it('should return mock success when API key is not configured', async () => {
      configService.get.mockReturnValueOnce({
        ...mockNovuConfig,
        apiKey: null,
      });

      const result = await service.markInAppMessageAsRead(subscriberId, messageId);

      expect(result).toEqual({ success: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Message not found',
      });

      await expect(
        service.markInAppMessageAsRead(subscriberId, messageId),
      ).rejects.toThrow('Novu API error: 404 - Message not found');
    });
  });

  describe('markAllInAppMessagesAsRead', () => {
    const subscriberId = 'user-123';

    it('should mark all messages as read successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await service.markAllInAppMessagesAsRead(subscriberId);

      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockNovuConfig.apiUrl}/v1/subscribers/${subscriberId}/messages/read`,
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: `ApiKey ${mockNovuConfig.apiKey}`,
          }),
        }),
      );
    });

    it('should return mock success when API key is not configured', async () => {
      configService.get.mockReturnValueOnce({
        ...mockNovuConfig,
        apiKey: null,
      });

      const result = await service.markAllInAppMessagesAsRead(subscriberId);

      expect(result).toEqual({ success: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getInAppUnreadCount', () => {
    const subscriberId = 'user-123';

    it('should get unread count successfully', async () => {
      const mockResponse = {
        data: { count: 5 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.getInAppUnreadCount(subscriberId);

      expect(result).toEqual({ count: 5 });
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockNovuConfig.apiUrl}/v1/subscribers/${subscriberId}/notifications/unseen`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `ApiKey ${mockNovuConfig.apiKey}`,
          }),
        }),
      );
    });

    it('should handle different response formats', async () => {
      const mockResponse = {
        count: 3,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.getInAppUnreadCount(subscriberId);

      expect(result).toEqual({ count: 3 });
    });

    it('should return zero when API key is not configured', async () => {
      configService.get.mockReturnValueOnce({
        ...mockNovuConfig,
        apiKey: null,
      });

      const result = await service.getInAppUnreadCount(subscriberId);

      expect(result).toEqual({ count: 0 });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(service.getInAppUnreadCount(subscriberId)).rejects.toThrow(
        'Novu API error: 500 - Internal Server Error',
      );
    });
  });
});

