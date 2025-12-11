import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Category, CategoryDocument } from '../../src/modules/notification/category/category.schema';
import {
  CategoryMember,
  CategoryMemberDocument,
} from '../../src/infrastructure/database/schemas/category-member.schema';
import { NovuClient } from '../../src/infrastructure/external/novu/novu.client';
import { Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';

/**
 * Migration script to migrate Category members from embedded array to CategoryMember collection
 * and sync with Novu Topics
 *
 * Usage:
 *   npx ts-node scripts/migrations/migrate-category-to-novu-topics.ts
 */
async function migrateCategoryToNovuTopics() {
  const logger = new Logger('CategoryMigration');

  logger.log('🚀 Starting Category to Novu Topics migration...\n');

  try {
    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(AppModule);

    // Get services
    const categoryModel = app.get<Model<CategoryDocument>>(getModelToken('Category'));
    const categoryMemberModel = app.get<Model<CategoryMemberDocument>>(
      getModelToken(CategoryMember.name),
    );
    const novuClient = app.get<NovuClient>(NovuClient);

    logger.log('✅ Services initialized\n');

    // Get all categories
    const categories = await categoryModel.find({}).exec();
    logger.log(`📋 Found ${categories.length} categories to migrate\n`);

    let successCount = 0;
    let errorCount = 0;
    let totalMembersMigrated = 0;

    for (const category of categories) {
      try {
        logger.log(`\n📦 Processing category: ${category.name} (${category.id})`);

        // 1. Create topic in Novu
        const topicKey = `category_${category.id}`;
        logger.log(`   Creating Novu topic: ${topicKey}`);

        try {
          await novuClient.createTopic(topicKey, category.name);
          logger.log(`   ✅ Topic created: ${topicKey}`);
        } catch (error) {
          // Topic might already exist, that's okay
          if (error.message.includes('already exists') || error.message.includes('409')) {
            logger.log(`   ⚠️  Topic already exists: ${topicKey}`);
          } else {
            throw error;
          }
        }

        // 2. Migrate members from array → CategoryMember collection
        const members = (category as any).members || [];
        logger.log(`   Migrating ${members.length} members to CategoryMember collection`);

        let membersMigrated = 0;
        let membersSynced = 0;

        for (const member of members) {
          try {
            // Check if member already exists
            const existing = await categoryMemberModel.findOne({
              categoryId: category.id,
              userId: member.userId,
            });

            if (existing) {
              logger.log(`   ⚠️  Member ${member.userId} already exists, skipping`);
              continue;
            }

            // Create CategoryMember document
            await categoryMemberModel.create({
              _id: createId(),
              categoryId: category.id,
              userId: member.userId,
              joinedAt: member.joinedAt || new Date(),
              isActive: member.isActive !== false, // Default to true
              novuSynced: false,
            });

            membersMigrated++;

            // 3. Sync with Novu Topics
            try {
              await novuClient.addSubscriberToTopic(topicKey, member.userId);
              await categoryMemberModel.updateOne(
                { categoryId: category.id, userId: member.userId },
                { novuSynced: true, novuSyncedAt: new Date() },
              );
              membersSynced++;
            } catch (error) {
              logger.warn(`   ⚠️  Failed to sync member ${member.userId} with Novu: ${error.message}`);
              // Continue with other members
            }
          } catch (error) {
            logger.error(`   ❌ Failed to migrate member ${member.userId}: ${error.message}`);
            // Continue with other members
          }
        }

        logger.log(`   ✅ Migrated ${membersMigrated} members, synced ${membersSynced} with Novu`);

        // 4. Update category with topicKey
        await categoryModel.updateOne(
          { _id: category._id },
          {
            $set: {
              topicKey,
              novuSynced: true,
              novuSyncedAt: new Date(),
            },
          },
        );

        logger.log(`   ✅ Category updated with topicKey: ${topicKey}`);

        successCount++;
        totalMembersMigrated += membersMigrated;
      } catch (error) {
        logger.error(`❌ Failed to migrate category ${category.name}: ${error.message}`);
        errorCount++;
      }
    }

    logger.log('\n' + '='.repeat(60));
    logger.log('📊 Migration Summary:');
    logger.log(`   ✅ Categories migrated: ${successCount}`);
    logger.log(`   ❌ Categories failed: ${errorCount}`);
    logger.log(`   👥 Total members migrated: ${totalMembersMigrated}`);
    logger.log('='.repeat(60) + '\n');

    // Close application context
    await app.close();
    logger.log('✅ Migration completed!');
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateCategoryToNovuTopics()
  .then(() => {
    console.log('🎉 Migration script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });

