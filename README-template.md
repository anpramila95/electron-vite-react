# HƯỚNG DẪN TẠO TEMPLATE MỚI CHO TIKTOK LIVE MULTI-TEMPLATES

Tài liệu này cung cấp toàn bộ đặc tả kiến trúc, quy chuẩn thư mục, giao thức WebSocket và cấu hình để **AI Agent hoặc Lập trình viên** có thể tự động tạo ra một giao diện Template tương tác TikTok Live mới hoàn chỉnh và chạy được ngay.

---

## 1. Cấu Trúc Thư Mục

Mọi template mới được đặt trong thư mục:
```text
public/templates/[template-id]/
├── settings.json   (Bắt buộc: Khai báo tên, mô tả, options cài đặt, nút bấm điều khiển)
├── index.html      (Bắt buộc: Khung HTML hiển thị trên OBS và Preview)
├── index.css       (Bắt buộc: Giao diện, hoạt ảnh, kích thước responsive)
└── index.js        (Bắt buộc: Logic tương tác, WebSocket client, hoạt họa Canvas/Three.js/DOM)
```

> **Quy tắc đặt tên `template-id`**: Viết thường, phân cách bằng dấu gạch ngang (kebab-case), ví dụ: `racing-game`, `lucky-wheel`, `space-battle`. Trong `settings.json`, dùng `snake_case` (ví dụ: `racing_game`).

---

## 2. File `settings.json` (Cấu Hình Metadata & Điều Khiển)

Hệ thống tự động quét file `settings.json` khi khởi động để hiển thị template lên danh sách chọn, tạo form điều khiển và sinh các nút bấm trên giao diện điều khiển trung tâm (`App.tsx`).

```json
{
  "id": "racing_game",
  "name": "Đua Xe Avatar TikTok",
  "description": "Cuộc đua xe tương tác nạp avatar khán giả khi comment/tặng quà, tăng tốc bằng xu.",
  "icon": "🏎️",
  "badge": "Tương tác",
  "features": [
    "Đồ họa 60FPS",
    "Tự nạp avatar khán giả",
    "Bình chọn & Tăng tốc bằng quà"
  ],
  "settingsSchema": [
    {
      "key": "lapsCount",
      "label": "Số vòng đua",
      "type": "buttons",
      "defaultValue": 3,
      "options": [
        { "label": "3 Vòng", "value": 3 },
        { "label": "5 Vòng", "value": 5 },
        { "label": "10 Vòng", "value": 10 }
      ]
    },
    {
      "key": "gameSpeed",
      "label": "Tốc độ trận đấu",
      "type": "range",
      "defaultValue": 1.5,
      "min": 0.5,
      "max": 5.0,
      "step": 0.5,
      "unit": "×"
    },
    {
      "key": "themeTrack",
      "label": "Địa hình đường đua",
      "type": "select",
      "defaultValue": "neon",
      "options": [
        { "label": "Thành phố Neon", "value": "neon" },
        { "label": "Sa mạc Nắng", "value": "desert" },
        { "label": "Băng tuyết", "value": "snow" }
      ]
    },
    {
      "key": "showComments",
      "label": "Hiển thị bình luận trên màn hình (Live Chat)",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "key": "showTopUsers",
      "label": "Hiển thị Top tương tác (Top người dùng)",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "key": "showGifts",
      "label": "Hiển thị quà tặng trên màn hình (Gifts)",
      "type": "boolean",
      "defaultValue": false
    }
  ],
  "actions": [
    {
      "id": "start_race",
      "label": "BẮT ĐẦU ĐUA NGAY",
      "icon": "🏁",
      "variant": "accent",
      "actionKey": "start_race",
      "group": "main_trigger"
    },
    {
      "id": "reset_race",
      "label": "Xếp lại xe từ đầu",
      "icon": "🔄",
      "variant": "secondary",
      "actionKey": "reset_race",
      "group": "game_actions"
    },
    {
      "id": "boost_vip",
      "label": "Kích hoạt Nitro xe VIP",
      "icon": "⚡",
      "variant": "warning",
      "actionKey": "boost_vip",
      "group": "game_actions"
    }
  ]
}
```

