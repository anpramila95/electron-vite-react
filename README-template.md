# HƯỚNG DẪN TẠO TEMPLATE MỚI CHO TIKTOK LIVE MULTI-TEMPLATES

Tài liệu đặc tả kiến trúc Event-Driven, chuẩn giao thức WebSocket, định dạng sự kiện và cơ chế kích thích tặng quà (Incentive Mechanics) dành cho **AI Agent hoặc Lập trình viên** tự động sinh Template mới độc lập 100%, không cần can thiệp core backend.

---

## 1. Kiến Trúc Tách Tầng (Decoupled Architecture)

```
[TikTok Live Stream]
        │
        ▼
[Core Backend (Electron / Node.js)]
   ├── Chuẩn hóa dữ liệu sự kiện (Normalize)
   ├── Cung cấp Proxy ảnh chống CORS (/api/proxy-img)
   └── Bắn WebSocket thời gian thực tới Template
        │
        ▼  ws://localhost:3210/ws?key={streamKey}
┌──────────────────────────────────────────────────────────────┐
│ [Template Độc Lập] (public/templates/[template-id]/)         │
│  ├── Nhận STREAM_EVENT (GIFT, CHAT, LIKE, SHARE, MEMBER)    │
│  ├── Tự tính điểm, xếp hàng ưu tiên, kích hoạt hiệu ứng 3D  │
│  ├── Hiển thị Menu Quà & Bảng Vinh Danh kích thích donate    │
│  └── Gửi lệnh điều khiển ngược lại Core (QUEUE_ADD, ...)     │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Cấu Trúc Thư Mục Chuẩn

Mỗi template nằm độc lập trong một thư mục con:
```text
public/templates/[template-id]/
├── settings.json   # Metadata, thông số cấu hình & nút điều khiển trên Dashboard
├── index.html      # Khung HTML hiển thị trên OBS và Preview
├── index.css       # Style, hoạt ảnh, bố cục responsive
└── index.js        # Logic game, kết nối WebSocket, xử lý đồ họa (Canvas/Three.js/DOM)
```
> **Quy ước đặt tên `template-id`**: Tên thư mục dùng `kebab-case` (ví dụ: `lucky-wheel-3d`), trường `id` trong `settings.json` dùng `snake_case` (ví dụ: `lucky_wheel_3d`).

---

## 3. File `settings.json`

File khai báo để Dashboard tự sinh giao diện điều khiển:

```json
{
  "id": "racing_3d",
  "name": "Đua Xe Avatar 3D (Grand Prix)",
  "description": "Trường đua xe 3D tương tác. Xe gắn avatar khán giả, phụt lửa Nitro khi tặng quà.",
  "icon": "🏎️",
  "badge": "Three.js 3D",
  "features": [
    "Three.js 3D 60FPS",
    "Xe gắn avatar thật",
    "Phụt lửa Nitro khi tặng quà",
    "Bục vinh danh Top 1"
  ],
  "settingsSchema": [
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
      "key": "trackTheme",
      "label": "Bản đồ đường đua",
      "type": "select",
      "defaultValue": "neon",
      "options": [
        { "label": "Thành phố Neon", "value": "neon" },
        { "label": "Sa mạc Nắng", "value": "desert" }
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
      "label": "Hiển thị Top tương tác",
      "type": "boolean",
      "defaultValue": true
    },
    {
      "key": "showGifts",
      "label": "Hiển thị hiệu ứng quà",
      "type": "boolean",
      "defaultValue": true
    }
  ],
  "actions": [
    {
      "id": "start_race",
      "label": "BẮT ĐẦU ĐUA",
      "icon": "🏁",
      "variant": "accent",
      "actionKey": "start_race",
      "group": "main"
    },
    {
      "id": "reset_race",
      "label": "Làm mới đường đua",
      "icon": "🔄",
      "variant": "secondary",
      "actionKey": "reset_race",
      "group": "main"
    }
  ]
}
```

---

## 4. Giao Thức WebSocket (`ws://localhost:3210/ws?key={streamKey}`)

