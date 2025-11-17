import { Injectable, Logger } from '@nestjs/common';

export interface BaseEventDto {
  eventId?: string;
  eventType: string;
  aggregateId?: string;
  aggregateType?: string;
  timestamp?: Date | string;
  payload: any;
  correlationId?: string;
  metadata?: any;
}

@Injectable()
export abstract class BaseEventHandler {
  protected readonly logger = new Logger(this.constructor.name);

  abstract getEventType(): string;

  abstract handle(event: BaseEventDto): Promise<void>;

  protected logEventProcessing(event: BaseEventDto, action: string) {
    this.logger.log(`Processing ${this.getEventType()} event`, {
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      action,
    });
  }

  protected logEventError(event: BaseEventDto, error: unknown, action: string) {
    this.logger.error(`Error processing ${this.getEventType()} event`, {
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
