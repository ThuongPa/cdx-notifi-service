import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WebhookDocument = Webhook & Document;

@Schema({ timestamps: true })
export class Webhook {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  url: string;

  @Prop({ type: [String], required: true })
  events: string[];

  @Prop({ type: Object, default: {} })
  headers?: Record<string, string>;

  @Prop()
  secret?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 30000 })
  timeout: number;

  @Prop({ default: 3 })
  retryCount: number;

  @Prop({ default: 1000 })
  retryDelay: number;

  @Prop({ required: true })
  createdBy: string;
}

export const WebhookSchema = SchemaFactory.createForClass(Webhook);

// Indexes for performance optimization
// Index on url for fast lookups (used in service-to-service registration)
WebhookSchema.index({ url: 1 });

// Index on isActive for filtering active webhooks
WebhookSchema.index({ isActive: 1 });

// Index on createdBy for filtering by creator
WebhookSchema.index({ createdBy: 1 });

// Compound index for common queries: url + isActive (check if webhook exists and is active)
WebhookSchema.index({ url: 1, isActive: 1 });

// Compound index for filtering by creator and sorting by creation date
WebhookSchema.index({ createdBy: 1, createdAt: -1 });

// Index on events array for finding webhooks by event type
WebhookSchema.index({ events: 1 });

// Compound index for active webhooks with specific event type
WebhookSchema.index({ events: 1, isActive: 1 });
