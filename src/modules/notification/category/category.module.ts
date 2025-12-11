import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoryService } from './application/services/category.service';
import { CategoryRepositoryImpl } from './infrastructure/category.repository.impl';
import { Category, CategorySchema } from './category.schema';
import { CategoryController } from './category.controller';
import {
  CategoryMember,
  CategoryMemberSchema,
} from '../../../infrastructure/database/schemas/category-member.schema';
import { CategoryMemberService } from './category-member.service';
import { CategoryTargetingService } from './category-targeting.service';
import { NovuModule } from '../../../infrastructure/external/novu/novu.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Category', schema: CategorySchema },
      { name: CategoryMember.name, schema: CategoryMemberSchema },
    ]),
    NovuModule,
  ],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    CategoryMemberService,
    CategoryTargetingService,
    {
      provide: 'CategoryRepository',
      useClass: CategoryRepositoryImpl,
    },
  ],
  exports: [CategoryService, CategoryMemberService, CategoryTargetingService],
})
export class CategoryModule {}
