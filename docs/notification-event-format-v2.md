# Notification Event Format V2 - Format Chuẩn (Không Còn Backward Compatibility)

## ⚠️ Breaking Changes

**Format cũ đã bị loại bỏ hoàn toàn. Tất cả services phải sử dụng format mới này.**

## Format Event Chuẩn

### Cấu trúc Event

```json
{
  "eventId": "event-cuid-123", // Optional
  "eventType": "{service}.{EventName}", // REQUIRED
  "aggregateId": "aggregate-id", // Optional
  "aggregateType": "Announcement", // Optional
  "timestamp": "2024-11-05T16:00:00Z", // Optional
  "correlationId": "correlation-id-123", // Optional
  "payload": {
    "notification": {
      "title": "Tiêu đề thông báo", // REQUIRED
      "body": "Nội dung thông báo", // REQUIRED
      "type": "announcement", // REQUIRED
      "priority": "normal", // REQUIRED
      "channels": ["push", "in-app"], // REQUIRED - at least 1
      "target": {
        // Optional
        "users": ["user-123", "user-456"],
        "roles": ["RESIDENT", "ADMIN"],
        "segments": ["segment-1"]
      },
      "scheduledAt": "2024-11-05T17:00:00Z", // Optional
      "expiresAt": "2024-11-06T17:00:00Z", // Optional
      "actionButtons": [
        // Optional
        {
          "label": "Xem chi tiết",
          "action": "/announcements/123",
          "style": "primary"
        }
      ],
      "data": {
        // Optional
        "announcementId": "announcement-123",
        "category": "general"
      }
    },
    "sourceService": "loaphuong", // REQUIRED
    "contentId": "announcement-123", // REQUIRED
    "redirectUrl": "/announcements/announcement-123", // Optional - auto-resolve if not provided
    "contentType": "announcement" // Optional - auto-resolve from type if not provided
  },
  "metadata": {
    // Optional
    "source": "loaphuong-service",
    "version": "1.0.0"
  }
}
```

## Required Fields

### Event Level

- ✅ `eventType` - Format: `{service}.{EventName}` (ví dụ: `loaphuong.AnnouncementCreated`)

### Payload Level

- ✅ `payload.notification` - Notification object
- ✅ `payload.sourceService` - Service name để resolve redirect URL
- ✅ `payload.contentId` - ID của content để resolve redirect URL

### Notification Level

- ✅ `payload.notification.title` - Tiêu đề (max 200 chars)
- ✅ `payload.notification.body` - Nội dung (max 1000 chars)
- ✅ `payload.notification.type` - Loại: `announcement` | `payment` | `booking` | `emergency`
- ✅ `payload.notification.priority` - Độ ưu tiên: `urgent` | `high` | `normal` | `low`
- ✅ `payload.notification.channels` - Ít nhất 1 channel: `['push']` | `['in-app']` | `['push', 'in-app']`

## Optional Fields

### Notification Targeting

- ⚪ `payload.notification.target` - Object chứa targeting info
  - `target.users` - Danh sách user IDs cụ thể
  - `target.roles` - Danh sách roles (RESIDENT, ADMIN, etc.)
  - `target.segments` - Danh sách segments (nếu có segmentation)
- **Lưu ý**: Nếu không có `target`, sẽ broadcast cho tất cả active users

### Scheduling & Expiration

- ⚪ `payload.notification.scheduledAt` - ISO date string - Schedule notification
- ⚪ `payload.notification.expiresAt` - ISO date string - Notification sẽ expire sau thời điểm này

### Action Buttons (In-App)

- ⚪ `payload.notification.actionButtons` - Array of action buttons
  - `label` - Text hiển thị trên button
  - `action` - URL hoặc action type
  - `style` - `primary` | `secondary`

### Additional Data

- ⚪ `payload.notification.data` - Additional metadata (chỉ ở đây, không dùng `payload.data`)
- ⚪ `payload.redirectUrl` - Custom redirect URL (override auto-resolve)
- ⚪ `payload.contentType` - Content type (override auto-resolve)

### Event Metadata

