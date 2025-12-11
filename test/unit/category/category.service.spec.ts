import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CategoryService } from '../../../src/modules/notification/category/application/services/category.service';
import { CategoryRepository } from '../../../src/modules/notification/category/category.repository';
import {
  Category,
  CategoryDocument,
} from '../../../src/modules/notification/category/category.schema';
import { StructuredLoggerService } from '../../../src/infrastructure/logging/structured-logger.service';
import { CategoryMemberService } from '../../../src/modules/notification/category/category-member.service';
import { NovuClient } from '../../../src/infrastructure/external/novu/novu.client';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

describe('CategoryService', () => {
  let service: CategoryService;
  let repository: CategoryRepository;
  let categoryModel: Model<CategoryDocument>;
  let structuredLogger: StructuredLoggerService;

  const mockCategory = {
    id: '507f1f77bcf86cd799439011',
    _id: '507f1f77bcf86cd799439011',
    name: 'Test Category',
    description: 'Test Description',
    parentId: null,
    children: [],
    metadata: {
      icon: 'test-icon',
      color: '#FF0000',
      priority: 1,
      tags: ['test', 'category'],
    },
    members: [],
    isActive: true,
    memberCount: 0,
    notificationCount: 0,
    engagementScore: 0,
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    updateContent: jest.fn(function (dto) {
      Object.assign(this, dto);
    }),
    addChild: jest.fn(),
    removeChild: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
  };

  const mockCategoryModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    findMany: jest.fn(),
    updateById: jest.fn(),
    delete: jest.fn(),
    deleteById: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    updateMember: jest.fn(),
    findMember: jest.fn(),
    findCategoriesByUser: jest.fn(),
    findChildren: jest.fn(),
    findRootCategories: jest.fn(),
    getStatistics: jest.fn(),
    getTopCategories: jest.fn(),
    updateEngagementScore: jest.fn(),
    incrementNotificationCount: jest.fn(),
  };

  const mockStructuredLogger = {
    logBusinessEvent: jest.fn(),
  };

  const mockCategoryMemberService = {
    addMember: jest.fn(),
    removeMember: jest.fn(),
    isMember: jest.fn(),
    bulkAddMembers: jest.fn(),
    findMember: jest.fn(),
  };

  const mockNovuClient = {
    createTopic: jest.fn(),
    addSubscriberToTopic: jest.fn(),
    removeSubscriberFromTopic: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: 'CategoryRepository',
          useValue: mockRepository,
        },
        {
          provide: getModelToken(Category.name),
          useValue: mockCategoryModel,
        },
        {
          provide: StructuredLoggerService,
          useValue: mockStructuredLogger,
        },
        {
          provide: CategoryMemberService,
          useValue: mockCategoryMemberService,
        },
        {
          provide: NovuClient,
          useValue: mockNovuClient,
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
    repository = module.get<CategoryRepository>('CategoryRepository');
    categoryModel = module.get<Model<CategoryDocument>>(getModelToken(Category.name));
    structuredLogger = module.get<StructuredLoggerService>(StructuredLoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCategory', () => {
    it('should create a category successfully', async () => {
      const createDto = {
        name: 'Test Category',
        description: 'Test Description',
        metadata: {
          icon: 'test-icon',
          color: '#FF0000',
          priority: 1,
          tags: ['test'],
        },
      };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue(mockCategory);
      mockNovuClient.createTopic.mockResolvedValue(undefined);

      const result = await service.createCategory(createDto, 'user-123');

      expect(mockRepository.findByName).toHaveBeenCalledWith('Test Category');
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockNovuClient.createTopic).toHaveBeenCalled();
      expect(result).toEqual(mockCategory);
      // logBusinessEvent is commented out in implementation
    });

    it('should throw ConflictException if category name already exists', async () => {
      const createDto = {
        name: 'Existing Category',
        description: 'Test Description',
      };

      mockRepository.findByName.mockResolvedValue(mockCategory);

      await expect(service.createCategory(createDto, 'user-123')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if parent category does not exist', async () => {
      const createDto = {
        name: 'Test Category',
        parentId: '507f1f77bcf86cd799439012',
      };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.createCategory(createDto, 'user-123')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if parent category is inactive', async () => {
      const createDto = {
        name: 'Test Category',
        parentId: '507f1f77bcf86cd799439012',
      };

      const inactiveParent = { ...mockCategory, isActive: false };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.findById.mockResolvedValue(inactiveParent);

      await expect(service.createCategory(createDto, 'user-123')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getCategoryById', () => {
    it('should return category if found', async () => {
      mockRepository.findById.mockResolvedValue(mockCategory);

      const result = await service.getCategoryById('507f1f77bcf86cd799439011');

      expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException if category not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.getCategoryById('507f1f77bcf86cd799439011')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateCategory', () => {
    it('should update category successfully', async () => {
      const updateDto = {
        name: 'Updated Category',
        description: 'Updated Description',
      };

      const updatedCategory = { ...mockCategory, ...updateDto };
      mockRepository.findById.mockResolvedValue(mockCategory);
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue(updatedCategory);

      const result = await service.updateCategory('507f1f77bcf86cd799439011', updateDto);

      expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(updatedCategory);
    });

    it('should throw NotFoundException if category not found', async () => {
      const updateDto = { name: 'Updated Category' };

      mockRepository.findById.mockResolvedValue(null);

      await expect(service.updateCategory('507f1f77bcf86cd799439011', updateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepository.updateById).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if new name already exists', async () => {
      const updateDto = { name: 'Existing Category' };
      // Return a category with different ID to trigger conflict
      const existingCategory = {
        ...mockCategory,
        id: 'different-id',
        _id: 'different-id',
        name: 'Existing Category',
      };

      mockRepository.findById.mockResolvedValue(mockCategory);
      mockRepository.findByName.mockResolvedValue(existingCategory);

      await expect(service.updateCategory('507f1f77bcf86cd799439011', updateDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    it('should delete category successfully', async () => {
      mockRepository.findById
        .mockResolvedValueOnce(mockCategory) // for getCategoryById
        .mockResolvedValueOnce(mockCategory); // for getCategoryChildren
      const mockGetCategoryChildren = jest.fn().mockResolvedValue([]);
      jest.spyOn(service, 'getCategoryChildren').mockImplementation(mockGetCategoryChildren);
      mockRepository.delete.mockResolvedValue(undefined);

      await service.deleteCategory('507f1f77bcf86cd799439011');

      expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockRepository.delete).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should throw NotFoundException if category not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.deleteCategory('507f1f77bcf86cd799439011')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepository.deleteById).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if category has children', async () => {
      const children = [{ id: '507f1f77bcf86cd799439012', name: 'Child Category' }];

      mockRepository.findById
        .mockResolvedValueOnce(mockCategory) // for getCategoryById
        .mockResolvedValueOnce(mockCategory); // for getCategoryChildren
      const mockGetCategoryChildren = jest.fn().mockResolvedValue(children);
      jest.spyOn(service, 'getCategoryChildren').mockImplementation(mockGetCategoryChildren);

      await expect(service.deleteCategory('507f1f77bcf86cd799439011')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('addMember', () => {
    it('should add member successfully', async () => {
      const memberDto = {
        userId: 'user123',
        role: 'member' as any,
        metadata: { source: 'test' },
      };

      mockRepository.findById.mockResolvedValue(mockCategory);
      mockCategoryMemberService.isMember.mockResolvedValue(false);
      mockCategoryMemberService.addMember.mockResolvedValue(undefined);

      const result = await service.addMember('507f1f77bcf86cd799439011', memberDto);

      expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockCategoryMemberService.isMember).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'user123',
      );
      expect(mockCategoryMemberService.addMember).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'user123',
      );
      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException if category not found', async () => {
      const memberDto = { userId: 'user123' };

      mockRepository.findById.mockResolvedValue(null);

      await expect(service.addMember('507f1f77bcf86cd799439011', memberDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeMember', () => {
    it('should remove member successfully', async () => {
      const existingMember = { category: mockCategory, member: { userId: 'user123' } };

      mockRepository.findById.mockResolvedValue(mockCategory);
      mockCategoryMemberService.isMember.mockResolvedValue(true);
      mockCategoryMemberService.removeMember.mockResolvedValue(undefined);

      const result = await service.removeMember('507f1f77bcf86cd799439011', 'user123');

      expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockCategoryMemberService.isMember).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'user123',
      );
      expect(mockCategoryMemberService.removeMember).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'user123',
      );
      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException if category not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.removeMember('507f1f77bcf86cd799439011', 'user123')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepository.removeMember).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user is not a member', async () => {
      mockRepository.findById.mockResolvedValue(mockCategory);
      mockCategoryMemberService.isMember.mockResolvedValue(false);

      await expect(service.removeMember('507f1f77bcf86cd799439011', 'user123')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockCategoryMemberService.removeMember).not.toHaveBeenCalled();
    });
  });

  describe('bulkMemberOperation', () => {
    it('should perform bulk add operation successfully', async () => {
      const operationDto = {
        userIds: ['user1', 'user2', 'user3'],
        operation: 'add' as any,
        role: 'member' as any,
        metadata: { source: 'bulk' },
      };

      mockRepository.findById.mockResolvedValue(mockCategory);
      mockCategoryMemberService.bulkAddMembers.mockResolvedValue(undefined);

      const result = await service.bulkMemberOperation('507f1f77bcf86cd799439011', operationDto);

      expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockCategoryMemberService.bulkAddMembers).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        ['user1', 'user2', 'user3'],
      );
      expect(result).toEqual(mockCategory);
    });

    it('should throw BadRequestException if userIds list is empty', async () => {
      const operationDto = {
        userIds: [],
        operation: 'add' as any,
      };

      await expect(
        service.bulkMemberOperation('507f1f77bcf86cd799439011', operationDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if more than 1000 users', async () => {
      const operationDto = {
        userIds: Array.from({ length: 1001 }, (_, i) => `user${i}`),
        operation: 'add' as any,
      };

      await expect(
        service.bulkMemberOperation('507f1f77bcf86cd799439011', operationDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCategoryStatistics', () => {
    it('should return category statistics', async () => {
      const category = {
        id: '507f1f77bcf86cd799439011',
        name: 'Test Category',
        isActive: true,
        children: [],
      };
      const children: Category[] = [];

      mockRepository.findById
        .mockResolvedValueOnce(category) // for getCategoryById
        .mockResolvedValueOnce(category); // for getCategoryChildren
      const mockGetCategoryChildren = jest.fn().mockResolvedValue(children);
      jest.spyOn(service, 'getCategoryChildren').mockImplementation(mockGetCategoryChildren);

      const result = await service.getCategoryStatistics('507f1f77bcf86cd799439011');

      expect(mockRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('statistics');
      expect(result.statistics).toHaveProperty('totalChildren');
    });

    it('should return default statistics if no data', async () => {
      const category = {
        id: '507f1f77bcf86cd799439011',
        name: 'Test Category',
        isActive: true,
        notificationCount: 0,
        engagementScore: 0,
      };
      const children: Category[] = [];

      mockRepository.findById
        .mockResolvedValueOnce(category) // for getCategoryById
        .mockResolvedValueOnce(category); // for getCategoryChildren (if needed)
      const mockGetCategoryChildren = jest.fn().mockResolvedValue(children);
      jest.spyOn(service, 'getCategoryChildren').mockImplementation(mockGetCategoryChildren);

      const result = await service.getCategoryStatistics('507f1f77bcf86cd799439011');

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('statistics');
    });
  });
});
