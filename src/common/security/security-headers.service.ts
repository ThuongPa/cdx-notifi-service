import { Injectable, Res } from '@nestjs/common';
import { Type } from 'class-transformer';

@Injectable()
export class SecurityHeadersService {
  getSecurityHeaders(): Record<string, string> {
    return {
      // Prevent clickjacking
      'X-Frame-Options': 'DENY',

      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',

      // Enable XSS protection
      'X-XSS-Protection': '1; mode=block',

      // Referrer policy
      'Referrer-Policy': 'strict-origin-when-cross-origin',

      // Content Security Policy
      'Content-Security-Policy': this.getCSP(),

      // Strict Transport Security (HTTPS only)
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

      // Permissions Policy
      'Permissions-Policy': this.getPermissionsPolicy(),

      // Cross-Origin policies
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
  }

  private getCSP(): string {
    const directives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for Swagger UI
      "style-src 'self' 'unsafe-inline'", // Allow inline styles for Swagger UI
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ];

    return directives.join('; ');
  }

  private getPermissionsPolicy(): string {
    const policies = [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'battery=()',
      'bluetooth=()',
      'display-capture=()',
      'fullscreen=(self)',
      'gamepad=()',
      'midi=()',
      'nfc=()',
      'notifications=()',
      'persistent-storage=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'speaker-selection=()',
      'sync-xhr=()',
      'web-share=()',
      'xr-spatial-tracking=()',
    ];

    return policies.join(', ');
  }

  getCORSHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Requested-With, X-Correlation-ID, X-Service-Name',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400', // 24 hours
    };
  }

  getCacheControlHeaders(): Record<string, string> {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    };
  }

  getAPIHeaders(): Record<string, string> {
    return {
      'X-API-Version': '1.0.0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    };
  }
}
