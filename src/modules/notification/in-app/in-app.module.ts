import { Module } from '@nestjs/common';
import { InAppController } from './in-app.controller';
import { InAppService } from './in-app.service';
import { InAppGateway } from './in-app.gateway';
import { WebSocketConnectionManager } from './websocket-connection.manager';
import { NovuModule } from '../../../infrastructure/external/novu/novu.module';

@Module({
  imports: [NovuModule],
  controllers: [InAppController],
  providers: [InAppService, InAppGateway, WebSocketConnectionManager],
  exports: [InAppService],
})
export class InAppModule {}