### 4.1. Handshake Ban Đầu
Ngay khi mở kết nối, client bắt buộc gửi:
```javascript
ws.send(JSON.stringify({
  type: 'SUBSCRIBE',
  key: streamKey
}));
```

### 4.2. Tin Nhắn Server Gửi Xuống Template (`ws.onmessage`)

#### A. Sự Kiện Live Chuẩn Hóa (`STREAM_EVENT`) — **Quan trọng nhất**
Tất cả tương tác từ TikTok Live đều được server đóng gói dưới dạng `STREAM_EVENT`:

```javascript
// Cấu trúc chung
{
  type: "STREAM_EVENT",
  event: "GIFT" | "CHAT" | "MEMBER" | "LIKE" | "SHARE" | "FOLLOW",
  timestamp: 1714500000000,
  user: {
    id: "123456789",
    uniqueId: "user_tiktok",
    name: "Tên Khán Giả",
    avatar: "/api/proxy-img?url=https%3A%2F%2F...",  // Đã bọc CORS proxy
    photoUrl: "/api/proxy-img?url=https%3A%2F%2F..."
  },
  data: { ... } // Chi tiết tùy theo loại event
}
```

* **Khi có Quà (`event === "GIFT"`):**
  ```json
  "data": {
    "giftId": "5655",
    "giftName": "Melon Juice",
    "diamonds": 199,       // Tổng số xu của đợt tặng này (= unitDiamonds * repeatCount)
    "unitDiamonds": 199,   // Giá trị xu của 1 món quà đơn lẻ
    "repeatCount": 1       // Số lượng quà hoặc chuỗi combo
  }
  ```
  > **Quy ước điểm quà**: `1 xu quà tặng = 1 điểm tích lũy = 1 kim cương (Diamonds)`. Đã chặn lọc streak đang tăng dở, chỉ bắn sự kiện khi kết thúc chuỗi combo.

* **Khi có Bình luận (`event === "CHAT"`):**
  ```json
  "data": {
    "comment": "in giup minh voi"
  }
  ```
  > Bình luận hợp lệ được cộng **+0.3 điểm**.

* **Khi có Thả tim (`event === "LIKE"`):**
  ```json
  "data": {
    "count": 5,
    "total": 1250
  }
  ```
  > Mỗi đợt thả tim được cộng **+0.05 điểm**.

* **Khi có Chia sẻ / Follow (`event === "SHARE"` hoặc `"FOLLOW"`):**
  ```json
  "data": {
    "actionType": 1
  }
  ```
  > Chia sẻ phiên live được cộng **+0.2 điểm**.

* **Khi có Khán giả mới vào phòng (`event === "MEMBER"`):**
  ```json
  "data": {}
  ```
  > Người xem tham gia được cộng **+0.1 điểm**.

#### B. Các Tin Nhắn Quản Lý Hệ Thống
* `USER_SCORE_UPDATE`: **(Cực kỳ quan trọng)** Bắn xuống mỗi khi người xem được cộng điểm (quà, chat, share, like, join).
  ```json
  {
    "type": "USER_SCORE_UPDATE",
    "user": {
      "uniqueId": "user_tiktok",
      "name": "Tên Khán Giả",
      "avatarUrl": "/api/proxy-img?...",
      "score": 199.3,   // Tổng điểm tích lũy chuẩn xu trong toàn phiên Live
      "isVip": true     // True nếu từng tặng quà lớn >= bigGiftThreshold
    }
  }
  ```
  *Template dùng sự kiện này để cập nhật Bảng Xếp Hạng Top tương tác (Leaderboard) mà không cần tự cộng dồn thủ công.*
