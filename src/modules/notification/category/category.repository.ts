import { Injectable, Delete, Query, Res } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Category, CategoryDocument } from './category.schema';
import { Model, Document, Types } from 'mongoose';
import { Type } from 'class-transformer';


export interface CategoryFilters {
  name?: string;
  parentId?: string;
  isActive?: boolean;
  userId?: string;
  search?: string;
}

export interface CategorySortOptions {
  field: 'name' | 'createdAt' | 'lastActivityAt' | 'engagementScore' | 'memberCount';
  order: 'asc' | 'desc';
}

export interface CategoryPaginationOptions {
  page: number;
  limit: number;
}

export interface CategoryQueryResult {
  categories: CategoryDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CategoryRepository {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async create(categoryData: Partial<Category>): Promise<CategoryDocument> {
    const category = new this.categoryModel(categoryData);
    return category.save();
  }

  async findById(id: string): Promise<CategoryDocument | null> {
    return this.categoryModel.findById(id).exec();
  }

  async findByName(name: string): Promise<CategoryDocument | null> {
    return this.categoryModel.findOne({ name }).exec();
  }

  async findMany(
    filters: CategoryFilters = {},
    sort: CategorySortOptions = { field: 'createdAt', order: 'desc' },
    pagination: CategoryPaginationOptions = { page: 1, limit: 10 },
  ): Promise<CategoryQueryResult> {
    const query = this.buildQuery(filters);
    const sortOptions = this.buildSortOptions(sort);
    const skip = (pagination.page - 1) * pagination.limit;

    const [categories, total] = await Promise.all([
      this.categoryModel
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(pagination.limit)
        .populate('parentId', 'name')
        .exec(),
      this.categoryModel.countDocuments(query),
    ]);

    return {
      categories,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async updateById(id: string, updateData: Partial<Category>): Promise<CategoryDocument | null> {
    return this.categoryModel
      .findByIdAndUpdate(id, { ...updateData, updatedAt: new Date() }, { new: true })
      .exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.categoryModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // ❌ XÓA: Các methods này đã được thay thế bởi CategoryMemberService
  // - addMember() → CategoryMemberService.addMember()
  // - removeMember() → CategoryMemberService.removeMember()
  // - updateMember() → Không còn cần thiết (CategoryMember không có role/metadata)
  // - findMember() → CategoryMemberService.findMember()
  // - findCategoriesByUser() → CategoryMemberService.getCategoriesByUser()

  async findChildren(parentId: string): Promise<CategoryDocument[]> {
    return this.categoryModel.find({ parentId }).exec();
  }

  async findRootCategories(): Promise<CategoryDocument[]> {
    return this.categoryModel.find({ parentId: null, isActive: true }).exec();
  }

  async updateEngagementScore(categoryId: string, score: number): Promise<CategoryDocument | null> {
    return this.categoryModel
      .findByIdAndUpdate(
        categoryId,
        {
          engagementScore: score,
          lastActivityAt: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async incrementNotificationCount(categoryId: string): Promise<CategoryDocument | null> {
    return this.categoryModel
      .findByIdAndUpdate(
        categoryId,
        {
          $inc: { notificationCount: 1 },
          lastActivityAt: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async getStatistics(categoryId?: string): Promise<any> {
    const matchStage = categoryId ? { _id: new Types.ObjectId(categoryId) } : {};

    return this.categoryModel
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalCategories: { $sum: 1 },
            totalMembers: { $sum: '$memberCount' },
            totalNotifications: { $sum: '$notificationCount' },
            avgEngagementScore: { $avg: '$engagementScore' },
            activeCategories: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] },
            },
          },
        },
      ])
      .exec();
  }

  async getTopCategories(limit: number = 10): Promise<CategoryDocument[]> {
    return this.categoryModel
      .find({ isActive: true })
      .sort({ engagementScore: -1, memberCount: -1 })
      .limit(limit)
      .exec();
  }

  private buildQuery(filters: CategoryFilters): any {
    const query: any = {};

    if (filters.name) {
      query.name = { $regex: filters.name, $options: 'i' };
    }

    if (filters.parentId) {
      query.parentId = filters.parentId === 'null' ? null : new Types.ObjectId(filters.parentId);
    }

    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters.userId) {
      query['members.userId'] = filters.userId;
    }

    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return query;
  }

  private buildSortOptions(sort: CategorySortOptions): any {
    const order = sort.order === 'asc' ? 1 : -1;
    return { [sort.field]: order };
  }
}
