import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service to resolve redirect URLs for notifications from different services
 * 
 * Supports multiple services like:
 * - loaphuong (loa phường) service → /announcements/{contentId}
 * - task service → /tasks/{contentId}
 * - payment service → /payments/{contentId}
 * - booking service → /bookings/{contentId}
 */
@Injectable()
export class RedirectUrlService {
  private readonly logger = new Logger(RedirectUrlService.name);

  // Default redirect URL patterns from config
  private readonly redirectPatterns: Record<string, string>;

  constructor(private readonly configService: ConfigService) {
    // Load redirect patterns from config
    this.redirectPatterns = this.loadRedirectPatterns();
  }

  /**
   * Load redirect URL patterns from environment variables
   * Format: NOTIFICATION_REDIRECT_LOAPHUONG=/announcements/{contentId}
   */
  private loadRedirectPatterns(): Record<string, string> {
    const patterns: Record<string, string> = {};

    // Get all redirect pattern env vars
    const envVars = process.env;
    for (const [key, value] of Object.entries(envVars)) {
      if (key.startsWith('NOTIFICATION_REDIRECT_') && value) {
        const serviceName = key.replace('NOTIFICATION_REDIRECT_', '').toLowerCase();
        patterns[serviceName] = value;
        this.logger.debug(`Loaded redirect pattern for ${serviceName}: ${value}`);
      }
    }

    // Set default patterns if not configured
    if (Object.keys(patterns).length === 0) {
      patterns['default'] = '/notifications/{contentId}';
      patterns['loaphuong'] = '/announcements/{contentId}';
      patterns['task'] = '/tasks/{contentId}';
      patterns['payment'] = '/payments/{contentId}';
      patterns['booking'] = '/bookings/{contentId}';
      this.logger.warn('No redirect patterns configured, using defaults');
    }

    return patterns;
  }

  /**
   * Resolve redirect URL based on source service and contentId
   * 
   * @param sourceService - Source service name (e.g., 'loaphuong', 'task', 'payment')
   * @param contentId - Content ID from the event
   * @param customRedirectUrl - Optional custom redirect URL (takes priority)
   * @param contentType - Optional content type for more specific routing
   * @returns Resolved redirect URL
   */
  resolveRedirectUrl(
    sourceService?: string,
    contentId?: string,
    customRedirectUrl?: string,
    contentType?: string,
  ): string | undefined {
    // If custom redirect URL is provided, use it directly
    if (customRedirectUrl) {
      this.logger.debug(`Using custom redirect URL: ${customRedirectUrl}`);
      return this.replacePlaceholders(customRedirectUrl, contentId);
    }

    // If no contentId, cannot generate redirect URL
    if (!contentId) {
      this.logger.debug('No contentId provided, skipping redirect URL');
      return undefined;
    }

    // Determine service name
    const serviceName = this.normalizeServiceName(sourceService || 'default');

    // Get pattern for this service
    const pattern = this.redirectPatterns[serviceName] || this.redirectPatterns['default'];

    if (!pattern) {
      this.logger.warn(`No redirect pattern found for service: ${serviceName}`);
      return undefined;
    }

    // Replace placeholders in pattern
    const redirectUrl = this.replacePlaceholders(pattern, contentId, contentType);

    this.logger.debug(`Resolved redirect URL for ${serviceName}: ${redirectUrl}`, {
      sourceService,
      contentId,
      contentType,
    });

    return redirectUrl;
  }

  /**
   * Normalize service name to lowercase
   */
  private normalizeServiceName(serviceName: string): string {
    return serviceName.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Replace placeholders in URL pattern
   * Supports: {contentId}, {contentType}, {id}
   */
  private replacePlaceholders(
    pattern: string,
    contentId?: string,
    contentType?: string,
  ): string {
    let url = pattern;

    // Replace {contentId} or {id}
    if (contentId) {
      url = url.replace(/\{contentId\}/g, contentId);
      url = url.replace(/\{id\}/g, contentId);
    }

    // Replace {contentType}
    if (contentType) {
      url = url.replace(/\{contentType\}/g, contentType);
    }

    return url;
  }

  /**
   * Register or update redirect pattern for a service
   * (Can be extended to support dynamic updates from database)
   */
  registerPattern(serviceName: string, pattern: string): void {
    const normalizedName = this.normalizeServiceName(serviceName);
    this.redirectPatterns[normalizedName] = pattern;
    this.logger.log(`Registered redirect pattern for ${normalizedName}: ${pattern}`);
  }

  /**
   * Get all registered patterns
   */
  getPatterns(): Record<string, string> {
    return { ...this.redirectPatterns };
  }
}

