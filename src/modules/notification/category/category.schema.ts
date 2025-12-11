import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  color?: string;

  @Prop()
  icon?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  parentId?: string;

  @Prop({ type: [String], default: [] })
  children: string[];

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ required: true })
  createdBy: string;

  // ⭐ THÊM: Novu Topics integration
  @Prop({ unique: true, sparse: true })
  topicKey?: string; // Format: "category_{categoryId}"

  @Prop({ default: false })
  novuSynced?: boolean;

  @Prop({ type: Date })
  novuSyncedAt?: Date;

  // ✅ GIỮ NGUYÊN: Analytics
  @Prop({ default: 0 })
  engagementScore: number;

  @Prop({ default: 0 })
  notificationCount: number;

  @Prop()
  lastActivityAt?: Date;

  // ❌ XÓA: members array (dùng CategoryMember collection thay thế)
  // ❌ XÓA: memberCount (tính động từ CategoryMember)
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// ⭐ THÊM: Indexes cho Novu sync
// Note: topicKey đã có unique index từ @Prop({ unique: true, sparse: true }) nên không cần thêm index ở đây
CategorySchema.index({ novuSynced: 1 });
