const grid = document.getElementById('grid');
const countEl = document.getElementById('count');
const params = new URLSearchParams(location.search);
const streamKey = params.get('key') || 'live_default';

let users = [];
let highlightDuration = 3000;

function renderGrid() {
  grid.innerHTML = '';
  users.forEach((u, i) => {
    const card = document.createElement('div');
    card.className = `avatar-card ${u.isVip ? 'vip' : ''}`;
    card.id = `user-${u.id || i}`;

    const img = document.createElement('img');
    img.src = u.photoUrl || 'https://images.generated.photos/3nZt9v5-TizuhzK8TpkdbYVG8JQBkVZGvTh10qcd_FI/rs:fit:256:256/wm:1:re:0:0:0.8/att:0/czM6Ly9yMi1pY29u/czgtZ3Bob3Rvcy1w/cm9kLXBob3Rvcy92/M18wOTI3MzQxLmpw/Zw.jpg';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = u.name;

    card.appendChild(img);
    card.appendChild(name);
    grid.appendChild(card);
  });
  countEl.textContent = users.length;
}

function applyDensity(density) {
  if (density === 'large') {
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
  } else if (density === 'small') {
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(55px, 1fr))';
  } else {
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(85px, 1fr))';
  }
}

function highlightUser(id) {
  const el = document.getElementById(`user-${id}`);
  if (el) {
    el.classList.add('highlight');
    setTimeout(() => {
      el.classList.remove('highlight');
    }, highlightDuration);
  }
}

// WebSocket Bridge
const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?key=' + encodeURIComponent(streamKey));

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'SUBSCRIBE', key: streamKey }));
};

ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === 'INIT_STATE' && Array.isArray(msg.queue)) {
      users = msg.queue;
      renderGrid();
    } else if (msg.type === 'ADD_USER' && msg.user) {
      users.unshift(msg.user);
      renderGrid();
      if (msg.user.isVip) {
        highlightUser(msg.user.id);
      }
    } else if (msg.type === 'CLEAR_QUEUE') {
      users = [];
      renderGrid();
    } else if (msg.type === 'ACTION') {
      if (msg.action === 'highlight_top' && users.length > 0) {
        highlightUser(users[0].id);
      } else if (msg.action === 'clear_wall') {
        users = [];
        renderGrid();
      }
    } else if (msg.type === 'SET_SETTINGS' && msg.settings) {
      if (msg.settings.highlightDuration) highlightDuration = msg.settings.highlightDuration * 1000;
      if (msg.settings.gridDensity) applyDensity(msg.settings.gridDensity);
    }
  } catch (e) {}
};