### Các Loại Field trong `settingsSchema`:
- `"buttons"`: Dãy nút bấm lựa chọn (`options: [{ label, value }]`).
- `"range"`: Thanh trượt (`min`, `max`, `step`, `unit`).
- `"select"`: Dropdown chọn danh sách.
- `"boolean"`: Checkbox bật / tắt (True / False).
> **Lưu ý**: Luôn kèm 3 boolean fields chuẩn: `showComments`, `showTopUsers`, `showGifts` để tích hợp hệ thống Live Overlay.

### Các Variant của `actions`:
- `"accent"` hoặc `"danger"`: Nút to nổi bật ở trên cùng (ví dụ: Bắt đầu game, Quay ngay, In ngay).
- `"warning"`, `"secondary"`: Các nút điều khiển phụ hiển thị dạng lưới 2 cột.

---

## 3. File `index.html` (Mẫu Chuẩn)

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>TÊN TEMPLATE CỦA BẠN</title>
  <link rel="stylesheet" href="index.css" />
  <!-- Nhúng hệ thống Overlay bình luận & quà tặng dùng chung -->
  <link rel="stylesheet" href="../../overlay.css" />
</head>
<body>
  <!-- Vùng hiển thị chính của Template (Canvas, DOM hoặc Three.js) -->
  <div id="game-app">
    <canvas id="main-canvas"></canvas>
  </div>

  <!-- Nhúng thư viện kịch bản -->
  <script src="../../overlay.js"></script>
  <script src="index.js"></script>
</body>
</html>
```

---

## 4. File `index.js` & Giao Thức WebSocket Realtime Bridge

Template kết nối tới WebSocket Server cục bộ tại `ws://localhost:3210/ws?key={streamKey}`.

### 4.1. Khởi Tạo & Handshake

```javascript
const urlParams = new URLSearchParams(location.search);
const streamKey = urlParams.get('key') || urlParams.get('session') || 'live_default';

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = location.host || 'localhost:3210';
const wsUrl = `${protocol}//${host}/ws?key=${encodeURIComponent(streamKey)}`;

let ws = new WebSocket(wsUrl);

