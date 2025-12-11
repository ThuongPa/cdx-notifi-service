import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    try {
      this.logger.log('Initializing database collections...');
      await this.ensureCollectionsExist();
      await this.ensureIndexesExist();
      this.logger.log('Database initialization completed successfully');
    } catch (error) {
      this.logger.error('Database initialization failed:', error);
      // Don't throw - let app continue even if init fails
      // Collections will be created automatically when first document is inserted
    }
  }

  private async ensureCollectionsExist() {
    const db = this.connection.db;
    if (!db) {
      this.logger.error('Database connection not available');
      return;
    }
    const collections = await db.listCollections().toArray();
    const existingCollectionNames = collections.map((c) => c.name);

    const requiredCollections = [
      'users',
      'device_tokens',
      'announcements',
      'user_notifications',
      'categories',
      'category_members',
      'user_preferences',
      'notification_templates',
    ];

    for (const collectionName of requiredCollections) {
      if (!existingCollectionNames.includes(collectionName)) {
        try {
          await db.createCollection(collectionName);
          this.logger.log(`Created collection: ${collectionName}`);
        } catch (error: any) {
          // Collection might already exist (race condition)
          if (error.code !== 48) {
            // 48 = NamespaceExists
            this.logger.warn(`Failed to create collection ${collectionName}: ${error.message}`);
          }
        }
      } else {
        this.logger.debug(`Collection already exists: ${collectionName}`);
      }
    }
  }

  private async ensureIndexesExist() {
    const db = this.connection.db;
    if (!db) {
      this.logger.error('Database connection not available');
      return;
    }

    try {
      // Users indexes
      await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
      await db.collection('users').createIndex({ roles: 1 });
      await db.collection('users').createIndex({ isActive: 1 });
      await db.collection('users').createIndex({ lastSyncedAt: 1 });

      // Device tokens indexes
      await db.collection('device_tokens').createIndex({ userId: 1 });
      await db
        .collection('device_tokens')
        .createIndex({ token: 1 }, { unique: true, sparse: true });
      await db.collection('device_tokens').createIndex({ deviceId: 1 });
      await db.collection('device_tokens').createIndex({ platform: 1 });
      await db.collection('device_tokens').createIndex({ provider: 1 });
      await db.collection('device_tokens').createIndex({ isActive: 1 });
      await db.collection('device_tokens').createIndex({ lastUsedAt: 1 });

      // Announcements indexes
      await db.collection('announcements').createIndex({ type: 1 });
      await db.collection('announcements').createIndex({ priority: 1 });
      await db.collection('announcements').createIndex({ status: 1 });
      await db.collection('announcements').createIndex({ createdBy: 1 });
      await db.collection('announcements').createIndex({ scheduledAt: 1 });
      await db.collection('announcements').createIndex({ targetRoles: 1 });
      await db.collection('announcements').createIndex({ targetUsers: 1 });
      await db.collection('announcements').createIndex({ createdAt: -1 });

      // User notifications indexes
      await db
        .collection('user_notifications')
        .createIndex({ userId: 1, status: 1, createdAt: -1 });
      await db.collection('user_notifications').createIndex({ userId: 1, type: 1, createdAt: -1 });
      await db.collection('user_notifications').createIndex({ notificationId: 1 });
      await db.collection('user_notifications').createIndex({ status: 1 });
      await db.collection('user_notifications').createIndex({ type: 1 });
      await db.collection('user_notifications').createIndex({ channel: 1 });
      await db.collection('user_notifications').createIndex({ priority: 1 });
      await db.collection('user_notifications').createIndex({ sentAt: 1 });
      await db.collection('user_notifications').createIndex({ readAt: 1 });
      await db.collection('user_notifications').createIndex({ createdAt: -1 });
      await db
        .collection('user_notifications')
        .createIndex({ status: 1, retryCount: 1, createdAt: 1 });
      // ⭐ Indexes for service-to-service queries
      await db.collection('user_notifications').createIndex({ 'data.correlationId': 1 });
      await db.collection('user_notifications').createIndex({ 'data.sourceService': 1 });
      await db.collection('user_notifications').createIndex({ 'data.sentBy': 1 });
      await db
        .collection('user_notifications')
        .createIndex({ 'data.sourceService': 1, 'data.correlationId': 1 });
      await db
        .collection('user_notifications')
        .createIndex({ 'data.sourceService': 1, 'data.sentBy': 1 });
      await db
        .collection('user_notifications')
        .createIndex({ 'data.sourceService': 1, 'data.sentBy': 1, createdAt: -1 });

      // Categories indexes
      await db.collection('categories').createIndex({ id: 1 }, { unique: true });
      await db.collection('categories').createIndex({ name: 1 });
      await db.collection('categories').createIndex({ isActive: 1 });
      await db.collection('categories').createIndex({ parentId: 1 });
      await db.collection('categories').createIndex({ createdBy: 1 });
      // Note: topicKey index đã được tạo tự động từ schema @Prop({ unique: true, sparse: true })
      await db.collection('categories').createIndex({ novuSynced: 1 });
      await db.collection('categories').createIndex({ createdAt: -1 });

      // Category members indexes
      await db
        .collection('category_members')
        .createIndex({ categoryId: 1, userId: 1 }, { unique: true });
      await db.collection('category_members').createIndex({ categoryId: 1 });
      // Note: userId index đã được tạo tự động từ Mongoose schema, không cần tạo thủ công ở đây
      // Compound index { userId: 1, isActive: 1 } trong schema cũng đã cover cho single userId index
      await db.collection('category_members').createIndex({ isActive: 1 });
      await db.collection('category_members').createIndex({ joinedAt: 1 });
      await db.collection('category_members').createIndex({ novuSynced: 1 });

      // User preferences indexes
      await db.collection('user_preferences').createIndex({ userId: 1 }, { unique: true });

      // Notification templates indexes
      await db.collection('notification_templates').createIndex({ name: 1 });
      await db.collection('notification_templates').createIndex({ type: 1 });
      await db.collection('notification_templates').createIndex({ channel: 1 });
      await db.collection('notification_templates').createIndex({ language: 1 });
      await db.collection('notification_templates').createIndex({ isActive: 1 });
      await db.collection('notification_templates').createIndex({ createdBy: 1 });

      this.logger.log('Database indexes created/verified successfully');
    } catch (error: any) {
      // Index might already exist - that's okay
      if (error.code !== 85 && error.code !== 86) {
        // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict
        this.logger.warn(`Failed to create some indexes: ${error.message}`);
      }
    }
  }
}
