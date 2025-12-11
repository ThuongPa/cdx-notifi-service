import { ConfigService } from '@nestjs/config';
import { NovuClient } from './novu.client';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { Injectable, Get, Delete, Logger } from '@nestjs/common';


export interface WorkflowTemplate {
  name: string;
  type: 'push' | 'in-app' | 'email';
  subject?: string;
  body: string;
  variables: string[];
}

export interface NotificationData {
  templateId: string;
  recipient: string;
  data: Record<string, any>;
  channel: 'push' | 'in-app' | 'email';
}

@Injectable()
export class NovuWorkflowService {
  private readonly logger = new Logger(NovuWorkflowService.name);
  private readonly applicationIdentifier: string;

  constructor(
    private readonly novuClient: NovuClient,
    private readonly configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    const novuConfig = this.configService.get('novu');
    this.applicationIdentifier = novuConfig.applicationIdentifier;
  }

  /**
   * Create push notification workflow
   */
  async createPushWorkflow(): Promise<string> {
    const template: WorkflowTemplate = {
      name: 'Push Notification Workflow',
      type: 'push',
      body: 'Hello {{firstName}}! {{message}}',
      variables: ['firstName', 'message'],
    };

    return this.createWorkflowTemplate(template);
  }

  /**
   * Create in-app notification workflow
   */
  async createInAppWorkflow(): Promise<string> {
    const template: WorkflowTemplate = {
      name: 'In-App Notification Workflow',
      type: 'in-app',
      body: '{{title}}\n\n{{message}}\n\n{{actionUrl}}',
      variables: ['title', 'message', 'actionUrl'],
    };

    return this.createWorkflowTemplate(template);
  }

  /**
   * Create email notification workflow
   */
  async createEmailWorkflow(): Promise<string> {
    const template: WorkflowTemplate = {
      name: 'Email Notification Workflow',
      type: 'email',
      subject: '{{subject}}',
      body: `
        <html>
          <body>
            <h1>{{title}}</h1>
            <p>{{message}}</p>
            <a href="{{actionUrl}}">Click here</a>
          </body>
        </html>
      `,
      variables: ['subject', 'title', 'message', 'actionUrl'],
    };

    return this.createWorkflowTemplate(template);
  }

  /**
   * Create workflow template
   */
  private async createWorkflowTemplate(template: WorkflowTemplate): Promise<string> {
    try {
      this.logger.log(`Creating workflow template: ${template.name}`);

      const templateId = await this.novuClient.createTemplate({
        name: template.name,
        type: template.type,
        channel: template.type,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
      });

      this.logger.log(`Workflow template created: ${templateId}`);
      return templateId;
    } catch (error) {
      this.logger.error(`Failed to create workflow template ${template.name}:`, error);
      throw error;
    }
  }

  /**
   * Trigger notification workflow
   */
  async triggerNotification(notification: NotificationData): Promise<void> {
    try {
      this.logger.log(`Triggering notification workflow: ${notification.templateId}`);

      await this.novuClient.sendNotification({
        templateId: notification.templateId,
        recipient: notification.recipient,
        data: notification.data,
        channel: notification.channel,
      });

      this.logger.log(`Notification workflow triggered successfully`);
    } catch (error) {
      this.logger.error(`Failed to trigger notification workflow:`, error);
      throw error;
    }
  }

  /**
   * Trigger workflow for multiple recipients
   */
  async triggerWorkflow(params: {
    workflowId: string;
    recipients: string[];
    payload: Record<string, any>;
  }): Promise<{ deliveryId: string }> {
    try {
      this.logger.log(
        `Triggering workflow: ${params.workflowId} for ${params.recipients.length} recipients`,
      );

      // Use circuit breaker for Novu API calls
      const result = await this.circuitBreakerService.executeWithNovuConfig(async () => {
        return this.novuClient.triggerWorkflow({
          workflowId: params.workflowId,
          recipients: params.recipients,
          payload: params.payload,
        });
      });

      this.logger.log(`Workflow triggered successfully: ${result.deliveryId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to trigger workflow:`, error);
      throw error;
    }
  }

  /**
   * Create default workflows for the application
   */
  async setupDefaultWorkflows(): Promise<{
    pushWorkflowId: string;
    inAppWorkflowId: string;
    emailWorkflowId: string;
  }> {
    try {
      this.logger.log('Setting up default workflows');

      const [pushWorkflowId, inAppWorkflowId, emailWorkflowId] = await Promise.all([
        this.createPushWorkflow(),
        this.createInAppWorkflow(),
        this.createEmailWorkflow(),
      ]);

      this.logger.log('Default workflows created successfully', {
        pushWorkflowId,
        inAppWorkflowId,
        emailWorkflowId,
      });

      return {
        pushWorkflowId,
        inAppWorkflowId,
        emailWorkflowId,
      };
    } catch (error) {
      this.logger.error('Failed to setup default workflows:', error);
      throw error;
    }
  }

  /**
   * Get workflow template by ID
   */
  async getWorkflowTemplate(templateId: string): Promise<any> {
    try {
      this.logger.log(`Getting workflow template: ${templateId}`);

      const template = await this.novuClient.getTemplate(templateId);

      this.logger.log(`Workflow template retrieved: ${templateId}`);
      return template;
    } catch (error) {
      this.logger.error(`Failed to get workflow template ${templateId}:`, error);
      throw error;
    }
  }

  /**
   * List all workflow templates
   */
  async listWorkflowTemplates(): Promise<any[]> {
    try {
      this.logger.log('Listing workflow templates');

      const templates = await this.novuClient.listTemplates();

      this.logger.log(`Found ${templates.length} workflow templates`);
      return templates;
    } catch (error) {
      this.logger.error('Failed to list workflow templates:', error);
      throw error;
    }
  }

  /**
   * Update workflow template
   */
  async updateWorkflowTemplate(
    templateId: string,
    template: Partial<WorkflowTemplate>,
  ): Promise<void> {
    try {
      this.logger.log(`Updating workflow template: ${templateId}`);

      await this.novuClient.updateTemplate(templateId, {
        name: template.name,
        type: template.type,
        channel: template.type,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
      });

      this.logger.log(`Workflow template updated: ${templateId}`);
    } catch (error) {
      this.logger.error(`Failed to update workflow template ${templateId}:`, error);
      throw error;
    }
  }

  /**
   * Delete workflow template
   */
  async deleteWorkflowTemplate(templateId: string): Promise<void> {
    try {
      this.logger.log(`Deleting workflow template: ${templateId}`);

      await this.novuClient.deleteTemplate(templateId);

      this.logger.log(`Workflow template deleted: ${templateId}`);
    } catch (error) {
      this.logger.error(`Failed to delete workflow template ${templateId}:`, error);
      throw error;
    }
  }

  /**
   * Trigger workflow with topic (sends to all subscribers in topic)
   * @param params - Workflow trigger parameters with topic
   */
  async triggerWorkflowWithTopic(params: {
    workflowId: string;
    topicKey: string;
    payload: Record<string, any>;
  }): Promise<{ deliveryId: string }> {
    try {
      this.logger.log(
        `Triggering workflow: ${params.workflowId} for topic: ${params.topicKey}`,
      );

      // Use circuit breaker for Novu API calls
      const result = await this.circuitBreakerService.executeWithNovuConfig(async () => {
        return this.novuClient.triggerWorkflowWithTopic({
          workflowId: params.workflowId,
          topicKey: params.topicKey,
          payload: params.payload,
        });
      });

      this.logger.log(`Workflow triggered successfully with topic: ${result.deliveryId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to trigger workflow with topic:`, error);
      throw error;
    }
  }
}
