import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CategoryMember,
  CategoryMemberDocument,
} from '../../../infrastructure/database/schemas/category-member.schema';
import { NovuClient } from '../../../infrastructure/external/novu/novu.client';
import { createId } from '@paralleldrive/cuid2';

@Injectable()
export class CategoryMemberService {
  private readonly logger = new Logger(CategoryMemberService.name);

  constructor(
    @InjectModel(CategoryMember.name)
    private readonly categoryMemberModel: Model<CategoryMemberDocument>,
    private readonly novuClient: NovuClient,
  ) {}

  /**
   * Add member to category
   */
  async addMember(categoryId: string, userId: string): Promise<CategoryMemberDocument> {
    // 1. Check if member already exists
    const existing = await this.categoryMemberModel.findOne({
      categoryId,
      userId,
    });

    if (existing) {
      // Update if inactive
      if (!existing.isActive) {
        existing.isActive = true;
        existing.joinedAt = new Date();
        existing.novuSynced = false;
        existing.novuSyncedAt = undefined;
        await existing.save();

        // Sync với Novu
        await this.syncWithNovu(categoryId, userId, existing);
        return existing;
      }
      throw new ConflictException('User is already a member of this category');
    }

    // 2. Create CategoryMember document
    const categoryMember = new this.categoryMemberModel({
      _id: createId(),
      categoryId,
      userId,
      joinedAt: new Date(),
      isActive: true,
      novuSynced: false,
    });

    await categoryMember.save();

    // 3. Sync với Novu Topics
    await this.syncWithNovu(categoryId, userId, categoryMember);

    return categoryMember;
  }

  /**
   * Remove member from category
   */
  async removeMember(categoryId: string, userId: string): Promise<void> {
    // 1. Find member
    const member = await this.categoryMemberModel.findOne({
      categoryId,
      userId,
    });

    if (!member) {
      throw new NotFoundException('User is not a member of this category');
    }

    // 2. Soft delete (set isActive = false)
    member.isActive = false;
    await member.save();

    // 3. Remove from Novu Topics
    const topicKey = `category_${categoryId}`;
    try {
      await this.novuClient.removeSubscriberFromTopic(topicKey, userId);
      this.logger.log(`Member ${userId} removed from Novu topic ${topicKey}`);
    } catch (error) {
      this.logger.warn(`Failed to remove from Novu: ${error.message}`);
      // Không fail operation, chỉ log warning
    }
  }

  /**
   * Get all active members of a category
   */
  async getMembers(
    categoryId: string,
    options?: {
      includeInactive?: boolean;
      excludeUsers?: string[];
    },
  ): Promise<string[]> {
    const query: any = { categoryId };

    if (!options?.includeInactive) {
      query.isActive = true;
    }

    if (options?.excludeUsers && options.excludeUsers.length > 0) {
      query.userId = { $nin: options.excludeUsers };
    }

    const members = await this.categoryMemberModel.find(query).exec();
    return members.map((m) => m.userId);
  }

  /**
   * Get member count (tính động)
   */
  async getMemberCount(categoryId: string, activeOnly: boolean = true): Promise<number> {
    const query: any = { categoryId };
    if (activeOnly) {
      query.isActive = true;
    }

    return this.categoryMemberModel.countDocuments(query);
  }

  /**
   * Check if user is member of category
   */
  async isMember(categoryId: string, userId: string): Promise<boolean> {
    const member = await this.categoryMemberModel.findOne({
      categoryId,
      userId,
      isActive: true,
    });

    return !!member;
  }

  /**
   * Get member document
   */
  async findMember(
    categoryId: string,
    userId: string,
  ): Promise<CategoryMemberDocument | null> {
    return this.categoryMemberModel.findOne({
      categoryId,
      userId,
    });
  }

  /**
   * Get all categories for a user
   */
  async getCategoriesByUser(userId: string): Promise<string[]> {
    const members = await this.categoryMemberModel
      .find({
        userId,
        isActive: true,
      })
      .exec();

    return members.map((m) => m.categoryId);
  }

  /**
   * Bulk add members
   */
  async bulkAddMembers(categoryId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      try {
        await this.addMember(categoryId, userId);
      } catch (error) {
        // Skip duplicates, log others
        if (error.message.includes('already a member')) {
          continue;
        }
        this.logger.warn(`Failed to add member ${userId}: ${error.message}`);
      }
    }
  }

  /**
   * Sync member with Novu Topics
   */
  private async syncWithNovu(
    categoryId: string,
    userId: string,
    member: CategoryMemberDocument,
  ): Promise<void> {
    const topicKey = `category_${categoryId}`;
    try {
      await this.novuClient.addSubscriberToTopic(topicKey, userId);

      // Update sync status
      member.novuSynced = true;
      member.novuSyncedAt = new Date();
      await member.save();

      this.logger.log(`Member ${userId} synced with Novu topic ${topicKey}`);
    } catch (error) {
      this.logger.warn(`Failed to sync with Novu: ${error.message}`);
      // Không fail operation, chỉ log warning
    }
  }
}


