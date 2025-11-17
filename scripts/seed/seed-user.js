const { MongoClient } = require('mongodb');

// MongoDB connection configuration
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://admin:password123@localhost:27017/notification-service?authSource=admin';
const DB_NAME = process.env.DB_NAME || 'notification-service';

// User data
const userData = {
  id: 'cmfxplnhx0000mthirstsrxze',
  role: 'ADMIN_XA',
  fullName: 'System Administrator',
  isFirstLogin: false,
};

// Device tokens data
const deviceTokensData = [
  {
    id: 'idqyhs64cohskdb3x80kx11e',
    token: 'ExponentPushToken[ABC-123456789XYZ]',
    platform: 'ios',
    provider: 'expo',
    deviceId: 'expo-ios-003',
    isActive: true,
  },
  {
    id: 'sd2l3f53i3cgmllqh0gim12i',
    token: 'ExponentPushToken[XYZ-GHI987654321]',
    platform: 'android',
    provider: 'expo',
    deviceId: 'expo-android-003',
    isActive: true,
  },
  {
    id: 'uzqjcl4mrjwm1zmwl425m0tf',
    token: 'ExponentPushToken[ABC-DEF123456789]',
    platform: 'ios',
    provider: 'expo',
    deviceId: 'expo-ios-002',
    isActive: true,
  },
  {
    id: 'odebrzv0nlx5ia0dm3d22zd7',
    token: 'ExponentPushToken[2JZ-axOO4YjmTqbSgpRb2Q]',
    platform: 'android',
    provider: 'expo',
    deviceId: 'expo-android-001',
    isActive: true,
  },
];

// Map role to UserRole enum (lowercase values: admin, manager, resident, guest)
function mapRoleToEnum(role) {
  const roleMap = {
    ROLE_RESIDENT: 'resident',
    ROLE_ADMIN: 'admin',
    ROLE_MANAGER: 'manager',
    ROLE_STAFF: 'manager',
    ADMIN_XA: 'admin',
    resident: 'resident',
    admin: 'admin',
    manager: 'manager',
    staff: 'manager',
  };
  return roleMap[role] || 'resident';
}

// Parse full name to firstName and lastName
function parseFullName(fullName) {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

async function seedUser() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');
    const deviceTokensCollection = db.collection('device_tokens');

    // Parse user data
    const { firstName, lastName } = parseFullName(userData.fullName);
    const email = `${userData.id}@system.local`.toLowerCase();
    const role = mapRoleToEnum(userData.role);
    const now = new Date();

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ _id: userData.id });
    if (existingUser) {
      console.log(`⚠️  User ${userData.id} already exists. Updating...`);
      await usersCollection.updateOne(
        { _id: userData.id },
        {
          $set: {
            email: email,
            firstName: firstName,
            lastName: lastName,
            roles: [role],
            isActive: true,
            lastSyncedAt: now,
            updatedAt: now,
          },
        },
      );
      console.log(`✅ User updated: ${userData.id} (${userData.fullName})`);
    } else {
      // Create user document
      const userDocument = {
        _id: userData.id,
        userId: userData.id,
        email: email,
        firstName: firstName,
        lastName: lastName,
        roles: [role],
        isActive: true,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: {
          syncSource: 'manual-seed',
          lastSyncedAt: now,
          isFirstLogin: userData.isFirstLogin,
        },
      };

      // Insert user
      await usersCollection.insertOne(userDocument);
      console.log(`✅ User created: ${userData.id} (${userData.fullName})`);
      console.log(`   Email: ${email}`);
      console.log(`   Role: ${role}`);
    }

    // Handle device tokens
    console.log(`\n📱 Seeding ${deviceTokensData.length} device tokens...`);

    let insertedCount = 0;
    let updatedCount = 0;

    for (const tokenData of deviceTokensData) {
      const existingToken = await deviceTokensCollection.findOne({ _id: tokenData.id });

      const tokenDocument = {
        _id: tokenData.id,
        userId: userData.id,
        token: tokenData.token,
        platform: tokenData.platform,
        provider: tokenData.provider,
        deviceId: tokenData.deviceId,
        channel: 'push', // Required field
        isActive: tokenData.isActive,
        lastUsedAt: new Date('2025-10-22T18:57:02.303Z'),
        createdAt: now,
        updatedAt: now,
      };

      if (existingToken) {
        await deviceTokensCollection.updateOne({ _id: tokenData.id }, { $set: tokenDocument });
        updatedCount++;
        console.log(`   ✅ Updated token: ${tokenData.id} (${tokenData.platform})`);
      } else {
        await deviceTokensCollection.insertOne(tokenDocument);
        insertedCount++;
        console.log(`   ✅ Created token: ${tokenData.id} (${tokenData.platform})`);
      }
    }

    console.log(`\n✅ Device tokens seeding completed:`);
    console.log(`   Created: ${insertedCount}`);
    console.log(`   Updated: ${updatedCount}`);

    // Verify
    const userCount = await usersCollection.countDocuments({ _id: userData.id });
    const tokenCount = await deviceTokensCollection.countDocuments({ userId: userData.id });

    console.log(`\n📊 Verification:`);
    console.log(`   User exists: ${userCount > 0 ? '✅' : '❌'}`);
    console.log(`   Device tokens: ${tokenCount}`);

    console.log('\n✅ User seeding completed successfully');
  } catch (error) {
    console.error('❌ Error seeding user:', error);
    throw error;
  } finally {
    await client.close();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedUser()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ User seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedUser };
