const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const countEl = document.getElementById('count');
const toast = document.getElementById('winner-toast');
const winnerNameEl = document.getElementById('winner-name');

const PALETTES = {
  rainbow: ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'],
  neon: ['#ff007f', '#00f0ff', '#7b2cbf', '#00ff66', '#ff0033', '#ffe600'],
  gold: ['#d97706', '#f59e0b', '#fbbf24', '#b45309', '#78350f', '#fef3c7'],
};

let currentTheme = 'rainbow';
let spinDuration = 4000;
let autoSpinOnVip = true;

let users = [];
let currentAngle = 0;
let isSpinning = false;

function drawWheel() {
  const num = Math.max(users.length, 6);
  const arc = (2 * Math.PI) / num;
  ctx.clearRect(0, 0, 600, 600);
  const colors = PALETTES[currentTheme] || PALETTES.rainbow;

  for (let i = 0; i < num; i++) {
    const angle = currentAngle + i * arc;
    ctx.beginPath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.moveTo(300, 300);
    ctx.arc(300, 300, 290, angle, angle + arc);
    ctx.lineTo(300, 300);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(300, 300);
    ctx.rotate(angle + arc / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Space Grotesk", sans-serif';
    const name = users[i] ? users[i].name : `Ô số #${i + 1}`;
    ctx.fillText(name.slice(0, 14), 260, 6);
    ctx.restore();
  }
}

drawWheel();

function spin() {
  if (isSpinning || users.length === 0) return;
  isSpinning = true;
  toast.style.display = 'none';

  const duration = spinDuration;
  const start = performance.now();
  const extraSpins = 5 + Math.random() * 4;
  const totalRot = extraSpins * 2 * Math.PI + Math.random() * 2 * Math.PI;
  const initialAngle = currentAngle;

  function anim(time) {
    const t = Math.min((time - start) / duration, 1);
    const easeOut = 1 - Math.pow(1 - t, 3);
    currentAngle = initialAngle + totalRot * easeOut;
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      isSpinning = false;
      const num = users.length;
      const arc = (2 * Math.PI) / num;
      const normalized = (3 * Math.PI / 2 - (currentAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const winIdx = Math.floor(normalized / arc) % num;
      const winner = users[winIdx];
      if (winner) {
        winnerNameEl.textContent = winner.name;
        toast.style.display = 'block';
      }
    }
  }
  requestAnimationFrame(anim);
}

document.getElementById('btn-spin').addEventListener('click', spin);

// Realtime WebSocket Bridge
const params = new URLSearchParams(location.search);
const streamKey = params.get('key') || 'live_default';
const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?key=' + encodeURIComponent(streamKey));

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'SUBSCRIBE', key: streamKey }));
};

ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === 'INIT_STATE' && Array.isArray(msg.queue)) {
      users = msg.queue;
      countEl.textContent = users.length;
      drawWheel();
    } else if (msg.type === 'ADD_USER' && msg.user) {
      users.push(msg.user);
      countEl.textContent = users.length;
      drawWheel();
      if (msg.user.isVip && autoSpinOnVip) spin();
    } else if (msg.type === 'CLEAR_QUEUE') {
      users = [];
      countEl.textContent = '0';
      drawWheel();
    } else if (msg.type === 'ACTION') {
      if (msg.action === 'spin') spin();
      if (msg.action === 'reset_winner') toast.style.display = 'none';
      if (msg.action === 'shuffle') {
        users.sort(() => Math.random() - 0.5);
        drawWheel();
      }
    } else if (msg.type === 'SET_SETTINGS' && msg.settings) {
      if (msg.settings.spinDuration) spinDuration = msg.settings.spinDuration * 1000;
      if (typeof msg.settings.autoSpinOnVip === 'boolean') autoSpinOnVip = msg.settings.autoSpinOnVip;
      if (msg.settings.wheelTheme) {
        currentTheme = msg.settings.wheelTheme;
        drawWheel();
      }
    }
  } catch (e) {}
};
