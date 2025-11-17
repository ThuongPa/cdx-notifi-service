import { Module } from '@nestjs/common';
import { InAppController } from './in-app.controller';
import { InAppService } from './in-app.service';
import { NovuModule } from '../../../infrastructure/external/novu/novu.module';

@Module({
  imports: [NovuModule],
  controllers: [InAppController],
  providers: [InAppService],
  exports: [InAppService],
})
export class InAppModule {}

