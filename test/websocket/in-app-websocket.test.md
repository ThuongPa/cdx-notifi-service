# Test WebSocket In-App Notifications

## Prerequisites

1. Cài đặt dependencies:
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io-client
```

2. Cấu hình environment variables trong `.env`:
```env
NOVU_WS_URL=wss://ws.cudanso.net
NOVU_WS_ENABLED=true
NOVU_WS_MOCK_MODE=true  # Set true để test với mock, false để test với Novu thật
NOVU_API_KEY=your-api-key
```

## Test Script

Tạo file `test-websocket.js`:

```javascript
const { io } = require('socket.io-client');

// Thay YOUR_JWT_TOKEN bằng JWT token thật của bạn
const token = 'YOUR_JWT_TOKEN';

const socket = io('http://localhost:3000/in-app', {
  auth: {
    token: token
  },
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket');
});

socket.on('connected', (data) => {
  console.log('✅ Server confirmed connection:', data);
});

socket.on('notification:new', (notification) => {
  console.log('📬 New notification received:', notification);
});

socket.on('unread:count', (data) => {
  console.log('📊 Unread count:', data.count);
});

socket.on('marked:read', (data) => {
  console.log('✅ Marked as read:', data);
});

socket.on('error', (error) => {
  console.error('❌ Error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

// Test mark as read
setTimeout(() => {
  console.log('Testing mark:read...');
  socket.emit('mark:read', { messageId: 'test-msg-123' });
}, 2000);

// Test get unread count
setTimeout(() => {
  console.log('Testing get:unread-count...');
  socket.emit('get:unread-count');
}, 3000);

// Keep connection alive
setTimeout(() => {
  console.log('Closing connection...');
  socket.disconnect();
  process.exit(0);
}, 10000);
```

## Chạy Test

```bash
node test-websocket.js
```

## Test với Mock Mode

Khi `NOVU_WS_MOCK_MODE=true`, bạn sẽ nhận được mock notifications tự động mỗi 30 giây.

## Test với Novu Thật

1. Set `NOVU_WS_MOCK_MODE=false`
2. Đảm bảo `NOVU_API_KEY` đúng
3. Đảm bảo Novu WebSocket server đang chạy tại `wss://ws.cudanso.net`
4. Gửi một notification qua Novu API để test

## Expected Output

```
✅ Connected to WebSocket
✅ Server confirmed connection: { userId: 'user123', message: 'Connected to in-app notifications', timestamp: '...' }
📊 Unread count: 0
✅ Marked as read: { messageId: 'test-msg-123', success: true }
📬 New notification received: { id: '...', title: '...', content: '...', ... }
```