* `ADD_LOG`: Có bản ghi log tương tác mới (gift, chat, member).
  ```json
  {
    "type": "ADD_LOG",
    "log": {
      "id": 1,
      "type": "gift",
      "userName": "Tên Khán Giả",
      "message": "Tặng 1x Melon Juice (199 xu) 🎁",
      "avatarUrl": "/api/proxy-img?...",
      "createdAt": "15:30:00"
    }
  }
  ```
* `INIT_STATE`: Trả về toàn bộ cài đặt (`settings`), lịch sử chat (`logs`), hàng chờ (`queue`) khi template vừa kết nối.
* `SET_SETTINGS`: Streamer vừa đổi cài đặt trên Dashboard (ví dụ đổi tốc độ, đổi màu).
* `ACTION`: Streamer vừa bấm một nút điều khiển trong `actions` (ví dụ: `action: 'start_race'`).
* `ADD_USER`: Có người dùng được thêm vào hàng chờ hệ thống.
* `REMOVE_USER`: Người dùng bị xóa khỏi hàng chờ (`msg.id`).
* `CLEAR_QUEUE`: Streamer bấm nút xóa sạch hàng chờ.
* `TTS_SPEAK`: Yêu cầu phát giọng nói AI kèm link mp3 (`audioUrl`).

### 4.3. Tin Nhắn Template Gửi Lên Server (`ws.send`)

| Tin nhắn | Mục đích | Cấu trúc dữ liệu |
| :--- | :--- | :--- |
| `USER_ACTIVE` | Báo khán giả đang lên hình / đang được vẽ / đang đua / đang chơi (để Dashboard hiện trạng thái) | `{ type: "USER_ACTIVE", streamKey, user: { id, name, photoUrl, isVip } }` |
| `USER_COMPLETED` | Báo đã phục vụ xong khán giả này để server **xóa khỏi hàng chờ** trên ứng dụng quản lý | `{ type: "USER_COMPLETED", streamKey, userId }` |
| `QUEUE_ADD` | Template tự thêm khán giả vào hàng chờ với độ ưu tiên tự tính | `{ type: "QUEUE_ADD", streamKey, user: { uniqueId, name, avatar, priority, isVip } }` |
| `REMOVE_USER` | Template yêu cầu xóa 1 user khỏi hàng chờ | `{ type: "REMOVE_USER", streamKey, id }` |
| `CLEAR_QUEUE` | Template yêu cầu xóa sạch hàng chờ | `{ type: "CLEAR_QUEUE", streamKey }` |
| `SYNC_STATUS` | Đồng bộ trạng thái game (điểm, round...) lên Dashboard | `{ type: "SYNC_STATUS", streamKey, ...customData }` |

> *Ghi chú tương thích ngược*: Server vẫn hỗ trợ song song các mã cũ `USER_PRINTING` (tương đương `USER_ACTIVE`) và `USER_PRINTED` (tương đương `USER_COMPLETED`) để các template cũ tiếp tục hoạt động bình thường.

---

## 5. Nguyên Tắc Thiết Kế Kích Thích Tặng Quà (Incentive Design)

Để viewer muốn tặng quà, mọi Template cần tuân thủ 5 nguyên tắc:

1. **Bảng Menu Quà Cố Định (Call-To-Action Overlay):**
   * Hiển thị góc màn hình: `🌹 1 xu: Lên hình ngay | 🧋 10 xu: Chiếm trọn màn hình VIP | 🚀 100 xu: Nổ hiệu ứng bá chủ`.
