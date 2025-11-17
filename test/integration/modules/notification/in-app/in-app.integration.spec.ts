import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { InAppController } from '../../../../../src/modules/notification/in-app/in-app.controller';
import { InAppService } from '../../../../../src/modules/notification/in-app/in-app.service';
import { NovuClient } from '../../../../../src/infrastructure/external/novu/novu.client';
import { CircuitBreakerModule } from '../../../../../src/infrastructure/external/circuit-breaker/circuit-breaker.module';
import { NovuRetryService } from '../../../../../src/infrastructure/external/novu/novu-retry.service';
import { NovuModule } from '../../../../../src/infrastructure/external/novu/novu.module';
import { JwtAuthGuard } from '../../../../../src/common/guards/jwt-auth.guard';
import { NovuConfig } from '../../../../../src/config/novu.config';

/**
 * Integration test for In-App Notifications
 * 
 * Requirements:
 * - Novu self-hosted instance running at NOVU_API_URL
 * - Valid NOVU_API_KEY in environment
 * - Test subscriber created in Novu
 * 
 * To run: npm run test:integration -- in-app.integration.spec.ts
 */
describe('In-App Notifications Integration', () => {
  let controller: InAppController;
  let service: InAppService;
  let novuClient: NovuClient;
  let module: TestingModule;

  const testUserId = 'test-user-integration';
  const testSubscriberId = testUserId; // In our system, userId = subscriberId

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['config/development.env', '.env'],
          load: [NovuConfig],
        }),
        NovuModule,
        CircuitBreakerModule,
      ],
      controllers: [InAppController],
      providers: [InAppService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn(() => true),
      })
      .compile();

    controller = module.get<InAppController>(InAppController);
    service = module.get<InAppService>(InAppService);
    novuClient = module.get<NovuClient>(NovuClient);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('Real API Tests (requires Novu instance)', () => {
    // Skip if NOVU_API_KEY is not configured
    const skipIfNoApiKey = !process.env.NOVU_API_KEY
      ? describe.skip
      : describe;

    skipIfNoApiKey('when Novu API is configured', () => {
      it('should get in-app messages from Novu', async () => {
        const result = await service.getInAppNotifications(testSubscriberId, {
          page: 1,
          limit: 10,
        });

        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('totalCount');
        expect(result).toHaveProperty('page');
        expect(result).toHaveProperty('pageSize');
        expect(result).toHaveProperty('hasMore');
        expect(Array.isArray(result.data)).toBe(true);
      });

      it('should get unread count from Novu', async () => {
        const result = await service.getUnreadCount(testSubscriberId);

        expect(result).toHaveProperty('count');
        expect(typeof result.count).toBe('number');
        expect(result.count).toBeGreaterThanOrEqual(0);
      });

      it('should mark message as read in Novu', async () => {
        // First, get a message to mark as read
        const messages = await service.getInAppNotifications(testSubscriberId, {
          page: 1,
          limit: 1,
        });

        if (messages.data.length > 0) {
          const messageId = messages.data[0].id;
          const result = await service.markAsRead(testSubscriberId, messageId);

          expect(result).toHaveProperty('success');
          expect(result.success).toBe(true);
        } else {
          console.log('No messages to mark as read');
        }
      });
    });
  });

  describe('Controller Tests', () => {
    const mockUserId = 'mock-user-123';

    beforeEach(() => {
      jest.spyOn(service, 'getInAppNotifications').mockResolvedValue({
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });

      jest.spyOn(service, 'getUnreadCount').mockResolvedValue({
        count: 0,
      });

      jest.spyOn(service, 'markAsRead').mockResolvedValue({
        success: true,
      });

      jest.spyOn(service, 'markAllAsRead').mockResolvedValue({
        success: true,
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should get messages via controller', async () => {
      const result = await controller.getMessages(
        { page: 1, limit: 20 },
        mockUserId,
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('data');
      expect(service.getInAppNotifications).toHaveBeenCalledWith(mockUserId, {
        page: 1,
        limit: 20,
      });
    });

    it('should get unread count via controller', async () => {
      const result = await controller.getUnreadCount(mockUserId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('count');
      expect(service.getUnreadCount).toHaveBeenCalledWith(mockUserId);
    });

    it('should mark message as read via controller', async () => {
      const messageId = 'msg-123';
      const result = await controller.markAsRead(messageId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('success');
      expect(service.markAsRead).toHaveBeenCalledWith(mockUserId, messageId);
    });

    it('should mark all as read via controller', async () => {
      const result = await controller.markAllAsRead(mockUserId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('success');
      expect(service.markAllAsRead).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('Configuration Validation', () => {
    it('should have Novu configuration loaded', () => {
      // This test verifies that the configuration is loaded correctly
      // The actual values depend on your .env file
      expect(process.env.NOVU_API_URL).toBeDefined();
      expect(process.env.NOVU_API_KEY).toBeDefined();
    });

    it('should use correct API URL format', () => {
      const apiUrl = process.env.NOVU_API_URL;
      if (apiUrl) {
        // Should be a valid URL
        expect(apiUrl).toMatch(/^https?:\/\//);
      }
    });
  });
});

