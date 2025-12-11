import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Webhook } from '../../domain/webhook.entity';
import { WebhookRepository } from '../../infrastructure/webhook.repository';

export interface CreateWebhookDto {
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  secret?: string;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface UpdateWebhookDto {
  name?: string;
  url?: string;
  events?: string[];
  headers?: Record<string, string>;
  secret?: string;
  isActive?: boolean;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface WebhookFilters {
  name?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
  createdBy?: string;
  limit?: number;
  offset?: number;
}

export interface WebhookSortOptions {
  field?: string;
  order?: 'asc' | 'desc';
}

export interface WebhookPaginationOptions {
  page?: number;
  limit?: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(@Inject('WebhookRepository') private readonly webhookRepository: WebhookRepository) {}

  async createWebhook(createDto: CreateWebhookDto, createdBy: string): Promise<Webhook> {
    this.logger.log(`Creating webhook ${createDto.name}`);

    this.validateUrl(createDto.url);
    this.validateEvents(createDto.events);

    const existingWebhook = await this.webhookRepository.findByName(createDto.name);
    if (existingWebhook) {
      throw new ConflictException('Webhook with this name already exists');
    }

    const webhook = Webhook.create({
      name: createDto.name,
      url: createDto.url,
      events: createDto.events,
      headers: createDto.headers,
      secret: createDto.secret,
      isActive: true,
      timeout: createDto.timeout || 30000,
      retryCount: createDto.retryCount || 3,
      retryDelay: createDto.retryDelay || 1000,
      createdBy,
    });

    return this.webhookRepository.create(webhook);
  }

  async getWebhookById(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepository.findById(id);
    if (!webhook) {
      throw new NotFoundException(`Webhook with ID ${id} not found`);
    }
    return webhook;
  }

  async getWebhooks(
    filters: WebhookFilters = {},
    sort?: WebhookSortOptions,
    pagination?: WebhookPaginationOptions,
  ): Promise<any> {
    // Get all webhooks matching filters
    let webhooks = await this.webhookRepository.find(filters);

    // Apply sorting
    if (sort?.field) {
      const field = sort.field;
      const order = sort.order || 'desc';
      webhooks.sort((a, b) => {
        const aValue = (a as any)[field];
        const bValue = (b as any)[field];

        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;

        if (aValue instanceof Date && bValue instanceof Date) {
          return order === 'asc'
            ? aValue.getTime() - bValue.getTime()
            : bValue.getTime() - aValue.getTime();
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return order === 'asc' ? aValue - bValue : bValue - aValue;
        }

        return 0;
      });
    }

    // Apply pagination
    if (pagination) {
      const page = pagination.page || 1;
      const limit = pagination.limit || 10;
      const offset = (page - 1) * limit;
      const total = webhooks.length;
      const totalPages = Math.ceil(total / limit);
      const paginatedWebhooks = webhooks.slice(offset, offset + limit);

      return {
        data: paginatedWebhooks.map((w) => this.webhookToPlainObject(w)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    }

    // Return as array if no pagination
    return webhooks.map((w) => this.webhookToPlainObject(w));
  }

  private webhookToPlainObject(webhook: Webhook): any {
    return {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      headers: webhook.headers,
      secret: webhook.secret,
      isActive: webhook.isActive,
      timeout: webhook.timeout,
      retryCount: webhook.retryCount,
      retryDelay: webhook.retryDelay,
      createdBy: webhook.createdBy,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };
  }

  async updateWebhook(id: string, updateDto: UpdateWebhookDto, updatedBy?: string): Promise<Webhook> {
    this.logger.log(`Updating webhook ${id}`);

    const webhook = await this.getWebhookById(id);

    if (updateDto.name) {
      const existingWebhook = await this.webhookRepository.findByName(updateDto.name);
      if (existingWebhook && existingWebhook.id !== id) {
        throw new ConflictException('Webhook with this name already exists');
      }
      webhook.updateName(updateDto.name);
    }

    if (updateDto.url) {
      this.validateUrl(updateDto.url);
      webhook.updateUrl(updateDto.url);
    }

    if (updateDto.events) {
      this.validateEvents(updateDto.events);
      webhook.updateEvents(updateDto.events);
    }

    if (updateDto.headers !== undefined) {
      webhook.updateHeaders(updateDto.headers);
    }

    if (updateDto.secret !== undefined) {
      webhook.updateSecret(updateDto.secret);
    }

    if (updateDto.isActive !== undefined) {
      if (updateDto.isActive) {
        webhook.activate();
      } else {
        webhook.deactivate();
      }
    }

    if (updateDto.timeout !== undefined) {
      webhook.updateTimeout(updateDto.timeout);
    }

    if (updateDto.retryCount !== undefined || updateDto.retryDelay !== undefined) {
      webhook.updateRetrySettings(
        updateDto.retryCount ?? webhook.retryCount,
        updateDto.retryDelay ?? webhook.retryDelay,
      );
    }

    return this.webhookRepository.update(id, webhook);
  }

  async deleteWebhook(id: string): Promise<void> {
    this.logger.log(`Deleting webhook ${id}`);

    const webhook = await this.getWebhookById(id);
    await this.webhookRepository.delete(id);
  }

  async getWebhooksByEventType(eventType: string): Promise<Webhook[]> {
    return this.webhookRepository.findByEventType(eventType);
  }

  async getActiveWebhooks(): Promise<Webhook[]> {
    return this.webhookRepository.find({ isActive: true });
  }

  async activateWebhook(id: string): Promise<Webhook> {
    this.logger.log(`Activating webhook ${id}`);

    const webhook = await this.getWebhookById(id);
    webhook.activate();
    return this.webhookRepository.update(id, webhook);
  }

  async deactivateWebhook(id: string): Promise<Webhook> {
    this.logger.log(`Deactivating webhook ${id}`);

    const webhook = await this.getWebhookById(id);
    webhook.deactivate();
    return this.webhookRepository.update(id, webhook);
  }

  async getWebhookStatistics(webhookId?: string): Promise<{
    total: number;
    active: number;
    inactive: number;
  }> {
    const webhooks = webhookId
      ? [await this.getWebhookById(webhookId)]
      : await this.webhookRepository.find({});

    return {
      total: webhooks.length,
      active: webhooks.filter((w) => w.isActive).length,
      inactive: webhooks.filter((w) => !w.isActive).length,
    };
  }

  async getWebhooksByUser(createdBy: string): Promise<Webhook[]> {
    return this.webhookRepository.find({ createdBy });
  }

  async searchWebhooks(query: string): Promise<Webhook[]> {
    return this.webhookRepository.search(query);
  }

  async bulkUpdateWebhooks(
    ids: string[],
    updateDto: UpdateWebhookDto,
  ): Promise<{
    successCount: number;
    errorCount: number;
  }> {
    this.logger.log(`Bulk updating ${ids.length} webhooks`);

    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        await this.updateWebhook(id, updateDto);
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to update webhook ${id}: ${error.message}`);
        errorCount++;
      }
    }

    return { successCount, errorCount };
  }

  async bulkDeleteWebhooks(ids: string[]): Promise<{
    successCount: number;
    errorCount: number;
  }> {
    this.logger.log(`Bulk deleting ${ids.length} webhooks`);

    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        await this.deleteWebhook(id);
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to delete webhook ${id}: ${error.message}`);
        errorCount++;
      }
    }

    return { successCount, errorCount };
  }

  async cleanupInactiveWebhooks(): Promise<number> {
    this.logger.log('Cleaning up inactive webhooks');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days ago

    return this.webhookRepository.cleanupInactiveWebhooks(cutoffDate);
  }

  private validateUrl(url: string): void {
    try {
      new URL(url);
    } catch (error) {
      throw new BadRequestException(`Invalid URL format: ${url}`);
    }
  }

  // Delivery-related methods (stubs for now)
  async triggerWebhook(deliveryDto: any): Promise<any> {
    this.logger.warn('triggerWebhook is not implemented yet');
    throw new BadRequestException('Webhook triggering is not implemented yet');
  }

  async getDeliveries(filters?: any, sort?: any, pagination?: any): Promise<any> {
    this.logger.warn('getDeliveries is not implemented yet');
    return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
  }

  async getDeliveryStatistics(webhookId?: string): Promise<any> {
    this.logger.warn('getDeliveryStatistics is not implemented yet');
    return {
      total: 0,
      success: 0,
      failed: 0,
      pending: 0,
    };
  }

  async getDeliveryById(id: string): Promise<any> {
    this.logger.warn('getDeliveryById is not implemented yet');
    throw new NotFoundException(`Delivery with ID ${id} not found`);
  }

  async getDeliveriesByWebhook(webhookId: string): Promise<any[]> {
    this.logger.warn('getDeliveriesByWebhook is not implemented yet');
    return [];
  }

  async getDeliveriesByEventId(eventId: string): Promise<any[]> {
    this.logger.warn('getDeliveriesByEventId is not implemented yet');
    return [];
  }

  private validateEvents(events: string[]): void {
    if (!events || events.length === 0) {
      throw new BadRequestException('At least one event type must be specified');
    }

    const validEvents = [
      'notification.created',
      'notification.sent',
      'notification.delivered',
      'notification.failed',
      'notification.read',
      'notification.clicked',
      'notification.status-update', // ⭐ Event cho status updates từ notification service
      'user.created',
      'user.updated',
      'user.deleted',
    ];

    const invalidEvents = events.filter((event) => !validEvents.includes(event));
    if (invalidEvents.length > 0) {
      throw new BadRequestException(`Invalid event types: ${invalidEvents.join(', ')}`);
    }
  }
}
