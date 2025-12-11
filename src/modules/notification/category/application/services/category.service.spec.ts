import { Test, TestingModule } from '@nestjs/testing';
import { CategoryService } from './category.service';
import { CategoryRepository } from '../../infrastructure/category.repository';
import { Category } from '../../domain/category.entity';
import { CategoryMemberService } from '../../category-member.service';
import { NovuClient } from '../../../../../infrastructure/external/novu/novu.client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepository: jest.Mocked<CategoryRepository>;

  beforeEach(async () => {
    const mockCategoryRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      findMany: jest.fn(),
      findTree: jest.fn(),
      findByUser: jest.fn(),
      search: jest.fn(),
      delete: jest.fn(),
    };

    const mockCategoryMemberService = {
      addMember: jest.fn(),
      removeMember: jest.fn(),
      isMember: jest.fn(),
      bulkAddMembers: jest.fn(),
    };

    const mockNovuClient = {
      createTopic: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: 'CategoryRepository',
          useValue: mockCategoryRepository,
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
    categoryRepository = module.get('CategoryRepository');
  });

  describe('createCategory', () => {
    it('should create a category successfully', async () => {
      const createDto = {
        name: 'Test Category',
        description: 'Test description',
        color: '#FF0000',
        icon: 'test-icon',
      };

      const mockCategory = Category.create({
        name: 'Test Category',
        description: 'Test description',
        color: '#FF0000',
        icon: 'test-icon',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.save.mockResolvedValue(mockCategory);

      const result = await service.createCategory(createDto, 'user123');

      expect(result).toEqual(mockCategory);
      expect(categoryRepository.save).toHaveBeenCalled();
    });

    it('should create a subcategory with valid parent', async () => {
      const parentCategory = Category.create({
        name: 'Parent Category',
        isActive: true,
        createdBy: 'user123',
      });

      const createDto = {
        name: 'Child Category',
        parentId: 'parent123',
      };

      const mockCategory = Category.create({
        name: 'Child Category',
        isActive: true,
        parentId: 'parent123',
        createdBy: 'user123',
      });

      categoryRepository.findById
        .mockResolvedValueOnce(parentCategory) // First call for validation
        .mockResolvedValueOnce(parentCategory); // Second call for updating parent
      categoryRepository.save
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce(parentCategory);

      const result = await service.createCategory(createDto, 'user123');

      expect(result).toEqual(mockCategory);
      expect(categoryRepository.findById).toHaveBeenCalledWith('parent123');
      expect(categoryRepository.save).toHaveBeenCalledTimes(2); // category + parent update
    });

    it('should throw NotFoundException if parent category not found', async () => {
      const createDto = {
        name: 'Child Category',
        parentId: 'nonexistent',
      };

      categoryRepository.findByName.mockResolvedValue(null);
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.createCategory(createDto, 'user123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if parent category is inactive', async () => {
      const parentCategory = Category.create({
        name: 'Parent Category',
        isActive: false,
        createdBy: 'user123',
      });

      const createDto = {
        name: 'Child Category',
        parentId: 'parent123',
      };

      categoryRepository.findById.mockResolvedValue(parentCategory);

      await expect(service.createCategory(createDto, 'user123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getCategoryById', () => {
    it('should return category if found', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById.mockResolvedValue(mockCategory);

      const result = await service.getCategoryById('category123');

      expect(result).toEqual(mockCategory);
      expect(categoryRepository.findById).toHaveBeenCalledWith('category123');
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.getCategoryById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCategory', () => {
    it('should update category successfully', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        createdBy: 'user123',
      });

      const updates = {
        name: 'Updated Category',
        description: 'Updated description',
      };

      const updatedCategory = Category.create({
        name: 'Updated Category',
        description: 'Updated description',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById.mockResolvedValue(mockCategory);
      categoryRepository.findByName.mockResolvedValue(null);
      categoryRepository.save.mockResolvedValue(updatedCategory);

      const result = await service.updateCategory('category123', updates);

      expect(result).toEqual(updatedCategory);
      expect(categoryRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.updateCategory('nonexistent', {})).rejects.toThrow(NotFoundException);
    });

    it('should update parent relationships when changing parent', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        parentId: 'oldParent',
        createdBy: 'user123',
      });

      const oldParent = Category.create({
        name: 'Old Parent',
        isActive: true,
        createdBy: 'user123',
      });

      const newParent = Category.create({
        name: 'New Parent',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce(newParent)
        .mockResolvedValueOnce(oldParent)
        .mockResolvedValueOnce(newParent);

      categoryRepository.save.mockResolvedValue(mockCategory);

      const result = await service.updateCategory('category123', { parentId: 'newParent' });

      expect(result).toEqual(mockCategory);
      expect(categoryRepository.save).toHaveBeenCalledTimes(3); // category + old parent + new parent
    });
  });

  describe('deleteCategory', () => {
    it('should delete category successfully', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById.mockResolvedValue(mockCategory);
      categoryRepository.delete.mockResolvedValue(undefined);

      await service.deleteCategory('category123');

      expect(categoryRepository.findById).toHaveBeenCalledWith('category123');
      expect(categoryRepository.delete).toHaveBeenCalledWith('category123');
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.deleteCategory('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if category has children', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        createdBy: 'user123',
      });
      const child1 = Category.create({
        name: 'Child 1',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById
        .mockResolvedValueOnce(mockCategory) // for getCategoryById
        .mockResolvedValueOnce(mockCategory); // for getCategoryChildren
      const mockGetCategoryChildren = jest.fn().mockResolvedValue([child1]);
      jest.spyOn(service, 'getCategoryChildren').mockImplementation(mockGetCategoryChildren);

      await expect(service.deleteCategory('category123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('activateCategory', () => {
    it('should activate category successfully', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: false,
        createdBy: 'user123',
      });

      categoryRepository.findById.mockResolvedValue(mockCategory);
      categoryRepository.save.mockResolvedValue(mockCategory);

      const result = await service.activateCategory('category123');

      expect(result.isActive).toBe(true);
      expect(categoryRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.activateCategory('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateCategory', () => {
    it('should deactivate category successfully', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById.mockResolvedValue(mockCategory);
      categoryRepository.save.mockResolvedValue(mockCategory);

      const result = await service.deactivateCategory('category123');

      expect(result.isActive).toBe(false);
      expect(categoryRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.deactivateCategory('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCategoryTree', () => {
    it('should return root categories', async () => {
      const mockCategories = [
        Category.create({
          name: 'Category 1',
          isActive: true,
          createdBy: 'user123',
        }),
        Category.create({
          name: 'Category 2',
          isActive: true,
          createdBy: 'user123',
        }),
      ];

      categoryRepository.findTree.mockResolvedValue(mockCategories);

      const result = await service.getCategoryTree();

      expect(result).toEqual(mockCategories);
      expect(categoryRepository.findTree).toHaveBeenCalled();
    });
  });

  describe('getCategoryChildren', () => {
    it('should return children categories', async () => {
      const mockCategory = Category.create({
        name: 'Parent Category',
        isActive: true,
        createdBy: 'user123',
      });
      mockCategory.addChild('child1');
      mockCategory.addChild('child2');

      const child1 = Category.create({
        name: 'Child 1',
        isActive: true,
        createdBy: 'user123',
      });

      const child2 = Category.create({
        name: 'Child 2',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce(child1)
        .mockResolvedValueOnce(child2);

      const result = await service.getCategoryChildren('parent123');

      expect(result).toEqual([child1, child2]);
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.getCategoryChildren('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCategoryPath', () => {
    it('should return category path from root to target', async () => {
      const rootCategory = Category.create({
        name: 'Root Category',
        isActive: true,
        createdBy: 'user123',
      });

      const parentCategory = Category.create({
        name: 'Parent Category',
        isActive: true,
        parentId: 'root123',
        createdBy: 'user123',
      });

      const targetCategory = Category.create({
        name: 'Target Category',
        isActive: true,
        parentId: 'parent123',
        createdBy: 'user123',
      });

      categoryRepository.findById
        .mockResolvedValueOnce(targetCategory)
        .mockResolvedValueOnce(parentCategory)
        .mockResolvedValueOnce(rootCategory)
        .mockResolvedValueOnce(null);

      const result = await service.getCategoryPath('target123');

      expect(result).toEqual([rootCategory, parentCategory, targetCategory]);
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.getCategoryPath('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('moveCategory', () => {
    it('should move category to new parent successfully', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        parentId: 'oldParent',
        createdBy: 'user123',
      });

      const oldParent = Category.create({
        name: 'Old Parent',
        isActive: true,
        createdBy: 'user123',
      });

      const newParent = Category.create({
        name: 'New Parent',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce(newParent)
        .mockResolvedValueOnce(oldParent)
        .mockResolvedValueOnce(newParent);

      categoryRepository.save.mockResolvedValue(mockCategory);

      const result = await service.moveCategory('category123', 'newParent');

      expect(result).toEqual(mockCategory);
      expect(categoryRepository.save).toHaveBeenCalledTimes(3); // category + old parent + new parent
    });

    it('should throw BadRequestException if trying to move to self', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById.mockResolvedValue(mockCategory);

      await expect(service.moveCategory('category123', 'category123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.moveCategory('nonexistent', 'newParent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCategoryStatistics', () => {
    it('should return category statistics', async () => {
      const mockCategory = Category.create({
        name: 'Test Category',
        isActive: true,
        createdBy: 'user123',
      });

      // Mock getCategoryById - called twice (once in getCategoryStatistics, once in getCategoryChildren)
      categoryRepository.findById
        .mockResolvedValueOnce(mockCategory) // First call in getCategoryStatistics
        .mockResolvedValueOnce(mockCategory); // Second call in getCategoryChildren

      const result = await service.getCategoryStatistics('category123');

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('statistics');
      expect(result.statistics.totalChildren).toBe(0);
      expect(result.statistics.activeChildren).toBe(0);
      expect(result.statistics.inactiveChildren).toBe(0);
    });

    it('should throw NotFoundException if category not found', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.getCategoryStatistics('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchCategories', () => {
    it('should return matching categories', async () => {
      const mockCategories = [
        Category.create({
          name: 'Test Category 1',
          isActive: true,
          createdBy: 'user123',
        }),
        Category.create({
          name: 'Test Category 2',
          isActive: true,
          createdBy: 'user123',
        }),
      ];

      categoryRepository.search.mockResolvedValue(mockCategories);

      const result = await service.searchCategories('test');

      expect(result).toEqual(mockCategories);
      expect(categoryRepository.search).toHaveBeenCalledWith('test');
    });
  });

  describe('getCategoriesByUser', () => {
    it('should return categories created by user', async () => {
      const mockCategories = [
        Category.create({
          name: 'User Category 1',
          isActive: true,
          createdBy: 'user123',
        }),
        Category.create({
          name: 'User Category 2',
          isActive: true,
          createdBy: 'user123',
        }),
      ];

      categoryRepository.findByUser.mockResolvedValue(mockCategories);

      const result = await service.getCategoriesByUser('user123');

      expect(result).toEqual(mockCategories);
      expect(categoryRepository.findByUser).toHaveBeenCalledWith('user123');
    });
  });

  describe('bulkUpdateCategories', () => {
    it('should update multiple categories successfully', async () => {
      const mockCategory1 = Category.create({
        name: 'Category 1',
        isActive: true,
        createdBy: 'user123',
      });

      const mockCategory2 = Category.create({
        name: 'Category 2',
        isActive: true,
        createdBy: 'user123',
      });

      const updatedCategory1 = Category.create({
        name: 'Updated Category 1',
        isActive: true,
        createdBy: 'user123',
      });

      const updatedCategory2 = Category.create({
        name: 'Updated Category 2',
        isActive: true,
        createdBy: 'user123',
      });

      categoryRepository.findById
        .mockResolvedValueOnce(mockCategory1)
        .mockResolvedValueOnce(mockCategory2);

      categoryRepository.save
        .mockResolvedValueOnce(updatedCategory1)
        .mockResolvedValueOnce(updatedCategory2);

      const updates = [
        { id: 'category1', updates: { name: 'Updated Category 1' } },
        { id: 'category2', updates: { name: 'Updated Category 2' } },
      ];

      const result = await service.bulkUpdateCategories(updates);

      expect(result).toEqual([updatedCategory1, updatedCategory2]);
      expect(categoryRepository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('bulkDeleteCategories', () => {
    it('should delete multiple categories successfully', async () => {
      const mockCategory1 = Category.create({
        name: 'Category 1',
        isActive: true,
        createdBy: 'user123',
      });

      const mockCategory2 = Category.create({
        name: 'Category 2',
        isActive: true,
        createdBy: 'user123',
      });

      // deleteCategory calls getCategoryById (findById) and getCategoryChildren (findById for each child)
      // For each category: getCategoryById + getCategoryChildren
      categoryRepository.findById
        .mockResolvedValueOnce(mockCategory1) // category1: getCategoryById
        .mockResolvedValueOnce(mockCategory1) // category1: getCategoryChildren
        .mockResolvedValueOnce(mockCategory2) // category2: getCategoryById
        .mockResolvedValueOnce(mockCategory2); // category2: getCategoryChildren
      const mockGetCategoryChildren = jest.fn().mockResolvedValue([]);
      jest.spyOn(service, 'getCategoryChildren').mockImplementation(mockGetCategoryChildren);
      categoryRepository.delete.mockResolvedValue(undefined);

      await service.bulkDeleteCategories(['category1', 'category2']);

      expect(categoryRepository.delete).toHaveBeenCalledTimes(2);
    });
  });
});
