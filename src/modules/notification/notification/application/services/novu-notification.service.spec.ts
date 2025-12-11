import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  NotificationChannel,
} from '../../../../../common/types/notification.types';
import { NovuNotificationService } from './novu-notification.service';
import { NovuWorkflowService } from '../../../../../infrastructure/external/novu/novu-workflow.service';
import { CircuitBreakerService } from '../../../../../infrastructure/external/circuit-breaker/circuit-breaker.service';
import { NotificationRepositoryImpl } from '../../infrastructure/notification.repository.impl';
import { NotificationAggregate } from '../../domain/notification.aggregate';
import { NotificationPriorityVO } from '../../domain/value-objects/notification-priority.vo';
import { NotificationChannelVO } from '../../domain/value-objects/notification-channel.vo';
import { NotificationTypeVO } from '../../domain/value-objects/notification-type.vo';

describe('NovuNotificationService', () => {
  let service: NovuNotificationService;
  let novuWorkflowService: jest.Mocked<NovuWorkflowService>;
  let circuitBreakerService: jest.Mocked<CircuitBreakerService>;
  let notificationRepository: jest.Mocked<NotificationRepositoryImpl>;

  beforeEach(async () => {
    const mockNovuWorkflowService = {
      createPushWorkflow: jest.fn(),
      createInAppWorkflow: jest.fn(),
      createEmailWorkflow: jest.fn(),
      triggerNotification: jest.fn(),
      triggerWorkflow: jest.fn(),
      setupDefaultWorkflows: jest.fn(),
      getWorkflowTemplate: jest.fn(),
      listWorkflowTemplates: jest.fn(),
      updateWorkflowTemplate: jest.fn(),
      deleteWorkflowTemplate: jest.fn(),
    };

    const mockCircuitBreakerService = {
      execute: jest.fn(),
    };

    const mockNotificationRepository = {
      saveUserNotification: jest.fn(),
      updateUserNotificationStatus: jest.fn(),
      getUserNotifications: jest.fn(),
      getUserNotificationCount: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          NOVU_WORKFLOW_PUSH: 'test-push',
          NOVU_WORKFLOW_EMAIL: 'test-email',
          NOVU_WORKFLOW_SMS: 'test-sms',
          NOVU_WORKFLOW_IN_APP: 'test-in-app',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NovuNotificationService,
        {
          provide: NovuWorkflowService,
          useValue: mockNovuWorkflowService,
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: NotificationRepositoryImpl,
          useValue: mockNotificationRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<NovuNotificationService>(NovuNotificationService);
    novuWorkflowService = module.get(NovuWorkflowService);
    circuitBreakerService = module.get(CircuitBreakerService);
    notificationRepository = module.get(NotificationRepositoryImpl);
  });

  describe('sendNotifications', () => {
    let notification: NotificationAggregate;
    let channel: NotificationChannelVO;

    beforeEach(() => {
      notification = new NotificationAggregate({
        title: 'Test Notification',
        body: 'This is a test notification',
        type: new NotificationTypeVO(NotificationType.PAYMENT),
        priority: NotificationPriorityVO.fromString('normal'),
        channels: NotificationChannelVO.fromStrings(['push']),
        targetRoles: ['user'],
        targetUsers: ['user123'],
        data: { amount: 100 },
      });

      channel = NotificationChannelVO.fromString('push');
    });

    it('should send notifications successfully', async () => {
      const userIds = ['user1', 'user2'];
      const mockResult = { deliveryId: 'delivery_123' };

      circuitBreakerService.execute.mockResolvedValue(mockResult);

      const results = await service.sendNotifications({
        notification,
        userIds,
        channel,
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle notification sending failure', async () => {
      const userIds = ['user1', 'user2'];
      const error = new Error('Failed to send notification');
      (error as any).code = 'NOVU_ERROR';

      circuitBreakerService.execute.mockRejectedValue(error);

      const result = await service.sendNotifications({
        notification,
        userIds,
        channel,
      });

      expect(result).toEqual([
        { success: false, errorCode: 'NOVU_ERROR', errorMessage: 'Failed to send notification' },
        { success: false, errorCode: 'NOVU_ERROR', errorMessage: 'Failed to send notification' },
      ]);
    });

    it('should handle partial failures', async () => {
      const userIds = ['user1'];
      const mockResult = { deliveryId: 'delivery_123' };

      circuitBreakerService.execute.mockResolvedValue(mockResult);

      const result = await service.sendNotifications({
        notification,
        userIds,
        channel,
      });

      expect(circuitBreakerService.execute).toHaveBeenCalledWith(
        'novu-workflow',
        expect.any(Function),
        {
          failureThreshold: 3,
          timeout: 30000,
          resetTimeout: 60000,
        },
      );

      expect(result).toEqual([{ success: true, deliveryId: 'delivery_123' }]);
    });
  });

  describe('sendNotificationWithRetry', () => {
    let notification: NotificationAggregate;
    let channel: NotificationChannelVO;

    beforeEach(() => {
      notification = new NotificationAggregate({
        title: 'Test Notification',
        body: 'This is a test notification',
        type: new NotificationTypeVO(NotificationType.PAYMENT),
        priority: NotificationPriorityVO.fromString('normal'),
        channels: NotificationChannelVO.fromStrings(['push']),
        targetRoles: ['user'],
        targetUsers: ['user123'],
        data: { amount: 100 },
      });

      channel = NotificationChannelVO.fromString('push');
      notificationRepository.saveUserNotification.mockResolvedValue();
    });

    it('should send notification with retry successfully', async () => {
      circuitBreakerService.execute.mockResolvedValue({
        deliveryId: 'delivery_123',
      });

      const results = await service.sendNotificationWithRetry({
        notification,
        userIds: ['user1'],
        channel,
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(circuitBreakerService.execute).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const error = new Error('Temporary failure');
      circuitBreakerService.execute
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue({ deliveryId: 'delivery_123' });

      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      const results = await service.sendNotificationWithRetry({
        notification,
        userIds: ['user1'],
        channel,
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should fail after max retries', async () => {
      const error = new Error('Persistent failure');
      circuitBreakerService.execute.mockRejectedValue(error);

      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      await expect(
        service.sendNotificationWithRetry({
          notification,
          userIds: ['user1'],
          channel,
        }),
      ).rejects.toThrow('Some notifications failed');
    });
  });

  describe('updateDeliveryStatus', () => {
    it('should update delivery status successfully', async () => {
      const deliveryId = 'delivery_123';
      const status = 'delivered';

      notificationRepository.updateUserNotificationStatus.mockResolvedValue();

      await service.updateDeliveryStatus(deliveryId, status);

      expect(notificationRepository.updateUserNotificationStatus).toHaveBeenCalledWith(
        deliveryId,
        'delivered',
        {
          status: 'delivered',
          deliveredAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      );
    });

    it('should update delivery status with error', async () => {
      const deliveryId = 'delivery_123';
      const status = 'failed';
      const errorMessage = 'Delivery failed';

      notificationRepository.updateUserNotificationStatus.mockResolvedValue();

      await service.updateDeliveryStatus(deliveryId, status, errorMessage);

      expect(notificationRepository.updateUserNotificationStatus).toHaveBeenCalledWith(
        deliveryId,
        'failed',
        {
          status: 'failed',
          errorMessage: 'Delivery failed',
          updatedAt: expect.any(Date),
        },
      );
    });
  });

  describe('getNotificationStats', () => {
    it('should get notification statistics', async () => {
      notificationRepository.getUserNotificationCount
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(2) // delivered
        .mockResolvedValueOnce(1) // failed
        .mockResolvedValueOnce(1) // pending
        .mockResolvedValueOnce(1); // read

      const stats = await service.getNotificationStats('user123');

      expect(stats).toEqual({
        total: 5,
        delivered: 1,
        failed: 1,
        pending: 1,
        sent: 2,
      });

      expect(notificationRepository.getUserNotificationCount).toHaveBeenCalledTimes(5);
    });
  });

  describe('getWorkflowId', () => {
    it('should return workflow ID for notification type and channel', () => {
      const workflowId = (service as any).getWorkflowId('payment', 'push');
      expect(workflowId).toBeDefined();
    });
  });
});
