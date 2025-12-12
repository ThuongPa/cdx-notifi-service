# Tài Liệu Tổng Hợp: Service-to-Service Authentication và Webhook Registration APIs

**Ngày cập nhật:** 10/12/2025  
**Branch:** `thuongpa`  
**Commit:** `b966c38`

---

## 📋 Tổng Quan

Tài liệu này tổng hợp tất cả các thay đổi đã được triển khai để hỗ trợ **Service-to-Service Authentication** và **Webhook Registration APIs** cho notification service, đặc biệt phục vụ cho service `cdx-loaphuong` và các external services khác.

---

## 🎯 Mục Tiêu

1. **Service-to-Service Authentication**: Cho phép các service khác (như `cdx-loaphuong`) gọi API mà không cần JWT token của user
2. **Webhook Registration**: Cho phép external services đăng ký webhook để nhận thông báo về trạng thái notification
3. **Notification Tracking**: Hỗ trợ query notification theo `correlationId`, `sourceService`, và `sentBy`
4. **Backward Compatibility**: Đảm bảo các API hiện tại (dùng JWT) vẫn hoạt động bình thường

---

## 🔐 1. Service-to-Service Authentication

### 1.1. Guards Mới

#### `ServiceNameGuard`

- **File:** `src/common/guards/service-name.guard.ts`
- **Mục đích:** Chỉ cho phép service-to-service calls với header `X-Service-Name`
- **Whitelist Services:**
  - `cdx-loaphuong`
  - `cdx-task`
  - `cdx-payment`
  - `cdx-booking`

**Cách sử dụng:**

```typescript
@UseGuards(ServiceNameGuard)
@Get('endpoint')
async endpoint() {
  // Chỉ chấp nhận X-Service-Name header
}
```

#### `ServiceNameOrJwtGuard`

- **File:** `src/common/guards/service-name-or-jwt.guard.ts`
- **Mục đích:** Hybrid guard - hỗ trợ cả service-to-service (X-Service-Name) và user calls (JWT)
- **Ưu tiên:** X-Service-Name header trước, sau đó fallback về JWT

**Cách sử dụng:**

```typescript
@UseGuards(ServiceNameOrJwtGuard)
@Get('endpoint')
async endpoint() {
  // Chấp nhận cả X-Service-Name header hoặc JWT token
}
```

### 1.2. Header Authentication

**Header yêu cầu:**

```
X-Service-Name: cdx-loaphuong
```

**Response khi thiếu header:**

- Status: `401 Unauthorized`
- Message: `Missing X-Service-Name header`

**Response khi service name không hợp lệ:**

- Status: `401 Unauthorized`
- Message: `Invalid service name: {serviceName}`

---

## 🔔 2. Webhook Registration APIs

### 2.1. Check Webhook Registration

**Endpoint:** `GET /api/v1/webhooks/register/check`

**Authentication:** `ServiceNameOrJwtGuard` (hỗ trợ cả X-Service-Name và JWT)

**Query Parameters:**

- `url` (required): Webhook URL (URL encoded)

**Request Example:**

```bash
GET /api/v1/webhooks/register/check?url=http://localhost:3005/api/v1/webhooks/notifications/status-update
Headers:
  X-Service-Name: cdx-loaphuong
```

**Response khi webhook đã đăng ký:**

```json
{
  "registered": true,
  "webhook": {
    "id": "693937ad4894bc3ed0384767",
    "url": "http://localhost:3005/api/v1/webhooks/notifications/status-update",
    "events": ["notification.status-update", "notification.sent", "notification.failed"],
    "status": "active",
    "createdAt": "2025-12-10T09:04:45.726Z"
  },
  "timestamp": "2025-12-10T09:04:45.726Z"
}
```

**Response khi webhook chưa đăng ký:**

```json
{
  "registered": false,
  "timestamp": "2025-12-10T09:04:45.726Z"
}
```

### 2.2. Register Webhook

**Endpoint:** `POST /api/v1/webhooks/register`

**Authentication:** `ServiceNameOrJwtGuard` (hỗ trợ cả X-Service-Name và JWT)

**Request Body:**

