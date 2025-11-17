# Hướng Dẫn Sử Dụng In-App Notifications cho Client Apps

## Tổng quan

Client apps (frontend/mobile) gọi **trực tiếp Novu self-hosted API** để quản lý in-app notifications. Điều này giúp **giảm latency** và **tránh gọi API 2 lần** (không cần qua Notification Service proxy layer).

### Kiến trúc

```
┌─────────────┐
│ Client App │
└──────┬──────┘
       │ GET /v1/subscribers/{id}/notifications/feeds (ApiKey)
       ▼
┌──────────────────┐
│ Novu Self-Hosted │ ← Storage & Inbox Management (Trực tiếp)
│   (Inbox DB)     │
└──────────────────┘
```

**Lợi ích của việc gọi trực tiếp:**

1. ✅ **Giảm latency**: Không cần qua Notification Service (1 hop thay vì 2 hops)
2. ✅ **Giảm server load**: Notification Service không cần xử lý read requests
3. ✅ **Đơn giản hóa**: Client gọi trực tiếp đến nguồn dữ liệu
4. ✅ **Real-time**: Truy cập trực tiếp đến Novu inbox database

**Client có thể thực hiện:**

- Lấy danh sách in-app notifications
- Đánh dấu đã đọc (read/unread)
- Lấy số lượng thông báo chưa đọc
- Xử lý redirect URL khi user click vào notification

## Base URL

```
{NOVU_API_URL}/v1
```

**Ví dụ**: `https://your-novu-instance.com/v1`

**Lưu ý**:

- Tất cả endpoints đều yêu cầu **Novu API Key** trong header `Authorization: ApiKey <API_KEY>`
- API Key cần được cấp từ Novu self-hosted instance
- `subscriberId` = `userId` của user trong hệ thống

## Endpoints

### 1. Lấy Danh Sách In-App Notifications

**Endpoint**: `GET /v1/subscribers/{subscriberId}/notifications/feeds`

**Headers**:

```
Authorization: ApiKey <NOVU_API_KEY>
Content-Type: application/json
```

**Path Parameters**:

- `subscriberId`: User ID (subscriber ID trong Novu) - thường là `userId` từ hệ thống

**Query Parameters**:

- `page` (optional, default: 1): Số trang
- `limit` (optional, default: 20, max: 100): Số lượng items mỗi trang
- `seen` (optional): Lọc theo trạng thái đã xem
  - `true`: Chỉ lấy những thông báo đã đọc
  - `false`: Chỉ lấy những thông báo chưa đọc
  - Không có: Lấy tất cả

**Ví dụ Request**:

```bash
GET {NOVU_API_URL}/v1/subscribers/user-id-123/notifications/feeds?page=1&limit=20&seen=false
Authorization: ApiKey your-novu-api-key-here
```

**Response Structure** (Novu API format):

```json
{
  "data": [
    {
      "id": "message-id-123",
      "title": "Thông báo mới",
      "content": "Nội dung thông báo",
      "read": false,
      "seen": false,
      "payload": {
        "redirectUrl": "/tasks/12345",
        "taskId": "12345",
        "contentId": "12345",
        "sourceService": "loaphuong",
        "contentType": "announcement",
        "announcementId": "ann-123"
      },
      "createdAt": "2025-01-11T10:00:00.000Z",
      "readAt": null
    }
  ],
  "totalCount": 50,
  "page": 1,
  "pageSize": 20,
  "hasMore": true
}
```

**Lưu ý**: Novu API trả về response trực tiếp - không có wrapper `success`, `message`, `timestamp`. Data trực tiếp trong response.

**Response Fields**:

- `id`: Message ID duy nhất
- `title`: Tiêu đề thông báo
- `content`: Nội dung thông báo
- `read`: Đã đọc hay chưa (boolean)
- `seen`: Đã xem hay chưa (boolean)
- `payload`: Object chứa metadata (Novu dùng "payload" thay vì "data"):
  - `redirectUrl`: URL để redirect khi user click vào notification
  - `taskId`: ID của task (nếu có)
  - `contentId`: ID của content
  - `sourceService`: Service gửi notification (ví dụ: "loaphuong")
  - `contentType`: Loại content (ví dụ: "announcement")
  - `announcementId`: ID của announcement (nếu có)

  **Lưu ý**: Novu có thể dùng `payload` hoặc `data` tùy version, nên check cả 2.

- `createdAt`: Thời gian tạo
- `readAt`: Thời gian đọc (null nếu chưa đọc)

---

### 2. Đánh Dấu Đã Đọc (Mark as Read)

**Endpoint**: `PATCH /v1/subscribers/{subscriberId}/messages/{messageId}/read`

**Headers**:

```
Authorization: ApiKey <NOVU_API_KEY>
Content-Type: application/json
```

**Path Parameters**:

- `subscriberId`: User ID (subscriber ID trong Novu)
- `messageId`: ID của message cần đánh dấu đã đọc

**Ví dụ Request**:

```bash
PATCH {NOVU_API_URL}/v1/subscribers/user-id-123/messages/message-id-123/read
Authorization: ApiKey your-novu-api-key-here
```

