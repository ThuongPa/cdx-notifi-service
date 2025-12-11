# Hướng dẫn Setup Webhook cho Novu

## Tổng quan

Webhook được sử dụng để Novu tự động gửi thông báo về trạng thái delivery (delivered/failed) đến notification service. Điều này giúp:

- Cập nhật trạng thái notification trong database (cho analytics)
- Đồng bộ dữ liệu giữa Novu và local database
- Theo dõi delivery status real-time

## Các phương pháp setup webhook

### Phương pháp 1: Tự động đăng ký qua API (Đã implement)

Service `NovuWebhookInitService` sẽ tự động thử đăng ký webhook khi app khởi động:

1. **Cấu hình environment variable:**

   ```env
   NOVU_WEBHOOK_URL=https://your-notification-service.com/notifications/webhooks/novu
   NOVU_API_KEY=your-novu-api-key
   NOVU_API_URL=https://novu-service-api.cudanso.net
   ```

2. **Service sẽ thử các endpoint sau:**
   - `/v1/integrations/webhooks`
   - `/v1/webhooks`
   - `/v1/hooks`
   - `/webhooks`

3. **Nếu thành công:** Webhook sẽ được đăng ký tự động
4. **Nếu thất bại:** Service sẽ log warning nhưng không block app startup

### Phương pháp 2: Đăng ký thủ công qua API

Nếu phương pháp 1 không hoạt động, bạn có thể thử đăng ký thủ công:

```bash
# Test xem endpoint nào hoạt động
node scripts/test-novu-webhook-api.js

# Hoặc thử POST request trực tiếp
curl -X POST https://novu-service-api.cudanso.net/v1/webhooks \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-notification-service.com/notifications/webhooks/novu",
    "triggers": ["notification.delivered", "notification.failed", "notification.sent"],
    "active": true
  }'
```

### Phương pháp 3: Cấu hình qua Novu Dashboard (nếu có)

Một số phiên bản Novu self-hosted có dashboard hỗ trợ cấu hình webhook:

1. Đăng nhập vào Novu dashboard
2. Vào Settings > Webhooks
3. Thêm webhook URL: `https://your-notification-service.com/notifications/webhooks/novu`
4. Chọn events: `notification.delivered`, `notification.failed`

### Phương pháp 4: Cấu hình qua Docker/Environment Variables

Nếu bạn deploy Novu qua Docker, có thể cần cấu hình trong `docker-compose.yml` hoặc environment variables:

```yaml
# docker-compose.yml
services:
  novu-api:
    environment:
      - WEBHOOK_URL=https://your-notification-service.com/notifications/webhooks/novu
      - WEBHOOK_EVENTS=notification.delivered,notification.failed
```

### Phương pháp 5: Sử dụng Webhook Service riêng (Forward)

Nếu bạn đã có webhook service riêng trên Coolify, bạn có thể:

1. **Cấu hình Novu gửi webhook đến service riêng:**

   ```
   NOVU_WEBHOOK_URL=https://your-webhook-service.cudanso.net
   ```

2. **Webhook service sẽ forward request đến notification service:**
   ```javascript
   // Trong webhook service
   app.post('/webhook', async (req, res) => {
     // Forward đến notification service
     await fetch('https://notification-service.com/notifications/webhooks/novu', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(req.body),
     });
     res.json({ success: true });
   });
   ```

## Webhook Endpoint

### Endpoint: `POST /notifications/webhooks/novu`

**Lưu ý:** Endpoint này **KHÔNG** yêu cầu authentication để Novu có thể gọi được.

**Payload mẫu từ Novu:**

```json
{
  "event": "notification.delivered",
  "data": {
    "deliveryId": "abc123",
    "transactionId": "abc123",
    "notificationId": "notif-123",
    "subscriberId": "user-123",
    "status": "delivered"
  }
}
```

**Hoặc:**

```json
{
  "event": "notification.failed",
  "data": {
    "deliveryId": "abc123",
    "transactionId": "abc123",
    "status": "failed",
    "error": {
      "message": "Delivery failed",
      "code": "DELIVERY_ERROR"
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Testing Webhook

### 1. Test với curl:

```bash
# Test delivered event
curl -X POST http://localhost:3000/notifications/webhooks/novu \
  -H "Content-Type: application/json" \
  -d '{
    "event": "notification.delivered",
    "data": {
      "deliveryId": "test-delivery-123",
      "transactionId": "test-delivery-123",
      "status": "delivered"
    }
  }'

# Test failed event
curl -X POST http://localhost:3000/notifications/webhooks/novu \
  -H "Content-Type: application/json" \
  -d '{
    "event": "notification.failed",
    "data": {
      "deliveryId": "test-delivery-123",
      "transactionId": "test-delivery-123",
      "status": "failed",
      "error": {
        "message": "Test error",
        "code": "TEST_ERROR"
      }
    }
  }'
```

### 2. Kiểm tra logs:

Sau khi gửi webhook, kiểm tra logs để xem:

- Webhook có được nhận không
- Status có được update trong database không
- Có lỗi gì không

```bash
# Xem logs
docker-compose logs -f notification-service

# Hoặc nếu chạy trực tiếp
npm run dev
```

### 3. Kiểm tra database:

```javascript
// MongoDB
db.usernotifications.findOne({ deliveryId: 'test-delivery-123' });
```

## Troubleshooting

### Webhook không được gọi

1. **Kiểm tra NOVU_WEBHOOK_URL có đúng không:**

   ```bash
   echo $NOVU_WEBHOOK_URL
   ```

2. **Kiểm tra endpoint có accessible không:**

   ```bash
   curl -X POST https://your-notification-service.com/notifications/webhooks/novu \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

3. **Kiểm tra logs của NovuWebhookInitService:**
   - Xem có log "Webhook registered successfully" không
   - Nếu không, xem warning message

### Webhook được gọi nhưng không update database

1. **Kiểm tra deliveryId có match không:**
   - Xem logs: "No UserNotification found to update"
   - Đảm bảo `deliveryId` trong webhook match với `deliveryId` trong database

2. **Kiểm tra webhook payload:**
   - Đảm bảo có `deliveryId` hoặc `transactionId`
   - Đảm bảo `event` hoặc `status` đúng format

### Novu không hỗ trợ webhook API

Nếu Novu self-hosted của bạn không hỗ trợ webhook API:

- Option 1: Sử dụng polling để check status từ Novu API
- Option 2: Giữ status="sent" trong database (không có delivered/failed)
- Option 3: Sử dụng WebSocket từ Novu (nếu có)

## Security

⚠️ **Lưu ý:** Webhook endpoint hiện tại không có authentication. Nên thêm:

1. **IP Whitelist:** Chỉ cho phép IP của Novu service
2. **Webhook Signature:** Verify signature từ Novu (nếu có)
3. **Rate Limiting:** Giới hạn số request từ một IP

Ví dụ thêm IP whitelist:

```typescript
@Post('webhooks/novu')
async handleNovuWebhook(@Req() req: Request, @Body() payload: any) {
  const allowedIPs = ['10.0.0.0/8', '172.16.0.0/12']; // Novu service IPs
  const clientIP = req.ip;

  if (!isIPAllowed(clientIP, allowedIPs)) {
    throw new ForbiddenException('IP not allowed');
  }

  // ... rest of the code
}
```