```json
{
  "url": "http://localhost:3005/api/v1/webhooks/notifications/status-update",
  "events": ["notification.status-update", "notification.sent", "notification.failed"],
  "secret": "optional-webhook-secret",
  "description": "Webhook for loaphuong service"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "693937ad4894bc3ed0384767",
    "url": "http://localhost:3005/api/v1/webhooks/notifications/status-update",
    "events": ["notification.status-update", "notification.sent", "notification.failed"],
    "status": "active",
    "createdAt": "2025-12-10T09:04:45.726Z"
  },
  "timestamp": "2025-12-10T09:04:45.726Z"
}
```

**Valid Events:**

- `notification.created`
- `notification.sent`
- `notification.delivered`
- `notification.failed`
- `notification.read`
- `notification.clicked`
- `notification.status-update` ⭐ (mới thêm)

### 2.3. Unregister Webhook

**Endpoint 1:** `DELETE /api/v1/webhooks/register/:webhookId`

**Endpoint 2:** `DELETE /api/v1/webhooks/register?url={webhookUrl}`

**Authentication:** `ServiceNameOrJwtGuard` (hỗ trợ cả X-Service-Name và JWT)

**Response:**

```json
{
  "success": true,
  "message": "Webhook unregistered successfully",
  "timestamp": "2025-12-10T09:04:45.726Z"
}
```

---

## 📊 3. Notification History APIs

### 3.1. Get Notification History với Filters

**Endpoint:** `GET /api/v1/notifications/history`

**Authentication:** `ServiceNameOrJwtGuard` (hỗ trợ cả X-Service-Name và JWT)

**Query Parameters:**

- `page` (optional): Số trang (default: 1)
- `limit` (optional): Số lượng mỗi trang (default: 20, max: 100)
- `type` (optional): Loại notification
- `channel` (optional): Kênh notification (push, email, sms, in-app)
- `status` (optional): Trạng thái (pending, sent, delivered, failed, read)
- `sourceService` (optional): ⭐ Filter theo source service
- `sentBy` (optional): ⭐ Filter theo sender user ID
- `startDate` (optional): Ngày bắt đầu (ISO 8601)
- `endDate` (optional): Ngày kết thúc (ISO 8601)
- `sortBy` (optional): Sắp xếp theo (createdAt, sentAt, readAt)
- `sortOrder` (optional): Thứ tự (asc, desc)

**Request Example (Service-to-Service):**

```bash
GET /api/v1/notifications/history?sourceService=cdx-loaphuong&page=1&limit=20
Headers:
  X-Service-Name: cdx-loaphuong
```

**Request Example (User):**

```bash
GET /api/v1/notifications/history?page=1&limit=20
Headers:
  Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notification-id",
        "correlationId": "correlation-123",
        "title": "Notification Title",
        "body": "Notification Body",
        "type": "task",
        "channel": "push",
        "status": "delivered",
        "sentBy": "user-id-123",
        "sourceService": "cdx-loaphuong",
        "sentAt": "2025-12-10T09:00:00.000Z",
        "deliveredAt": "2025-12-10T09:00:01.000Z",
        "readAt": null,
        "createdAt": "2025-12-10T09:00:00.000Z",
        "updatedAt": "2025-12-10T09:00:01.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  },
  "message": "Notification history retrieved successfully",
  "timestamp": "2025-12-10T09:04:45.726Z"
}
```

### 3.2. Get Notification by Correlation ID

**Endpoint:** `GET /api/v1/notifications/history/correlation/:correlationId`

**Authentication:** `ServiceNameOrJwtGuard` (hỗ trợ cả X-Service-Name và JWT)

**Path Parameters:**

- `correlationId` (required): Correlation ID của notification

**Request Example:**

