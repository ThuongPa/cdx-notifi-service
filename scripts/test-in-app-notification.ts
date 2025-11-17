import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PriorityQueueService, PriorityMessage } from '../src/modules/notification/priority-queue/priority-queue.service';
import { CuidUtil } from '../src/common/utils/cuid.util';

async function bootstrap() {
  console.log('🚀 Starting test script to send in-app notification...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const priorityQueueService = app.get(PriorityQueueService);

  const subscriberId = 'cmfxplnhx0000mthirstsrxze'; // Subscriber ID from Novu

  // Create notification message
  const notificationMessage: PriorityMessage = {
    id: CuidUtil.generate(),
    userId: subscriberId,
    type: 'announcement',
    title: 'Test In-App Notification với Redirect',
    body: 'Đây là thông báo in-app test với redirect URL. Click vào notification sẽ redirect đến /tasks/test-task-123',
    priority: 'normal',
    data: {
      channels: ['in-app'], // Specify in-app channel
      taskId: 'test-task-123', // ⭐ TaskId cho redirect URL trong Novu workflow
      data: {
        source: 'test-script',
        timestamp: new Date().toISOString(),
        test: true,
      },
    },
    retryCount: 0,
    maxRetries: 3,
  };

  try {
    console.log(`📤 Sending in-app notification to subscriber: ${subscriberId}`);
    console.log(`   Title: ${notificationMessage.title}`);
    console.log(`   Body: ${notificationMessage.body}`);
    console.log(`   Channels: ${notificationMessage.data.channels.join(', ')}\n`);

    await priorityQueueService.enqueueNotification(notificationMessage);

    console.log('✅ Notification successfully enqueued!');
    console.log('   The notification will be processed by the queue worker and sent to Novu.\n');
    console.log('📋 Next steps:');
    console.log('   1. Check Novu dashboard -> Subscribers -> Inbox');
    console.log(`   2. Look for subscriber ID: ${subscriberId}`);
    console.log('   3. Verify the in-app notification appears in the inbox\n');
  } catch (error) {
    console.error('❌ Failed to send in-app notification:', error);
    if (error.message) {
      console.error(`   Error: ${error.message}`);
    }
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
  } finally {
    await app.close();
    console.log('🔚 Script completed.');
  }
}

bootstrap().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