ws.onopen = () => {
  // Gửi lệnh SUBSCRIBE để nhận đúng luồng dữ liệu của phiên live này
  ws.send(JSON.stringify({ type: 'SUBSCRIBE', key: streamKey }));
};
```

### 4.2. Các Tin Nhắn Nhận Từ Server (`ws.onmessage`)

```javascript
ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);

    // 1. Chuyển tiếp tin nhắn sang Live Overlay (nếu có)
    if (window.LiveOverlay && typeof window.LiveOverlay.handleMessage === 'function') {
      window.LiveOverlay.handleMessage(msg);
    }

    // 2. Khởi tạo trạng thái ban đầu khi vừa mở template
    if (msg.type === 'INIT_STATE') {
      if (msg.settings) {
        applySettings(msg.settings);
      }
      if (Array.isArray(msg.queue)) {
        msg.queue.forEach((user) => addUser(user));
      }
    }

    // 3. Có khán giả mới (từ chat, tặng quà, join room, hoặc thêm thủ công)
    else if (msg.type === 'ADD_USER' && msg.user) {
      addUser(msg.user);
    }

    // 4. Khán giả bị xóa khỏi hàng chờ
    else if (msg.type === 'REMOVE_USER' && msg.id) {
      removeUser(msg.id);
    }

    // 5. Streamer xóa sạch hàng chờ từ dashboard
    else if (msg.type === 'CLEAR_QUEUE') {
      clearAllUsers();
    }

    // 6. Streamer đổi cài đặt (tốc độ, số lượng, màu sắc, v.v.)
    else if (msg.type === 'SET_SETTINGS' && msg.settings) {
      applySettings(msg.settings);
    }

    // 7. Streamer bấm các nút Action trên Dashboard
    else if (msg.type === 'ACTION') {
      handleAction(msg.action, msg.value);
    }
  } catch (err) {
    console.error('Lỗi phân tích WebSocket:', err);
  }
};
```

### 4.3. Các Tin Nhắn Template Gửi Lên Server (`ws.send`)

| Tin nhắn | Mục đích | Cấu trúc dữ liệu |
| :--- | :--- | :--- |
| `USER_PRINTED` | **Cực kỳ quan trọng**: Báo cho server biết khán giả này đã được in/vẽ/đưa lên màn hình xong, để server **xóa người đó khỏi hàng chờ chờ in** trên ứng dụng quản lý. | `{ type: 'USER_PRINTED', streamKey, userId: user.id }` |
| `CLEAR_QUEUE` | Yêu cầu server làm sạch database hàng chờ | `{ type: 'CLEAR_QUEUE', streamKey }` |
| `SYNC_STATUS` | Đồng bộ trạng thái game/máy in lên Dashboard | `{ type: 'SYNC_STATUS', streamKey, ...customData }` |

Ví dụ cách gọi khi xử lý xong 1 người:
```javascript
function onUserDisplayedOrFinished(userId) {
  if (ws && ws.readyState === WebSocket.OPEN && userId) {
    ws.send(JSON.stringify({
      type: 'USER_PRINTED',
      streamKey: streamKey,
      userId: userId,
    }));
  }
}
```

---

## 5. Quy Chuẩn Xử Lý Ảnh Avatar Tránh Lỗi CORS

Khi render ảnh avatar khán giả TikTok lên `<canvas>` hoặc WebGL Texture (Three.js), trình duyệt sẽ chặn CORS nếu tải trực tiếp link TikTok CDN.

**Giải pháp**: Hệ thống đã tích hợp sẵn proxy ảnh cục bộ. Mọi link ảnh gửi qua WebSocket đều đã được bọc dạng:
```text
/api/proxy-img?url=https%3A%2F%2F...
```
Nếu bạn tự tải ảnh avatar, luôn bọc qua endpoint này:
```javascript
function getSafePhotoUrl(rawUrl) {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/proxy-img')) return rawUrl;
  return `/api/proxy-img?url=${encodeURIComponent(rawUrl)}`;
}
```
Và luôn kèm fallback ảnh mặc định nếu mạng mất kết nối:
```javascript
img.onerror = () => {
  img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="64" fill="%23334155"/><circle cx="64" cy="50" r="24" fill="%2394a3b8"/></svg>';
};
```

---

## 6. Mẫu Prompt Cho AI Tạo Template Mới

Khi muốn yêu cầu một AI Agent (như Zed Agent, Claude, ChatGPT) tạo template mới, bạn chỉ cần copy đoạn prompt sau:

```text
Hãy tạo một template mới cho dự án TikTok Live Multi-Templates với các thông tin sau:
1. ID Template: [Ví dụ: lucky_box]
2. Tên Template: [Ví dụ: Hộp Quà May Mắn 3D]
3. Ý tưởng giao diện: [Mô tả chi tiết cách tương tác, hiệu ứng đồ họa, khi nào hoàn thành lượt...]
4. Tuân thủ đúng đặc tả trong README-template.md:
   - Tạo thư mục: public/templates/[id]/ với đủ 4 file: settings.json, index.html, index.css, index.js.
   - settings.json: Khai báo id, name, description, icon, badge, settingsSchema (kèm 3 boolean: showComments, showTopUsers, showGifts), và actions điều khiển.
   - index.html: Liên kết ../../overlay.css và ../../overlay.js.
   - index.js: Kết nối WebSocket với streamKey, xử lý INIT_STATE, ADD_USER, SET_SETTINGS, ACTION. Khi một khán giả đã được xử lý xong trên màn hình, bắt buộc gửi sự kiện { type: "USER_PRINTED", streamKey, userId } về server để xóa khỏi hàng chờ. Dùng /api/proxy-img cho avatar để chống lỗi CORS.
```
