import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Hybrid guard that supports both Service-to-Service (X-Service-Name) and User (JWT) authentication
 * Priority: X-Service-Name header first, then fallback to JWT
 */
@Injectable()
export class ServiceNameOrJwtGuard implements CanActivate {
  private readonly allowedServices: string[] = [
    'cdx-loaphuong',
    'cdx-task',
    'cdx-payment',
    'cdx-booking',
    // Add more services as needed
  ];

  private readonly jwtAuthGuard: JwtAuthGuard;

  constructor() {
    // Create instance of JwtAuthGuard (no dependency injection needed)
    this.jwtAuthGuard = new JwtAuthGuard();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check X-Service-Name header first (for service-to-service calls)
    const serviceName = request.headers['x-service-name'] || request.headers['X-Service-Name'];
    if (serviceName) {
      if (!this.allowedServices.includes(serviceName)) {
        throw new UnauthorizedException(`Invalid service name: ${serviceName}`);
      }

      // Set service name in request for later use
      request.serviceName = serviceName;
      request.isServiceCall = true;
      return true; // ✅ Allow service-to-service call
    }

    // Fallback to JWT authentication (for user calls)
    const result = this.jwtAuthGuard.canActivate(context);

    // Handle Observable result
    if (result instanceof Observable) {
      return result.pipe(
        map((value) => {
          if (value) {
            request.isServiceCall = false;
          }
          return value;
        }),
      );
    }

    // Handle Promise result
    if (result instanceof Promise) {
      return result.then((value) => {
        if (value) {
          request.isServiceCall = false;
        }
        return value;
      });
    }

    // Handle boolean result
    if (result) {
      request.isServiceCall = false;
    }
    return result;
  }
}