```bash
GET /api/v1/notifications/history/correlation/correlation-123
Headers:
  X-Service-Name: cdx-loaphuong
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "notification-id",
    "correlationId": "correlation-123",
    "title": "Notification Title",
    "body": "Notification Body",
    "type": "task",
    "channel": "push",
    "status": "delivered",
    "sentBy": "user-id-123",
    "sourceService": "cdx-loaphuong",
    "sentAt": "2025-12-10T09:00:00.000Z",
    "deliveredAt": "2025-12-10T09:00:01.000Z",
    "readAt": null,
    "createdAt": "2025-12-10T09:00:00.000Z",
    "updatedAt": "2025-12-10T09:00:01.000Z"
  },
  "message": "Notification retrieved successfully",
  "timestamp": "2025-12-10T09:04:45.726Z"
}
```

**Error Response (Not Found):**

```json
{
  "success": false,
  "error": "Notification with correlationId correlation-123 not found",
  "timestamp": "2025-12-10T09:04:45.726Z"
}
```

### 3.3. Get Notification by ID (External Service)

**Endpoint:** `GET /api/v1/notifications/history/:notificationId`

**Authentication:** `ServiceNameOrJwtGuard` (hỗ trợ cả X-Service-Name và JWT)

**Path Parameters:**

- `notificationId` (required): ID của notification

**Request Example:**

```bash
GET /api/v1/notifications/history/notification-id-123
Headers:
  X-Service-Name: cdx-loaphuong
```

**Response:** Tương tự như endpoint correlation ID

---

## 💾 4. Data Storage Updates

### 4.1. Correlation ID và SentBy trong Database

**Schema:** `UserNotification.data`

**Fields mới:**

- `correlationId`: ID để trace notification request across services
- `sentBy`: User ID của người gửi notification
- `sourceService`: Service nguồn gửi notification

**Ví dụ:**

```json
{
  "id": "notification-id",
  "title": "Notification Title",
  "body": "Notification Body",
  "data": {
    "correlationId": "correlation-123",
    "sentBy": "user-id-123",
    "sourceService": "cdx-loaphuong",
    "contentId": "content-123",
    "contentType": "task",
    "redirectUrl": "https://app.cdx.com/tasks/123"
  }
}
```

### 4.2. MongoDB Indexes

**File:** `src/infrastructure/database/database-init.service.ts`

**Indexes mới:**

```javascript
// Index cho correlationId
{ 'data.correlationId': 1 }

// Index cho sourceService
{ 'data.sourceService': 1 }

// Index cho sentBy
{ 'data.sentBy': 1 }

// Composite indexes
{ 'data.sourceService': 1, 'data.correlationId': 1 }
{ 'data.sourceService': 1, 'data.sentBy': 1 }
{ 'data.sourceService': 1, 'data.sentBy': 1, createdAt: -1 }
```

---

## 🔄 5. Event Processing Updates

### 5.1. Event Normalizer

**File:** `src/modules/notification/integration/rabbitmq/utils/event-normalizer.util.ts`

**Thay đổi:**

- Extract `payload.sentBy` từ event payload
- Extract `event.correlationId` từ event
- Validate `payload.sentBy` là required field
- Lưu vào `data` object của notification

**Ví dụ Event:**

```json
{
  "eventType": "notification.created",
  "correlationId": "correlation-123",
  "payload": {
    "userId": "user-id-123",
    "sentBy": "user-id-456",
    "sourceService": "cdx-loaphuong",
    "title": "Notification Title",
    "body": "Notification Body"
  }
}
```

### 5.2. Priority Queue Service

**File:** `src/modules/notification/priority-queue/priority-queue.service.ts`

**Thay đổi:**

- Lưu `sentBy` và `correlationId` vào `UserNotification.data`
- Đảm bảo các fields này được persist vào database

### 5.3. Notification Processing Service

**File:** `src/modules/notification/notification/application/services/notification-processing.service.ts`

**Thay đổi:**

- Truyền `sentBy` và `correlationId` vào notification message
- Đảm bảo data được truyền đúng qua các layers

---

## 📁 6. Files Đã Thay Đổi

### 6.1. Files Mới

1. `src/common/guards/service-name.guard.ts` - Service-to-service authentication guard
2. `src/common/guards/service-name-or-jwt.guard.ts` - Hybrid authentication guard
3. `src/infrastructure/database/database-init.service.ts` - Database initialization với indexes
4. `src/modules/notification/notification/application/queries/get-notification-by-correlation-id.query.ts` - Query definition
5. `src/modules/notification/notification/application/queries/get-notification-by-correlation-id.handler.ts` - Query handler

