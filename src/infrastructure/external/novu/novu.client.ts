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

  /**
   * Create a topic in Novu
   * @param topicKey - Unique topic key (e.g., "category_category_123")
   * @param name - Topic name
   */
  async createTopic(topicKey: string, name: string): Promise<void> {
    this.logger.log(`Creating topic: ${topicKey} with name: ${name}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            this.logger.log('Mock topic created:', { topicKey, name });
            return Promise.resolve();
          }

          try {
            const response = await fetch(`${apiUrl}/v1/topics`, {
              method: 'POST',
              headers: {
                Authorization: `ApiKey ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                key: topicKey,
                name: name,
              }),
            });

            if (!response.ok) {
              // Topic might already exist (409), that's okay
              if (response.status === 409) {
                this.logger.log(`Topic ${topicKey} already exists, skipping creation`);
                return Promise.resolve();
              }

              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            this.logger.log(`Topic created successfully: ${topicKey}`);
            return Promise.resolve();
          } catch (error) {
            this.logger.error(`Failed to create topic ${topicKey}: ${error.message}`);
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
   * Add subscriber to a topic
   * @param topicKey - Topic key
   * @param subscriberId - Subscriber ID (userId)
   */
  async addSubscriberToTopic(topicKey: string, subscriberId: string): Promise<void> {
    this.logger.log(`Adding subscriber ${subscriberId} to topic ${topicKey}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            this.logger.log('Mock subscriber added to topic:', { topicKey, subscriberId });
            return Promise.resolve();
          }

          try {
            const response = await fetch(`${apiUrl}/v1/topics/${topicKey}/subscribers`, {
              method: 'POST',
              headers: {
                Authorization: `ApiKey ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                subscribers: [subscriberId],
              }),
            });

            if (!response.ok) {
              // Subscriber might already be in topic, that's okay
              if (response.status === 409 || response.status === 400) {
                this.logger.log(
                  `Subscriber ${subscriberId} might already be in topic ${topicKey}, skipping`,
                );
                return Promise.resolve();
              }

              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            this.logger.log(`Subscriber ${subscriberId} added to topic ${topicKey} successfully`);
            return Promise.resolve();
          } catch (error) {
            this.logger.error(
              `Failed to add subscriber ${subscriberId} to topic ${topicKey}: ${error.message}`,
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
   * Remove subscriber from a topic
   * @param topicKey - Topic key
   * @param subscriberId - Subscriber ID (userId)
   */
  async removeSubscriberFromTopic(topicKey: string, subscriberId: string): Promise<void> {
    this.logger.log(`Removing subscriber ${subscriberId} from topic ${topicKey}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            this.logger.log('Mock subscriber removed from topic:', { topicKey, subscriberId });
            return Promise.resolve();
          }

          try {
            const response = await fetch(
              `${apiUrl}/v1/topics/${topicKey}/subscribers/${subscriberId}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `ApiKey ${apiKey}`,
                },
              },
            );

            // 404 means subscriber not in topic, that's okay
            if (response.status === 404) {
              this.logger.log(
                `Subscriber ${subscriberId} not found in topic ${topicKey}, skipping removal`,
              );
              return Promise.resolve();
            }

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            this.logger.log(
              `Subscriber ${subscriberId} removed from topic ${topicKey} successfully`,
            );
            return Promise.resolve();
          } catch (error) {
            this.logger.error(
              `Failed to remove subscriber ${subscriberId} from topic ${topicKey}: ${error.message}`,
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
   * Trigger workflow with topic (sends to all subscribers in topic)
   * @param params - Workflow trigger parameters
   */
  async triggerWorkflowWithTopic(params: {
    workflowId: string;
    topicKey: string;
    payload: Record<string, any>;
  }): Promise<{ deliveryId: string }> {
    this.logger.log(
      `Triggering workflow: ${params.workflowId} for topic: ${params.topicKey}`,
    );
    this.logger.log('Workflow payload:', JSON.stringify(params.payload, null, 2));

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            this.logger.log('Mock workflow trigger with topic:', {
              workflowId: params.workflowId,
              topicKey: params.topicKey,
              payload: params.payload,
              deliveryId: `mock_delivery_${Date.now()}`,
            });
            return Promise.resolve({ deliveryId: `mock_delivery_${Date.now()}` });
          }

          try {
            const response = await fetch(`${apiUrl}/v1/events/trigger`, {
              method: 'POST',
              headers: {
                Authorization: `ApiKey ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: params.workflowId,
                to: [{ type: 'Topic', topicKey: params.topicKey }],
                payload: params.payload,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            this.logger.log(
              `Workflow triggered successfully with topic: ${params.workflowId}`,
              {
                deliveryId: result.data?.transactionId || result.transactionId,
                topicKey: params.topicKey,
              },
            );

            return Promise.resolve({
              deliveryId:
                result.data?.transactionId || result.transactionId || `delivery_${Date.now()}`,
            });
          } catch (error) {
            this.logger.error(
              `Failed to trigger workflow with topic in Novu: ${error.message}`,
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
   * Get notification history for all channels (push, email, in-app, sms)
   * @param subscriberId - The subscriber ID
   * @param options - Query options
   */
  async getNotificationHistory(
    subscriberId: string,
    options: {
      page?: number;
      limit?: number;
      channel?: 'push' | 'email' | 'in-app' | 'sms';
      status?: 'read' | 'unread' | 'all';
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{
    data: any[];
    totalCount: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    this.logger.log(`Getting notification history for subscriber: ${subscriberId}`);

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

            // Build query parameters
            const queryParams = new URLSearchParams({
              page: page.toString(),
              limit: limit.toString(),
            });

            if (options.channel) {
              queryParams.append('channel', options.channel);
            }

            if (options.status) {
              if (options.status === 'unread') {
                queryParams.append('seen', 'false');
              } else if (options.status === 'read') {
                queryParams.append('seen', 'true');
              }
            }

            if (options.startDate) {
              queryParams.append('startDate', options.startDate.toISOString());
            }

            if (options.endDate) {
              queryParams.append('endDate', options.endDate.toISOString());
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
            this.logger.log(`Retrieved notification history for subscriber: ${subscriberId}`, {
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
              `Failed to get notification history for subscriber ${subscriberId}: ${error.message}`,
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
   * Get unread count for all channels
   * @param subscriberId - The subscriber ID
   * @param channel - Optional channel filter
   */
  async getUnreadCount(
    subscriberId: string,
    channel?: 'push' | 'email' | 'in-app' | 'sms',
  ): Promise<{ count: number }> {
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
            // Use unseen endpoint for unread count
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

  /**
   * Get notification detail by ID
   * @param subscriberId - The subscriber ID
   * @param notificationId - The notification ID
   */
  async getNotificationDetail(
    subscriberId: string,
    notificationId: string,
  ): Promise<any> {
    this.logger.log(
      `Getting notification detail: ${notificationId} for subscriber: ${subscriberId}`,
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
            return Promise.resolve(null);
          }

          try {
            const response = await fetch(
              `${apiUrl}/v1/subscribers/${subscriberId}/notifications/${notificationId}`,
              {
                method: 'GET',
                headers: {
                  Authorization: `ApiKey ${apiKey}`,
                  'Content-Type': 'application/json',
                },
              },
            );

            if (!response.ok) {
              if (response.status === 404) {
                return null;
              }
              const errorText = await response.text();
              throw new Error(`Novu API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            this.logger.log(`Retrieved notification detail: ${notificationId}`);

            return result.data || result;
          } catch (error) {
            this.logger.error(
              `Failed to get notification detail ${notificationId}: ${error.message}`,
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
   * Mark notification as read (all channels)
   * @param subscriberId - The subscriber ID
   * @param notificationId - The notification ID
   */
  async markNotificationAsRead(
    subscriberId: string,
    notificationId: string,
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `Marking notification as read: ${notificationId} for subscriber: ${subscriberId}`,
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
              `${apiUrl}/v1/subscribers/${subscriberId}/messages/${notificationId}/read`,
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

            this.logger.log(`Notification marked as read successfully: ${notificationId}`);
            return { success: true };
          } catch (error) {
            this.logger.error(
              `Failed to mark notification as read ${notificationId}: ${error.message}`,
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
   * Mark all notifications as read (all channels)
   * @param subscriberId - The subscriber ID
   * @param channel - Optional channel filter
   */
  async markAllNotificationsAsRead(
    subscriberId: string,
    channel?: 'push' | 'email' | 'in-app' | 'sms',
  ): Promise<{ success: boolean; updatedCount: number }> {
    this.logger.log(`Marking all notifications as read for subscriber: ${subscriberId}`);

    return this.circuitBreakerService.execute(
      'novu',
      async () => {
        return this.retryService.executeWithRetry(async () => {
          const novuConfig = this.configService.get('novu');
          const apiKey = novuConfig?.apiKey;
          const apiUrl = novuConfig?.apiUrl;

          if (!apiKey) {
            this.logger.warn('NOVU_API_KEY not configured, using mock implementation');
            return Promise.resolve({ success: true, updatedCount: 0 });
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

            const result = await response.json();
            const updatedCount = result.data?.updatedCount || result.updatedCount || 0;

            this.logger.log(
              `All notifications marked as read successfully for subscriber: ${subscriberId}`,
              { updatedCount },
            );
            return { success: true, updatedCount };
          } catch (error) {
            this.logger.error(
              `Failed to mark all notifications as read for subscriber ${subscriberId}: ${error.message}`,
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
   * Get notification statistics
   * @param subscriberId - The subscriber ID
   * @param options - Query options
   */
  async getNotificationStatistics(
    subscriberId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{
    total: number;
    unread: number;
    read: number;
    byType: Record<string, number>;
    byChannel: Record<string, number>;
  }> {
    this.logger.log(`Getting notification statistics for subscriber: ${subscriberId}`);

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
              total: 0,
              unread: 0,
              read: 0,
              byType: {},
              byChannel: {},
            });
          }

          try {
            // Get all notifications to calculate statistics
            const allNotifications = await this.getNotificationHistory(subscriberId, {
              page: 1,
              limit: 1000, // Get more to calculate stats
              startDate: options.startDate,
              endDate: options.endDate,
            });

            const notifications = allNotifications.data || [];

            // Calculate statistics
            const total = notifications.length;
            const unread = notifications.filter((n) => !n.seen && !n.read).length;
            const read = notifications.filter((n) => n.seen || n.read).length;

            // Group by type
            const byType: Record<string, number> = {};
            notifications.forEach((n) => {
              const type = n.payload?.type || n.type || 'unknown';
              byType[type] = (byType[type] || 0) + 1;
            });

            // Group by channel
            const byChannel: Record<string, number> = {};
            notifications.forEach((n) => {
              const channel = n.channel || 'unknown';
              byChannel[channel] = (byChannel[channel] || 0) + 1;
            });

            this.logger.log(`Retrieved notification statistics for subscriber: ${subscriberId}`, {
              total,
              unread,
              read,
            });

            return {
              total,
              unread,
              read,
              byType,
              byChannel,
            };
          } catch (error) {
            this.logger.error(
              `Failed to get notification statistics for subscriber ${subscriberId}: ${error.message}`,
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
