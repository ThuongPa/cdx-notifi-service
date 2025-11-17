import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { NovuRetryService } from './novu-retry.service';

@Injectable()
export class NovuClient {
  private readonly logger = new Logger(NovuClient.name);

  constructor(
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly retryService: NovuRetryService,
    private readonly configService: ConfigService,
  ) {}

  getWorkflowId(channels: string[]): string {
    // Get the first channel to determine workflow
    const primaryChannel = channels[0] || 'push';

    switch (primaryChannel) {
      case 'push':
        return this.configService.get('NOVU_WORKFLOW_PUSH') || 'test-push';
      case 'email':
        return this.configService.get('NOVU_WORKFLOW_EMAIL') || 'test-email';
      case 'sms':
        return this.configService.get('NOVU_WORKFLOW_SMS') || 'test-sms';
      case 'in-app':
        return this.configService.get('NOVU_WORKFLOW_IN_APP') || 'test-in-app';
      default:
        return this.configService.get('NOVU_WORKFLOW_PUSH') || 'test-push';
    }
  }

  async createSubscriber(data: any): Promise<void> {
    this.logger.log(`Creating subscriber: ${data.subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Real Novu API implementation
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig.apiKey;
          const apiUrl = novuConfig.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            return Promise.resolve();
          }

          try {
            const response = await fetch(`${apiUrl}/v1/subscribers`, {
              method: 'POST',
              headers: {
                Authorization: `ApiKey ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                subscriberId: data.subscriberId,
                email: data.email,
                phone: data.phone,
                firstName: data.firstName,
                lastName: data.lastName,
                data: data.data,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            this.logger.log(`Subscriber created successfully in Novu: ${data.subscriberId}`);
            return Promise.resolve();
          } catch (error) {
            this.logger.error(`Failed to create subscriber in Novu: ${error.message}`);
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async updateSubscriber(subscriberId: string, data: any): Promise<void> {
    this.logger.log(`Updating subscriber: ${subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Real Novu API implementation
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig.apiKey;
          const apiUrl = novuConfig.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            return Promise.resolve();
          }

          try {
            const response = await fetch(`${apiUrl}/v1/subscribers/${subscriberId}`, {
              method: 'PUT',
              headers: {
                Authorization: `ApiKey ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: data.email,
                phone: data.phone,
                firstName: data.firstName,
                lastName: data.lastName,
                data: data.data,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            this.logger.log(`Subscriber updated successfully in Novu: ${subscriberId}`);
            return Promise.resolve();
          } catch (error) {
            this.logger.error(`Failed to update subscriber in Novu: ${error.message}`);
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async getSubscriber(subscriberId: string): Promise<any> {
    this.logger.log(`Getting subscriber: ${subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Mock implementation - in real app, this would call Novu API
          // For testing, we'll return null to simulate subscriber not found
          return Promise.resolve(null);
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async deleteSubscriber(subscriberId: string): Promise<void> {
    this.logger.log(`Deleting subscriber: ${subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Mock implementation - in real app, this would call Novu API
          return Promise.resolve();
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async createTemplate(data: any): Promise<string> {
    this.logger.log(`Creating template: ${data.name}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Mock implementation - in real app, this would call Novu API
          return Promise.resolve('mock-template-id');
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async updateTemplate(templateId: string, data: any): Promise<void> {
    this.logger.log(`Updating template: ${templateId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Mock implementation - in real app, this would call Novu API
          return Promise.resolve();
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async deleteTemplate(templateId: string): Promise<void> {
    this.logger.log(`Deleting template: ${templateId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Mock implementation - in real app, this would call Novu API
          return Promise.resolve();
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async getTemplate(templateId: string): Promise<any> {
    this.logger.log(`Getting template: ${templateId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Mock implementation - in real app, this would call Novu API
          return Promise.resolve({ id: templateId, name: 'Mock Template' });
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async listTemplates(): Promise<any[]> {
    this.logger.log(`Listing templates`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Mock implementation - in real app, this would call Novu API
          return Promise.resolve([]);
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async sendNotification(data: any): Promise<void> {
    this.logger.log(`Sending notification: ${data.to}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Check if NOVU_API_KEY is configured
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            this.logger.log('Mock notification sent:', {
              to: data.to,
              title: data.title,
              body: data.body,
            });
            return Promise.resolve();
          }

          // Real Novu API implementation
          try {
            const response = await fetch(`${apiUrl}/v1/notifications`, {
              method: 'POST',
              headers: {
                Authorization: `ApiKey ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: data.to,
                title: data.title,
                body: data.body,
                channels: data.channels || ['push'],
                data: data.data || {},
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            this.logger.log(`Notification sent successfully in Novu: ${data.to}`, {
              notificationId: result.data?.id || result.id,
            });

            return Promise.resolve();
          } catch (error) {
            this.logger.error(`Failed to send notification in Novu: ${error.message}`);
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  async triggerWorkflow(data: {
    workflowId: string;
    recipients: string[];
    payload: Record<string, any>;
  }): Promise<{ deliveryId: string }> {
    this.logger.log(
      `Triggering workflow: ${data.workflowId} for ${data.recipients.length} recipients`,
    );
    this.logger.log('Workflow payload:', JSON.stringify(data.payload, null, 2));

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          // Check if NOVU_API_KEY is configured
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            this.logger.log('Mock workflow trigger:', {
              workflowId: data.workflowId,
              recipients: data.recipients,
              payload: data.payload,
              deliveryId: `mock_delivery_${Date.now()}`,
            });
            return Promise.resolve({ deliveryId: `mock_delivery_${Date.now()}` });
          }

          // Real Novu API implementation

          try {
            const response = await fetch(`${apiUrl}/v1/events/trigger`, {
              method: 'POST',
              headers: {
                Authorization: `ApiKey ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: data.workflowId,
                to: data.recipients[0], // Novu expects single recipient
                payload: data.payload,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            this.logger.log(`Workflow triggered successfully in Novu: ${data.workflowId}`, {
              deliveryId: result.data?.transactionId || result.transactionId,
              recipient: data.recipients[0],
            });

            return Promise.resolve({
              deliveryId:
                result.data?.transactionId || result.transactionId || `delivery_${Date.now()}`,
            });
          } catch (error) {
            this.logger.error(`Failed to trigger workflow in Novu: ${error.message}`);
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  /**
   * Get in-app notifications (messages) for a subscriber
   * @param subscriberId - The subscriber ID (usually userId)
   * @param options - Query options (page, limit, seen)
   */
  async getInAppMessages(
    subscriberId: string,
    options: {
      page?: number;
      limit?: number;
      seen?: boolean;
    } = {},
  ): Promise<{
    data: any[];
    totalCount: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    this.logger.log(`Getting in-app messages for subscriber: ${subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            return Promise.resolve({
              data: [],
              totalCount: 0,
              page: options.page || 1,
              pageSize: options.limit || 20,
              hasMore: false,
            });
          }

          try {
            const page = options.page || 1;
            const limit = options.limit || 20;
            const seen = options.seen !== undefined ? options.seen : undefined;

            // Build query parameters
            const queryParams = new URLSearchParams({
              page: page.toString(),
              limit: limit.toString(),
            });
            if (seen !== undefined) {
              queryParams.append('seen', seen.toString());
            }

            const response = await fetch(
              `${apiUrl}/v1/subscribers/${subscriberId}/notifications/feeds?${queryParams.toString()}`,
              {
                method: 'GET',
                headers: {
                  Authorization: `ApiKey ${apiKey}`,
                  'Content-Type': 'application/json',
                },
              },
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            this.logger.log(`Retrieved in-app messages for subscriber: ${subscriberId}`, {
              count: result.data?.length || 0,
            });

            return {
              data: result.data || [],
              totalCount: result.totalCount || result.data?.length || 0,
              page: result.page || page,
              pageSize: result.pageSize || limit,
              hasMore: result.hasMore || false,
            };
          } catch (error) {
            this.logger.error(
              `Failed to get in-app messages for subscriber ${subscriberId}: ${error.message}`,
            );
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  /**
   * Mark in-app notification as read
   * @param subscriberId - The subscriber ID
   * @param messageId - The message ID to mark as read
   */
  async markInAppMessageAsRead(
    subscriberId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `Marking in-app message as read: ${messageId} for subscriber: ${subscriberId}`,
    );

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            return Promise.resolve({ success: true });
          }

          try {
            const response = await fetch(
              `${apiUrl}/v1/subscribers/${subscriberId}/messages/${messageId}/read`,
              {
                method: 'PATCH',
                headers: {
                  Authorization: `ApiKey ${apiKey}`,
                  'Content-Type': 'application/json',
                },
              },
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            this.logger.log(`Message marked as read successfully: ${messageId}`);
            return { success: true };
          } catch (error) {
            this.logger.error(
              `Failed to mark message as read ${messageId}: ${error.message}`,
            );
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  /**
   * Mark all in-app notifications as read for a subscriber
   * @param subscriberId - The subscriber ID
   */
  async markAllInAppMessagesAsRead(subscriberId: string): Promise<{ success: boolean }> {
    this.logger.log(`Marking all in-app messages as read for subscriber: ${subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            return Promise.resolve({ success: true });
          }

          try {
            const response = await fetch(
              `${apiUrl}/v1/subscribers/${subscriberId}/messages/read`,
              {
                method: 'PATCH',
                headers: {
                  Authorization: `ApiKey ${apiKey}`,
                  'Content-Type': 'application/json',
                },
              },
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            this.logger.log(`All messages marked as read successfully for subscriber: ${subscriberId}`);
            return { success: true };
          } catch (error) {
            this.logger.error(
              `Failed to mark all messages as read for subscriber ${subscriberId}: ${error.message}`,
            );
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }

  /**
   * Get unread count for in-app notifications
   * @param subscriberId - The subscriber ID
   */
  async getInAppUnreadCount(subscriberId: string): Promise<{ count: number }> {
    this.logger.log(`Getting unread count for subscriber: ${subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            return Promise.resolve({ count: 0 });
          }

          try {
            const response = await fetch(
              `${apiUrl}/v1/subscribers/${subscriberId}/notifications/unseen`,
              {
                method: 'GET',
                headers: {
                  Authorization: `ApiKey ${apiKey}`,
                  'Content-Type': 'application/json',
                },
              },
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            const count = result.data?.count || result.count || 0;

            this.logger.log(`Retrieved unread count for subscriber: ${subscriberId}`, {
              count,
            });

            return { count };
          } catch (error) {
            this.logger.error(
              `Failed to get unread count for subscriber ${subscriberId}: ${error.message}`,
            );
            throw error;
          }
        });
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000,
      },
    );
  }
}
