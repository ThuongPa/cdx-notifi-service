import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserPreferencesDocument = UserPreferences & Document;

@Schema({ timestamps: true })
export class UserPreferences {
  @Prop({ required: true })
  userId: string;

  @Prop({ type: Object, required: true })
  channelPreferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
    inApp: boolean;
    webhook: boolean;
  };

  @Prop({ type: Object, required: true })
  typePreferences: {
    payment: boolean;
    order: boolean;
    promotion: boolean;
    system: boolean;
    security: boolean;
    emergency: boolean;
    booking: boolean;
    announcement: boolean;
  };

  @Prop({ type: Object, required: true })
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
    days: number[];
  };
}

export const UserPreferencesSchema = SchemaFactory.createForClass(UserPreferences);

// Add indexes
UserPreferencesSchema.index({ userId: 1 }, { unique: true });