- ⚪ `eventId` - Unique event ID (CUID)
- ⚪ `aggregateId` - ID của entity
- ⚪ `aggregateType` - Type của entity
- ⚪ `timestamp` - ISO 8601 format
- ⚪ `correlationId` - For distributed tracing
- ⚪ `metadata` - Event-level metadata (chỉ cho tracing, không dùng cho business logic)

## ❌ Deprecated Fields (Đã Loại Bỏ)

Các field sau đã bị loại bỏ và sẽ gây lỗi validation:

- ❌ `payload.notification.targetUsers` - **DEPRECATED**: Dùng `notification.target.users` thay thế
- ❌ `payload.notification.targetRoles` - **DEPRECATED**: Dùng `notification.target.roles` thay thế
- ❌ `payload.data` - **DEPRECATED**: Dùng `notification.data` thay thế

## Ví dụ

### Minimum Required Format

```json
{
  "eventType": "loaphuong.AnnouncementCreated",
  "payload": {
    "notification": {
      "title": "Thông báo mới",
      "body": "Có thông báo mới từ loa phường",
      "type": "announcement",
      "priority": "normal",
      "channels": ["push", "in-app"]
    },
    "sourceService": "loaphuong",
    "contentId": "announcement-123"
  }
}
```

### Full Format với Targeting

```json
{
  "eventId": "event-announce-123",
  "eventType": "loaphuong.AnnouncementCreated",
  "aggregateId": "announcement-123",
  "aggregateType": "Announcement",
  "timestamp": "2024-11-05T16:00:00Z",
  "correlationId": "corr-123",
  "payload": {
    "notification": {
      "title": "Thông báo từ loa phường",
      "body": "Có thông báo mới về quy định chung cư",
      "type": "announcement",
      "priority": "normal",
      "channels": ["push", "in-app"],
      "target": {
        "users": ["user-123"],
        "roles": ["RESIDENT"]
      },
      "actionButtons": [
        {
          "label": "Xem chi tiết",
          "action": "/announcements/announcement-123",
          "style": "primary"
        }
      ],
      "data": {
        "announcementId": "announcement-123",
        "category": "general",
        "buildingId": "building-A"
      }
    },
    "sourceService": "loaphuong",
    "contentId": "announcement-123",
    "contentType": "announcement"
  }
}
```

## Redirect URL Auto-Resolve

Hệ thống tự động resolve redirect URL từ:

- `sourceService` → Tìm pattern trong `.env` (`NOTIFICATION_REDIRECT_{SERVICE}`)
- `contentId` → Replace vào pattern
- **Kết quả**: `/announcements/{contentId}` → `/announcements/announcement-123`

Nếu muốn override, set `payload.redirectUrl` với custom URL.

## Validation Rules

1. **Required fields** phải có đầy đủ
2. **Channels** phải có ít nhất 1 channel
3. **Target**: Nếu không có, sẽ broadcast cho tất cả active users
4. **Data**: Chỉ dùng `notification.data`, không dùng `payload.data`
5. **Old format fields** sẽ gây validation error

## Error Messages

Nếu sử dụng format cũ, sẽ nhận được các lỗi sau:

- `Old format detected: targetUsers and targetRoles are deprecated. Use notification.target object instead.`
- `Old format detected: payload.data is deprecated. Use notification.data instead.`

## Migration Guide

### Từ Format Cũ Sang Format Mới

**Format Cũ (Đã Loại Bỏ):**

```json
{
  "payload": {
    "notification": {
      "targetUsers": ["user-123"],
      "targetRoles": ["RESIDENT"],
      "data": {...}
    },
    "data": {...}
  }
}
```

**Format Mới:**

```json
{
  "payload": {
    "notification": {
      "target": {
        "users": ["user-123"],
        "roles": ["RESIDENT"]
      },
      "data": {...}  // Merge cả payload.data vào đây
    }
  }
}
```

## Best Practices

1. **Luôn include `sourceService` và `contentId`** để có redirect URL tự động
2. **Sử dụng `target` object** thay vì `targetUsers`/`targetRoles` riêng lẻ
3. **Chỉ dùng `notification.data`** để chứa metadata, không dùng `payload.data`
4. **Sử dụng `correlationId`** để trace events
5. **Chọn channels phù hợp**:
   - Chỉ push: `['push']`
   - Chỉ in-app: `['in-app']`
   - Cả hai: `['push', 'in-app']`
