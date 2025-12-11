// MongoDB initialization script
db = db.getSiblingDB('notification-service');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'email', 'roles', 'isActive'],
      properties: {
        _id: { bsonType: 'string' },
        email: { bsonType: 'string' },
        phone: { bsonType: 'string' },
        roles: { bsonType: 'array' },
        isActive: { bsonType: 'bool' },
        lastSyncedAt: { bsonType: 'date' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('device_tokens', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'userId', 'token', 'platform', 'provider', 'deviceId'],
      properties: {
        _id: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        token: { bsonType: 'string' },
        platform: { bsonType: 'string' },
        provider: { bsonType: 'string' },
        deviceId: { bsonType: 'string' },
        isActive: { bsonType: 'bool' },
        lastUsedAt: { bsonType: 'date' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('announcements', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'title', 'body', 'type', 'priority', 'channels', 'status', 'createdBy'],
      properties: {
        _id: { bsonType: 'string' },
        title: { bsonType: 'string' },
        body: { bsonType: 'string' },
        type: { bsonType: 'string' },
        priority: { bsonType: 'string' },
        channels: { bsonType: 'array' },
        targetRoles: { bsonType: 'array' },
        targetUsers: { bsonType: 'array' },
        data: { bsonType: 'object' },
        templateId: { bsonType: 'string' },
        scheduledAt: { bsonType: 'date' },
        status: { bsonType: 'string' },
        createdBy: { bsonType: 'string' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('user_notifications', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'userId', 'announcementId', 'title', 'body', 'type', 'channel', 'priority', 'status'],
      properties: {
        _id: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        announcementId: { bsonType: 'string' },
        title: { bsonType: 'string' },
        body: { bsonType: 'string' },
        type: { bsonType: 'string' },
        channel: { bsonType: 'string' },
        priority: { bsonType: 'string' },
        data: { bsonType: 'object' },
        status: { bsonType: 'string' },
        sentAt: { bsonType: 'date' },
        deliveredAt: { bsonType: 'date' },
        readAt: { bsonType: 'date' },
        errorMessage: { bsonType: 'string' },
        retryCount: { bsonType: 'int' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('categories', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'name', 'type', 'createdBy'],
      properties: {
        _id: { bsonType: 'string' },
        name: { bsonType: 'string' },
        description: { bsonType: 'string' },
        type: { bsonType: 'string' },
        isActive: { bsonType: 'bool' },
        createdBy: { bsonType: 'string' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('category_members', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'categoryId', 'userId'],
      properties: {
        _id: { bsonType: 'string' },
        categoryId: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        joinedAt: { bsonType: 'date' },
        isActive: { bsonType: 'bool' }
      }
    }
  }
});

db.createCollection('user_preferences', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'userId'],
      properties: {
        _id: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        channels: { bsonType: 'object' },
        types: { bsonType: 'object' },
        quietHours: { bsonType: 'object' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('notification_templates', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'name', 'type', 'channel', 'body', 'language', 'createdBy'],
      properties: {
        _id: { bsonType: 'string' },
        name: { bsonType: 'string' },
        type: { bsonType: 'string' },
        channel: { bsonType: 'string' },
        subject: { bsonType: 'string' },
        body: { bsonType: 'string' },
        language: { bsonType: 'string' },
        variables: { bsonType: 'array' },
        isActive: { bsonType: 'bool' },
        createdBy: { bsonType: 'string' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

// Create indexes for performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ roles: 1 });
db.users.createIndex({ isActive: 1 });
db.users.createIndex({ lastSyncedAt: 1 });

db.device_tokens.createIndex({ userId: 1 });
db.device_tokens.createIndex({ token: 1 });
db.device_tokens.createIndex({ deviceId: 1 });
db.device_tokens.createIndex({ platform: 1 });
db.device_tokens.createIndex({ provider: 1 });
db.device_tokens.createIndex({ isActive: 1 });
db.device_tokens.createIndex({ lastUsedAt: 1 });

db.announcements.createIndex({ type: 1 });
db.announcements.createIndex({ priority: 1 });
db.announcements.createIndex({ status: 1 });
db.announcements.createIndex({ createdBy: 1 });
db.announcements.createIndex({ scheduledAt: 1 });
db.announcements.createIndex({ targetRoles: 1 });
db.announcements.createIndex({ targetUsers: 1 });
db.announcements.createIndex({ createdAt: 1 });

// Note: userId index không cần tạo ở đây vì đã có compound indexes { userId: 1, status: 1, createdAt: -1 } và { userId: 1, type: 1, createdAt: -1 } trong database-init.service.ts
// MongoDB có thể sử dụng prefix của compound index cho single field queries
db.user_notifications.createIndex({ announcementId: 1 });
db.user_notifications.createIndex({ status: 1 });
db.user_notifications.createIndex({ type: 1 });
db.user_notifications.createIndex({ channel: 1 });
db.user_notifications.createIndex({ priority: 1 });
db.user_notifications.createIndex({ sentAt: 1 });
db.user_notifications.createIndex({ readAt: 1 });
db.user_notifications.createIndex({ createdAt: 1 });

db.categories.createIndex({ name: 1 });
db.categories.createIndex({ type: 1 });
db.categories.createIndex({ isActive: 1 });
db.categories.createIndex({ createdBy: 1 });
db.categories.createIndex({ createdAt: 1 });

db.category_members.createIndex({ categoryId: 1 });
db.category_members.createIndex({ userId: 1 });
db.category_members.createIndex({ isActive: 1 });
db.category_members.createIndex({ joinedAt: 1 });

db.user_preferences.createIndex({ userId: 1 }, { unique: true });

db.notification_templates.createIndex({ name: 1 });
db.notification_templates.createIndex({ type: 1 });
db.notification_templates.createIndex({ channel: 1 });
db.notification_templates.createIndex({ language: 1 });
db.notification_templates.createIndex({ isActive: 1 });
db.notification_templates.createIndex({ createdBy: 1 });

// Create TTL indexes for data cleanup
db.device_tokens.createIndex({ lastUsedAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
db.user_notifications.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

print('MongoDB initialization completed successfully');
