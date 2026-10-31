// public/templates/celestial-cultivation/index.js
(function () {
  const urlParams = new URLSearchParams(location.search);
  const streamKey = urlParams.get('key') || urlParams.get('session') || 'live_default';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host || 'localhost:3210';
  const wsUrl = `${protocol}//${host}/ws?key=${encodeURIComponent(streamKey)}`;

  let ws = null;

  // Hệ thống 8 Cảnh Giới Tu Tiên
  const REALMS = [
    { name: 'Phàm Nhân', minExp: 0, maxExp: 300, color: '#cccccc' },
    { name: 'Luyện Khí Kỳ', minExp: 300, maxExp: 800, color: '#70e000' },
    { name: 'Trúc Cơ Kỳ', minExp: 800, maxExp: 1800, color: '#00b4d8' },
    { name: 'Kim Đan Kỳ', minExp: 1800, maxExp: 4000, color: '#ffd700' },
    { name: 'Nguyên Anh Kỳ', minExp: 4000, maxExp: 8500, color: '#ff9900' },
    { name: 'Hóa Thần Kỳ', minExp: 8500, maxExp: 18000, color: '#e0aaff' },
    { name: 'Độ Kiếp Kỳ', minExp: 18000, maxExp: 40000, color: '#ff0055' },
    { name: 'Tiên Đế Chí Tôn', minExp: 40000, maxExp: 999999, color: '#00f5d4' }
  ];

  // Trạng thái cấu hình từ settings.json
  const state = {
    settings: {
      cultivationSpeed: 1.5,
      realmTheme: 'golden_palace',
      goalTarget: 100,
      showComments: true,
      showTopUsers: true,
      showGifts: true
    },
    spiritEnergy: 0,
    isSpiritRainTurbo: false,
    turboTimer: null
  };

  // Quản lý hàng chờ ưu tiên & Bảng Phong Thần
  const gameQueue = [];
  const cultivatorsDB = new Map(); // Lưu trữ Tu Vi của từng user trong phiên
  let currentCultivator = null;
  let activeSessionTimer = null;
  let topDonator = null;

  // DOM Elements
  const dom = {
    body: document.body,
    appContainer: document.getElementById('app-container'),
    lightningFlash: document.getElementById('lightning-flash'),
    goalBar: document.getElementById('goal-progress-bar'),
    goalText: document.getElementById('goal-progress-text'),
    turboBadge: document.getElementById('turbo-badge'),
    emperorAvatar: document.getElementById('emperor-avatar'),
    emperorName: document.getElementById('emperor-name'),
    emperorTitle: document.getElementById('emperor-title'),
    emperorScore: document.getElementById('emperor-score'),
    leaderboardBox: document.getElementById('leaderboard-box'),
    topUsersList: document.getElementById('top-users-list'),
    queueCount: document.getElementById('queue-count'),
    waitingQueue: document.getElementById('waiting-queue'),
    decreeBox: document.getElementById('imperial-decree'),
    decreeText: document.getElementById('decree-text'),
    dharmaWheel: document.getElementById('dharma-wheel'),
    dragonAura: document.getElementById('dragon-aura'),
    realmBadge: document.getElementById('realm-badge'),
    activeAvatar: document.getElementById('active-avatar'),
    activeName: document.getElementById('active-name'),
    activeAction: document.getElementById('active-action'),
    activeExpBar: document.getElementById('active-exp-bar'),
    activeExpText: document.getElementById('active-exp-text'),
    chatBox: document.getElementById('chat-box'),
    chatMessages: document.getElementById('chat-messages')
  };

  // Chuẩn hóa URL ảnh qua CORS Proxy theo kiến trúc
  function safeAvatarUrl(rawUrl) {
    if (!rawUrl) {
      return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%232a1b0e' stroke='%23d4af37' stroke-width='4'/><text x='50' y='62' font-size='38' text-anchor='middle' fill='%23d4af37'>仙</text></svg>";
    }
    if (rawUrl.startsWith('/api/proxy-img') || rawUrl.startsWith('data:')) {
      return rawUrl;
    }
    return `/api/proxy-img?url=${encodeURIComponent(rawUrl)}`;
  }

  // Lấy Cảnh Giới hiện tại dựa trên điểm Tu Vi (EXP)
  function getRealmByExp(exp) {
    for (let i = REALMS.length - 1; i >= 0; i--) {
      if (exp >= REALMS[i].minExp) return REALMS[i];
    }
    return REALMS[0];
  }

  // ==================== KẾT NỐI WEBSOCKET ====================
  function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', key: streamKey }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (window.LiveOverlay && typeof window.LiveOverlay.handleMessage === 'function') {
          window.LiveOverlay.handleMessage(msg);
        }

        if (msg.type === 'STREAM_EVENT') {
          handleStreamEvent(msg.event, msg.user, msg.data);
        } else if (msg.type === 'SET_SETTINGS' && msg.settings) {
          applySettings(msg.settings);
        } else if (msg.type === 'ACTION') {
          triggerAction(msg.action, msg.value);
        } else if (msg.type === 'INIT_STATE') {
          if (msg.settings) applySettings(msg.settings);
          if (Array.isArray(msg.queue)) {
            msg.queue.forEach((u) => enqueueCultivator(u, false));
          }
        } else if (msg.type === 'ADD_USER' && msg.user) {
          enqueueCultivator(msg.user, false);
        } else if (msg.type === 'REMOVE_USER' && msg.id) {
          removeUserFromQueue(msg.id);
        } else if (msg.type === 'CLEAR_QUEUE') {
          gameQueue.length = 0;
          renderQueueUI();
        } else if (msg.type === 'TTS_SPEAK' && msg.audioUrl) {
          const audio = new Audio(msg.audioUrl);
          audio.play().catch(() => {});
        }
      } catch (e) {
        console.error('[CelestialTemplate] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 2000);
    };
  }

  // ==================== XỬ LÝ SỰ KIỆN TIKTOK LIVE ====================
  function handleStreamEvent(event, user, data) {
    if (!user) return;

    const normalizedUser = {
      id: user.id || user.uniqueId || `dao_${Date.now()}`,
      uniqueId: user.uniqueId || 'dao_huu',
      name: user.name || user.uniqueId || 'Vô Danh Đạo Hữu',
      avatar: safeAvatarUrl(user.avatar || user.photoUrl),
      photoUrl: safeAvatarUrl(user.photoUrl || user.avatar)
    };

    if (event === 'GIFT') {
      const diamonds = Number(data?.diamonds) || 1;
      const giftName = data?.giftName || 'Tiên Bảo';
      const isBig = diamonds >= 10;
      const turboMultiplier = state.isSpiritRainTurbo ? 2 : 1;
      const expGain = diamonds * 350 * turboMultiplier;

      // Cộng dồn Tu Vi & Tiên Ngọc cho Đạo Hữu
      const record = getOrCreateCultivator(normalizedUser);
      record.exp += expGain;
      record.totalDiamonds += diamonds;

      // 2. Cơ chế cắt hàng (Jump Queue): Quà cắt ngang toàn bộ hàng chờ
      const priority = isBig ? 50000 + diamonds : 5000 + diamonds;
      enqueueCultivator({
        ...normalizedUser,
        isVip: isBig,
        priority,
        giftName,
        diamonds,
        expGain,
        actionText: `Tặng ${giftName} (+${expGain} Tu Vi)`
      }, true);

      // 4. Cập nhật Tiên Đế Chí Tôn (King of the Room)
      if (!topDonator || record.totalDiamonds >= topDonator.totalDiamonds) {
        topDonator = { ...record };
        updateKingBanner(topDonator);
      }

      // 5. Tăng Thanh Tụ Linh Đại Trận (Community Goal)
      addSpiritEnergy(diamonds);

      // 3. Nổ hiệu ứng Thiên Lôi & Pháp Tướng tức thì
      triggerGiftEffect(normalizedUser, diamonds, isBig, giftName);
      updateLeaderboardUI();
    }

    else if (event === 'CHAT') {
      const comment = data?.comment || 'Cầu đạo trường sinh!';
      appendChatMessage(normalizedUser, comment);

      const record = getOrCreateCultivator(normalizedUser);
      const expGain = Math.round(120 * (state.isSpiritRainTurbo ? 2 : 1));
      record.exp += expGain;

      // Bình luận thường xếp cuối hàng chờ (priority: 10)
      enqueueCultivator({
        ...normalizedUser,
        isVip: false,
        priority: 10,
        comment,
        expGain,
        actionText: `Ngộ đạo: "${comment.slice(0, 28)}" (+${expGain} Tu Vi)`
      }, false);

      updateLeaderboardUI();
    }

    else if (event === 'LIKE') {
      const likeCount = Number(data?.count) || 1;
      addSpiritEnergy(Math.ceil(likeCount * 0.5));
      spawnFloatingText(`+${likeCount} Linh Khí`, window.innerWidth * 0.5, window.innerHeight * 0.7, '#00f5d4');
    }

    else if (event === 'FOLLOW' || event === 'SHARE') {
      const record = getOrCreateCultivator(normalizedUser);
      record.exp += 250;
      enqueueCultivator({
        ...normalizedUser,
        isVip: false,
        priority: 100,
        expGain: 250,
        actionText: event === 'FOLLOW' ? 'Bái nhập Tiên Môn (+250 Tu Vi)' : 'Truyền bá Đạo Pháp (+250 Tu Vi)'
      }, false);
    }
  }

  function getOrCreateCultivator(user) {
    if (!cultivatorsDB.has(user.id)) {
      cultivatorsDB.set(user.id, {
        id: user.id,
        uniqueId: user.uniqueId,
        name: user.name,
        avatar: user.avatar,
        exp: 100,
        totalDiamonds: 0
      });
    }
    const rec = cultivatorsDB.get(user.id);
    rec.name = user.name;
    rec.avatar = user.avatar;
    return rec;
  }

  // ==================== HÀNG CHỜ ƯU TIÊN & ĐÀI SEN ====================
  function enqueueCultivator(item, isJumpQueue) {
    // Nếu đang ở trên đài sen và chính người đó tặng quà VIP -> buff trực tiếp luôn
    if (currentCultivator && currentCultivator.id === item.id && isJumpQueue) {
      currentCultivator.isVip = currentCultivator.isVip || item.isVip;
      currentCultivator.actionText = item.actionText;
      renderActiveCultivator();
      return;
    }

    // Xóa bản ghi chờ thấp hơn của cùng 1 user để tránh trùng lặp
    const existingIdx = gameQueue.findIndex((u) => u.id === item.id);
    if (existingIdx !== -1) {
      if ((item.priority || 10) > (gameQueue[existingIdx].priority || 10)) {
        gameQueue.splice(existingIdx, 1);
      } else {
        return;
      }
    }

    gameQueue.push(item);
    // Sắp xếp giảm dần theo priority (Pay-to-Win)
    gameQueue.sort((a, b) => (b.priority || 10) - (a.priority || 10));

    // Báo ngược về Core Server
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'QUEUE_ADD',
        streamKey,
        user: {
          uniqueId: item.uniqueId,
          name: item.name,
          avatar: item.avatar,
          priority: item.priority || 10,
          isVip: Boolean(item.isVip)
        }
      }));
    }

    renderQueueUI();

    // Nếu có quà VIP cắt hàng hoặc đài sen đang trống -> Chuyển lượt ngay
    if (!currentCultivator || (isJumpQueue && item.priority > (currentCultivator.priority || 10))) {
      processNextInQueue();
    }
  }

  function removeUserFromQueue(userId) {
    const idx = gameQueue.findIndex((u) => u.id === userId || u.uniqueId === userId);
    if (idx !== -1) {
      gameQueue.splice(idx, 1);
      renderQueueUI();
    }
  }

  function processNextInQueue() {
    if (activeSessionTimer) {
      clearTimeout(activeSessionTimer);
      activeSessionTimer = null;
    }

    if (currentCultivator) {
      notifyUserFinished(currentCultivator.id);
    }

    if (gameQueue.length === 0) {
      currentCultivator = null;
      dom.activeName.textContent = 'Đang chờ Đạo Hữu...';
      dom.activeAction.textContent = 'Bình luận hoặc Tặng quà để lên Đài Sen!';
      dom.dharmaWheel.classList.remove('vip-wheel');
      dom.activeAvatar.classList.remove('vip-glow');
      dom.dragonAura.classList.add('hidden');
      return;
    }

    currentCultivator = gameQueue.shift();
    renderQueueUI();
    notifyUserActive(currentCultivator);
    renderActiveCultivator();

    // Thời gian ngự trên đài sen (VIP được ngồi lâu hơn)
    const baseDuration = currentCultivator.isVip ? 7000 : 4000;
    const duration = Math.max(1800, baseDuration / (state.settings.cultivationSpeed || 1.5));

    activeSessionTimer = setTimeout(() => {
      processNextInQueue();
    }, duration);
  }

  function renderActiveCultivator() {
    if (!currentCultivator) return;
    const record = getOrCreateCultivator(currentCultivator);
    const realm = getRealmByExp(record.exp);

    dom.activeAvatar.src = currentCultivator.avatar;
    dom.activeName.textContent = currentCultivator.name;
    dom.activeAction.textContent = currentCultivator.actionText || 'Đang hấp thu thiên địa linh khí...';
    dom.realmBadge.textContent = realm.name;
    dom.realmBadge.style.borderColor = realm.color;

    const progress = Math.min(100, Math.round(((record.exp - realm.minExp) / (realm.maxExp - realm.minExp)) * 100));
    dom.activeExpBar.style.width = `${progress}%`;
    dom.activeExpText.textContent = `${realm.name} • Tu vi: ${record.exp} / ${realm.maxExp}`;

    if (currentCultivator.isVip) {
      dom.dharmaWheel.classList.add('vip-wheel');
      dom.activeAvatar.classList.add('vip-glow');
      dom.dragonAura.classList.remove('hidden');
    } else {
      dom.dharmaWheel.classList.remove('vip-wheel');
      dom.activeAvatar.classList.remove('vip-glow');
      dom.dragonAura.classList.add('hidden');
    }

    // Đồng bộ trạng thái lên Dashboard
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'SYNC_STATUS',
        streamKey,
        activeUser: currentCultivator.name,
        realm: realm.name,
        queueLength: gameQueue.length
      }));
    }
  }

  // ==================== GIAO TIẾP SERVER (ACTIVE / COMPLETED) ====================
  function notifyUserFinished(userId) {
    if (ws && ws.readyState === WebSocket.OPEN && userId) {
      ws.send(JSON.stringify({
        type: 'USER_COMPLETED',
        streamKey: streamKey,
        userId: userId
      }));
    }
  }

  function notifyUserActive(user) {
    if (ws && ws.readyState === WebSocket.OPEN && user) {
      ws.send(JSON.stringify({
        type: 'USER_ACTIVE',
        streamKey: streamKey,
        user: {
          id: user.id,
          name: user.name,
          photoUrl: user.photoUrl || user.avatar,
          isVip: Boolean(user.isVip)
        }
      }));
    }
  }

  // ==================== CƠ CHẾ KÍCH THÍCH TẶNG QUÀ & HIỆU ỨNG ====================
  function addSpiritEnergy(amount) {
    const target = Number(state.settings.goalTarget) || 100;
    state.spiritEnergy = Math.min(target, state.spiritEnergy + amount);
    const pct = Math.min(100, Math.round((state.spiritEnergy / target) * 100));

    dom.goalBar.style.width = `${pct}%`;
    dom.goalText.textContent = `${state.spiritEnergy} / ${target} Linh Khí`;

    if (state.spiritEnergy >= target && !state.isSpiritRainTurbo) {
      activateSpiritRainTurbo();
    }
  }

  function activateSpiritRainTurbo() {
    state.isSpiritRainTurbo = true;
    state.spiritEnergy = 0;
    dom.goalBar.style.width = '100%';
    dom.turboBadge.classList.remove('hidden');
    showImperialDecree('✨ TỤ LINH TRẬN KHAI MỞ: MƯA TIÊN ĐƠN X2 TU VI TRONG 60 GIÂY! ✨');

    // Tạo mưa kim đơn trên Canvas
    for (let i = 0; i < 45; i++) {
      spawnGoldenPill();
    }

    if (state.turboTimer) clearTimeout(state.turboTimer);
    state.turboTimer = setTimeout(() => {
      state.isSpiritRainTurbo = false;
      dom.turboBadge.classList.add('hidden');
      dom.goalBar.style.width = '0%';
      dom.goalText.textContent = `0 / ${state.settings.goalTarget} Linh Khí`;
    }, 60000);
  }

  function updateKingBanner(kingUser) {
    if (!kingUser) return;
    const realm = getRealmByExp(kingUser.exp || 0);
    dom.emperorAvatar.src = kingUser.avatar;
    dom.emperorName.textContent = kingUser.name;
    dom.emperorTitle.textContent = `Cảnh giới: ${realm.name}`;
    dom.emperorScore.textContent = `💎 ${kingUser.totalDiamonds} Tiên Ngọc`;
  }

  function triggerGiftEffect(user, diamonds, isBig, giftName) {
    if (!state.settings.showGifts) return;

    // Gọi Thiên Lôi đánh xuống Đài Sen
    const boltCount = isBig ? 5 : 2;
    for (let i = 0; i < boltCount; i++) {
      setTimeout(() => {
        createLightningBolt(isBig ? '#ffd700' : '#e0aaff');
      }, i * 140);
    }

    if (isBig) {
      dom.appContainer.classList.remove('shake-intense');
      void dom.appContainer.offsetWidth;
      dom.appContainer.classList.add('shake-intense');
      showImperialDecree(`🐉 ${user.name} ban thưởng ${giftName} (${diamonds} Xu) - Kim Long Hộ Thể!`);
    } else {
      showImperialDecree(`⚡ ${user.name} triệu hồi Tử Tiêu Thần Lôi với ${giftName}!`);
    }

    spawnFloatingText(`+${diamonds * 350} TU VI`, window.innerWidth * 0.5, window.innerHeight * 0.45, '#ffd700');
  }

  let decreeTimeout = null;
  function showImperialDecree(text) {
    dom.decreeText.textContent = text;
    dom.decreeBox.classList.remove('hidden');
    if (decreeTimeout) clearTimeout(decreeTimeout);
    decreeTimeout = setTimeout(() => {
      dom.decreeBox.classList.add('hidden');
    }, 4200);
  }

  // ==================== CẬP NHẬT GIAO DIỆN PHỤ ====================
  function renderQueueUI() {
    dom.queueCount.textContent = gameQueue.length;
    dom.waitingQueue.innerHTML = '';
    gameQueue.slice(0, 12).forEach((u) => {
      const chip = document.createElement('div');
      chip.className = `queue-chip ${u.isVip ? 'vip-chip' : ''}`;
      chip.innerHTML = `<img src="${u.avatar}" alt="" /><span>${u.name}</span>`;
      dom.waitingQueue.appendChild(chip);
    });
  }

  function updateLeaderboardUI() {
    if (!state.settings.showTopUsers) return;
    const sorted = Array.from(cultivatorsDB.values())
      .sort((a, b) => b.exp - a.exp)
      .slice(0, 6);

    dom.topUsersList.innerHTML = '';
    sorted.forEach((u, index) => {
      const realm = getRealmByExp(u.exp);
      const li = document.createElement('li');
      li.className = 'rank-item';
      li.innerHTML = `
        <span class="rank-num">#${index + 1}</span>
        <img class="rank-avatar" src="${u.avatar}" alt="" />
        <div class="rank-info">
          <div class="rank-name">${u.name}</div>
          <div class="rank-realm-tag">${realm.name} • ${u.exp} Tu vi</div>
        </div>
      `;
      dom.topUsersList.appendChild(li);
    });
  }

  function appendChatMessage(user, comment) {
    if (!state.settings.showComments) return;
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.innerHTML = `
      <img src="${user.avatar}" alt="" />
      <div>
        <span class="chat-user">${user.name}:</span>
        <span>${comment}</span>
      </div>
    `;
    dom.chatMessages.prepend(div);
    while (dom.chatMessages.children.length > 25) {
      dom.chatMessages.lastElementChild.remove();
    }
  }

  // ==================== SETTINGS & ACTIONS TỪ DASHBOARD ====================
  function applySettings(newSettings) {
    Object.assign(state.settings, newSettings);

    // Đổi theme Tiên Giới
    dom.body.className = `theme-${state.settings.realmTheme || 'golden_palace'}`;

    // Ẩn/hiện các khối
    dom.chatBox.classList.toggle('hidden', !state.settings.showComments);
    dom.leaderboardBox.classList.toggle('hidden', !state.settings.showTopUsers);
    dom.goalText.textContent = `${state.spiritEnergy} / ${state.settings.goalTarget} Linh Khí`;
  }

  function triggerAction(actionKey) {
    if (actionKey === 'trigger_tribulation') {
      createLightningBolt('#ffd700');
      createLightningBolt('#00f5d4');
      showImperialDecree('⚡ THIÊN ĐẠO GIÁNG LÔI KIẾP TOÀN CÕI! ⚡');
    } else if (actionKey === 'activate_spirit_rain') {
      activateSpiritRainTurbo();
    } else if (actionKey === 'reset_realm') {
      gameQueue.length = 0;
      cultivatorsDB.clear();
      topDonator = null;
      state.spiritEnergy = 0;
      renderQueueUI();
      updateLeaderboardUI();
      showImperialDecree('🔄 TÁI TẠO KỶ NGUYÊN TU TIÊN MỚI!');
    }
  }

  // ==================== ĐỒ HỌA CANVAS 2D (LINH KHÍ, MÂY TIÊN, THIÊN LÔI) ====================
  const canvas = document.getElementById('celestial-canvas');
  const ctx = canvas.getContext('2d');
  const particles = [];
  const lightningBolts = [];
  const floatingTexts = [];

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Khởi tạo hạt Linh Khí bay lơ lửng
  for (let i = 0; i < 65; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2.8 + 1,
      vy: -(Math.random() * 0.8 + 0.3),
      vx: (Math.random() - 0.5) * 0.5,
      color: Math.random() > 0.4 ? '#f5d061' : '#00f5d4',
      alpha: Math.random() * 0.75 + 0.2
    });
  }

  function spawnGoldenPill() {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20,
      r: 5,
      vy: Math.random() * 2.5 + 1.5,
      vx: (Math.random() - 0.5) * 1.2,
      color: '#ffd700',
      alpha: 1,
      isPill: true
    });
  }

  function spawnFloatingText(text, x, y, color) {
    floatingTexts.push({ text, x, y, color, alpha: 1, vy: -1.8 });
  }

  function createLightningBolt(color = '#ffd700') {
    const targetX = canvas.width * 0.5 + (Math.random() - 0.5) * 120;
    const targetY = canvas.height * 0.48;
    const segments = [];
    let currX = targetX + (Math.random() - 0.5) * 260;
    let currY = 0;

    while (currY < targetY) {
      const nextY = currY + Math.random() * 35 + 15;
      const nextX = currX + (Math.random() - 0.5) * 65;
      segments.push({ x1: currX, y1: currY, x2: nextX, y2: nextY });
      currX = nextX;
      currY = nextY;
    }

    lightningBolts.push({ segments, color, alpha: 1 });
    dom.lightningFlash.classList.add('active');
    setTimeout(() => dom.lightningFlash.classList.remove('active'), 90);
  }

  function animateCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Vẽ Hạt Linh Khí & Mưa Tiên Đơn
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * (state.settings.cultivationSpeed || 1.5);
      p.y += p.vy * (state.settings.cultivationSpeed || 1.5);

      if (p.isPill && p.y > canvas.height) {
        particles.splice(i, 1);
        continue;
      }
      if (!p.isPill && p.y < 0) p.y = canvas.height;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = p.isPill ? 18 : 10;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.restore();
    }

    // 2. Vẽ Tia Sét Thiên Lôi
    for (let i = lightningBolts.length - 1; i >= 0; i--) {
      const bolt = lightningBolts[i];
      ctx.save();
      ctx.strokeStyle = bolt.color;
      ctx.lineWidth = 4;
      ctx.shadowBlur = 25;
      ctx.shadowColor = bolt.color;
      ctx.globalAlpha = bolt.alpha;
      ctx.beginPath();
      bolt.segments.forEach((seg) => {
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
      });
      ctx.stroke();
      ctx.restore();

      bolt.alpha -= 0.06;
      if (bolt.alpha <= 0) lightningBolts.splice(i, 1);
    }

    // 3. Vẽ Chữ Bay (+Tu Vi / +Linh Khí)
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.018;
      ctx.save();
      ctx.font = '900 22px "Noto Serif SC", serif';
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 8;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();

      if (ft.alpha <= 0) floatingTexts.splice(i, 1);
    }

    requestAnimationFrame(animateCanvas);
  }

  // Khởi chạy
  connectWebSocket();
  animateCanvas();
})();
