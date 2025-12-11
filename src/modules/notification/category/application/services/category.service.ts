import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  ConflictException,
} from '@nestjs/common';
import { Category } from '../../domain/category.entity';
import { CategoryRepository } from '../../infrastructure/category.repository';
import { CategoryMemberService } from '../../category-member.service';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';

export interface CreateCategoryDto {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  metadata?: Record<string, any>;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  metadata?: Record<string, any>;
}

export interface CategoryQuery {
  search?: string;
  parentId?: string;
  isActive?: boolean;
  createdBy?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @Inject('CategoryRepository') private readonly categoryRepository: CategoryRepository,
    private readonly categoryMemberService: CategoryMemberService,
    private readonly novuClient: NovuClient,
  ) {}

  async createCategory(dto: CreateCategoryDto, createdBy: string): Promise<Category> {
    this.logger.log(`Creating category: ${dto.name}`);

    try {
      // Check if category with same name already exists
      const existingCategory = await this.categoryRepository.findByName(dto.name);
      if (existingCategory) {
        throw new ConflictException(`Category with name '${dto.name}' already exists`);
      }

      // Validate parent category if provided
      if (dto.parentId) {
        const parentCategory = await this.categoryRepository.findById(dto.parentId);
        if (!parentCategory) {
          throw new NotFoundException(`Parent category with ID '${dto.parentId}' not found`);
        }
        if (!parentCategory.isActive) {
          throw new BadRequestException('Cannot create subcategory under inactive parent category');
        }
      }

      const category = Category.create({
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        isActive: true,
        parentId: dto.parentId,
        metadata: dto.metadata,
        createdBy,
      });

      const savedCategory = await this.categoryRepository.save(category);

      // ⭐ THÊM: Tạo Novu Topic
      const topicKey = `category_${savedCategory.id}`;
      try {
        await this.novuClient.createTopic(topicKey, savedCategory.name);
        this.logger.log(`Novu topic created: ${topicKey} for category ${savedCategory.name}`);
      } catch (error) {
        this.logger.warn(`Failed to create Novu topic: ${error.message}`);
        // Không fail operation, chỉ log warning
      }

      // Update parent category to include this child
      if (dto.parentId) {
        const parentCategory = await this.categoryRepository.findById(dto.parentId);
        if (parentCategory) {
          parentCategory.addChild(savedCategory.id);
          await this.categoryRepository.save(parentCategory);
        }
      }

      this.logger.log(`Category created: ${savedCategory.name} (${savedCategory.id})`);
      return savedCategory;
    } catch (error) {
      this.logger.error(`Failed to create category: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCategories(
    query: CategoryQuery = {},
  ): Promise<{ categories: Category[]; total: number; page: number; limit: number }> {
    return await this.categoryRepository.findMany(query);
  }

  async getCategoryById(id: string): Promise<Category> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }
    return category;
  }

  async getCategoryByName(name: string): Promise<Category | null> {
    return await this.categoryRepository.findByName(name);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.getCategoryById(id);

    // Check if new name already exists (if name is being changed)
    if (dto.name && dto.name !== category.name) {
      const existingCategory = await this.categoryRepository.findByName(dto.name);
      if (existingCategory && existingCategory.id !== id) {
        throw new ConflictException(`Category with name '${dto.name}' already exists`);
      }
    }

    // Validate parent category if changing
    if (dto.parentId !== undefined && dto.parentId !== category.parentId) {
      if (dto.parentId) {
        const parentCategory = await this.categoryRepository.findById(dto.parentId);
        if (!parentCategory) {
          throw new BadRequestException(`Parent category with ID '${dto.parentId}' not found`);
        }
        if (!parentCategory.isActive) {
          throw new BadRequestException('Cannot set inactive category as parent');
        }
        if (dto.parentId === id) {
          throw new BadRequestException('Category cannot be its own parent');
        }
      }

      // Update parent relationships
      if (category.parentId) {
        const oldParent = await this.categoryRepository.findById(category.parentId);
        if (oldParent) {
          oldParent.removeChild(id);
          await this.categoryRepository.save(oldParent);
        }
      }

      if (dto.parentId) {
        const newParent = await this.categoryRepository.findById(dto.parentId);
        if (newParent) {
          newParent.addChild(id);
          await this.categoryRepository.save(newParent);
        }
      }
    }

    category.updateContent(dto);
    return await this.categoryRepository.save(category);
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.getCategoryById(id);

    // Check if category has children
    const children = await this.getCategoryChildren(id);
    if (children && children.length > 0) {
      throw new BadRequestException(
        'Cannot delete category with subcategories. Please delete subcategories first.',
      );
    }

    // Remove from parent's children list
    if (category.parentId) {
      const parent = await this.categoryRepository.findById(category.parentId);
      if (parent) {
        parent.removeChild(id);
        await this.categoryRepository.save(parent);
      }
    }

    await this.categoryRepository.delete(id);
    this.logger.log(`Category deleted: ${category.name} (${category.id})`);
  }

  async activateCategory(id: string): Promise<Category> {
    const category = await this.getCategoryById(id);
    category.activate();
    return await this.categoryRepository.save(category);
  }

  async deactivateCategory(id: string): Promise<Category> {
    const category = await this.getCategoryById(id);
    category.deactivate();
    return await this.categoryRepository.save(category);
  }

  async getCategoryTree(): Promise<Category[]> {
    return await this.categoryRepository.findTree();
  }

  async getCategoryChildren(id: string): Promise<Category[]> {
    const category = await this.getCategoryById(id);
    const children = await Promise.all(
      category.children.map((childId) => this.categoryRepository.findById(childId)),
    );
    return children.filter((child) => child !== null) as Category[];
  }

  async getCategoryPath(id: string): Promise<Category[]> {
    const path: Category[] = [];
    let current: Category | null = await this.getCategoryById(id);

    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = await this.categoryRepository.findById(current.parentId);
      } else {
        current = null;
      }
    }

    return path;
  }

  async moveCategory(id: string, newParentId: string | null): Promise<Category> {
    const category = await this.getCategoryById(id);

    if (newParentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    // Validate new parent
    if (newParentId) {
      const newParent = await this.categoryRepository.findById(newParentId);
      if (!newParent) {
        throw new BadRequestException(`Parent category with ID '${newParentId}' not found`);
      }
      if (!newParent.isActive) {
        throw new BadRequestException('Cannot move category under inactive parent');
      }
    }

    // Remove from current parent
    if (category.parentId) {
      const currentParent = await this.categoryRepository.findById(category.parentId);
      if (currentParent) {
        currentParent.removeChild(id);
        await this.categoryRepository.save(currentParent);
      }
    }

    // Add to new parent
    if (newParentId) {
      const newParent = await this.categoryRepository.findById(newParentId);
      if (newParent) {
        newParent.addChild(id);
        await this.categoryRepository.save(newParent);
      }
    }

    if (newParentId) {
      category.setParent(newParentId);
    } else {
      category.removeParent();
    }
    return await this.categoryRepository.save(category);
  }

  async getCategoryStatistics(id: string): Promise<any> {
    const category = await this.getCategoryById(id);
    const children = await this.getCategoryChildren(id);

    return {
      category: {
        id: category.id,
        name: category.name,
        isActive: category.isActive,
      },
      statistics: {
        totalChildren: children.length,
        activeChildren: children.filter((child) => child.isActive).length,
        inactiveChildren: children.filter((child) => !child.isActive).length,
      },
    };
  }

  async searchCategories(searchTerm: string): Promise<Category[]> {
    return await this.categoryRepository.search(searchTerm);
  }

  async getCategoriesByUser(userId: string): Promise<Category[]> {
    return await this.categoryRepository.findByUser(userId);
  }

  async bulkUpdateCategories(
    updateItems: Array<{ id: string; updates: UpdateCategoryDto }>,
  ): Promise<Category[]> {
    const results: Category[] = [];

    for (const { id, updates } of updateItems) {
      try {
        const updatedCategory = await this.updateCategory(id, updates);
        results.push(updatedCategory);
      } catch (error) {
        this.logger.error(`Failed to update category ${id}: ${error.message}`);
        throw error;
      }
    }

    return results;
  }

  async bulkDeleteCategories(ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.deleteCategory(id);
      } catch (error) {
        this.logger.error(`Failed to delete category ${id}: ${error.message}`);
        throw error;
      }
    }
  }

  async getCategoryHierarchy(): Promise<Category[]> {
    return await this.categoryRepository.findTree();
  }

  async getTopCategories(limit: number = 10): Promise<Category[]> {
    // This would need to be implemented in the repository
    // For now, return empty array as placeholder
    return [];
  }

  async addMember(id: string, memberDto: AddMemberDto): Promise<Category> {
    try {
      const category = await this.getCategoryById(id);
      if (!category) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // Check if user is already a member
      const isMember = await this.categoryMemberService.isMember(id, memberDto.userId);
      if (isMember) {
        throw new ConflictException('User is already a member of this category');
      }

      // ✅ THAY ĐỔI: Dùng CategoryMemberService thay vì members array
      await this.categoryMemberService.addMember(id, memberDto.userId);

      this.logger.log(`Member added to category: ${memberDto.userId} -> ${id}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to add member: ${error.message}`, error.stack);
      throw error;
    }
  }

  async removeMember(id: string, userId: string): Promise<Category> {
    try {
      const category = await this.getCategoryById(id);
      if (!category) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // Check if user is a member
      const isMember = await this.categoryMemberService.isMember(id, userId);
      if (!isMember) {
        throw new NotFoundException('User is not a member of this category');
      }

      // ✅ THAY ĐỔI: Dùng CategoryMemberService
      await this.categoryMemberService.removeMember(id, userId);

      this.logger.log(`Member removed from category: ${userId} -> ${id}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to remove member: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateMember(id: string, userId: string, memberDto: UpdateMemberDto): Promise<Category> {
    try {
      const category = await this.getCategoryById(id);
      if (!category) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // Check if user is a member
      const isMember = await this.categoryMemberService.isMember(id, userId);
      if (!isMember) {
        throw new NotFoundException('User is not a member of this category');
      }

      // ⚠️ NOTE: UpdateMemberDto có role và metadata
      // Hiện tại CategoryMember schema không có role/metadata
      // Tạm thời chỉ log, không update vì CategoryMember không có các fields này
      this.logger.log(`Member update requested (role/metadata not stored in CategoryMember):`, {
        categoryId: id,
        userId,
        changes: memberDto,
      });

      return category;
    } catch (error) {
      this.logger.error(`Failed to update member: ${error.message}`, error.stack);
      throw error;
    }
  }

  async bulkMemberOperation(id: string, operationDto: BulkMemberOperationDto): Promise<Category> {
    try {
      if (operationDto.userIds.length === 0) {
        throw new BadRequestException('User IDs list cannot be empty');
      }

      if (operationDto.userIds.length > 1000) {
        throw new BadRequestException('Cannot process more than 1000 users at once');
      }

      const category = await this.getCategoryById(id);
      if (!category) {
        throw new NotFoundException(`Category with ID '${id}' not found`);
      }

      // ✅ THAY ĐỔI: Dùng CategoryMemberService
      if (operationDto.operation === 'add') {
        await this.categoryMemberService.bulkAddMembers(id, operationDto.userIds);
      } else if (operationDto.operation === 'remove') {
        for (const userId of operationDto.userIds) {
          try {
            await this.categoryMemberService.removeMember(id, userId);
          } catch (error) {
            // Skip if not found, log others
            if (error.message && error.message.includes('not a member')) {
              continue;
            }
            this.logger.warn(`Failed to remove member ${userId}: ${error.message}`);
          }
        }
      }

      this.logger.log(
        `Bulk member operation completed: ${operationDto.operation} for ${operationDto.userIds.length} users`,
      );
      return category;
    } catch (error) {
      this.logger.error(`Failed to perform bulk member operation: ${error.message}`, error.stack);
      throw error;
    }
  }

  async incrementNotificationCount(categoryId: string): Promise<Category> {
    const category = await this.getCategoryById(categoryId);
    category.incrementNotificationCount();
    return await this.categoryRepository.save(category);
  }

  async updateEngagementScore(categoryId: string, score: number): Promise<Category> {
    const category = await this.getCategoryById(categoryId);
    category.updateEngagementScore(score);
    return await this.categoryRepository.save(category);
  }
}
