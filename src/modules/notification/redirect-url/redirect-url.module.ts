import { Module } from '@nestjs/common';
import { RedirectUrlService } from './redirect-url.service';

@Module({
  providers: [RedirectUrlService],
  exports: [RedirectUrlService],
})
export class RedirectUrlModule {}

