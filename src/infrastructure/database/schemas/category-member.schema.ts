import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryMemberDocument = CategoryMember & Document;

@Schema({ timestamps: true })
export class CategoryMember {
  @Prop({ required: true })
  _id: string; // CUID

  @Prop({ required: true, ref: 'Category' })
  categoryId: string;

  @Prop({ required: true, ref: 'User' })
  userId: string;

  @Prop({ default: Date.now })
  joinedAt: Date;

  @Prop({ default: true })
  isActive: boolean;

  // ⭐ THÊM: Sync status với Novu
  @Prop({ default: false })
  novuSynced?: boolean;

  @Prop({ type: Date })
  novuSyncedAt?: Date;
}

export const CategoryMemberSchema = SchemaFactory.createForClass(CategoryMember);

// Indexes
CategoryMemberSchema.index({ categoryId: 1 });
CategoryMemberSchema.index({ userId: 1 });
CategoryMemberSchema.index({ isActive: 1 });
CategoryMemberSchema.index({ joinedAt: 1 });

// Compound indexes for performance
CategoryMemberSchema.index({ categoryId: 1, userId: 1 }, { unique: true });
CategoryMemberSchema.index({ userId: 1, isActive: 1 });
CategoryMemberSchema.index({ categoryId: 1, isActive: 1 });

// ⭐ THÊM: Indexes cho sync status
CategoryMemberSchema.index({ novuSynced: 1 });
CategoryMemberSchema.index({ categoryId: 1, novuSynced: 1 });
