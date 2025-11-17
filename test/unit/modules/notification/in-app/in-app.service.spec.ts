import { Test, TestingModule } from '@nestjs/testing';
import { InAppService } from '../../../../../src/modules/notification/in-app/in-app.service';
import { NovuClient } from '../../../../../src/infrastructure/external/novu/novu.client';

describe('InAppService', () => {
  let service: InAppService;
  let novuClient: jest.Mocked<NovuClient>;

  beforeEach(async () => {
    const mockNovuClient = {
      getInAppMessages: jest.fn(),
      markInAppMessageAsRead: jest.fn(),
      markAllInAppMessagesAsRead: jest.fn(),
      getInAppUnreadCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InAppService,
        {
          provide: NovuClient,
          useValue: mockNovuClient,
        },
      ],
    }).compile();

    service = module.get<InAppService>(InAppService);
    novuClient = module.get(NovuClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInAppNotifications', () => {
    it('should call novuClient.getInAppMessages with correct parameters', async () => {
      const userId = 'user-123';
      const options = { page: 1, limit: 20, seen: false };
      const mockResult = {
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      };

      novuClient.getInAppMessages.mockResolvedValue(mockResult);

      const result = await service.getInAppNotifications(userId, options);

      expect(novuClient.getInAppMessages).toHaveBeenCalledWith(userId, options);
      expect(result).toEqual(mockResult);
    });

    it('should use default options when not provided', async () => {
      const userId = 'user-123';
      const mockResult = {
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      };

      novuClient.getInAppMessages.mockResolvedValue(mockResult);

      await service.getInAppNotifications(userId);

      expect(novuClient.getInAppMessages).toHaveBeenCalledWith(userId, {});
    });
  });

  describe('markAsRead', () => {
    it('should call novuClient.markInAppMessageAsRead', async () => {
      const userId = 'user-123';
      const messageId = 'msg-123';
      const mockResult = { success: true };

      novuClient.markInAppMessageAsRead.mockResolvedValue(mockResult);

      const result = await service.markAsRead(userId, messageId);

      expect(novuClient.markInAppMessageAsRead).toHaveBeenCalledWith(userId, messageId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('markAllAsRead', () => {
    it('should call novuClient.markAllInAppMessagesAsRead', async () => {
      const userId = 'user-123';
      const mockResult = { success: true };

      novuClient.markAllInAppMessagesAsRead.mockResolvedValue(mockResult);

      const result = await service.markAllAsRead(userId);

      expect(novuClient.markAllInAppMessagesAsRead).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getUnreadCount', () => {
    it('should call novuClient.getInAppUnreadCount', async () => {
      const userId = 'user-123';
      const mockResult = { count: 5 };

      novuClient.getInAppUnreadCount.mockResolvedValue(mockResult);

      const result = await service.getUnreadCount(userId);

      expect(novuClient.getInAppUnreadCount).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });
});

