# Notification Event API - Hướng Dẫn Gửi Event từ Services

## ⚠️ DEPRECATED - Format Cũ Đã Bị Loại Bỏ

**File này chứa format cũ đã bị deprecated. Vui lòng sử dụng format mới:**

👉 **[Notification Event Format V2](../notification-event-format-v2.md)** - Format chuẩn hiện tại

---

## Endpoint (RabbitMQ)

Services gửi events qua **RabbitMQ Exchange**:

- **Exchange**: `notifications.exchange`
- **Routing Key**: `{service}.{EventName}` (ví dụ: `loaphuong.AnnouncementCreated`)
- **Message Format**: JSON

## ⚠️ Cấu trúc Event Body (DEPRECATED)

> **LƯU Ý**: Format dưới đây đã bị loại bỏ. Sử dụng format mới trong `notification-event-format-v2.md`

### Standard Event Format (DEPRECATED)

```typescript
// ⚠️ DEPRECATED - Không sử dụng format này nữa
interface NotificationEvent {
  eventId: string; // Unique event ID (CUID)
  eventType: string; // Format: {service}.{EventName}
  aggregateId: string; // ID của entity (announcement, task, etc.)
  aggregateType: string; // Type của entity (Announcement, Task, etc.)
  timestamp: string; // ISO 8601 format
  correlationId?: string; // For tracing
  payload: {
    notification: {
      title: string; // Required: Max 200 chars
      body: string; // Required: Max 1000 chars
      type: 'announcement' | 'payment' | 'booking' | 'emergency';
      priority: 'urgent' | 'high' | 'normal' | 'low';
      channels: ('push' | 'in-app')[]; // At least one required
      targetUsers?: string[]; // ❌ DEPRECATED: Dùng notification.target.users
      targetRoles?: string[]; // ❌ DEPRECATED: Dùng notification.target.roles
      scheduledAt?: string; // ISO date - for scheduled notifications
      data?: Record<string, any>; // Additional metadata
    };
    sourceService: string; // Required: Service name (loaphuong, task, etc.)
    contentId: string; // Required: For redirect URL
    contentType?: string; // Optional: Content type
    redirectUrl?: string; // Optional: Custom redirect (override pattern)
    data?: Record<string, any>; // ❌ DEPRECATED: Dùng notification.data
  };
  metadata?: Record<string, any>; // Optional: Additional metadata
}
```

## Ví dụ Code cho Loa Phường Service

### Node.js/NestJS Example

```typescript
import { Injectable } from '@nestjs/common';
import { RabbitMQService } from '@nestjs/microservices';

@Injectable()
export class LoaphuongNotificationService {
  constructor(private readonly rabbitMQ: RabbitMQService) {}

  async sendAnnouncementNotification(announcement: Announcement) {
    // ⚠️ DEPRECATED EXAMPLE - Sử dụng format mới trong notification-event-format-v2.md
    const event = {
      eventId: generateCuid(),
      eventType: 'loaphuong.AnnouncementCreated',
      aggregateId: announcement.id,
      aggregateType: 'Announcement',
      timestamp: new Date().toISOString(),
      correlationId: generateCorrelationId(),
      payload: {
        notification: {
          title: announcement.title,
          body: announcement.content,
          type: 'announcement',
          priority: announcement.priority || 'normal',
          channels: ['push', 'in-app'], // ⭐ Push + In-app
          // ❌ DEPRECATED: targetRoles - Dùng target object thay thế
          target: {
            roles: ['RESIDENT'], // ✅ Format mới
            users: [], // ✅ Format mới
          },
          data: {
            // ✅ Format mới: chỉ dùng notification.data
            announcementId: announcement.id,
            category: announcement.category,
            buildingId: announcement.buildingId,
          },
        },
        sourceService: 'loaphuong', // ⭐ Quan trọng: để resolve redirect URL
        contentId: announcement.id, // ⭐ Quan trọng: cho redirect URL
        contentType: 'announcement',
        // ❌ DEPRECATED: payload.data - Đã merge vào notification.data
      },
      metadata: {
        source: 'loaphuong-service',
        version: '1.0.0',
      },
    };

    // Publish to RabbitMQ
    await this.rabbitMQ.publish('notifications.exchange', 'loaphuong.AnnouncementCreated', event);
  }
}
```

## Luồng Xử Lý

```
1. Service (loa phường) → Publish event to RabbitMQ
   ↓
2. Notification Service → Consume event from RabbitMQ
   ↓
3. Event Handler → Validate và transform event
   ↓
4. Notification Processing Service → Create notification
   ↓
5. Priority Queue Service → Enqueue notification
   ↓
6. Worker → Process và resolve redirect URL
   ↓
7. Novu Client → Trigger workflow với redirect URL
   ↓
8. Novu → Send push + save in-app to inbox
```

## Redirect URL Auto-Resolve

Hệ thống tự động resolve redirect URL dựa trên:

1. **sourceService** → Tìm pattern trong `.env`
2. **contentId** → Replace vào pattern
3. **Kết quả**: `/announcements/{contentId}` → `/announcements/announcement-123`

### Pattern Mapping

| sourceService | Pattern (from .env)          | Example Result                |
| ------------- | ---------------------------- | ----------------------------- |
| `loaphuong`   | `/announcements/{contentId}` | `/announcements/announce-123` |
| `task`        | `/tasks/{contentId}`         | `/tasks/task-456`             |
| `payment`     | `/payments/{contentId}`      | `/payments/payment-789`       |
| `booking`     | `/bookings/{contentId}`      | `/bookings/booking-101`       |

## Validation Rules

### Required Fields

- ✅ `eventType`
- ✅ `payload.notification.title`
- ✅ `payload.notification.body`
- ✅ `payload.notification.type`
- ✅ `payload.notification.priority`
- ✅ `payload.notification.channels` (ít nhất 1 channel)
- ✅ `payload.sourceService`
- ✅ `payload.contentId` (nếu muốn có redirect URL)

### Optional Fields

- ⚪ `targetUsers` - Nếu không có, sẽ target theo `targetRoles`
- ⚪ `targetRoles` - Nếu không có cả 2, sẽ gửi cho tất cả users
- ⚪ `redirectUrl` - Nếu không có, sẽ auto-resolve
- ⚪ `scheduledAt` - Nếu có, sẽ schedule notification

## Error Handling

Nếu event không đúng format:

- ❌ Event sẽ bị reject và move to DLQ
- ✅ Log error với correlationId để trace
- ✅ Retry logic sẽ tự động xử lý

## Best Practices

1. **Luôn include sourceService và contentId** để có redirect URL
2. **Sử dụng correlationId** để trace events
3. **Chọn channels phù hợp**:
   - Chỉ push: `['push']`
   - Chỉ in-app: `['in-app']`
   - Cả hai: `['push', 'in-app']`
4. **Priority hợp lý**:
   - `urgent`: Chỉ cho emergency
   - `high`: Cần xử lý ngay
   - `normal`: Mặc định
   - `low`: Không quan trọng