### 6.2. Files Đã Cập Nhật

1. **Webhook Controller** (`src/modules/notification/webhook/webhook.controller.ts`)
   - Thêm endpoint `GET /webhooks/register/check`
   - Thêm endpoint `POST /webhooks/register`
   - Thêm endpoint `DELETE /webhooks/register/:webhookId`
   - Thêm endpoint `DELETE /webhooks/register?url={url}`
   - Cập nhật guards để hỗ trợ service-to-service authentication

2. **Webhook Service** (`src/modules/notification/webhook/application/services/webhook.service.ts`)
   - Thêm `notification.status-update` vào valid events
   - Cập nhật method signatures

3. **Notification Controller** (`src/modules/notification/notification/interface/notification.controller.ts`)
   - Thêm filters `sourceService` và `sentBy` vào `GET /notifications/history`
   - Thêm endpoint `GET /notifications/history/correlation/:correlationId`
   - Thêm endpoint `GET /notifications/history/:notificationId`
   - Cập nhật guards để hỗ trợ service-to-service authentication

4. **Notification History Query** (`src/modules/notification/notification/application/queries/get-notification-history.query.ts`)
   - Thêm `sourceService` và `sentBy` filters

5. **Notification History Handler** (`src/modules/notification/notification/application/queries/get-notification-history.handler.ts`)
   - Hỗ trợ query theo `sourceService` và `sentBy` (không cần `userId`)
   - Include `correlationId` và `sentBy` trong response

6. **Notification Repository** (`src/modules/notification/notification/infrastructure/notification.repository.impl.ts`)
   - Thêm method `getNotificationByCorrelationId`
   - Cập nhật `getUserNotificationsFromMongo` để `userId` là optional
   - Hỗ trợ filters `sourceService` và `sentBy`

7. **Notification History DTO** (`src/modules/notification/notification/interface/dto/notification-history.dto.ts`)
   - Thêm `sourceService` và `sentBy` vào query DTO
   - Thêm `correlationId` và `sentBy` vào response DTO

8. **Event Normalizer** (`src/modules/notification/integration/rabbitmq/utils/event-normalizer.util.ts`)
   - Extract và lưu `sentBy` từ payload
   - Extract và lưu `correlationId` từ event
   - Validate `sentBy` là required

9. **Priority Queue Service** (`src/modules/notification/priority-queue/priority-queue.service.ts`)
   - Lưu `sentBy` và `correlationId` vào `UserNotification.data`

10. **Notification Processing Service** (`src/modules/notification/notification/application/services/notification-processing.service.ts`)
    - Truyền `sentBy` và `correlationId` vào notification message

11. **Notification Module** (`src/modules/notification/notification/notification.module.ts`)
    - Đăng ký `GetNotificationByCorrelationIdHandler`

---

## ✅ 7. Testing

### 7.1. Test Cases Đã Thực Hiện

1. ✅ **Check Webhook - URL đã đăng ký**
   - Request với header `X-Service-Name: cdx-loaphuong`
   - Response: `200 OK` với `registered: true`

2. ✅ **Check Webhook - URL chưa đăng ký**
   - Request với header `X-Service-Name: cdx-loaphuong`
   - Response: `200 OK` với `registered: false`

3. ✅ **Check Webhook - Thiếu header**
   - Request không có header
   - Response: `403 Forbidden`

4. ✅ **Check Webhook - Service name không hợp lệ**
   - Request với header `X-Service-Name: invalid-service`
   - Response: `401 Unauthorized`

### 7.2. Test Commands