2. **Cơ Chế Cắt Hàng (Jump Queue) & Phân Cấp VIP:**
   * **Bình luận thường / Join / Like:** Xếp hàng sau hoặc chỉ tính điểm tích lũy (`priority: 1 - 10`, `isVip: false`).
   * **Tặng quà nhỏ (< 10 xu):** Cắt hàng thường ngay lập tức (`priority: 5000 + diamonds`, `isVip: false`).
   * **Tặng quà VIP (>= 10 xu TRONG 1 LẦN TẶNG):** Cắt hàng tuyệt đối (`priority: 50000 + diamonds`, `isVip: true`). Đạt danh hiệu VIP tức thì, gắn cờ hoàng gia trên thẻ nhân vật.
   * *Lưu ý: VIP tính trên từng lần tặng quà đơn hoặc combo đạt ngưỡng `bigGiftThreshold` (mặc định 10 xu), không cộng dồn từ các lần tặng 1 xu lẻ để tránh spam cướp hàng.*
3. **Hiệu Ứng Bùng Nổ Tức Thì (Instant Dopamine):**
   * Quà lớn (>= 10 xu): Phóng to avatar giữa màn hình, viền hào quang hoàng gia, rung lắc camera hoặc phụt pháo hoa.
4. **Vinh Danh Bá Chủ (King of the Room):**
   * Dành một góc trang trọng trên cùng để ghim avatar của người tặng nhiều nhất phiên. Chỉ bị thay thế khi có người khác donate cao hơn.
5. **Thanh Mục Tiêu Cộng Đồng (Community Goal Bar):**
   * Đặt thanh tiến độ (ví dụ: 65/100 hoa hồng). Khi đủ 100 hoa hồng, kích hoạt chế độ cuồng nộ (Turbo mode / Mưa quà) trong 60 giây.

---

## 6. Boilerplate Chuẩn Cho File `index.js`

```javascript
// public/templates/[template-id]/index.js
(function () {
  const urlParams = new URLSearchParams(location.search);
  const streamKey = urlParams.get('key') || urlParams.get('session') || 'live_default';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host || 'localhost:3210';
  const wsUrl = `${protocol}//${host}/ws?key=${encodeURIComponent(streamKey)}`;

  let ws = new WebSocket(wsUrl);

  // Khởi tạo hàng chờ nội bộ của template
  const gameQueue = [];
  let topDonator = null;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'SUBSCRIBE', key: streamKey }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Chuyển tiếp tới Overlay chat/gift mặc định nếu có
      if (window.LiveOverlay && typeof window.LiveOverlay.handleMessage === 'function') {
        window.LiveOverlay.handleMessage(msg);
      }

      // 1. Nhận sự kiện trực tiếp từ TikTok Live
      if (msg.type === 'STREAM_EVENT') {
        handleStreamEvent(msg.event, msg.user, msg.data);
      }

      // 2. Cập nhật điểm tích lũy toàn phiên (Bảng Xếp Hạng / Leaderboard)
      else if (msg.type === 'USER_SCORE_UPDATE' && msg.user) {
        updateUserScore(msg.user);
      }

      // 3. Đồng bộ cài đặt từ Dashboard
      else if (msg.type === 'SET_SETTINGS' && msg.settings) {
        applySettings(msg.settings);
      }

      // 3. Nhận lệnh bấm nút Action từ Dashboard
      else if (msg.type === 'ACTION') {
        triggerAction(msg.action, msg.value);
      }

      // 4. Nhận dữ liệu khởi tạo ban đầu
      else if (msg.type === 'INIT_STATE') {
        if (msg.settings) applySettings(msg.settings);
        if (Array.isArray(msg.queue)) {
          msg.queue.forEach((u) => gameQueue.push(u));
        }
      }
    } catch (e) {
      console.error('[Template] Parse error:', e);
    }
  };

  function handleStreamEvent(event, user, data) {
    if (!user) return;

    if (event === 'GIFT') {
      const diamonds = Number(data?.diamonds) || 1;
      const isBig = diamonds >= 10;

      // Cắt hàng lên đầu
      gameQueue.unshift({
        ...user,
        isVip: isBig,
        priority: isBig ? 50000 + diamonds : 5000 + diamonds,
        giftName: data?.giftName,
      });

      // Cập nhật Top Donator
      if (!topDonator || diamonds > (topDonator.diamonds || 0)) {
        topDonator = { ...user, diamonds };
        updateKingBanner(topDonator);
      }

      // Hiệu ứng đồ họa / âm thanh
      triggerGiftEffect(user, diamonds, isBig);
    }

    else if (event === 'CHAT') {
      // Bình luận chỉ thêm vào cuối hàng chờ
      gameQueue.push({
        ...user,
        isVip: false,
        priority: 10,
        comment: data?.comment,
      });
    }
  }

  // Khi hiển thị hoặc xử lý xong 1 khán giả, báo server để cập nhật DB
  function notifyUserFinished(userId) {
    if (ws && ws.readyState === WebSocket.OPEN && userId) {
      ws.send(JSON.stringify({
        type: 'USER_COMPLETED',
        streamKey: streamKey,
        userId: userId,
      }));
    }
  }

  // Khi bắt đầu đưa khán giả lên màn hình chơi / hiển thị
  function notifyUserActive(user) {
    if (ws && ws.readyState === WebSocket.OPEN && user) {
      ws.send(JSON.stringify({
        type: 'USER_ACTIVE',
        streamKey: streamKey,
        user: user,
      }));
    }
  }

  function applySettings(settings) {
    // Cập nhật tốc độ, màu sắc, chế độ hiển thị
  }

  function triggerAction(actionKey, payload) {
    // Xử lý các nút bấm từ Streamer
  }

  function triggerGiftEffect(user, diamonds, isBig) {
    // Hiệu ứng 3D / Canvas / Âm thanh
  }

  function updateKingBanner(kingUser) {
    // Cập nhật avatar bá chủ phòng live
  }

  function updateUserScore(user) {
    // user: { uniqueId, name, avatarUrl, score, isVip }
    // Cập nhật BXH Top điểm tương tác / Công đức / Tu vi trong Template
  }

  // Tự động kết nối lại khi mất socket
  ws.onclose = () => {
    setTimeout(() => {
      ws = new WebSocket(wsUrl);
    }, 2000);
  };
})();
```

---

## 7. Mẫu Prompt Chuẩn Cho AI Tạo Template Mới

Copy đoạn prompt dưới đây khi yêu cầu AI tạo template:

```text
Hãy tạo một Template tương tác TikTok Live mới hoàn chỉnh cho dự án theo đúng đặc tả kiến trúc trong README-template.md:

