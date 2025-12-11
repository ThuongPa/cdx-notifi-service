import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  HttpCode,
  UseGuards,
  ParseIntPipe,
  Headers,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { ServiceNameOrJwtGuard } from '../../../common/guards/service-name-or-jwt.guard';
import { WebhookService } from './application/services/webhook.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhookDeliveryDto } from './dto/webhook-delivery.dto';

@ApiTags('Webhook Management')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Create a new webhook' })
  @ApiBody({
    description: 'Webhook creation data',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Webhook name' },
        description: { type: 'string', description: 'Webhook description' },
        url: { type: 'string', description: 'Webhook URL' },
        eventTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'notification.sent',
              'notification.delivered',
              'notification.read',
              'notification.failed',
              'notification.bounced',
              'notification.clicked',
              'notification.dismissed',
            ],
          },
          description: 'Event types to listen for',
        },
        headers: {
          type: 'object',
          description: 'Custom headers for webhook requests',
        },
        retryConfig: {
          type: 'object',
          properties: {
            maxRetries: { type: 'number' },
            retryDelay: { type: 'number' },
            backoffMultiplier: { type: 'number' },
            maxRetryDelay: { type: 'number' },
          },
        },
        secret: { type: 'string', description: 'Webhook secret for signature verification' },
        metadata: { type: 'object', description: 'Additional metadata' },
      },
      required: ['name', 'url', 'eventTypes'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Webhook created successfully',
  })
  async createWebhook(@Body() createDto: CreateWebhookDto, @Res() res: Response): Promise<void> {
    try {
      const webhook = await this.webhookService.createWebhook(createDto, 'system'); // TODO: Get from auth context

      res.status(HttpStatus.CREATED).json({
        success: true,
        data: webhook,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Failed to create webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get webhooks with filtering and pagination' })
  @ApiQuery({ name: 'name', required: false, description: 'Filter by webhook name' })
  @ApiQuery({ name: 'url', required: false, description: 'Filter by webhook URL' })
  @ApiQuery({ name: 'eventTypes', required: false, description: 'Filter by event types' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiQuery({ name: 'createdBy', required: false, description: 'Filter by creator' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search in name, description, and URL',
  })
  @ApiQuery({
    name: 'sortField',
    required: false,
    description: 'Sort field (name, createdAt, lastTriggeredAt, successCount, failureCount)',
  })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order (asc, desc)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhooks retrieved successfully',
  })
  async getWebhooks(
    @Query('name') name?: string,
    @Query('url') url?: string,
    @Query('eventTypes') eventTypes?: string,
    @Query('status') status?: string,
    @Query('isActive') isActive?: boolean,
    @Query('createdBy') createdBy?: string,
    @Query('search') search?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('page', ParseIntPipe) page?: number,
    @Query('limit', ParseIntPipe) limit?: number,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const filters = {
        name,
        url,
        eventTypes: eventTypes ? (eventTypes.split(',') as any) : undefined,
        status: status as any,
        isActive,
        createdBy,
        search,
      };

      const sort = {
        field: (sortField as any) || 'createdAt',
        order: (sortOrder as any) || 'desc',
      };

      const pagination = { page: page || 1, limit: limit || 10 };

      const result = await this.webhookService.getWebhooks(filters, sort, pagination);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res!.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to get webhooks',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get webhook statistics' })
  @ApiQuery({
    name: 'webhookId',
    required: false,
    description: 'Specific webhook ID for statistics',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook statistics retrieved successfully',
  })
  async getWebhookStatistics(
    @Query('webhookId') webhookId?: string,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const statistics = await this.webhookService.getWebhookStatistics(webhookId);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: statistics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res!.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to get webhook statistics',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get webhook by ID' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook retrieved successfully',
  })
  async getWebhookById(@Param('id') id: string, @Res() res: Response): Promise<void> {
    try {
      const webhook = await this.webhookService.getWebhookById(id);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: webhook,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res!.status(status).json({
        success: false,
        error: 'Failed to get webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Update webhook' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiBody({
    description: 'Webhook update data',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        url: { type: 'string' },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'suspended'],
        },
        headers: { type: 'object' },
        retryConfig: {
          type: 'object',
          properties: {
            maxRetries: { type: 'number' },
            retryDelay: { type: 'number' },
            backoffMultiplier: { type: 'number' },
            maxRetryDelay: { type: 'number' },
          },
        },
        isActive: { type: 'boolean' },
        secret: { type: 'string' },
        metadata: { type: 'object' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook updated successfully',
  })
  async updateWebhook(
    @Param('id') id: string,
    @Body() updateDto: UpdateWebhookDto,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const webhook = await this.webhookService.updateWebhook(id, updateDto, 'system'); // TODO: Get from auth context

      res!.status(HttpStatus.OK).json({
        success: true,
        data: webhook,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res!.status(status).json({
        success: false,
        error: 'Failed to update webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Delete webhook' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook deleted successfully',
  })
  async deleteWebhook(@Param('id') id: string, @Res() res: Response): Promise<void> {
    try {
      await this.webhookService.deleteWebhook(id);

      res!.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook deleted successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res!.status(status).json({
        success: false,
        error: 'Failed to delete webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Post('trigger')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Trigger webhook delivery' })
  @ApiBody({
    description: 'Webhook delivery data',
    schema: {
      type: 'object',
      properties: {
        webhookId: { type: 'string', description: 'Webhook ID' },
        eventType: { type: 'string', description: 'Event type' },
        eventId: { type: 'string', description: 'Event ID' },
        payload: { type: 'object', description: 'Event payload' },
        method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'], description: 'HTTP method' },
        headers: { type: 'object', description: 'Additional headers' },
        scheduledAt: {
          type: 'string',
          format: 'date-time',
          description: 'Scheduled delivery time',
        },
        expiresAt: { type: 'string', format: 'date-time', description: 'Expiration time' },
        metadata: { type: 'object', description: 'Additional metadata' },
      },
      required: ['webhookId', 'eventType', 'eventId', 'payload'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook triggered successfully',
  })
  async triggerWebhook(
    @Body() deliveryDto: WebhookDeliveryDto,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const delivery = await this.webhookService.triggerWebhook(deliveryDto);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: delivery,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res!.status(status).json({
        success: false,
        error: 'Failed to trigger webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Get webhook deliveries with filtering and pagination' })
  @ApiQuery({ name: 'webhookId', required: false, description: 'Filter by webhook ID' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Filter by event type' })
  @ApiQuery({ name: 'eventId', required: false, description: 'Filter by event ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by delivery status' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by date from' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by date to' })
  @ApiQuery({
    name: 'sortField',
    required: false,
    description: 'Sort field (createdAt, scheduledAt, sentAt, deliveredAt, failedAt)',
  })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order (asc, desc)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook deliveries retrieved successfully',
  })
  async getDeliveries(
    @Query('webhookId') webhookId?: string,
    @Query('eventType') eventType?: string,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('page', ParseIntPipe) page?: number,
    @Query('limit', ParseIntPipe) limit?: number,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const filters = {
        webhookId,
        eventType,
        eventId,
        status: status as any,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      };

      const sort = {
        field: (sortField as any) || 'createdAt',
        order: (sortOrder as any) || 'desc',
      };

      const pagination = { page: page || 1, limit: limit || 10 };

      const result = await this.webhookService.getDeliveries(filters, sort, pagination);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res!.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to get webhook deliveries',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('deliveries/statistics')
  @ApiOperation({ summary: 'Get webhook delivery statistics' })
  @ApiQuery({
    name: 'webhookId',
    required: false,
    description: 'Specific webhook ID for statistics',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook delivery statistics retrieved successfully',
  })
  async getDeliveryStatistics(
    @Query('webhookId') webhookId?: string,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const statistics = await this.webhookService.getDeliveryStatistics(webhookId);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: statistics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res!.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to get webhook delivery statistics',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('deliveries/:id')
  @ApiOperation({ summary: 'Get webhook delivery by ID' })
  @ApiParam({ name: 'id', description: 'Delivery ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook delivery retrieved successfully',
  })
  async getDeliveryById(@Param('id') id: string, @Res() res: Response): Promise<void> {
    try {
      const delivery = await this.webhookService.getDeliveryById(id);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: delivery,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res!.status(status).json({
        success: false,
        error: 'Failed to get webhook delivery',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('deliveries/webhook/:webhookId')
  @ApiOperation({ summary: 'Get deliveries for a specific webhook' })
  @ApiParam({ name: 'webhookId', description: 'Webhook ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook deliveries retrieved successfully',
  })
  async getDeliveriesByWebhook(
    @Param('webhookId') webhookId: string,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const deliveries = await this.webhookService.getDeliveriesByWebhook(webhookId);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: deliveries,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res!.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to get webhook deliveries',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('deliveries/event/:eventId')
  @ApiOperation({ summary: 'Get deliveries for a specific event' })
  @ApiParam({ name: 'eventId', description: 'Event ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Event deliveries retrieved successfully',
  })
  async getDeliveriesByEventId(
    @Param('eventId') eventId: string,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      const deliveries = await this.webhookService.getDeliveriesByEventId(eventId);

      res!.status(HttpStatus.OK).json({
        success: true,
        data: deliveries,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res!.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to get event deliveries',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('register/check')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Check if webhook URL is already registered' })
  @ApiQuery({ name: 'url', required: true, description: 'Webhook URL (URL encoded)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook registration status retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid URL format',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid service name or invalid JWT token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Missing X-Service-Name header and missing/invalid JWT token',
  })
  async checkWebhookRegistration(@Query('url') url: string, @Res() res: Response): Promise<void> {
    try {
      if (!url) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'URL parameter is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Decode URL if encoded
      const decodedUrl = decodeURIComponent(url);

      // Find webhook by URL
      const webhooks = await this.webhookService.getWebhooks(
        { url: decodedUrl },
        { field: 'createdAt', order: 'desc' },
        { page: 1, limit: 1 },
      );

      const webhook = webhooks?.data?.[0] || webhooks?.[0];

      if (webhook) {
        res.status(HttpStatus.OK).json({
          registered: true,
          webhook: {
            id: webhook.id,
            url: webhook.url,
            events: webhook.eventTypes || webhook.events || [],
            status: webhook.status || (webhook.isActive ? 'active' : 'inactive'),
            createdAt: webhook.createdAt,
          },
        });
      } else {
        res.status(HttpStatus.OK).json({
          registered: false,
        });
      }
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to check webhook registration',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Post('register')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Register webhook for external services' })
  @ApiBody({
    description: 'Webhook registration data',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Webhook callback URL' },
        events: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of event types to subscribe',
        },
        secret: { type: 'string', description: 'Secret key for webhook verification' },
        description: { type: 'string', description: 'Description of webhook' },
      },
      required: ['url', 'events'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook registered successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request body or URL already registered',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Missing X-Service-Name header or invalid JWT token',
  })
  async registerWebhook(
    @Body()
    body: {
      url: string;
      events: string[];
      secret?: string;
      description?: string;
    },
    @Headers('x-service-name') serviceName?: string,
    @Res() res?: Response,
  ): Promise<void> {
    try {
      // Check if webhook already exists
      const existingWebhooks = await this.webhookService.getWebhooks(
        { url: body.url },
        { field: 'createdAt', order: 'desc' },
        { page: 1, limit: 1 },
      );

      const existingWebhook = existingWebhooks?.data?.[0] || existingWebhooks?.[0];
      if (existingWebhook) {
        res!.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Webhook with this URL is already registered',
          webhookId: existingWebhook.id,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Create webhook
      const createDto: CreateWebhookDto = {
        name: `Webhook-${serviceName || 'external'}-${Date.now()}`,
        url: body.url,
        events: body.events, // ⭐ Use 'events' instead of 'eventTypes'
        secret: body.secret,
        isActive: true,
      };

      const webhook = await this.webhookService.createWebhook(createDto, serviceName || 'external');

      res!.status(HttpStatus.OK).json({
        success: true,
        webhookId: webhook.id,
        message: 'Webhook registered successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res!.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Failed to register webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Delete('register/:webhookId')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Unregister webhook for external services' })
  @ApiParam({ name: 'webhookId', description: 'Webhook ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook unregistered successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Webhook not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Missing X-Service-Name header or invalid JWT token',
  })
  async unregisterWebhook(
    @Param('webhookId') webhookId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.webhookService.deleteWebhook(webhookId);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook unregistered successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({
        success: false,
        error: 'Failed to unregister webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Delete('register')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Unregister webhook by URL for external services' })
  @ApiQuery({ name: 'url', required: true, description: 'Webhook URL (URL encoded)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook unregistered successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Webhook not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Missing X-Service-Name header or invalid JWT token',
  })
  async unregisterWebhookByUrl(@Query('url') url: string, @Res() res: Response): Promise<void> {
    try {
      if (!url) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'URL parameter is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Decode URL if encoded
      const decodedUrl = decodeURIComponent(url);

      // Find webhook by URL
      const webhooks = await this.webhookService.getWebhooks(
        { url: decodedUrl },
        { field: 'createdAt', order: 'desc' },
        { page: 1, limit: 1 },
      );

      const webhook = webhooks?.data?.[0] || webhooks?.[0];

      if (!webhook) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          error: 'Webhook not found',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await this.webhookService.deleteWebhook(webhook.id);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook unregistered successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({
        success: false,
        error: 'Failed to unregister webhook',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