```powershell
# Test check webhook với header hợp lệ
$headers = @{"X-Service-Name"="cdx-loaphuong"}
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/webhooks/register/check?url=http://localhost:3005/api/v1/webhooks/notifications/status-update" -Method Get -Headers $headers
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

---

## 🔒 8. Security Considerations

### 8.1. Service Whitelist

Chỉ các service trong whitelist mới được phép sử dụng `X-Service-Name` header:

- `cdx-loaphuong`
- `cdx-task`
- `cdx-payment`
- `cdx-booking`

**Lưu ý:** Để thêm service mới, cập nhật array `allowedServices` trong:

- `src/common/guards/service-name.guard.ts`
- `src/common/guards/service-name-or-jwt.guard.ts`

### 8.2. Backward Compatibility

- Tất cả các API hiện tại (dùng JWT) vẫn hoạt động bình thường
- `ServiceNameOrJwtGuard` tự động fallback về JWT nếu không có `X-Service-Name` header
- Không có breaking changes cho existing APIs

---

## 📝 9. Migration Guide

### 9.1. Cho External Services (như cdx-loaphuong)

**Bước 1:** Thêm header `X-Service-Name` vào requests

```typescript
const headers = {
  'X-Service-Name': 'cdx-loaphuong',
  'Content-Type': 'application/json',
};
```

**Bước 2:** Sử dụng các endpoints mới

- `GET /api/v1/webhooks/register/check?url={webhookUrl}`
- `POST /api/v1/webhooks/register`
- `DELETE /api/v1/webhooks/register/:webhookId`
- `GET /api/v1/notifications/history?sourceService=cdx-loaphuong`
- `GET /api/v1/notifications/history/correlation/:correlationId`

**Bước 3:** Đảm bảo event payload có `sentBy` field

```json
{
  "eventType": "notification.created",
  "correlationId": "unique-correlation-id",
  "payload": {
    "sentBy": "user-id-123",
    "sourceService": "cdx-loaphuong"
    // ... other fields
  }
}
```

### 9.2. Cho Notification Service

**Bước 1:** Đảm bảo database indexes đã được tạo

- Service sẽ tự động tạo indexes khi khởi động (qua `database-init.service.ts`)

**Bước 2:** Kiểm tra logs để đảm bảo indexes được tạo thành công

**Bước 3:** Test các endpoints mới với Postman hoặc curl

---

## 🚀 10. Deployment Notes

### 10.1. Environment Variables

Không cần thêm biến môi trường mới. Tất cả các thay đổi đều sử dụng cấu hình hiện có.

### 10.2. Database Migration

Indexes sẽ được tạo tự động khi service khởi động. Không cần migration script thủ công.

### 10.3. Breaking Changes

**Không có breaking changes.** Tất cả các thay đổi đều backward compatible.

---

## 📚 11. API Documentation

### 11.1. Swagger/OpenAPI

Tất cả các endpoints mới đã được document trong Swagger với:

- `@ApiOperation` - Mô tả endpoint
- `@ApiResponse` - Response examples
- `@ApiQuery` / `@ApiParam` - Parameters

Truy cập Swagger UI tại: `http://localhost:3000/api/docs`

### 11.2. Postman Collection

Có thể tạo Postman collection từ Swagger documentation.

---

## 🐛 12. Known Issues & Limitations

### 12.1. Rate Limiting

- Rate limiting middleware chưa được implement (TODO)
- Hiện tại chưa có giới hạn số lượng requests từ external services

### 12.2. Webhook Delivery

- Webhook delivery mechanism chưa được implement đầy đủ
- Các methods `triggerWebhook`, `getDeliveries`, etc. hiện tại là stubs

---

## 📞 13. Support & Contact

Nếu có vấn đề hoặc câu hỏi, vui lòng liên hệ:

- **Repository:** https://github.com/ThuongPa/cdx-notifi-service
- **Branch:** `thuongpa`
- **Commit:** `b966c38`

---

## 📋 14. Checklist

- [x] Service-to-Service Authentication Guards
- [x] Webhook Registration APIs (check, register, unregister)
- [x] Notification History với filters (sourceService, sentBy)
- [x] Correlation ID support
- [x] MongoDB Indexes
- [x] Event Normalizer updates
- [x] Data persistence (sentBy, correlationId)
- [x] Backward compatibility
- [x] API Documentation (Swagger)
- [x] Testing
- [ ] Rate Limiting (TODO)
- [ ] Webhook Delivery Implementation (TODO)

---

**Tài liệu này sẽ được cập nhật khi có thay đổi mới.**