1. ID Template: [Ví dụ: claw_machine_3d]
2. Tên Template: [Ví dụ: Máy Gắp Thú Avatar 3D]
3. Ý tưởng kịch bản:
   - Mô tả cơ chế game: [Ví dụ: Người xem gắp gấu bông có dán avatar của mình]
   - Cơ chế quà tặng:
     * Tặng 1 xu: Được 1 lượt gắp ưu tiên ngay lập tức.
     * Tặng 10 xu: Gắp trúng Hộp Quà Hoàng Kim VIP kích cỡ khổng lồ.
     * Bình luận: Xếp vào hàng chờ gắp thường.
4. Yêu cầu kỹ thuật:
   - Tạo thư mục `public/templates/[id]/` đủ 4 file: `settings.json`, `index.html`, `index.css`, `index.js`.
   - Lắng nghe sự kiện WebSocket `STREAM_EVENT` (GIFT, CHAT, LIKE).
   - Tự quản lý hàng chờ và ưu tiên tặng quà theo chuẩn Pay-to-Win.
   - Khi một khán giả bắt đầu lên hình, gửi `{ type: "USER_ACTIVE", streamKey, user }`.
   - Khi hoàn thành lượt của một khán giả, gửi `{ type: "USER_COMPLETED", streamKey, userId }`.
   - Tích hợp Menu Quà và Banner Top 1 Donator trên màn hình.
   - Mọi ảnh avatar dùng qua `/api/proxy-img` để tránh lỗi CORS.
```
