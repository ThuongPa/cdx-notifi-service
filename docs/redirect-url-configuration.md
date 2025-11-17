# Redirect URL Configuration Guide

## Tổng quan

Hệ thống notification service hỗ trợ tự động resolve redirect URL cho in-app notifications từ nhiều services khác nhau. Mỗi service có thể có pattern redirect URL riêng.

## Cấu hình trong .env

### Format
```env
NOTIFICATION_REDIRECT_{SERVICE_NAME}=/path/{contentId}
```

### Ví dụ
```env
# Loa phường service
NOTIFICATION_REDIRECT_LOAPHUONG=/announcements/{contentId}

# Task service
NOTIFICATION_REDIRECT_TASK=/tasks/{contentId}

# Payment service
NOTIFICATION_REDIRECT_PAYMENT=/payments/{contentId}

# Booking service
NOTIFICATION_REDIRECT_BOOKING=/bookings/{contentId}

# Default pattern
NOTIFICATION_REDIRECT_DEFAULT=/notifications/{contentId}
```

### Placeholders hỗ trợ
- `{contentId}` - Content ID từ event
- `{id}` - Alias cho contentId
- `{contentType}` - Type của content (nếu có)

## Cách sử dụng

### Option 1: Tự động resolve từ service name

```typescript
const notificationMessage: PriorityMessage = {
  id: CuidUtil.generate(),
  userId: 'user-123',
  type: 'announcement',
  title: 'Thông báo mới từ loa phường',
  body: 'Có thông báo mới...',
  priority: 'normal',
  data: {
    channels: ['in-app'],
    sourceService: 'loaphuong', // ⭐ Service name
    contentId: 'announcement-123', // ⭐ Content ID
    data: {
      // ... other data
    },
  },
};
```

**Kết quả**: Redirect URL = `/announcements/announcement-123`

### Option 2: Custom redirect URL (override)

```typescript
const notificationMessage: PriorityMessage = {
  id: CuidUtil.generate(),
  userId: 'user-123',
  type: 'announcement',
  title: 'Thông báo',
  body: 'Content...',
  priority: 'normal',
  data: {
    channels: ['in-app'],
    redirectUrl: '/custom/path/123', // ⭐ Custom URL (takes priority)
    contentId: 'content-123',
  },
};
```

**Kết quả**: Redirect URL = `/custom/path/123` (ignore pattern)

### Option 3: Sử dụng từ event RabbitMQ

Khi nhận event từ loa phường service:

```json
{
  "eventType": "loaphuong.AnnouncementCreated",
  "payload": {
    "contentId": "announcement-456",
    "title": "Thông báo mới",
    "body": "Nội dung thông báo",
    "sourceService": "loaphuong"
  }
}
```

Hệ thống sẽ tự động:
1. Detect `sourceService: "loaphuong"`
2. Lấy `contentId: "announcement-456"`
3. Resolve redirect URL: `/announcements/announcement-456`

## Thứ tự ưu tiên

1. **Custom redirectUrl** (nếu có) → Sử dụng trực tiếp
2. **Auto-resolve từ service pattern** → Dựa vào `sourceService` + `contentId`
3. **Default pattern** → Nếu không tìm thấy service pattern
4. **Không có redirect** → Nếu không có contentId

## Thêm service mới

Để thêm service mới, chỉ cần thêm vào `.env`:

```env
NOTIFICATION_REDIRECT_NEWSERVICE=/news/{contentId}
```

Sau đó khi gửi notification:

```typescript
data: {
  sourceService: 'newservice', // Match với env var
  contentId: 'news-123',
}
```

## Ví dụ thực tế

### Loa phường service gửi event

```typescript
// Event từ loa phường service
{
  eventType: 'loaphuong.AnnouncementCreated',
  payload: {
    contentId: 'announce-789',
    title: 'Thông báo từ loa phường',
    body: 'Có thông báo mới...',
    sourceService: 'loaphuong'
  }
}

// → Redirect URL: /announcements/announce-789
```

### Task service gửi event

```typescript
// Event từ task service
{
  eventType: 'task.TaskAssigned',
  payload: {
    contentId: 'task-456',
    title: 'Bạn có task mới',
    body: 'Task cần xử lý...',
    sourceService: 'task'
  }
}

// → Redirect URL: /tasks/task-456
```

## Lưu ý

1. Service name trong env var không phân biệt hoa thường
2. Nếu không có pattern, sẽ dùng default pattern
3. Nếu không có contentId, redirect URL sẽ là undefined
4. Custom redirectUrl luôn được ưu tiên cao nhất