**Response** (Novu API format):

```json
{
  "success": true
}
```

---

### 3. Đánh Dấu Tất Cả Đã Đọc (Mark All as Read)

**Endpoint**: `PATCH /v1/subscribers/{subscriberId}/messages/read`

**Headers**:

```
Authorization: ApiKey <NOVU_API_KEY>
Content-Type: application/json
```

**Path Parameters**:

- `subscriberId`: User ID (subscriber ID trong Novu)

**Ví dụ Request**:

```bash
PATCH {NOVU_API_URL}/v1/subscribers/user-id-123/messages/read
Authorization: ApiKey your-novu-api-key-here
```

**Response** (Novu API format):

```json
{
  "success": true
}
```

---

### 4. Lấy Số Lượng Chưa Đọc (Unread Count)

**Endpoint**: `GET /v1/subscribers/{subscriberId}/notifications/unseen`

**Headers**:

```
Authorization: ApiKey <NOVU_API_KEY>
Content-Type: application/json
```

**Path Parameters**:

- `subscriberId`: User ID (subscriber ID trong Novu)

**Ví dụ Request**:

```bash
GET {NOVU_API_URL}/v1/subscribers/user-id-123/notifications/unseen
Authorization: ApiKey your-novu-api-key-here
```

**Response** (Novu API format):

```json
{
  "data": {
    "count": 5
  }
}
```

hoặc có thể trả về:

```json
{
  "count": 5
}
```

---

## Cách Sử Dụng trong Client App

### 1. Fetch Notifications (Ví dụ với React/TypeScript)

```typescript
interface InAppMessage {
  id: string;
  title: string;
  content: string;
  read: boolean;
  seen: boolean;
  payload?: {
    redirectUrl?: string;
    taskId?: string;
    contentId?: string;
    sourceService?: string;
    contentType?: string;
    announcementId?: string;
  };
  data?: {
    redirectUrl?: string;
    taskId?: string;
    contentId?: string;
    sourceService?: string;
    contentType?: string;
    announcementId?: string;
  };
  createdAt: string;
  readAt?: string;
}

interface InAppMessagesResponse {
  data: InAppMessage[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

async function fetchInAppNotifications(
  apiKey: string,
  subscriberId: string,
  page: number = 1,
  limit: number = 20,
  seen?: boolean,
): Promise<InAppMessagesResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (seen !== undefined) {
    params.append('seen', seen.toString());
  }

  const response = await fetch(
    `${NOVU_API_URL}/v1/subscribers/${subscriberId}/notifications/feeds?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch notifications: ${response.statusText}`);
  }

  return response.json();
}
```

### 2. Mark as Read

