/**
 * LIVE STREAM INTERACTION OVERLAY
 * Draggable, resizable, virtualized chat & gift stream + top leaderboard overlay.
 * Works inside OBS Browser Source & standalone templates.
 */

(function () {
  // Prevent duplicate initialization if parent preview host already has it
  if (window.self !== window.top) {
    try {
      if (window.top.document && window.top.document.getElementById('live-overlay-container')) {
        console.log('[LiveOverlay] Running inside preview iframe - delegating overlay to top window.');
        return;
      }
    } catch (e) {
      // Cross-origin fallback
    }
  }

  // Avoid multiple instances on the same window
  if (window.__LiveOverlayInitialized) return;
  window.__LiveOverlayInitialized = true;

  const MAX_ITEMS = 100;
  const ESTIMATED_ITEM_HEIGHT = 52; // px

  let allLogs = [];
  let userStats = new Map(); // uniqueId / name -> { name, avatar, gifts, diamonds, comments, score }
  let currentSettings = {
    showComments: false,
    showGifts: false,
    showTopUsers: false,
  };
  let activeTab = 'feed'; // 'feed' | 'top'
  let opacityLevel = 0.90;
  let currentScale = 1.0;

  // DOM Elements
  let container, header, feedEl, topViewEl, virtualSpacer, virtualContent;
  let tabFeedBtn, tabTopBtn;

  function initUI() {
    if (document.getElementById('live-overlay-container')) return;

    // Inject HTML structure
    container = document.createElement('div');
    container.id = 'live-overlay-container';
    container.innerHTML = `
      <div id="live-overlay-header">
        <div class="overlay-header-left">
          <span class="overlay-drag-handle">⋮⋮</span>
          <span class="overlay-live-dot"></span>
          <span id="overlay-title-text">LIVE CHAT</span>
        </div>
        <div class="overlay-tabs" id="overlay-tabs-bar">
          <button class="overlay-tab-btn active" id="overlay-tab-feed">💬 Chat</button>
          <button class="overlay-tab-btn" id="overlay-tab-top">🏆 Top</button>
        </div>
        <div class="overlay-header-tools">
          <button class="overlay-tool-btn" id="overlay-btn-zoom-out" title="Thu nhỏ chữ">-</button>
          <button class="overlay-tool-btn" id="overlay-btn-zoom-in" title="Phóng to chữ">+</button>
          <button class="overlay-tool-btn" id="overlay-btn-opacity" title="Đổi độ trong suốt">◐</button>
          <button class="overlay-tool-btn" id="overlay-btn-close" title="Ẩn tạm thời">✕</button>
        </div>
      </div>
      <div id="live-overlay-body">
        <div id="live-overlay-feed">
          <div id="live-overlay-virtual-spacer">
            <div id="live-overlay-virtual-content"></div>
          </div>
        </div>
        <div id="live-overlay-top-view"></div>
      </div>
      <div class="overlay-resizer">⤡</div>
    `;

    document.body.appendChild(container);

    header = document.getElementById('live-overlay-header');
    feedEl = document.getElementById('live-overlay-feed');
    topViewEl = document.getElementById('live-overlay-top-view');
    virtualSpacer = document.getElementById('live-overlay-virtual-spacer');
    virtualContent = document.getElementById('live-overlay-virtual-content');
    tabFeedBtn = document.getElementById('overlay-tab-feed');
    tabTopBtn = document.getElementById('overlay-tab-top');

    setupDragAndDrop();
    setupResizeAndTools();
    setupTabs();
    restoreState();

    feedEl.addEventListener('scroll', () => {
      renderVirtualFeed();
    });

    window.addEventListener('resize', () => {
      clampPosition();
    });
  }

  // Drag and Drop
  function setupDragAndDrop() {
    let isDragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.overlay-header-tools') || e.target.closest('.overlay-tabs')) return;
      isDragging = true;
      container.classList.add('is-dragging');
      header.setPointerCapture(e.pointerId);

      const rect = container.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    header.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = origLeft + dx;
      let newTop = origTop + dy;

      const maxLeft = Math.max(0, window.innerWidth - container.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - container.offsetHeight);

      newLeft = Math.min(Math.max(0, newLeft), maxLeft);
      newTop = Math.min(Math.max(0, newTop), maxTop);

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        container.classList.remove('is-dragging');
        try { header.releasePointerCapture(e.pointerId); } catch (_) {}
        saveState();
      }
    };

    header.addEventListener('pointerup', stopDrag);
    header.addEventListener('pointercancel', stopDrag);
  }

  function clampPosition() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const curLeft = Math.min(Math.max(0, rect.left), maxLeft);
    const curTop = Math.min(Math.max(0, rect.top), maxTop);

    container.style.left = `${curLeft}px`;
    container.style.top = `${curTop}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  }

  // Resizing and quick tools
  function setupResizeAndTools() {
    // Save resize dimensions when user stops resizing
    const resizeObserver = new ResizeObserver(() => {
      clampPosition();
      renderVirtualFeed();
      saveState();
    });
    resizeObserver.observe(container);

    // Zoom scale buttons
    document.getElementById('overlay-btn-zoom-in')?.addEventListener('click', () => {
      currentScale = Math.min(1.5, currentScale + 0.1);
      applyScale();
      saveState();
    });

    document.getElementById('overlay-btn-zoom-out')?.addEventListener('click', () => {
      currentScale = Math.max(0.75, currentScale - 0.1);
      applyScale();
      saveState();
    });

    // Opacity toggle (cycle 0.90 -> 0.70 -> 0.50 -> 1.0)
    const opacities = [0.90, 0.70, 0.45, 1.0];
    let opIndex = 0;
    document.getElementById('overlay-btn-opacity')?.addEventListener('click', () => {
      opIndex = (opIndex + 1) % opacities.length;
      opacityLevel = opacities[opIndex];
      container.style.background = `rgba(10, 15, 29, ${opacityLevel})`;
      saveState();
    });

    // Close / Hide button
    document.getElementById('overlay-btn-close')?.addEventListener('click', () => {
      container.style.display = 'none';
    });
  }

  function applyScale() {
    if (!container) return;
    feedEl.style.fontSize = `${currentScale * 100}%`;
    topViewEl.style.fontSize = `${currentScale * 100}%`;
    renderVirtualFeed();
  }

  // Tabs
  function setupTabs() {
    tabFeedBtn?.addEventListener('click', () => switchTab('feed'));
    tabTopBtn?.addEventListener('click', () => switchTab('top'));
  }

  function switchTab(tab) {
    activeTab = tab;
    if (tab === 'feed') {
      tabFeedBtn?.classList.add('active');
      tabTopBtn?.classList.remove('active');
      feedEl.style.display = 'block';
      topViewEl.classList.remove('show');
      renderVirtualFeed();
    } else {
      tabTopBtn?.classList.add('active');
      tabFeedBtn?.classList.remove('active');
      feedEl.style.display = 'none';
      topViewEl.classList.add('show');
      renderTopLeaderboard();
    }
    saveState();
  }

  // State Persistence
  function saveState() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const state = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      scale: currentScale,
      opacity: opacityLevel,
      activeTab: activeTab,
    };
    try {
      localStorage.setItem('obs_live_overlay_cfg', JSON.stringify(state));
    } catch (_) {}
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem('obs_live_overlay_cfg');
      if (!raw) return;
      const state = JSON.parse(raw);

      if (typeof state.width === 'number' && state.width > 150) {
        container.style.width = `${state.width}px`;
      }
      if (typeof state.height === 'number' && state.height > 120) {
        container.style.height = `${state.height}px`;
      }
      if (typeof state.left === 'number' && typeof state.top === 'number') {
        const maxLeft = Math.max(0, window.innerWidth - (state.width || 320));
        const maxTop = Math.max(0, window.innerHeight - (state.height || 380));
        container.style.left = `${Math.min(Math.max(0, state.left), maxLeft)}px`;
        container.style.top = `${Math.min(Math.max(0, state.top), maxTop)}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }
      if (typeof state.scale === 'number') {
        currentScale = state.scale;
        applyScale();
      }
      if (typeof state.opacity === 'number') {
        opacityLevel = state.opacity;
        container.style.background = `rgba(10, 15, 29, ${opacityLevel})`;
      }
      if (state.activeTab === 'top') {
        switchTab('top');
      }
    } catch (_) {}
  }

  // Data processing: Filter by settings
  function getFilteredLogs() {
    const showComments = !!currentSettings.showComments;
    const showGifts = !!currentSettings.showGifts;

    return allLogs.filter((item) => {
      const isGift = item.type === 'gift';
      const isChat = item.type === 'chat' || item.type === 'member';

      if (isGift && showGifts) return true;
      if (isChat && showComments) return true;
      // If neither explicitly matches but settings allow
      if (!isGift && showComments) return true;
      return false;
    });
  }

  // Virtual Items Rendering Engine (max 100 items capped)
  function renderVirtualFeed() {
    if (!feedEl || activeTab !== 'feed') return;

    const filtered = getFilteredLogs();

    if (filtered.length === 0) {
      virtualSpacer.style.height = '0px';
      virtualContent.style.transform = 'translateY(0px)';
      virtualContent.innerHTML = `
        <div class="overlay-empty-state">
          <div class="overlay-empty-icon">💬</div>
          <div>Chờ bình luận hoặc quà tặng...</div>
          <div style="font-size: 9.5px; color: #475569; margin-top: 4px;">
            (Bật bình luận / quà trong Cài Đặt)
          </div>
        </div>
      `;
      return;
    }

    const itemHeight = Math.max(40, ESTIMATED_ITEM_HEIGHT * currentScale);
    const totalHeight = filtered.length * itemHeight;
    virtualSpacer.style.height = `${totalHeight}px`;

    const scrollTop = feedEl.scrollTop;
    const clientHeight = feedEl.clientHeight || 300;

    const buffer = 4;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const endIndex = Math.min(filtered.length, Math.ceil((scrollTop + clientHeight) / itemHeight) + buffer);

    const visibleItems = filtered.slice(startIndex, endIndex);
    const offsetY = startIndex * itemHeight;

    virtualContent.style.transform = `translateY(${offsetY}px)`;
    virtualContent.innerHTML = visibleItems
      .map((item) => {
        const isGift = item.type === 'gift';
        const avatar = item.avatarUrl || '/api/proxy-img?url=';
        const name = escapeHtml(item.userName || 'Khán giả');
        const message = escapeHtml(item.message || '');
        const timeStr = formatTime(item.createdAt);

        return `
          <div class="overlay-feed-item ${isGift ? 'is-gift' : ''}">
            <div class="overlay-avatar-wrap ${isGift ? 'is-vip' : ''}">
              <img class="overlay-avatar" src="${avatar}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 32 32\\'><circle cx=\\'16\\' cy=\\'16\\' r=\\'16\\' fill=\\'%23334155\\'/></svg>'" alt="" />
              ${isGift ? '<span class="overlay-vip-badge">★</span>' : ''}
            </div>
            <div class="overlay-content-wrap">
              <div class="overlay-author-line">
                <span class="overlay-author-name">${name}</span>
                <span class="overlay-item-time">${timeStr}</span>
              </div>
              <div class="overlay-message-text">
                ${isGift ? '<span class="overlay-gift-pill">🎁 QUÀ</span> ' : ''}
                ${message}
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Top Leaderboard Calculation & Rendering
  function updateTopStats(item) {
    if (!item || !item.userName) return;
    const key = item.userName;
    let entry = userStats.get(key);
    if (!entry) {
      entry = {
        name: item.userName,
        avatar: item.avatarUrl || '',
        gifts: 0,
        diamonds: 0,
        comments: 0,
        score: 0,
      };
      userStats.set(key, entry);
    }

    if (item.avatarUrl) entry.avatar = item.avatarUrl;

    if (item.type === 'gift') {
      entry.gifts += 1;
      // Trích xuất số xu quà tặng từ message "(X xu)"
      const match = (item.message || '').match(/\((\d+)\s*xu\)/i);
      const dia = match ? parseInt(match[1], 10) : 1;
      entry.diamonds += dia;
      // Tặng quà: Xu * 10
      entry.score += dia * 10;
    } else if (item.type === 'member') {
      // Mới tham gia: +1 điểm
      entry.score += 1;
    } else {
      // Comment: +3 điểm
      entry.comments += 1;
      entry.score += 3;
    }
  }

  function renderTopLeaderboard() {
    if (!topViewEl) return;

    const list = Array.from(userStats.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (list.length === 0) {
      topViewEl.innerHTML = `
        <div class="overlay-empty-state">
          <div class="overlay-empty-icon">🏆</div>
          <div>Chưa có dữ liệu xếp hạng</div>
          <div style="font-size: 9.5px; color: #475569; margin-top: 4px;">Khán giả bình luận hoặc tặng quà sẽ vào Top</div>
        </div>
      `;
      return;
    }

    topViewEl.innerHTML = list
      .map((u, idx) => {
        const rank = idx + 1;
        const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
        const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;

        return `
          <div class="overlay-top-card ${rankClass}">
            <div class="overlay-rank-badge">${rankBadge}</div>
            <div class="overlay-avatar-wrap ${rank === 1 ? 'is-vip' : ''}">
              <img class="overlay-avatar" src="${u.avatar}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 32 32\\'><circle cx=\\'16\\' cy=\\'16\\' r=\\'16\\' fill=\\'%23334155\\'/></svg>'" alt="" />
            </div>
            <div class="overlay-top-info">
              <div class="overlay-top-name">${escapeHtml(u.name)}</div>
              <div class="overlay-top-sub">
                ${u.diamonds > 0 ? `<span>🎁 ${u.diamonds} xu</span>` : ''}
                <span>💬 ${u.comments} cmt</span>
              </div>
            </div>
            <div class="overlay-top-score">${u.score.toLocaleString('vi-VN')} đ</div>
          </div>
        `;
      })
      .join('');
  }

  // Settings update & visibility controller
  function applyOverlayVisibility() {
    if (!container) return;

    const showComments = !!currentSettings.showComments;
    const showGifts = !!currentSettings.showGifts;
    const showTop = !!currentSettings.showTopUsers;

    const shouldShow = showComments || showGifts || showTop;

    if (!shouldShow) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    // Tabs control
    const tabsBar = document.getElementById('overlay-tabs-bar');
    const titleText = document.getElementById('overlay-title-text');

    if (showTop && (showComments || showGifts)) {
      if (tabsBar) tabsBar.style.display = 'flex';
      if (titleText) titleText.textContent = 'TƯƠNG TÁC';
    } else if (showTop && !showComments && !showGifts) {
      if (tabsBar) tabsBar.style.display = 'none';
      if (titleText) titleText.textContent = 'TOP BXH';
      switchTab('top');
    } else {
      if (tabsBar) tabsBar.style.display = 'none';
      if (titleText) titleText.textContent = showGifts && !showComments ? 'QUÀ TẶNG' : 'LIVE CHAT';
      switchTab('feed');
    }

    if (activeTab === 'feed') {
      renderVirtualFeed();
    } else {
      renderTopLeaderboard();
    }
  }

  function addLogItem(log) {
    if (!log) return;
    const item = {
      id: log.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: log.type || 'chat',
      userName: log.userName || log.user_name || 'Khán giả',
      message: log.message || '',
      avatarUrl: log.avatarUrl || log.avatar_url || '',
      createdAt: log.createdAt || log.created_at || Date.now(),
    };

    allLogs.push(item);
    updateTopStats(item);

    // Virtual items cap at 100 max: slice when exceeding 100
    if (allLogs.length > MAX_ITEMS) {
      allLogs.splice(0, allLogs.length - MAX_ITEMS);
    }

    if (activeTab === 'feed') {
      const wasAtBottom = isScrollNearBottom();
      renderVirtualFeed();
      if (wasAtBottom) {
        scrollToBottom();
      }
    } else {
      renderTopLeaderboard();
    }
  }

  function setLogsBatch(logs) {
    if (!Array.isArray(logs)) return;
    allLogs = [];
    userStats.clear();

    const sliced = logs.slice(-MAX_ITEMS);
    sliced.forEach((l) => {
      const item = {
        id: l.id || `log_${Date.now()}`,
        type: l.type || 'chat',
        userName: l.userName || l.user_name || 'Khán giả',
        message: l.message || '',
        avatarUrl: l.avatarUrl || l.avatar_url || '',
        createdAt: l.createdAt || l.created_at || Date.now(),
      };
      allLogs.push(item);
      updateTopStats(item);
    });

    if (activeTab === 'feed') {
      renderVirtualFeed();
      scrollToBottom();
    } else {
      renderTopLeaderboard();
    }
  }

  function isScrollNearBottom() {
    if (!feedEl) return true;
    const threshold = 80;
    return feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight <= threshold;
  }

  function scrollToBottom() {
    if (!feedEl) return;
    setTimeout(() => {
      feedEl.scrollTop = feedEl.scrollHeight;
    }, 20);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Public Interface
  window.LiveOverlay = {
    init: function () {
      initUI();
    },
    updateSettings: function (newSettings) {
      if (!newSettings) return;
      currentSettings = { ...currentSettings, ...newSettings };
      applyOverlayVisibility();
    },
    addLog: function (log) {
      addLogItem(log);
    },
    setLogs: function (logs) {
      setLogsBatch(logs);
    },
    handleMessage: function (msg) {
      if (!msg || !msg.type) return;

      if (msg.type === 'INIT_STATE') {
        if (msg.settings) {
          currentSettings = { ...currentSettings, ...msg.settings };
          applyOverlayVisibility();
        }
        if (Array.isArray(msg.logs)) {
          setLogsBatch(msg.logs);
        }
      } else if (msg.type === 'SET_SETTINGS') {
        if (msg.settings) {
          currentSettings = { ...currentSettings, ...msg.settings };
          applyOverlayVisibility();
        }
      } else if (msg.type === 'ADD_LOG') {
        if (msg.log) {
          addLogItem(msg.log);
        }
      } else if (msg.type === 'ACTION') {
        if (msg.action === 'showComments' || msg.action === 'showGifts' || msg.action === 'showTopUsers') {
          currentSettings[msg.action] = !!msg.value;
          applyOverlayVisibility();
        }
      }
    },
  };

  // Auto-mount when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();
