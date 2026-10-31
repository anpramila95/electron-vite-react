/**
 * CHÙA ONLINE — LIVESTREAM ĐI CHÙA LỄ PHẬT
 * - 100% dữ liệu thật từ WebSocket (không mockup).
 * - Cài đặt số lượng người tối đa trong phòng (maxDevotees).
 * - Nhân vật tự do đi lại quanh chánh điện (wandering), quỳ lễ, dập đầu bái Phật.
 * - Ưu tiên đọc tên (TTS) khi có khán giả tặng quà lớn.
 * - Banner vinh danh dưới màn hình khớp chính xác data từ TikTok stream.
 * - Trên đầu mỗi người có Avatar tròn + Tên pill + Nội dung comment nếu có.
 * - Hiệu ứng quà lớn bay lên màn hình lấp lánh hào quang rồi tắt ẩn.
 */
(function () {
  const canvas = document.getElementById('temple-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const params = new URLSearchParams(location.search);
  const streamKey = params.get('key') || 'live_default';

  // HUD Elements
  const hudDevoteesCount = document.getElementById('hud-devotees-count');
  const hudTotalMerit = document.getElementById('hud-total-merit');
  const lbList = document.getElementById('lb-list');
  const bannerVip = document.getElementById('banner-vip');
  const bannerVipText = document.getElementById('banner-vip-text');
  const bannerGift = document.getElementById('banner-gift');
  const giftBannerText = document.getElementById('gift-banner-text');
  const giftAvatarImg = document.getElementById('gift-avatar-img');
  const giftAvatar = document.getElementById('gift-avatar');
  const btnSound = document.getElementById('btn-sound');
  const btnProstrateAll = document.getElementById('btn-prostrate-all');
  const btnBell = document.getElementById('btn-bell');

  let W = 540;
  let H = 960;
  let maxDevotees = 40;
  let totalMeritCount = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = canvas.width = rect.width * (window.devicePixelRatio || 1);
    H = canvas.height = rect.height * (window.devicePixelRatio || 1);
  }
  window.addEventListener('resize', resize);
  resize();

  // ==================== IMAGE AVATAR CACHING ====================
  const avatarCache = new Map();
  function getAvatarImg(url) {
    if (!url) return null;
    if (avatarCache.has(url)) return avatarCache.get(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    avatarCache.set(url, img);
    return img;
  }

  // ==================== WEB AUDIO ENGINE ====================
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  let enableAudio = true;

  function ensureAudio() {
    if (!audioCtx && AudioCtx) audioCtx = new AudioCtx();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playBell() {
    if (!enableAudio) return;
    try {
      ensureAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      [110, 220, 330, 440, 587, 880].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        const dur = 4.5 + i * 0.4;
        gain.gain.setValueAtTime(0.24 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + dur);
      });
    } catch (_) {}
  }

  function playWoodblock() {
    if (!enableAudio) return;
    try {
      ensureAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filt = audioCtx.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.08);
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(700, now);
      filt.Q.setValueAtTime(3.5, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(filt);
      filt.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (_) {}
  }

  btnSound?.addEventListener('click', () => {
    enableAudio = !enableAudio;
    ensureAudio();
    btnSound.textContent = enableAudio ? '🔔' : '🔕';
  });

  btnBell?.addEventListener('click', () => {
    ensureAudio();
    playBell();
  });

  btnProstrateAll?.addEventListener('click', () => {
    ensureAudio();
    playBell();
    triggerAllProstrate();
  });

  // ==================== TEXT TO SPEECH ĐÃ ĐƯỢC CHUYỂN VỀ SERVER ĐIỀU PHỐI THEO HÀNG CHỜ ====================
  // (Tránh trình duyệt tự đọc đè giọng lên Edge TTS của server)
  function speakThankYou(_userName, _giftName) {
    // No-op: Server Queue Reader handles TTS_SPEAK centrally
  }

  // ==================== BẢNG QUY ĐỔI QUÀ TẶNG & Ý NGHĨA DÂNG LỄ ====================
  const GIFT_MEANINGS = {
    'hoa hồng': { action: 'thắp nén hương', icon: '🌹', isBig: false },
    'tim ngón tay': { action: 'thắp nến', icon: '🫰', isBig: false },
    'bó hoa': { action: 'dâng hoa sen', icon: '💐', isBig: false },
    'bánh donut': { action: 'thỉnh chuông', icon: '🍩', isBig: false },
    'tay bắn tim': { action: 'dâng mâm ngũ quả', icon: '🫶', isBig: false },
    'chó corgi': { action: 'phóng sinh cá chép', icon: '🐕', isBig: true },
    'súng tiền': { action: 'thả hoa đăng', icon: '🔫', isBig: true },
    'sư tử': { action: 'thỉnh Rồng Vàng hộ pháp', icon: '🦁', isBig: true },
    'rồng': { action: 'thỉnh Rồng Vàng hộ pháp', icon: '🐉', isBig: true },
    'thiên nga': { action: 'dâng ngọc toà sen', icon: '🦢', isBig: true }
  };

  function getGiftInfo(rawName) {
    if (!rawName) return { action: 'dâng lễ cúng dường', icon: '🪷', isBig: false };
    const lower = rawName.toLowerCase();
    for (const k in GIFT_MEANINGS) {
      if (lower.includes(k)) return GIFT_MEANINGS[k];
    }
    return { action: 'dâng lễ cúng dường', icon: '🎁', isBig: false };
  }

  // ==================== KHÓI TRẦM & BỤI VÀNG LẤP LÁNH ====================
  const smokeParticles = [];
  for (let i = 0; i < 55; i++) {
    smokeParticles.push({
      x: 0,
      y: 0,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -1.0 - Math.random() * 1.5,
      r: 6 + Math.random() * 16,
      alpha: Math.random() * 0.6,
      maxLife: 80 + Math.random() * 60,
      life: Math.random() * 80
    });
  }

  const goldenSparks = [];
  for (let i = 0; i < 35; i++) {
    goldenSparks.push({
      x: Math.random(),
      y: Math.random(),
      vy: -0.0006 - Math.random() * 0.0012,
      r: 1 + Math.random() * 2.5,
      alpha: 0.2 + Math.random() * 0.7,
      pulse: Math.random() * Math.PI * 2
    });
  }

  // ==================== QUÀ LỚN BAY LÊN MÀN HÌNH (FLYING GIFTS) ====================
  const flyingGifts = [];
  function triggerFlyingGift(userName, giftName, icon) {
    flyingGifts.push({
      userName,
      giftName,
      icon: icon || '🎁',
      x: W * 0.5,
      y: H * 0.58,
      vy: -1.8,
      scale: 0.4,
      alpha: 0,
      life: 0,
      maxLife: 200 // ~3.5s
    });
  }

  // ==================== DANH SÁCH PHẬT TỬ (100% DATA THẬT) ====================
  const devotees = [];

  function findOrAddDevotee(u) {
    const id = u.id || u.name;
    let dev = devotees.find((d) => d.id === id || d.name === u.name);

    if (!dev) {
      // Nếu đã đầy phòng, loại người ít điểm nhất
      if (devotees.length >= maxDevotees) {
        let lowestIdx = 0;
        let lowestPts = Infinity;
        for (let i = 0; i < devotees.length; i++) {
          if (devotees[i].pts < lowestPts) {
            lowestPts = devotees[i].pts;
            lowestIdx = i;
          }
        }
        devotees.splice(lowestIdx, 1);
      }

      // Vị trí xuất phát ngẫu nhiên trên sàn
      const startX = 0.15 + Math.random() * 0.7;
      const startY = 0.52 + Math.random() * 0.34;
      const types = ['monk', 'monk_orange', 'girl_blue', 'young_man', 'old_woman'];
      const charType = types[Math.floor(Math.random() * types.length)];

      dev = {
        id,
        name: u.name || 'Phật tử',
        photoUrl: u.photoUrl || u.avatar || '',
        pts: u.score || u.points || 10,
        isVip: !!u.isVip,
        type: charType,
        // Tọa độ & di chuyển tự do
        x: startX,
        y: startY,
        targetX: startX,
        targetY: startY,
        vx: 0,
        vy: 0,
        state: 'praying', // 'walking' | 'praying' | 'bowing'
        moveTimer: 60 + Math.random() * 180,
        walkCycle: Math.random() * Math.PI * 2,
        bowAngle: 0,
        bowSpeed: 0,
        // Bong bóng bình luận
        comment: u.comment || null,
        commentLife: u.comment ? 300 : 0,
        meritFloat: null
      };
      devotees.push(dev);
    } else {
      if (u.photoUrl) dev.photoUrl = u.photoUrl;
      if (u.avatar) dev.photoUrl = u.avatar;
      if (u.score) dev.pts = Math.max(dev.pts, u.score);
      if (u.isVip) dev.isVip = true;
      if (u.comment) {
        dev.comment = u.comment;
        dev.commentLife = 300;
      }
    }

    updateHUD();
    return dev;
  }

  function removeDevotee(id) {
    const idx = devotees.findIndex((d) => d.id === id);
    if (idx !== -1) {
      devotees.splice(idx, 1);
      updateHUD();
    }
  }

  function triggerAllProstrate() {
    devotees.forEach((d) => {
      d.state = 'bowing';
      d.bowSpeed = 0.05 + Math.random() * 0.02;
    });
    totalMeritCount += devotees.length * 3;
    updateHUD();
  }

  function updateHUD() {
    if (hudDevoteesCount) hudDevoteesCount.textContent = devotees.length;
    if (hudTotalMerit) hudTotalMerit.textContent = totalMeritCount;

    // Leaderboard top 5
    if (lbList) {
      const sorted = [...devotees].sort((a, b) => b.pts - a.pts).slice(0, 5);
      if (sorted.length === 0) {
        lbList.innerHTML = '<div style="font-size: 9px; color: #a1a1aa; text-align: center; padding: 6px 0;">Đang đón tiếp chư Phật tử...</div>';
      } else {
        lbList.innerHTML = sorted
          .map(
            (dev, idx) => `
            <div class="lb-row rank-${idx + 1}">
              <span class="rank-badge r${idx + 1}">${idx + 1}</span>
              <span class="dev-name">${dev.name}</span>
              <span class="dev-pts">${dev.pts}</span>
            </div>`
          )
          .join('');
      }
    }
  }

  // ==================== CẬP NHẬT DI CHUYỂN TỰ DO CỦA PHẬT TỬ ====================
  function updateDevoteesMovement(dt) {
    devotees.forEach((d) => {
      d.moveTimer -= dt * 60;

      // Hết timer -> chọn hành động mới: Đi lại hoặc quỳ lạy
      if (d.moveTimer <= 0) {
        d.moveTimer = 180 + Math.random() * 320; // 3 - 8s đổi trạng thái
        const rndAction = Math.random();

        if (rndAction < 0.6) {
          // Bắt đầu đi tới vị trí mới trên sàn chánh điện
          d.state = 'walking';
          d.targetX = 0.12 + Math.random() * 0.76;
          d.targetY = 0.51 + Math.random() * 0.35;
        } else if (rndAction < 0.85) {
          // Dừng lại dập đầu bái Phật
          d.state = 'bowing';
          d.bowSpeed = 0.04;
        } else {
          // Đứng/ngồi niệm Phật trang nghiêm
          d.state = 'praying';
        }
      }

      // Xử lý di chuyển
      if (d.state === 'walking') {
        const dx = d.targetX - d.x;
        const dy = d.targetY - d.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.015) {
          const speed = 0.045 * dt;
          d.x += (dx / dist) * speed;
          d.y += (dy / dist) * speed;
          d.walkCycle += dt * 10;
        } else {
          d.x = d.targetX;
          d.y = d.targetY;
          d.state = 'praying';
        }
      }

      // Xử lý hoạt ảnh lạy
      if (d.state === 'bowing' || d.bowSpeed !== 0) {
        d.bowAngle += d.bowSpeed;
        if (d.bowAngle >= 1.0) {
          d.bowAngle = 1.0;
          d.bowSpeed = -0.04;
        } else if (d.bowAngle <= 0) {
          d.bowAngle = 0;
          d.bowSpeed = 0;
          d.state = 'praying';
        }
      }

      // Giảm thời gian hiển thị comment
      if (d.commentLife > 0) {
        d.commentLife -= dt * 60;
        if (d.commentLife <= 0) d.comment = null;
      }

      // Hiệu ứng cộng điểm bay lên
      if (d.meritFloat) {
        d.meritFloat.y += dt * 25;
        d.meritFloat.alpha -= dt * 0.5;
        if (d.meritFloat.alpha <= 0) d.meritFloat = null;
      }
    });
  }

  // ==================== VẼ ĐẠI ĐIỆN CHÙA VÀNG ====================
  function drawTempleBackground(time) {
    // 1. Nền ánh vàng đồng
    const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.28, W * 0.05, W * 0.5, H * 0.45, W * 0.9);
    bgGrad.addColorStop(0, '#fef08a');
    bgGrad.addColorStop(0.2, '#ca8a04');
    bgGrad.addColorStop(0.5, '#451a03');
    bgGrad.addColorStop(0.85, '#200c03');
    bgGrad.addColorStop(1, '#110602');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Tia sáng hào quang Phật quang
    ctx.save();
    ctx.translate(W * 0.5, H * 0.24);
    const rayCount = 18;
    for (let i = 0; i < rayCount; i++) {
      ctx.rotate((Math.PI * 2) / rayCount + Math.sin(time * 0.5) * 0.002);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(254, 240, 138, 0.08)' : 'rgba(234, 179, 8, 0.03)';
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(0, -H * 0.65);
      ctx.lineTo(15, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 3. Tượng Đức Phật Thích Ca dát vàng
    const bX = W * 0.5;
    const bY = H * 0.23;
    const bScale = W / 480;

    // Hào quang tròn
    const haloGrad = ctx.createRadialGradient(bX, bY - 60 * bScale, 20 * bScale, bX, bY - 60 * bScale, 110 * bScale);
    haloGrad.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
    haloGrad.addColorStop(0.35, 'rgba(250, 204, 21, 0.7)');
    haloGrad.addColorStop(0.75, 'rgba(217, 119, 6, 0.25)');
    haloGrad.addColorStop(1, 'rgba(217, 119, 6, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(bX, bY - 60 * bScale, 110 * bScale, 0, Math.PI * 2);
    ctx.fill();

    // Toà sen vàng
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.ellipse(bX, bY + 45 * bScale, 90 * bScale, 22 * bScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.ellipse(bX, bY + 38 * bScale, 80 * bScale, 18 * bScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Thân ngồi kiết già
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.ellipse(bX, bY + 15 * bScale, 72 * bScale, 28 * bScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Thân trên áo cà sa dát vàng
    const robeGrad = ctx.createLinearGradient(bX - 40 * bScale, bY - 50 * bScale, bX + 40 * bScale, bY + 20 * bScale);
    robeGrad.addColorStop(0, '#fef08a');
    robeGrad.addColorStop(0.5, '#eab308');
    robeGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = robeGrad;
    ctx.beginPath();
    ctx.moveTo(bX - 38 * bScale, bY + 12 * bScale);
    ctx.quadraticCurveTo(bX - 44 * bScale, bY - 45 * bScale, bX - 22 * bScale, bY - 58 * bScale);
    ctx.lineTo(bX + 22 * bScale, bY - 58 * bScale);
    ctx.quadraticCurveTo(bX + 44 * bScale, bY - 45 * bScale, bX + 38 * bScale, bY + 12 * bScale);
    ctx.closePath();
    ctx.fill();

    // Đầu & khuôn mặt từ bi
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.ellipse(bX, bY - 78 * bScale, 26 * bScale, 32 * bScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.arc(bX, bY - 110 * bScale, 12 * bScale, 0, Math.PI * 2);
    ctx.fill();

    // Mắt khép thiền định & miệng cười
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2 * bScale;
    ctx.beginPath();
    ctx.arc(bX - 8 * bScale, bY - 76 * bScale, 5 * bScale, 0.1, Math.PI - 0.1, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bX + 8 * bScale, bY - 76 * bScale, 5 * bScale, 0.1, Math.PI - 0.1, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bX, bY - 65 * bScale, 6 * bScale, 0.2, Math.PI - 0.2, false);
    ctx.stroke();

    // 4. Bàn thờ gỗ nâu & Mâm ngũ quả, Chuông đồng
    const altarY = H * 0.38;
    const altarW = W * 0.94;
    const altarX = (W - altarW) / 2;

    const tableGrad = ctx.createLinearGradient(0, altarY, 0, altarY + H * 0.08);
    tableGrad.addColorStop(0, '#542611');
    tableGrad.addColorStop(0.5, '#3b180a');
    tableGrad.addColorStop(1, '#200b04');
    ctx.fillStyle = tableGrad;
    ctx.beginPath();
    ctx.roundRect(altarX, altarY, altarW, H * 0.075, 8);
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1;
    ctx.strokeRect(altarX + 10, altarY + 6, altarW - 20, H * 0.06);

    // Mâm ngũ quả bên trái
    const fruitX = W * 0.29;
    const fruitY = altarY + 12;
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.ellipse(fruitX, fruitY + 12, 22 * bScale, 6 * bScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(fruitX - 6, fruitY, 12 * bScale, 0.2, Math.PI - 0.2);
    ctx.fill();
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(fruitX + 4, fruitY - 2, 7 * bScale, 0, Math.PI * 2);
    ctx.fill();

    // Đại hồng chung bên phải
    const bellX = W * 0.86;
    const bellY = altarY - 22;
    ctx.fillStyle = '#451a03';
    ctx.fillRect(bellX - 16 * bScale, bellY - 30 * bScale, 32 * bScale, 4 * bScale);
    ctx.fillRect(bellX - 16 * bScale, bellY - 30 * bScale, 3 * bScale, 60 * bScale);
    ctx.fillRect(bellX + 13 * bScale, bellY - 30 * bScale, 3 * bScale, 60 * bScale);

    const bellGrad = ctx.createLinearGradient(bellX - 12 * bScale, 0, bellX + 12 * bScale, 0);
    bellGrad.addColorStop(0, '#78350f');
    bellGrad.addColorStop(0.5, '#d97706');
    bellGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = bellGrad;
    ctx.beginPath();
    ctx.moveTo(bellX - 6 * bScale, bellY - 24 * bScale);
    ctx.lineTo(bellX + 6 * bScale, bellY - 24 * bScale);
    ctx.lineTo(bellX + 12 * bScale, bellY + 12 * bScale);
    ctx.lineTo(bellX - 12 * bScale, bellY + 12 * bScale);
    ctx.closePath();
    ctx.fill();

    // Lư hương đồng cổ lớn chính giữa
    const cX = W * 0.5;
    const cY = altarY + 28 * bScale;
    ctx.fillStyle = '#78350f';
    [-18, 0, 18].forEach((lx) => {
      ctx.beginPath();
      ctx.ellipse(cX + lx * bScale, cY + 22 * bScale, 5 * bScale, 8 * bScale, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    const censerGrad = ctx.createRadialGradient(cX, cY, 4 * bScale, cX, cY, 32 * bScale);
    censerGrad.addColorStop(0, '#f59e0b');
    censerGrad.addColorStop(0.4, '#b45309');
    censerGrad.addColorStop(0.85, '#542611');
    censerGrad.addColorStop(1, '#2c1206');
    ctx.fillStyle = censerGrad;
    ctx.beginPath();
    ctx.ellipse(cX, cY + 8 * bScale, 34 * bScale, 18 * bScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.2 * bScale;
    ctx.stroke();

    ctx.fillStyle = '#3f1f0a';
    ctx.beginPath();
    ctx.ellipse(cX, cY - 2 * bScale, 28 * bScale, 8 * bScale, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let h = -12; h <= 12; h += 4) {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cX + h * bScale, cY - 2 * bScale);
      ctx.lineTo(cX + h * bScale * 0.9, cY - 22 * bScale);
      ctx.stroke();
      ctx.fillStyle = Math.random() > 0.5 ? '#fef08a' : '#ef4444';
      ctx.beginPath();
      ctx.arc(cX + h * bScale * 0.9, cY - 22 * bScale, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sàn chánh điện
    const floorY = altarY + H * 0.08;
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, H);
    floorGrad.addColorStop(0, '#2e1408');
    floorGrad.addColorStop(0.5, '#200c04');
    floorGrad.addColorStop(1, '#110502');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, W, H - floorY);
  }

  // ==================== VẼ KHÓI TRẦM & BỤI VÀNG ====================
  function drawSmoke(time) {
    const cX = W * 0.5;
    const cY = H * 0.38 + 10;
    const scale = W / 480;

    smokeParticles.forEach((p) => {
      p.y += p.vy;
      p.x += p.vx + Math.sin(time * 2 + p.y * 0.02) * 0.45;
      p.life++;
      p.r += 0.2;
      p.alpha = Math.max(0, 0.45 * (1 - p.life / p.maxLife));

      if (p.life >= p.maxLife || p.y < -H * 0.3) {
        p.x = cX + (Math.random() - 0.5) * 20 * scale;
        p.y = cY;
        p.life = 0;
        p.r = 6 + Math.random() * 8;
        p.alpha = 0.45;
      }

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * scale);
      grad.addColorStop(0, `rgba(255, 255, 255, ${p.alpha * 0.7})`);
      grad.addColorStop(0.5, `rgba(254, 243, 199, ${p.alpha * 0.3})`);
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * scale, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawGoldenSparks() {
    goldenSparks.forEach((s) => {
      s.y += s.vy;
      s.pulse += 0.03;
      if (s.y < 0) s.y = 1.0;

      const px = s.x * W;
      const py = s.y * H;
      const alpha = (Math.sin(s.pulse) * 0.3 + 0.7) * s.alpha;

      ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ==================== VẼ QUÀ LỚN BAY LÊN MÀN HÌNH ====================
  function drawFlyingGifts(dt) {
    for (let i = flyingGifts.length - 1; i >= 0; i--) {
      const g = flyingGifts[i];
      g.life += dt * 60;
      g.y += g.vy * dt * 60;

      if (g.life < 30) {
        g.alpha = g.life / 30;
        g.scale = 0.4 + (g.life / 30) * 0.6;
      } else if (g.life > g.maxLife - 40) {
        g.alpha = (g.maxLife - g.life) / 40;
      } else {
        g.alpha = 1;
        g.scale = 1.0 + Math.sin(g.life * 0.08) * 0.05;
      }

      if (g.life >= g.maxLife) {
        flyingGifts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(g.scale, g.scale);
      ctx.globalAlpha = g.alpha;

      // Hào quang vàng toả sáng quanh quà
      const glowGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 75);
      glowGrad.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
      glowGrad.addColorStop(0.5, 'rgba(234, 179, 8, 0.45)');
      glowGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 75, 0, Math.PI * 2);
      ctx.fill();

      // Icon quà tặng lớn
      ctx.font = '52px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.icon, 0, -10);

      // Tên quà & Tên người tặng
      ctx.font = '800 13px sans-serif';
      ctx.fillStyle = '#fffdf5';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(g.giftName.toUpperCase(), 0, 32);

      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(`Cúng dường bởi: ${g.userName}`, 0, 48);

      ctx.restore();
    }
  }

  // ==================== VẼ PHẬT TỬ (AVATAR TRÒN + PILL TÊN + BÓNG THOẠI) ====================
  function drawDevotee(d) {
    const px = d.x * W;
    const py = d.y * H;
    const scale = (0.75 + d.y * 0.45) * (W / 480);

    ctx.save();
    ctx.translate(px, py);

    // Hoạt ảnh dập đầu hoặc bước chân
    const walkBob = d.state === 'walking' ? Math.sin(d.walkCycle) * 3 * scale : 0;
    const bowShift = d.bowAngle * 10 * scale;
    ctx.translate(0, bowShift + walkBob);

    // 1. Bồ đoàn ngồi thiền (hoặc bóng dưới chân khi đi)
    ctx.fillStyle = d.isVip ? '#b45309' : '#451a03';
    ctx.beginPath();
    ctx.ellipse(0, 18 * scale, 20 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Thân áo
    let robeColor = '#64748b'; // Áo lam
    if (d.type === 'monk_orange') robeColor = '#ea580c';
    if (d.type === 'old_woman') robeColor = '#475569';
    if (d.type === 'young_man') robeColor = '#3b82f6';

    ctx.fillStyle = robeColor;
    ctx.beginPath();
    ctx.ellipse(0, 8 * scale, 16 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dải y vàng quấn vai
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.ellipse(3 * scale, 7 * scale, 5 * scale, 10 * scale, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Hai bàn tay chắp búp sen
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 4 * scale, 4 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Đầu chibi & kiểu tóc
    const headY = -12 * scale;
    const headR = 12 * scale;

    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    if (d.type === 'young_man') {
      ctx.fillStyle = '#1e1b18';
      ctx.beginPath();
      ctx.arc(0, headY - 3 * scale, headR + 1, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
    } else if (d.type === 'girl_blue') {
      ctx.fillStyle = '#1e1b18';
      ctx.beginPath();
      ctx.arc(0, headY - 2 * scale, headR + 2, Math.PI * 0.8, Math.PI * 2.2);
      ctx.fill();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(0, headY - 13 * scale, 4 * scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'old_woman') {
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(0, headY - 3 * scale, headR + 1, Math.PI * 0.85, Math.PI * 2.15);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, headY - 14 * scale, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. AVATAR TRÒN + NAME PILL TRÊN ĐẦU
    ctx.font = `700 ${8.5 * scale}px sans-serif`;
    const textW = ctx.measureText(d.name).width;
    const pillH = 16 * scale;
    const avR = (pillH / 2) - 1.5;
    const pillW = textW + avR * 2 + 14 * scale;
    const pillY = headY - 28 * scale;
    const pillX = -pillW / 2;

    // Khung pill
    ctx.fillStyle = d.isVip ? 'rgba(88, 38, 16, 0.92)' : 'rgba(20, 10, 5, 0.88)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = d.isVip ? '#facc15' : 'rgba(234, 179, 8, 0.4)';
    ctx.lineWidth = d.isVip ? 1.2 : 0.8;
    ctx.stroke();

    // Avatar tròn bên trái pill
    const avX = pillX + avR + 3;
    const avY = pillY + pillH / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.clip();

    const cachedImg = getAvatarImg(d.photoUrl);
    if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
      ctx.drawImage(cachedImg, avX - avR, avY - avR, avR * 2, avR * 2);
    } else {
      // Fallback ký tự đầu
      ctx.fillStyle = d.isVip ? '#d97706' : '#475569';
      ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${8 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((d.name || 'P')[0].toUpperCase(), avX, avY);
    }
    ctx.restore();

    // Tên người dùng trong pill
    ctx.fillStyle = d.isVip ? '#fef08a' : '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.name, avX + avR + 4 * scale, avY);

    // 5. BÓNG THOẠI BÌNH LUẬN NẾU CÓ (COMMENT SPEECH BUBBLE)
    if (d.comment) {
      const bubbleText = d.comment;
      ctx.font = `600 ${8.5 * scale}px sans-serif`;
      const bw = Math.min(ctx.measureText(bubbleText).width + 14 * scale, 160 * scale);
      const bh = 18 * scale;
      const by = pillY - bh - 6 * scale;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.beginPath();
      ctx.roundRect(-bw / 2, by, bw, bh, 6 * scale);
      ctx.fill();

      // Mũi nhọn trỏ xuống
      ctx.beginPath();
      ctx.moveTo(-3 * scale, by + bh);
      ctx.lineTo(0, by + bh + 4 * scale);
      ctx.lineTo(3 * scale, by + bh);
      ctx.fill();

      ctx.fillStyle = '#1c1917';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let displayText = bubbleText;
      if (ctx.measureText(displayText).width > bw - 8 * scale) {
        displayText = displayText.slice(0, 16) + '…';
      }
      ctx.fillText(displayText, 0, by + bh / 2);
    }

    // 6. ĐIỂM CÔNG ĐỨC BAY LÊN
    if (d.meritFloat) {
      ctx.font = `800 ${9.5 * scale}px sans-serif`;
      ctx.fillStyle = `rgba(250, 204, 21, ${d.meritFloat.alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(d.meritFloat.text, 0, pillY - 14 * scale - d.meritFloat.y);
    }

    ctx.restore();
  }

  // ==================== VÒNG LẶP RENDER CHÍNH (60FPS) ====================
  let lastTime = performance.now();
  let woodblockTimer = 0;

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const time = now * 0.001;

    // 1. Cập nhật di chuyển tự do của Phật tử
    updateDevoteesMovement(dt);

    // 2. Vẽ cảnh đại điện & khói trầm & bụi vàng
    drawTempleBackground(time);
    drawSmoke(time);
    drawGoldenSparks();

    // 3. Vẽ Phật tử từ xa tới gần (sort theo Y)
    const sortedDevotees = [...devotees].sort((a, b) => a.y - b.y);
    sortedDevotees.forEach((d) => drawDevotee(d));

    // 4. Vẽ quà tặng lớn bay lên
    drawFlyingGifts(dt);

    // 5. Tiếng gõ mõ đều đặn
    woodblockTimer += dt;
    if (woodblockTimer >= 1.6) {
      woodblockTimer = 0;
      playWoodblock();
    }
  }

  loop();
  updateHUD();

  // ==================== KẾT NỐI WEBSOCKET REALTIME LIVESTREAM ====================
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host || 'localhost:3210'}/ws?key=${encodeURIComponent(streamKey)}`;
  let ws = null;

  function connectWS() {
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'SUBSCRIBE', key: streamKey }));
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleLiveEvent(msg);
        } catch (_) {}
      };
      ws.onclose = () => setTimeout(connectWS, 2500);
      ws.onerror = () => setTimeout(connectWS, 2500);
    } catch (_) {
      setTimeout(connectWS, 3000);
    }
  }

  function handleLiveEvent(msg) {
    if (!msg || !msg.type) return;

    if (window.LiveOverlay?.handleMessage) {
      window.LiveOverlay.handleMessage(msg);
    }

    // 1. KHỞI TẠO TRẠNG THÁI TỪ SERVER
    if (msg.type === 'INIT_STATE') {
      if (msg.settings?.maxDevotees) {
        maxDevotees = parseInt(msg.settings.maxDevotees, 10) || 40;
      }
      if (Array.isArray(msg.queue)) {
        msg.queue.forEach((u) => findOrAddDevotee(u));
      }
      if (msg.userScores) {
        Object.keys(msg.userScores).forEach((name) => {
          const s = msg.userScores[name];
          findOrAddDevotee({
            id: name,
            name,
            avatar: s.avatar || '',
            score: s.score || 10,
            isVip: (s.diamonds || 0) > 0
          });
        });
      }
      updateHUD();
    }

    // 2. CÀI ĐẶT
    else if (msg.type === 'SET_SETTINGS' && msg.settings) {
      if (msg.settings.maxDevotees) {
        maxDevotees = parseInt(msg.settings.maxDevotees, 10) || 40;
        updateHUD();
      }
    }

    // 3. THÊM NGƯỜI DÙNG VÀO PHÒNG
    else if (msg.type === 'ADD_USER' && msg.user) {
      findOrAddDevotee(msg.user);
    }

    // 4. XÓA NGƯỜI DÙNG
    else if (msg.type === 'REMOVE_USER' && msg.id) {
      removeDevotee(msg.id);
    }

    // 5. CẬP NHẬT ĐIỂM
    else if (msg.type === 'USER_SCORE_UPDATE' && msg.user) {
      const dev = findOrAddDevotee(msg.user);
      if (dev && msg.user.score) dev.pts = msg.user.score;
      updateHUD();
    }

    // 6. SỰ KIỆN LIVE STREAM (LOG: GIFT, CHAT, LIKE, MEMBER)
    else if (msg.type === 'ADD_LOG' && msg.log) {
      const u = msg.log.userName || 'Phật tử';
      const isGift = msg.log.type === 'gift';
      const isChat = msg.log.type === 'chat';
      const dev = findOrAddDevotee({
        name: u,
        avatar: msg.log.avatarUrl,
        comment: isChat ? msg.log.message : null
      });

      if (isGift) {
        playBell();
        const giftRawName = msg.log.message || 'Quà';
        const giftInfo = getGiftInfo(giftRawName);
        const ptsAdd = giftInfo.isBig ? 100 : 20;

        dev.pts += ptsAdd;
        dev.isVip = dev.isVip || giftInfo.isBig;
        dev.meritFloat = { text: `+${ptsAdd} công đức`, y: 0, alpha: 1.0 };
        totalMeritCount += ptsAdd;

        // Banner vinh danh dưới màn hình (dữ liệu thật từ TikTok stream)
        if (giftInfo.isBig) {
          // Banner VIP Đại Công Đức
          if (bannerVip && bannerVipText) {
            bannerVipText.innerHTML = `<b>ĐẠI CÔNG ĐỨC</b> ✦ <span id="vip-user">${u}</span> tặng ${giftInfo.icon} <b>${giftRawName}</b> · ${giftInfo.action}`;
            bannerVip.style.display = 'flex';
            bannerVip.style.animation = 'none';
            void bannerVip.offsetWidth;
            bannerVip.style.animation = 'slideInUp 0.4s ease';
            setTimeout(() => {
              bannerVip.style.display = 'none';
            }, 6500);
          }
          // Quà lớn bay lên màn hình
          triggerFlyingGift(u, giftRawName, giftInfo.icon);
        } else {
          // Banner cúng dường thường
          if (bannerGift && giftBannerText) {
            giftBannerText.innerHTML = `<b>${u}</b> tặng ${giftInfo.icon} <b>${giftRawName}</b> · ${giftInfo.action}`;
            if (msg.log.avatarUrl && giftAvatarImg) {
              giftAvatarImg.src = msg.log.avatarUrl;
              giftAvatarImg.style.display = 'block';
              if (giftAvatar) giftAvatar.style.display = 'none';
            } else {
              if (giftAvatarImg) giftAvatarImg.style.display = 'none';
              if (giftAvatar) giftAvatar.style.display = 'block';
            }
            bannerGift.style.display = 'flex';
            bannerGift.style.animation = 'none';
            void bannerGift.offsetWidth;
            bannerGift.style.animation = 'slideInUp 0.4s ease';
            setTimeout(() => {
              bannerGift.style.display = 'none';
            }, 5000);
          }
        }

        // Đọc tên người cúng dường và random lời cám ơn + lời chúc
        speakThankYou(u, giftRawName);
      } else if (isChat) {
        dev.comment = msg.log.message;
        dev.commentLife = 320;
        dev.pts += 2;
        totalMeritCount += 2;
      }

      updateHUD();
    }

    // 7. HÀNH ĐỘNG ĐIỀU KHIỂN
    else if (msg.type === 'ACTION') {
      if (msg.action === 'all_chant' || msg.action === 'vip_prostrate') {
        playBell();
        triggerAllProstrate();
      } else if (msg.action === 'ring_bell') {
        playBell();
      } else if (msg.action === 'strike_woodblock') {
        playWoodblock();
      }
    }
  }

  connectWS();
})();