```typescript
async function markAsRead(apiKey: string, subscriberId: string, messageId: string): Promise<void> {
  const response = await fetch(
    `${NOVU_API_URL}/v1/subscribers/${subscriberId}/messages/${messageId}/read`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to mark as read: ${response.statusText}`);
  }
}
```

### 3. Get Unread Count

```typescript
async function getUnreadCount(apiKey: string, subscriberId: string): Promise<number> {
  const response = await fetch(
    `${NOVU_API_URL}/v1/subscribers/${subscriberId}/notifications/unseen`,
    {
      method: 'GET',
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get unread count: ${response.statusText}`);
  }

  const result = await response.json();
  // Novu có thể trả về { data: { count: 5 } } hoặc { count: 5 }
  return result.data?.count || result.count || 0;
}
```

### 4. Handle Notification Click (Redirect)

```typescript
function handleNotificationClick(message: InAppMessage, apiKey: string, subscriberId: string) {
  // Đánh dấu đã đọc
  markAsRead(apiKey, subscriberId, message.id).catch(console.error);

  // Redirect theo redirectUrl trong payload (Novu dùng "payload" thay vì "data")
  const redirectUrl = message.payload?.redirectUrl || message.data?.redirectUrl;
  if (redirectUrl) {
    // Nếu là relative URL (ví dụ: /tasks/123)
    if (redirectUrl.startsWith('/')) {
      window.location.href = redirectUrl;
    } else {
      // Nếu là absolute URL
      window.location.href = redirectUrl;
    }
  }
}
```

---

## Polling Strategy

Để hiển thị real-time notifications, client có thể:

1. **Polling định kỳ** (ví dụ: mỗi 30 giây):

```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    const unreadCount = await getUnreadCount(apiKey, subscriberId);
    if (unreadCount > 0) {
      // Refresh notifications list
      const notifications = await fetchInAppNotifications(apiKey, subscriberId);
      // Update UI
    }
  }, 30000); // 30 seconds

  return () => clearInterval(interval);
}, [apiKey, subscriberId]);
```

2. **WebSocket** (nếu có): Lắng nghe real-time events từ server

---

## Error Handling

Tất cả endpoints có thể trả về các lỗi sau:

- `401 Unauthorized`: API Key không hợp lệ hoặc đã hết hạn
- `404 Not Found`: Message hoặc subscriber không tồn tại
- `500 Internal Server Error`: Lỗi server

**Ví dụ Error Response**:

```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

---

## Best Practices

1. **Cache Unread Count**: Lưu unread count trong local state để tránh fetch quá nhiều
2. **Lazy Loading**: Load thêm notifications khi user scroll đến cuối danh sách
3. **Optimistic Updates**: Đánh dấu đã đọc ngay trong UI trước khi API call thành công
4. **Error Retry**: Retry khi API call thất bại
5. **Debounce**: Debounce polling requests để tránh spam server
6. **Secure API Key**: Lưu API Key trong environment variables, không hardcode trong code

---

## Ví Dụ Hoàn Chỉnh (React Component)

```typescript
import React, { useState, useEffect } from 'react';

function InAppNotifications() {
  const [notifications, setNotifications] = useState<InAppMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // ⭐ Sử dụng Novu API Key và Subscriber ID
  const apiKey = process.env.NEXT_PUBLIC_NOVU_API_KEY || '';
  const subscriberId = useAuth().user?.id || ''; // Lấy từ JWT token hoặc auth context

  useEffect(() => {
    if (!apiKey || !subscriberId) return;

    loadNotifications();
    loadUnreadCount();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      loadUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [apiKey, subscriberId]);

  const loadNotifications = async () => {
    try {
      const response = await fetchInAppNotifications(apiKey, subscriberId, 1, 20);
      // Novu trả về { data: [...], totalCount, page, pageSize, hasMore }
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const count = await getUnreadCount(apiKey, subscriberId);
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    try {
      await markAsRead(apiKey, subscriberId, messageId);
      // Update local state
      setNotifications(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, read: true } : msg
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleNotificationClick = (message: InAppMessage) => {
    handleMarkAsRead(message.id);
    // Novu dùng "payload" thay vì "data"
    const redirectUrl = message.payload?.redirectUrl || message.data?.redirectUrl;
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>In-App Notifications ({unreadCount} unread)</h2>
      {notifications.map(message => (
        <div
          key={message.id}
          onClick={() => handleNotificationClick(message)}
          className={message.read ? 'read' : 'unread'}
        >
          <h3>{message.title}</h3>
          <p>{message.content}</p>
          <small>{new Date(message.createdAt).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}
```

---

## Tóm Tắt

Client apps gọi **trực tiếp 4 Novu API endpoints**:

1. `GET /v1/subscribers/{subscriberId}/notifications/feeds` - Lấy danh sách notifications
2. `PATCH /v1/subscribers/{subscriberId}/messages/{messageId}/read` - Đánh dấu đã đọc
3. `PATCH /v1/subscribers/{subscriberId}/messages/read` - Đánh dấu tất cả đã đọc
4. `GET /v1/subscribers/{subscriberId}/notifications/unseen` - Lấy số lượng chưa đọc

Tất cả endpoints đều yêu cầu **Novu API Key** trong header `Authorization: ApiKey <API_KEY>`.

---

## Lưu ý Quan Trọng

### Authentication

- **Novu API Key**: Cần được cấp từ Novu self-hosted instance
- **Subscriber ID**: Thường là `userId` từ hệ thống authentication
- **Security**: API Key nên được lưu trong environment variables, không hardcode trong client code

### Response Format

- Novu API trả về response **trực tiếp** (không có wrapper `success`, `message`, `timestamp`)
- Data structure có thể khác tùy version của Novu
- Nên handle cả `payload` và `data` fields để tương thích với các version khác nhau

### Lợi ích của việc gọi trực tiếp

1. ✅ **Giảm latency**: Không cần qua Notification Service (1 hop thay vì 2 hops)
2. ✅ **Giảm server load**: Notification Service không cần xử lý read requests
3. ✅ **Real-time**: Truy cập trực tiếp đến Novu inbox database
4. ✅ **Đơn giản hóa**: Ít layer hơn, dễ debug hơn

### Trade-offs

- ⚠️ **Security**: Client cần biết Novu API Key (cần quản lý cẩn thận)
- ⚠️ **Error Handling**: Client phải tự handle Novu API errors
- ⚠️ **Coupling**: Client phụ thuộc trực tiếp vào Novu API structure

### Messages được lưu ở đâu?

**In-app messages được lưu trong Novu inbox database**.

- **Novu inbox DB**: Lưu trữ messages, quản lý read/unread status, pagination
- **Notification Service MongoDB**: Chỉ lưu metadata (UserNotification records) để tracking và analytics khi trigger workflow

### Flow thực tế

```
1. Client gọi: GET /v1/subscribers/{subscriberId}/notifications/feeds (ApiKey)
   ↓
2. Novu Self-Hosted:
   - Validate ApiKey
   - Query inbox database
   - Trả về messages từ Novu inbox
   ↓
3. Client nhận response trực tiếp từ Novu
```

---

## Kết luận

Client apps gọi **trực tiếp Novu self-hosted API** để quản lý in-app notifications. Điều này giúp:

1. **Performance**: Giảm latency và server load
2. **Simplicity**: Ít layer, dễ hiểu và maintain
3. **Real-time**: Truy cập trực tiếp đến nguồn dữ liệu

Tuy nhiên cần lưu ý về **security** khi quản lý Novu API Key trong client applications.
