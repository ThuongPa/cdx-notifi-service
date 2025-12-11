import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NovuClient } from './novu.client';

/**
 * Service to automatically register webhook with Novu on app startup
 * Tries multiple methods to setup webhook with Novu
 */
@Injectable()
export class NovuWebhookInitService implements OnModuleInit {
  private readonly logger = new Logger(NovuWebhookInitService.name);

  constructor(
    private readonly novuClient: NovuClient,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      const novuConfig = this.configService.get('novu');
      const webhookUrl = novuConfig?.webhookUrl;
      const apiUrl = novuConfig?.apiUrl;
      const apiKey = novuConfig?.apiKey;

      if (!webhookUrl) {
        this.logger.warn(
          'NOVU_WEBHOOK_URL not configured. Webhook will not be registered. You may need to register manually.',
        );
        return;
      }

      if (!apiKey) {
        this.logger.warn('NOVU_API_KEY not configured. Skipping webhook registration.');
        return;
      }

      this.logger.log(`🔗 Attempting to register webhook with Novu: ${webhookUrl}`);

      // Try multiple methods to register webhook
      const success = await this.tryRegisterWebhook(webhookUrl, apiUrl, apiKey);

      if (success) {
        this.logger.log('✅ Webhook registered successfully with Novu');
      } else {
        this.logger.warn(
          '⚠️  Could not register webhook via API. You may need to configure webhook manually in Novu dashboard or config.',
        );
        this.logger.warn(
          '   Note: Some Novu self-hosted versions may not support webhook API. Database will still work with status="sent".',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to register webhook with Novu: ${error.message}. Webhook may need manual setup.`,
      );
      // Don't throw - webhook registration failure shouldn't block app startup
    }
  }

  /**
   * Try multiple methods to register webhook
   */
  private async tryRegisterWebhook(
    webhookUrl: string,
    apiUrl: string,
    apiKey: string,
  ): Promise<boolean> {
    const endpoints = [
      '/v1/integrations/webhooks',
      '/v1/webhooks',
      '/v1/hooks',
      '/webhooks',
    ];

    for (const endpoint of endpoints) {
      try {
        const success = await this.registerWebhookAtEndpoint(
          webhookUrl,
          `${apiUrl}${endpoint}`,
          apiKey,
        );
        if (success) {
          return true;
        }
      } catch (error) {
        this.logger.debug(`Failed to register at ${endpoint}: ${error.message}`);
      }
    }

    return false;
  }

  /**
   * Register webhook at a specific endpoint
   */
  private async registerWebhookAtEndpoint(
    webhookUrl: string,
    endpointUrl: string,
    apiKey: string,
  ): Promise<boolean> {
    try {
      // First, check if webhook already exists
      const checkResponse = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          Authorization: `ApiKey ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (checkResponse.ok) {
        const existingWebhooks = await checkResponse.json();
        const webhookExists = existingWebhooks.data?.some(
          (wh: any) => wh.url === webhookUrl,
        ) || existingWebhooks.some((wh: any) => wh.url === webhookUrl);

        if (webhookExists) {
          this.logger.log(`Webhook already registered: ${webhookUrl}`);
          return true;
        }
      }

      // Try to create webhook
      const createResponse = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `ApiKey ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          triggers: ['notification.delivered', 'notification.failed', 'notification.sent'],
          active: true,
        }),
      });

      if (createResponse.ok || createResponse.status === 201) {
        const result = await createResponse.json();
        this.logger.log(`Webhook registered at ${endpointUrl}`, result);
        return true;
      } else if (createResponse.status === 409) {
        // Webhook already exists
        this.logger.log(`Webhook already exists at ${endpointUrl}`);
        return true;
      } else {
        const errorText = await createResponse.text();
        this.logger.debug(`Failed to register at ${endpointUrl}: ${createResponse.status} - ${errorText}`);
        return false;
      }
    } catch (error) {
      this.logger.debug(`Error registering webhook at ${endpointUrl}: ${error.message}`);
      return false;
    }
  }
}

