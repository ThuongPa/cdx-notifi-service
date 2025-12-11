import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ServiceNameGuard implements CanActivate {
  private readonly allowedServices: string[] = [
    'cdx-loaphuong',
    'cdx-task',
    'cdx-payment',
    'cdx-booking',
    // Add more services as needed
  ];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceName = request.headers['x-service-name'] || request.headers['X-Service-Name'];

    if (!serviceName) {
      throw new UnauthorizedException('Missing X-Service-Name header');
    }

    if (!this.allowedServices.includes(serviceName)) {
      throw new UnauthorizedException(`Invalid service name: ${serviceName}`);
    }

    // Set service name in request for later use
    request.serviceName = serviceName;

    return true;
  }
}

