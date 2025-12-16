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
import { RegisterWebhookDto } from './dto/register-webhook.dto';
import { Req, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

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
      const filters: any = {
        name,
        url,
        events: eventTypes ? eventTypes.split(',') : undefined,
        isActive,
        createdBy,
      };

      // Apply pagination to filters
      if (limit) {
        filters.limit = limit;
      }
      if (page && limit) {
        filters.offset = (page - 1) * limit;
      }

      const result = await this.webhookService.getWebhooks(filters);

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
      const statistics = await this.webhookService.getWebhookStatistics();

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
      const webhook = await this.webhookService.updateWebhook(id, updateDto);

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
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Trigger webhook delivery (Not implemented yet)' })
  @ApiResponse({
    status: HttpStatus.NOT_IMPLEMENTED,
    description: 'This endpoint is not implemented yet',
  })
  async triggerWebhook(
    @Body() deliveryDto: WebhookDeliveryDto,
    @Res() res: Response,
  ): Promise<void> {
    res.status(HttpStatus.NOT_IMPLEMENTED).json({
      success: false,
      error: 'Not implemented',
      message: 'Webhook delivery functionality is not implemented yet',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Get webhook deliveries (Not implemented yet)' })
  @ApiResponse({
    status: HttpStatus.NOT_IMPLEMENTED,
    description: 'This endpoint is not implemented yet',
  })
  async getDeliveries(@Res() res: Response): Promise<void> {
    res.status(HttpStatus.NOT_IMPLEMENTED).json({
      success: false,
      error: 'Not implemented',
      message: 'Webhook delivery functionality is not implemented yet',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('deliveries/statistics')
  @ApiOperation({ summary: 'Get webhook delivery statistics (Not implemented yet)' })
  @ApiResponse({
    status: HttpStatus.NOT_IMPLEMENTED,
    description: 'This endpoint is not implemented yet',
  })
  async getDeliveryStatistics(@Res() res: Response): Promise<void> {
    res.status(HttpStatus.NOT_IMPLEMENTED).json({
      success: false,
      error: 'Not implemented',
      message: 'Webhook delivery functionality is not implemented yet',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('deliveries/:id')
  @ApiOperation({ summary: 'Get webhook delivery by ID (Not implemented yet)' })
  @ApiResponse({
    status: HttpStatus.NOT_IMPLEMENTED,
    description: 'This endpoint is not implemented yet',
  })
  async getDeliveryById(@Param('id') id: string, @Res() res: Response): Promise<void> {
    res.status(HttpStatus.NOT_IMPLEMENTED).json({
      success: false,
      error: 'Not implemented',
      message: 'Webhook delivery functionality is not implemented yet',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('deliveries/webhook/:webhookId')
  @ApiOperation({ summary: 'Get deliveries for a specific webhook (Not implemented yet)' })
  @ApiResponse({
    status: HttpStatus.NOT_IMPLEMENTED,
    description: 'This endpoint is not implemented yet',
  })
  async getDeliveriesByWebhook(
    @Param('webhookId') webhookId: string,
    @Res() res: Response,
  ): Promise<void> {
    res.status(HttpStatus.NOT_IMPLEMENTED).json({
      success: false,
      error: 'Not implemented',
      message: 'Webhook delivery functionality is not implemented yet',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('deliveries/event/:eventId')
  @ApiOperation({ summary: 'Get deliveries for a specific event (Not implemented yet)' })
  @ApiResponse({
    status: HttpStatus.NOT_IMPLEMENTED,
    description: 'This endpoint is not implemented yet',
  })
  async getDeliveriesByEventId(
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ): Promise<void> {
    res.status(HttpStatus.NOT_IMPLEMENTED).json({
      success: false,
      error: 'Not implemented',
      message: 'Webhook delivery functionality is not implemented yet',
      timestamp: new Date().toISOString(),
    });
  }

  // ========================================
  // Service-to-Service Webhook Registration Endpoints
  // ========================================

  @Get('register/check')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Check if webhook is registered (Service-to-Service)' })
  @ApiQuery({
    name: 'url',
    required: true,
    description: 'Webhook URL to check (will be URL decoded)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook registration status',
  })
  async checkWebhookRegistration(@Query('url') url: string, @Req() req: any): Promise<any> {
    try {
      const decodedUrl = decodeURIComponent(url);
      const webhooks = await this.webhookService.getWebhooks({ url: decodedUrl });
      const isRegistered = webhooks && webhooks.length > 0;

      return {
        registered: isRegistered,
        webhook: isRegistered
          ? {
              id: webhooks[0].id,
              url: webhooks[0].url,
              events: webhooks[0].events,
              status: webhooks[0].isActive ? 'active' : 'inactive',
              createdAt: webhooks[0].createdAt?.toISOString(),
            }
          : null,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        registered: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('register')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Register webhook for service-to-service communication' })
  @ApiBody({
    description: 'Webhook registration data',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Webhook URL to receive notifications' },
        events: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Event types to listen for (required, must include notification.status-update)',
        },
        secret: {
          type: 'string',
          description: 'Webhook secret for signature verification (optional)',
        },
        description: { type: 'string', description: 'Webhook description (optional)' },
        name: { type: 'string', description: 'Webhook name (optional)' },
      },
      required: ['url', 'events'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Webhook registered successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'X-Service-Name header or Bearer token is required',
  })
  async registerWebhook(@Body() registerDto: RegisterWebhookDto, @Req() req: any): Promise<any> {
    try {
      // Validate events - must include notification.status-update
      const validEvents = [
        'notification.sent',
        'notification.delivered',
        'notification.failed',
        'notification.read',
        'notification.status-update',
        'notification.bounced',
        'notification.clicked',
        'notification.dismissed',
      ];

      const invalidEvents = registerDto.events.filter((e) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        throw new BadRequestException(`Invalid event types: ${invalidEvents.join(', ')}`);
      }

      if (!registerDto.events.includes('notification.status-update')) {
        throw new BadRequestException('Events must include notification.status-update');
      }

      // Check for duplicate URL
      const existingWebhooks = await this.webhookService.getWebhooks({ url: registerDto.url });
      if (existingWebhooks && existingWebhooks.length > 0) {
        throw new ConflictException('Webhook with this URL already exists');
      }

      const serviceName = req.serviceName || req.user?.id || 'system';
      const webhookName = registerDto.name || `${serviceName}-webhook-${Date.now()}`;

      const createDto: CreateWebhookDto = {
        name: webhookName,
        url: registerDto.url,
        events: registerDto.events,
        secret: registerDto.secret,
      };

      const webhook = await this.webhookService.createWebhook(createDto, serviceName);

      return {
        success: true,
        webhookId: webhook.id,
        message: 'Webhook registered successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error.status) {
        throw error;
      }
      throw new BadRequestException(`Failed to register webhook: ${error.message}`);
    }
  }

  @Delete('register/:webhookId')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Delete webhook by ID (Service-to-Service)' })
  @ApiParam({ name: 'webhookId', description: 'Webhook ID to delete' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Webhook not found',
  })
  async deleteWebhookById(@Param('webhookId') webhookId: string): Promise<any> {
    try {
      const webhook = await this.webhookService.getWebhookById(webhookId);
      if (!webhook) {
        throw new NotFoundException('Webhook not found');
      }

      await this.webhookService.deleteWebhook(webhookId);

      return {
        success: true,
        message: 'Webhook deleted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error.status) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete webhook: ${error.message}`);
    }
  }

  @Delete('register')
  @UseGuards(ServiceNameOrJwtGuard)
  @ApiOperation({ summary: 'Delete webhook by URL (Service-to-Service)' })
  @ApiQuery({
    name: 'url',
    required: true,
    description: 'Webhook URL to delete (will be URL decoded)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Webhook not found',
  })
  async deleteWebhookByUrl(@Query('url') url: string): Promise<any> {
    try {
      const decodedUrl = decodeURIComponent(url);
      const webhooks = await this.webhookService.getWebhooks({ url: decodedUrl });

      if (!webhooks || webhooks.length === 0) {
        throw new NotFoundException('Webhook not found');
      }

      // Delete all webhooks with this URL (should be only one, but handle multiple)
      for (const webhook of webhooks) {
        await this.webhookService.deleteWebhook(webhook.id!);
      }

      return {
        success: true,
        message: 'Webhook deleted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error.status) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete webhook: ${error.message}`);
    }
  }
}
