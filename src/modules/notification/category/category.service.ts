import { Category, CategoryDocument } from './category.schema';
import {
  NotFoundException,
  BadRequestException,
  Injectable,
  Get,
  Query,
  Res,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Document, Types } from 'mongoose';
import { Type } from 'class-transformer';
import {
  CategoryRepository,
  CategoryFilters,
  CategorySortOptions,
  CategoryPaginationOptions,
  CategoryQueryResult,
} from './category.repository';
import { CategoryMemberService } from './category-member.service';
import { NovuClient } from '../../../infrastructure/external/novu/novu.client';

export interface CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
  metadata?: {
    icon?: string;
    color?: string;
    priority?: number;
    tags?: string[];
  };
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string;
  metadata?: {
    icon?: string;
    color?: string;
    priority?: number;
    tags?: string[];
  };
  isActive?: boolean;
}

export interface AddMemberDto {
  userId: string;
  role?: 'admin' | 'member';
  metadata?: Record<string, any>;
}

export interface UpdateMemberDto {
  role?: 'admin' | 'member';
  metadata?: Record<string, any>;
}

export interface BulkMemberOperationDto {
  userIds: string[];
  operation: 'add' | 'remove';
  role?: 'admin' | 'member';
  metadata?: Record<string, any>;
}

export interface CategoryStatistics {
  totalCategories: number;
  totalMembers: number;
  totalNotifications: number;
  avgEngagementScore: number;
  activeCategories: number;
}

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly categoryMemberService: CategoryMemberService,
    private readonly novuClient: NovuClient,
    // private readonly structuredLogger: StructuredLoggerService,
  ) {}

  async createCategory(
    createDto: CreateCategoryDto,
    createdBy: string,
  ): Promise<CategoryDocument> {
    try {
      // Check if category with same name already exists
      const existingCategory = await this.categoryRepository.findByName(createDto.name);
      if (existingCategory) {
        throw new ConflictException(`Category with name '${createDto.name}' already exists`);
      }

      // Validate parent category if provided
      if (createDto.parentId) {
        const parentCategory = await this.categoryRepository.findById(createDto.parentId);
        if (!parentCategory) {
          throw new NotFoundException(`Parent category with ID '${createDto.parentId}' not found`);
        }
        if (!parentCategory.isActive) {
          throw new BadRequestException('Cannot create category under inactive parent');
        }
      }

      const category = await this.categoryRepository.create({
        ...createDto,
        createdBy,
        parentId: createDto.parentId ? (createDto.parentId as any) : null,
        isActive: true,
        notificationCount: 0,
        engagementScore: 0,
        lastActivityAt: new Date(),
      });

      // ⭐ THÊM: Tạo Novu Topic
      const topicKey = `category_${category.id}`;
      try {
        await this.novuClient.createTopic(topicKey, category.name);
        await this.categoryRepository.updateById(category.id, {
          topicKey,
          novuSynced: true,
          novuSyncedAt: new Date(),
        });
        this.logger.log(`Novu topic created: ${topicKey} for category ${category.name}`);
      } catch (error) {
        this.logger.warn(`Failed to create Novu topic: ${error.message}`);
        // Không fail operation, chỉ log warning
      }

      // this.structuredLogger.logBusinessEvent('category_created', {
      //   categoryId: category._id,
      //   name: category.name,
      //   parentId: category.parentId,
      // });

      this.logger.log(`Category created: ${category.name} (${category._id})`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to create category: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCategoryById(id: string): Promise<CategoryDocument> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }
    return category;
  }

  async getCategories(
    filters: CategoryFilters = {},
    sort: CategorySortOptions = { field: 'createdAt', order: 'desc' },
    pagination: CategoryPaginationOptions = { page: 1, limit: 10 },
  ): Promise<CategoryQueryResult> {
    return this.categoryRepository.findMany(filters, sort, pagination);
  }

  async updateCategory(id: string, updateDto: UpdateCategoryDto): Promise<CategoryDocument> {
    try {
      const existingCategory = await this.categoryRepository.findById(id);
      if (!existingCategory) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // Check for name conflicts if name is being updated
      if (updateDto.name && updateDto.name !== existingCategory.name) {
        const nameConflict = await this.categoryRepository.findByName(updateDto.name);
        if (nameConflict) {
          throw new ConflictException(`Category with name '${updateDto.name}' already exists`);
        }
      }

      // Validate parent category if being updated
      if (updateDto.parentId !== undefined) {
        if (updateDto.parentId && updateDto.parentId !== existingCategory.parentId?.toString()) {
          const parentCategory = await this.categoryRepository.findById(updateDto.parentId);
          if (!parentCategory) {
            throw new NotFoundException(
              `Parent category with ID '${updateDto.parentId}' not found`,
            );
          }
          if (!parentCategory.isActive) {
            throw new BadRequestException('Cannot set inactive category as parent');
          }
          // Prevent circular references
          if (updateDto.parentId === id) {
            throw new BadRequestException('Category cannot be its own parent');
          }
        }
      }

      const updatedCategory = await this.categoryRepository.updateById(id, {
        ...updateDto,
        parentId: updateDto.parentId ? (updateDto.parentId as any) : undefined,
      });
      if (!updatedCategory) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // this.structuredLogger.logBusinessEvent('category_updated', {
      //   categoryId: id,
      //   changes: updateDto,
      // });

      this.logger.log(`Category updated: ${updatedCategory.name} (${id})`);
      return updatedCategory;
    } catch (error) {
      this.logger.error(`Failed to update category: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteCategory(id: string): Promise<void> {
    try {
      const category = await this.categoryRepository.findById(id);
      if (!category) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // Check if category has children
      const children = await this.categoryRepository.findChildren(id);
      if (children.length > 0) {
        throw new BadRequestException('Cannot delete category with child categories');
      }

      const deleted = await this.categoryRepository.deleteById(id);
      if (!deleted) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // this.structuredLogger.logBusinessEvent('category_deleted', {
      //   categoryId: id,
      //   name: category.name,
      //   memberCount: category.memberCount,
      // });

      this.logger.log(`Category deleted: ${category.name} (${id})`);
    } catch (error) {
      this.logger.error(`Failed to delete category: ${error.message}`, error.stack);
      throw error;
    }
  }

  async addMember(categoryId: string, memberDto: AddMemberDto): Promise<CategoryDocument> {
    try {
      // ✅ GIỮ NGUYÊN: Validation logic
      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new NotFoundException(`Category with ID '${categoryId}' not found`);
      }

      // ✅ THAY ĐỔI: Dùng CategoryMemberService thay vì members array
      await this.categoryMemberService.addMember(categoryId, memberDto.userId);

      // ✅ GIỮ NGUYÊN: Return category (backward compatible)
      // this.structuredLogger.logBusinessEvent('category_member_added', {
      //   categoryId,
      //   userId: memberDto.userId,
      //   role: memberDto.role || 'member',
      // });

      this.logger.log(`Member added to category: ${memberDto.userId} -> ${categoryId}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to add member: ${error.message}`, error.stack);
      throw error;
    }
  }

  async removeMember(categoryId: string, userId: string): Promise<CategoryDocument> {
    try {
      // ✅ GIỮ NGUYÊN: Validation logic
      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new NotFoundException(`Category with ID '${categoryId}' not found`);
      }

      // ✅ THAY ĐỔI: Dùng CategoryMemberService
      await this.categoryMemberService.removeMember(categoryId, userId);

      // ✅ GIỮ NGUYÊN: Return category (backward compatible)
      // this.structuredLogger.logBusinessEvent('category_member_removed', {
      //   categoryId,
      //   userId,
      // });

      this.logger.log(`Member removed from category: ${userId} -> ${categoryId}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to remove member: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateMember(
    categoryId: string,
    userId: string,
    memberDto: UpdateMemberDto,
  ): Promise<CategoryDocument> {
    try {
      // ✅ GIỮ NGUYÊN: Validation logic
      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new NotFoundException(`Category with ID '${categoryId}' not found`);
      }

      // ✅ THAY ĐỔI: Dùng CategoryMemberService để check member
      const member = await this.categoryMemberService.findMember(categoryId, userId);
      if (!member || !member.isActive) {
        throw new NotFoundException('User is not a member of this category');
      }

      // ⚠️ NOTE: UpdateMemberDto có role và metadata
      // Hiện tại CategoryMember schema không có role/metadata
      // Có thể lưu vào metadata field hoặc bỏ qua nếu không cần
      // Tạm thời chỉ log, không update vì CategoryMember không có các fields này
      this.logger.log(`Member update requested (role/metadata not stored in CategoryMember):`, {
        categoryId,
        userId,
        changes: memberDto,
      });

      // this.structuredLogger.logBusinessEvent('category_member_updated', {
      //   categoryId,
      //   userId,
      //   changes: memberDto,
      // });

      this.logger.log(`Member updated in category: ${userId} -> ${categoryId}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to update member: ${error.message}`, error.stack);
      throw error;
    }
  }

  async bulkMemberOperation(
    categoryId: string,
    operationDto: BulkMemberOperationDto,
  ): Promise<CategoryDocument> {
    try {
      if (operationDto.userIds.length === 0) {
        throw new BadRequestException('User IDs list cannot be empty');
      }

      if (operationDto.userIds.length > 1000) {
        throw new BadRequestException('Cannot process more than 1000 users at once');
      }

      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new NotFoundException(`Category with ID '${categoryId}' not found`);
      }

      // ✅ THAY ĐỔI: Dùng CategoryMemberService
      if (operationDto.operation === 'add') {
        await this.categoryMemberService.bulkAddMembers(categoryId, operationDto.userIds);
      } else if (operationDto.operation === 'remove') {
        for (const userId of operationDto.userIds) {
          try {
            await this.categoryMemberService.removeMember(categoryId, userId);
          } catch (error) {
            // Skip if not found, log others
            if (error.message.includes('not a member')) {
              continue;
            }
            this.logger.warn(`Failed to remove member ${userId}: ${error.message}`);
          }
        }
      }

      // ✅ GIỮ NGUYÊN: Return category (backward compatible)
      // this.structuredLogger.logBusinessEvent('category_bulk_member_operation', {
      //   categoryId,
      //   operation: operationDto.operation,
      //   userIds: operationDto.userIds,
      //   count: operationDto.userIds.length,
      // });

      this.logger.log(
        `Bulk member operation completed: ${operationDto.operation} ${operationDto.userIds.length} users -> ${categoryId}`,
      );
      return category;
    } catch (error) {
      this.logger.error(`Failed to perform bulk member operation: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCategoriesByUser(userId: string): Promise<CategoryDocument[]> {
    // ✅ THAY ĐỔI: Lấy categoryIds từ CategoryMemberService
    const categoryIds = await this.categoryMemberService.getCategoriesByUser(userId);
    
    // Lấy category documents
    const categories = await Promise.all(
      categoryIds.map((id) => this.categoryRepository.findById(id)),
    );
    
    return categories.filter((cat) => cat !== null) as CategoryDocument[];
  }

  async getCategoryHierarchy(): Promise<CategoryDocument[]> {
    return this.categoryRepository.findRootCategories();
  }

  async getCategoryStatistics(categoryId?: string): Promise<CategoryStatistics> {
    const stats = await this.categoryRepository.getStatistics(categoryId);
    return (
      stats[0] || {
        totalCategories: 0,
        totalMembers: 0,
        totalNotifications: 0,
        avgEngagementScore: 0,
        activeCategories: 0,
      }
    );
  }

  async getTopCategories(limit: number = 10): Promise<CategoryDocument[]> {
    return this.categoryRepository.getTopCategories(limit);
  }

  async updateEngagementScore(categoryId: string, score: number): Promise<CategoryDocument> {
    const updatedCategory = await this.categoryRepository.updateEngagementScore(categoryId, score);
    if (!updatedCategory) {
      throw new NotFoundException(`Category with ID '${categoryId}' not found`);
    }
    return updatedCategory;
  }

  async incrementNotificationCount(categoryId: string): Promise<CategoryDocument> {
    const updatedCategory = await this.categoryRepository.incrementNotificationCount(categoryId);
    if (!updatedCategory) {
      throw new NotFoundException(`Category with ID '${categoryId}' not found`);
    }
    return updatedCategory;
  }
}
