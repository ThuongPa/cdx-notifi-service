import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class ServiceNameOrJwtGuard implements CanActivate {
  private readonly allowedServices = [
    'cdx-loaphuong',
    'cdx-task',
    'cdx-payment',
    'cdx-booking',
    'cdx-auth',
    'cdx-notifi-service',
  ];

  private readonly jwtGuard = new JwtAuthGuard();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const serviceName = request.headers['x-service-name'];
    const authHeader = request.headers.authorization;

    // Try JWT authentication first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwtResult = this.jwtGuard.canActivate(context);
        const result = jwtResult instanceof Promise ? await jwtResult : jwtResult;
        if (result) {
          return true;
        }
      } catch (error) {
        // JWT validation failed, continue to service name check
      }
    }

    // Try service name authentication
    if (serviceName) {
      const normalizedServiceName = serviceName.toLowerCase().trim();
      const isAllowed = this.allowedServices.some(
        (allowed) => allowed.toLowerCase() === normalizedServiceName,
      );

      if (isAllowed) {
        request.serviceName = normalizedServiceName;
        return true;
      }

      throw new UnauthorizedException(`Service '${serviceName}' is not authorized`);
    }

    // Neither JWT nor service name provided
    throw new UnauthorizedException('X-Service-Name header or Bearer token is required');
  }
}

