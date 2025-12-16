// Polyfill for crypto in Node.js 18
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as any;
}

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RequestLoggingInterceptor } from './infrastructure/logging/request-logging.interceptor';
import { MetricsInterceptor } from './infrastructure/monitoring/metrics.interceptor';
import { SecurityHeadersInterceptor } from './common/security/security-headers.interceptor';
import { RateLimitingGuard } from './common/security/rate-limiting.guard';
import { Get, Logger, ValidationPipe } from '@nestjs/common';
import { Document, Types } from 'mongoose';
import { Type } from 'class-transformer';
import * as helmet from 'helmet';
import * as compression from 'compression';
import { StructuredLoggerService } from './common/services/structured-logger.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Get services for global interceptors
  // const structuredLogger = app.get(StructuredLoggerService);
  // const requestLoggingInterceptor = app.get(RequestLoggingInterceptor);
  // const metricsInterceptor = app.get(MetricsInterceptor);
  // const securityHeadersInterceptor = app.get(SecurityHeadersInterceptor);

  // Global interceptors
  // app.useGlobalInterceptors(
  //   requestLoggingInterceptor,
  //   metricsInterceptor,
  //   securityHeadersInterceptor,
  // );

  // Global guards
  // app.useGlobalGuards(app.get(RateLimitingGuard));

  // Security middleware
  app.use(helmet.default());
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS configuration
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const allowedOrigins =
    corsOrigin === '*' ? '*' : corsOrigin.split(',').map((origin) => origin.trim());

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Correlation-ID',
      'X-Service-Name',
    ],
  });

  // Swagger documentation
  const port = process.env.PORT || 3000;
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const isProduction = process.env.NODE_ENV === 'production';

  const config = new DocumentBuilder()
    .setTitle('CDX Loap Huong Notification Service API')
    .setDescription(
      `
      Comprehensive notification service API for CDX Loap Huong platform.
      
      ## Features
      - Device token management for push notifications
      - Notification history and management
      - User notification preferences
      - Admin broadcast capabilities
      - Retry mechanism for failed notifications
      - Real-time delivery tracking
      
      ## Authentication
      All endpoints require JWT authentication via Bearer token in the Authorization header.
      
      ## Rate Limiting
      - User endpoints: 1000 requests per minute
      - Admin endpoints: 100 requests per minute
      
      ## Error Handling
      All errors follow a consistent format with appropriate HTTP status codes.
    `,
    )
    .setVersion('1.0.0')
    .setContact('CDX Development Team', 'https://cdx.com', 'dev@cdx.com')
    .setLicense('Proprietary', 'https://cdx.com/license')
    .addServer(baseUrl, isProduction ? 'Production server' : 'Development server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from authentication service',
      },
      'bearerAuth',
    )
    .addTag('Health', 'Health check endpoints')
    .addTag('Device Tokens', 'Device token management for push notifications')
    .addTag('Notifications', 'Notification history and management')
    .addTag('Preferences', 'User notification preferences')
    .addTag('Admin', 'Administrative functions (Admin access required)')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      url: '/api/docs-json',
    },
    customSiteTitle: 'CDX Notification Service API',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #1f2937; }
    `,
  });

  await app.listen(port, '0.0.0.0');

  // Log application startup
  // structuredLogger.log('Application started successfully', {
  //   type: 'application_startup',
  //   port,
  //   environment: process.env.NODE_ENV || 'development',
  //   version: process.env.npm_package_version || '1.0.0',
  // });

  logger.log(`Application is running on: ${baseUrl}`);
  logger.log(`Swagger documentation: ${baseUrl}/api/docs`);
  logger.log(`Health check: ${baseUrl}/monitoring/health`);
  logger.log(`Metrics: ${baseUrl}/monitoring/metrics`);
}

bootstrap();
