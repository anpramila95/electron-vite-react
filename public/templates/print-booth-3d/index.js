import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* ==================== TIEN ICH ==================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(pts, n) {
  n = n || 8;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n,
        t2 = t * t,
        t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

function arcPts(x, y, rx, ry, a0, a1, n) {
  n = n || 26;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]);
  }
  return out;
}

function roundRectPts(x, y, w, h, r) {
  const p = [];
  const corner = (cx, cy, a0, a1) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x + r, y + r, Math.PI, Math.PI * 1.5);
  corner(x + w - r, y + r, Math.PI * 1.5, Math.PI * 2);
  corner(x + w - r, y + h - r, 0, Math.PI * 0.5);
  corner(x + r, y + h - r, Math.PI * 0.5, Math.PI);
  p.push([x + r, y + r]);
  return p;
}

/* ==================== TRANG THAI (khai bao truoc khi dung) ==================== */
const state = {
  paused: false,
  batch: 1,
  printed: 0,
  score: 0,
  speed: 1.6,
  turbo: false,
  theme: 0,
  rare: true,
  cardsPerSheet: 6,
};

/* ==================== HOA TIET 5 CHU DE ==================== */
function spriteTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.32, "rgba(255,255,255,.5)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const SPRITE = spriteTexture();

function particles(count, color, size, area, speedY, drift) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area.x;
    pos[i * 3 + 1] = Math.random() * area.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area.z;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: size,
    map: SPRITE,
    color: color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.85,
  });
  const mesh = new THREE.Points(geo, mat);
  return {
    mesh: mesh,
    update: function (dt, t) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        p[i * 3 + 1] -= speedY * dt * (0.55 + ((i * 17) % 11) / 11);
        p[i * 3] += Math.sin(t * drift + i * 0.7) * dt * 0.32;
        if (p[i * 3 + 1] < -0.4) {
          p[i * 3 + 1] = area.y;
          p[i * 3] = (Math.random() - 0.5) * area.x;
          p[i * 3 + 2] = (Math.random() - 0.5) * area.z;
        }
        if (p[i * 3 + 1] > area.y + 0.5) {
          p[i * 3 + 1] = -0.2;
          p[i * 3] = (Math.random() - 0.5) * area.x;
          p[i * 3 + 2] = (Math.random() - 0.5) * area.z;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function decorLanterns() {
  const g = new THREE.Group();
  const items = [];
  const spots = [
    [-6.5, 5.6, -2.2],
    [6.5, 5.9, -1.4],
    [-4.6, 6.2, 2.8],
    [4.9, 6.0, 2.4],
    [0, 6.7, -5.0],
    [-7.4, 6.4, 3.4],
    [7.4, 6.2, 3.1],
  ];
  spots.forEach(function (p, i) {
    const grp = new THREE.Group();
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 1.8, 6),
      new THREE.MeshStandardMaterial({
        color: "#7d2a20",
        roughness: 0.8,
      }),
    );
    cord.position.y = 0.9;
    grp.add(cord);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 22, 16),
      new THREE.MeshStandardMaterial({
        color: "#e2382a",
        emissive: "#c22a1e",
        emissiveIntensity: 0.95,
        roughness: 0.55,
      }),
    );
    body.scale.y = 1.14;
    grp.add(body);
    for (let r = 0; r < 5; r++) {
      const rad = 0.62 * Math.cos((r - 2) * 0.3);
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(rad, 0.022, 6, 22),
        new THREE.MeshStandardMaterial({
          color: "#f0c060",
          metalness: 0.65,
          roughness: 0.36,
        }),
      );
      rib.rotation.x = Math.PI / 2;
      rib.position.y = (r - 2) * 0.31;
      grp.add(rib);
    }
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.15, 12),
      new THREE.MeshStandardMaterial({
        color: "#e8b64c",
        metalness: 0.72,
        roughness: 0.32,
      }),
    );
    cap.position.y = 0.76;
    grp.add(cap);
    const tas = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.018, 0.55, 8),
      new THREE.MeshStandardMaterial({
        color: "#e8b64c",
        roughness: 0.5,
      }),
    );
    tas.position.y = -0.86;
    grp.add(tas);
    const l = new THREE.PointLight("#ff6b3c", 10, 11, 2);
    l.position.y = -0.12;
    grp.add(l);
    grp.position.set(p[0], p[1], p[2]);
    grp.userData.baseY = p[1];
    items.push(grp);
    g.add(grp);
  });
  const spark = particles(
    180,
    "#ffcf7a",
    0.16,
    { x: 28, y: 13, z: 22 },
    -0.5,
    0.6,
  );
  g.add(spark.mesh);
  return {
    group: g,
    update: function (dt, t) {
      items.forEach(function (c, i) {
        c.rotation.z = Math.sin(t * 0.7 + i) * 0.06;
        c.position.y = c.userData.baseY + Math.sin(t * 0.85 + i) * 0.09;
      });
      spark.update(dt, t);
    },
  };
}

function decorSnow() {
  const g = new THREE.Group();
  const snow = particles(
    560,
    "#ffffff",
    0.16,
    { x: 38, y: 19, z: 30 },
    1.25,
    0.45,
  );
  g.add(snow.mesh);
  const cols = ["#ff6b5c", "#ffd166", "#7bf0a8", "#6bc9ff", "#ff9de0"];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26,
      x = -11.5 + t * 23,
      y = 6.35 - Math.sin(t * Math.PI) * 1.35,
      z = -3.3;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 10, 8),
      new THREE.MeshStandardMaterial({
        color: cols[i % 5],
        emissive: cols[i % 5],
        emissiveIntensity: 2.3,
        roughness: 0.35,
      }),
    );
    bulb.position.set(x, y, z);
    g.add(bulb);
    if (i % 6 === 0) {
      const l = new THREE.PointLight(cols[i % 5], 12, 12, 2);
      l.position.set(x, y, z + 0.4);
      g.add(l);
    }
  }
  const wire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 23, 6),
    new THREE.MeshStandardMaterial({
      color: "#22301f",
      roughness: 0.9,
    }),
  );
  wire.rotation.z = Math.PI / 2;
  wire.position.set(0, 6.35, -3.3);
  g.add(wire);
  return {
    group: g,
    update: function (dt, t) {
      snow.update(dt, t);
    },
  };
}

function decorParty() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.18, 2),
    new THREE.MeshStandardMaterial({
      color: "#d9e0ea",
      metalness: 1,
      roughness: 0.15,
      flatShading: true,
    }),
  );
  ball.position.set(0, 6.1, -2.2);
  g.add(ball);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8),
    new THREE.MeshStandardMaterial({
      color: "#8a919c",
      metalness: 0.9,
      roughness: 0.3,
    }),
  );
  stem.position.set(0, 7.6, -2.2);
  g.add(stem);
  const cols = ["#ff3d7f", "#31d1ff", "#ffd23d", "#8b5cff", "#25ff9c"];
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(cols[i], 28, 18, 2);
    g.add(l);
    lights.push(l);
  }
  const bokeh = particles(
    230,
    "#ffd6f2",
    0.62,
    { x: 32, y: 15, z: 24 },
    -0.2,
    0.35,
  );
  g.add(bokeh.mesh);
  return {
    group: g,
    update: function (dt, t) {
      ball.rotation.y += dt * 0.55;
      ball.rotation.x += dt * 0.12;
      lights.forEach(function (l, i) {
        const a = t * 0.72 + (i * Math.PI) / 2;
        l.position.set(
          Math.cos(a) * 7.4,
          3.4 + Math.sin(t * 1.15 + i) * 1.5,
          Math.sin(a) * 6 - 1.6,
        );
      });
      bokeh.update(dt, t);
    },
  };
}

function decorNeon() {
  const g = new THREE.Group();
  const cols = ["#25d3ff", "#ff3d9a", "#8b5cff", "#25ffb0"];
  const tubes = [];
  for (let i = 0; i < 11; i++) {
    const h = 2.6 + (((i * 37) % 100) / 100) * 3.6;
    const x = -9.2 + i * 1.85,
      z = -4.4 - (i % 2) * 1.5,
      y = h / 2 + 0.55;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, h, 12),
      new THREE.MeshStandardMaterial({
        color: cols[i % 4],
        emissive: cols[i % 4],
        emissiveIntensity: 2.5,
        roughness: 0.34,
        metalness: 0.1,
      }),
    );
    tube.position.set(x, y, z);
    g.add(tube);
    tubes.push(tube);
    if (i % 3 === 0) {
      const l = new THREE.PointLight(cols[i % 4], 16, 14, 2);
      l.position.set(x, y, z + 0.7);
      g.add(l);
    }
  }
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5 + i * 0.55, 0.06, 10, 44),
      new THREE.MeshStandardMaterial({
        color: cols[i],
        emissive: cols[i],
        emissiveIntensity: 2.2,
        roughness: 0.3,
      }),
    );
    ring.position.set(0, 5.2, -6.2);
    ring.rotation.x = Math.PI / 2.1;
    g.add(ring);
    tubes.push(ring);
  }
  const glow = particles(
    240,
    "#7fe6ff",
    0.2,
    { x: 32, y: 14, z: 24 },
    -0.35,
    0.5,
  );
  g.add(glow.mesh);
  return {
    group: g,
    update: function (dt, t) {
      tubes.forEach(function (o, i) {
        o.material.emissiveIntensity = 2 + Math.sin(t * 2.2 + i * 1.1) * 0.75;
      });
      glow.update(dt, t);
    },
  };
}

function decorDefault() {
  const g = new THREE.Group();
  return {
    group: g,
    update: function () {},
  };
}

function decorGolden() {
  const g = new THREE.Group();
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: SPRITE,
      color: "#ffb765",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sun.scale.set(19, 19, 1);
  sun.position.set(-9.5, 8.6, -12.5);
  g.add(sun);
  const sun2 = sun.clone();
  sun2.scale.set(9, 9, 1);
  sun2.position.set(8.6, 6.2, -9.5);
  sun2.material = sun.material.clone();
  sun2.material.color.set("#ffd9a0");
  g.add(sun2);
  const dust = particles(
    340,
    "#ffd9a0",
    0.13,
    { x: 31, y: 14, z: 23 },
    -0.16,
    0.25,
  );
  g.add(dust.mesh);
  const glow = particles(
    90,
    "#ffbe7a",
    0.85,
    { x: 28, y: 11, z: 20 },
    -0.09,
    0.2,
  );
  g.add(glow.mesh);
  return {
    group: g,
    update: function (dt, t) {
      dust.update(dt, t);
      glow.update(dt, t);
    },
  };
}

const THEMES = [
  {
    id: "default",
    name: "Mặc định (Nhẹ nhất)",
    accent: "#3b82f6",
    ring: "#d4a359",
    bg: "#11141a",
    fog: "#11141a",
    floorTint: "#a89b88",
    paperTint: "#ebd8b3",
    paperBase: "#ebd8b3",
    cardFill: "#f4e6cb",
    hemiSky: "#dbeafe",
    hemiGround: "#1e293b",
    hemiI: 0.65,
    keyColor: "#ffffff",
    keyI: 2.2,
    fillColor: "#93c5fd",
    rim: "#60a5fa",
    rimI: 40,
    headColor: "#f1f5f9",
    avatarBg: [
      ["0", "#f8fafc"],
      ["1", "#cbd5e1"],
    ],
    build: decorDefault,
  },
  {
    id: "tet",
    name: "Tết Việt Nam",
    accent: "#e2412c",
    ring: "#d9a441",
    bg: "#2b0b0a",
    fog: "#2b0b0a",
    floorTint: "#c99b72",
    paperTint: "#ebd8b3",
    paperBase: "#ebd8b3",
    cardFill: "#f4e6cb",
    hemiSky: "#ff9f7a",
    hemiGround: "#3a1210",
    hemiI: 0.62,
    keyColor: "#ffd7ab",
    keyI: 2.4,
    fillColor: "#ff7a5c",
    rim: "#ff4a24",
    rimI: 70,
    headColor: "#ffcf9c",
    avatarBg: [
      ["0", "#f8dcb4"],
      ["1", "#e2a468"],
    ],
    build: decorLanterns,
  },
  {
    id: "xmas",
    name: "Giáng Sinh",
    accent: "#d8443c",
    ring: "#c9463f",
    bg: "#0c1c18",
    fog: "#0c1c18",
    floorTint: "#a8bda8",
    paperTint: "#ebd8b3",
    paperBase: "#ebd8b3",
    cardFill: "#f4e6cb",
    hemiSky: "#bfe6ff",
    hemiGround: "#12281f",
    hemiI: 0.66,
    keyColor: "#ffeacf",
    keyI: 2.35,
    fillColor: "#79d9a2",
    rim: "#37c07c",
    rimI: 60,
    headColor: "#ffe2bc",
    avatarBg: [
      ["0", "#e2ede6"],
      ["1", "#a9c9ba"],
    ],
    build: decorSnow,
  },
  {
    id: "party",
    name: "Đêm Tiệc Vui",
    accent: "#b06bff",
    ring: "#a06bf5",
    bg: "#170c24",
    fog: "#170c24",
    floorTint: "#b09ad0",
    paperTint: "#ebd8b3",
    paperBase: "#ebd8b3",
    cardFill: "#f4e6cb",
    hemiSky: "#d0a6ff",
    hemiGround: "#22103a",
    hemiI: 0.6,
    keyColor: "#ffd6f2",
    keyI: 2.2,
    fillColor: "#a97dff",
    rim: "#8b3cff",
    rimI: 78,
    headColor: "#ffd7f5",
    avatarBg: [
      ["0", "#e8d6f7"],
      ["1", "#ac82e4"],
    ],
    build: decorParty,
  },
  {
    id: "neon",
    name: "Đèn Sáng",
    accent: "#25c9ff",
    ring: "#22c4f5",
    bg: "#06121b",
    fog: "#06121b",
    floorTint: "#8fc6de",
    paperTint: "#ebd8b3",
    paperBase: "#ebd8b3",
    cardFill: "#f4e6cb",
    hemiSky: "#8fe4ff",
    hemiGround: "#08202c",
    hemiI: 0.62,
    keyColor: "#dcf6ff",
    keyI: 2.35,
    fillColor: "#3fd6ff",
    rim: "#20c8ff",
    rimI: 76,
    headColor: "#cdf1ff",
    avatarBg: [
      ["0", "#d6edf8"],
      ["1", "#79c0e2"],
    ],
    build: decorNeon,
  },
  {
    id: "golden",
    name: "Ánh Nắng Vàng",
    accent: "#e0a054",
    ring: "#e0a054",
    bg: "#291a11",
    fog: "#291a11",
    floorTint: "#dcb98c",
    paperTint: "#ebd8b3",
    paperBase: "#ebd8b3",
    cardFill: "#f4e6cb",
    hemiSky: "#ffd9a4",
    hemiGround: "#3c2413",
    hemiI: 0.7,
    keyColor: "#ffe0b2",
    keyI: 2.7,
    fillColor: "#ffb46a",
    rim: "#ff9838",
    rimI: 72,
    headColor: "#ffe3b8",
    avatarBg: [
      ["0", "#ffe9c8"],
      ["1", "#eeb173"],
    ],
    build: decorGolden,
  },
];

/* ==================== ANH THAT VA HANG CHO (QUEUE SYSTEM) ==================== */
const REAL_PHOTOS = [
  "https://images.generated.photos/3nZt9v5-TizuhzK8TpkdbYVG8JQBkVZGvTh10qcd_FI/rs:fit:256:256/wm:1:re:0:0:0.8/att:0/czM6Ly9yMi1pY29u/czgtZ3Bob3Rvcy1w/cm9kLXBob3Rvcy92/M18wOTI3MzQxLmpw/Zw.jpg",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80",
];

// Cache anh that - LRU Cache gioi han 500 anh tranh tran bo nho khi live 24h
const PHOTO_CACHE = {};
const PHOTO_KEYS = [];
function addPhotoToCache(url, img) {
  if (!url || PHOTO_CACHE[url]) return;
  if (PHOTO_KEYS.length >= 500) {
    const oldest = PHOTO_KEYS.shift();
    if (PHOTO_CACHE[oldest]) {
      PHOTO_CACHE[oldest].src = "";
      delete PHOTO_CACHE[oldest];
    }
  }
  PHOTO_KEYS.push(url);
  PHOTO_CACHE[url] = img;
}

function getOrLoadPhoto(url, onReady) {
  if (!url) return null;
  let img = PHOTO_CACHE[url];
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    addPhotoToCache(url, img);
  }

  if (onReady) {
    if (img.complete && img.naturalWidth > 0) {
      onReady(img);
    } else {
      img.addEventListener(
        "load",
        function () {
          if (img.complete && img.naturalWidth > 0) {
            onReady(img);
          }
        },
        { once: true },
      );
    }
  }
  return img;
}

// Bộ lọc Siêu Phân Giải & Làm Nét Thích Ứng (Multi-step Bicubic Upscaling + Unsharp Masking)
function getEnhancedPhotoCanvas(img, targetDim) {
  if (!img || !img.complete || img.naturalWidth === 0) return null;
  const target = Math.max(256, Math.min(800, Math.round(targetDim || 512)));

  // Tái sử dụng canvas đã xử lý siêu nét nếu có
  if (img._enhancedCanvas && img._enhancedDim >= target * 0.85) {
    return img._enhancedCanvas;
  }

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const minDim = Math.min(nw, nh);
  const cropX = (nw - minDim) / 2;
  const cropY = (nh - minDim) / 2;

  // 1. Cắt vuông ảnh gốc
  let cur = document.createElement("canvas");
  cur.width = minDim;
  cur.height = minDim;
  let ctx = cur.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, cropX, cropY, minDim, minDim, 0, 0, minDim, minDim);

  // 2. Phóng to đa nấc từng bước nhân đôi (tránh nhòe do phóng 1 lần từ 72px lên 600px)
  let curSize = minDim;
  while (curSize < target) {
    const nextSize = Math.min(target, curSize * 2);
    const next = document.createElement("canvas");
    next.width = nextSize;
    next.height = nextSize;
    const nctx = next.getContext("2d", { willReadFrequently: true });
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(cur, 0, 0, curSize, curSize, 0, 0, nextSize, nextSize);
    cur = next;
    ctx = nctx;
    curSize = nextSize;
  }

  // 3. Unsharp Masking (Tăng độ tương phản & độ sắc nét viền khuôn mặt, mắt, tóc)
  try {
    const imgData = ctx.getImageData(0, 0, target, target);
    const d = imgData.data;
    const copy = new Uint8ClampedArray(d);
    const amount = 0.5; // Hệ số làm nét chuẩn mắt

    for (let y = 1; y < target - 1; y++) {
      const row = y * target;
      const rowUp = (y - 1) * target;
      const rowDown = (y + 1) * target;

      for (let x = 1; x < target - 1; x++) {
        const idx = (row + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = copy[idx + c];
          const edge =
            (copy[(rowUp + x) * 4 + c] +
              copy[(rowDown + x) * 4 + c] +
              copy[(row + x - 1) * 4 + c] +
              copy[(row + x + 1) * 4 + c]) *
            0.25;
          const sharp = center + (center - edge) * amount;
          d[idx + c] = sharp < 0 ? 0 : sharp > 255 ? 255 : sharp;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (err) {
    // Fallback nếu canvas bị tainted
  }

  img._enhancedCanvas = cur;
  img._enhancedDim = target;
  return cur;
}

REAL_PHOTOS.forEach(function (url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  addPhotoToCache(url, img);
});

// Hang cho nguoi can ve (FIFO + VIP priority)
const userQueue = [];
let nextUserId = 1;

const NAMES = [
  "Lucyy",
  "ZIP",
  "Bống",
  "Mèo",
  "Kẹo",
  "Na",
  "Tiin",
  "Boo",
  "Chiil",
  "Mây",
  "Ken",
  "June",
  "Lá",
  "Sun",
  "Hana",
  "Pao",
  "Yumi",
  "Tít",
  "Khoai",
  "Bơ",
  "Nhim",
  "Cà",
  "Bin",
  "Lulu",
];
const SKINS = [
  "#f6d9bd",
  "#eec6a3",
  "#e0b087",
  "#cf9468",
  "#f9e2ca",
  "#d9a276",
];
const HAIRS = [
  "#211713",
  "#3a2820",
  "#5c3a24",
  "#8b5a2f",
  "#c99a58",
  "#7c3545",
  "#2c3c55",
  "#4b2f6b",
  "#b8543c",
];
const SHIRTS = [
  "#e2412c",
  "#2f6f8f",
  "#e9b44c",
  "#5f8f5b",
  "#c2557f",
  "#3d56b0",
  "#f0e6d6",
  "#2a2f3a",
  "#8e5cc7",
];
const LIPS = ["#c2574f", "#d1655c", "#b34a52", "#d98070"];
const IRIS = ["#4a2c18", "#2f2a33", "#3b5a7a", "#5c7f5c", "#6b4226"];

function makeAvatar(cx, cy, R, rnd, theme, opt) {
  opt = opt || {};
  const S = [];
  const cardW = opt.cardW || 2.84 * R;
  const cardH = opt.cardH || 2.98 * R;
  const nameDy = typeof opt.nameDy === "number" ? opt.nameDy : 1.24 * R;
  const nameSize = opt.nameSize || R * 0.285;

  const skin = SKINS[Math.floor(rnd() * SKINS.length)];
  const hair = HAIRS[Math.floor(rnd() * HAIRS.length)];
  const shirt = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
  const lip = LIPS[Math.floor(rnd() * LIPS.length)];
  const iris = IRIS[Math.floor(rnd() * IRIS.length)];
  const dark = "#2c1c13";
  const W = 6.2;

  function push(pts, o) {
    o = o || {};
    const st = {
      pts: pts.map(function (p) {
        return [cx + p[0] * R, cy + p[1] * R];
      }),
      color: o.c || dark,
      w: o.w || W,
      fill: o.fill,
      text: o.text,
      size: o.size,
      cost: o.cost,
      clipStart: o.clipStart,
      restore: o.restore,
    };
    if (o.grad)
      st.grad = {
        stops: o.grad,
        x0: cx,
        y0: cy - R * 1.15,
        x1: cx,
        y1: cy + R * 1.15,
      };
    if (o.clip) st.clip = { cx: cx, cy: cy, r: R * 1.005 };
    S.push(st);
    return st;
  }
  function pushAbs(pts, o) {
    o = o || {};
    S.push({
      pts: pts.slice(),
      color: o.c || dark,
      w: o.w || W,
      fill: o.fill,
      text: o.text,
      size: o.size,
      cost: o.cost,
      restore: o.restore,
      strokeIt: o.strokeIt,
    });
  }
  function A(x, y, rx, ry, a0, a1, n) {
    return arcPts(x, y, rx, ry, a0, a1, n || 30);
  }

  /* nen anh tron */
  push(A(0, 0, 1, 1, 0, Math.PI * 2, 72), {
    c: "rgba(70,45,25,.3)",
    w: 5,
    grad: theme.avatarBg,
    clipStart: true,
    clip: true,
  });

  /* toc nen */
  const style = Math.floor(rnd() * 4);
  if (style === 0) {
    push(
      smooth(
        [
          [-1.04, 1.16],
          [-1.13, 0.28],
          [-1.06, -0.52],
          [-0.76, -1.04],
          [-0.18, -1.24],
          [0.44, -1.16],
          [0.9, -0.74],
          [1.08, -0.12],
          [1.11, 0.56],
          [1.02, 1.16],
        ],
        7,
      ),
      { fill: hair, c: dark, w: 5 },
    );
  } else if (style === 1) {
    push(
      smooth(
        [
          [-1.02, 0.66],
          [-1.1, -0.18],
          [-0.84, -0.92],
          [-0.18, -1.2],
          [0.5, -1.08],
          [0.95, -0.62],
          [1.06, 0.08],
          [1.0, 0.7],
        ],
        7,
      ),
      { fill: hair, c: dark, w: 5 },
    );
  } else if (style === 2) {
    push(
      smooth(
        [
          [-1.0, -0.12],
          [-0.86, -0.92],
          [-0.18, -1.22],
          [0.5, -1.06],
          [0.96, -0.62],
          [1.06, 0.12],
          [0.98, 0.86],
        ],
        7,
      ),
      { fill: hair, c: dark, w: 5 },
    );
    push(
      smooth(
        [
          [0.86, -0.72],
          [1.26, -0.42],
          [1.3, 0.22],
          [1.06, 0.7],
          [0.92, 0.86],
        ],
        6,
      ),
      { fill: hair, c: dark, w: 4.6 },
    );
  } else {
    push(
      smooth(
        [
          [-1.02, -0.06],
          [-0.86, -0.94],
          [-0.2, -1.24],
          [0.52, -1.06],
          [0.98, -0.62],
          [1.04, 0.22],
        ],
        7,
      ),
      { fill: hair, c: dark, w: 5 },
    );
    push(A(-0.62, -1.08, 0.32, 0.32, 0, Math.PI * 2, 24), {
      fill: hair,
      c: dark,
      w: 4.6,
    });
    push(A(0.68, -1.06, 0.3, 0.3, 0, Math.PI * 2, 24), {
      fill: hair,
      c: dark,
      w: 4.6,
    });
    push(
      smooth(
        [
          [-0.9, -1.02],
          [-0.62, -1.28],
          [-0.34, -1.02],
        ],
        5,
      ),
      { c: dark, w: 3 },
    );
    push(
      smooth(
        [
          [0.42, -1.0],
          [0.7, -1.26],
          [0.96, -1.0],
        ],
        5,
      ),
      { c: dark, w: 3 },
    );
  }

  /* than / ao */
  push(
    smooth(
      [
        [-1.42, 1.5],
        [-1.24, 0.92],
        [-0.84, 0.66],
        [-0.36, 0.54],
        [0, 0.5],
        [0.36, 0.54],
        [0.84, 0.66],
        [1.24, 0.92],
        [1.42, 1.5],
      ],
      8,
    ),
    { fill: shirt, c: dark, w: 5.4 },
  );
  push(
    smooth(
      [
        [-0.62, 0.72],
        [-0.34, 0.56],
        [0, 0.98],
        [0.34, 0.56],
        [0.62, 0.72],
        [0.34, 1.2],
        [0, 1.3],
        [-0.34, 1.2],
        [-0.62, 0.72],
      ],
      7,
    ),
    {
      fill: "rgba(255,255,255,.16)",
      c: "rgba(60,36,20,.35)",
      w: 3,
    },
  );

  /* co */
  push(
    smooth(
      [
        [-0.22, 0.16],
        [-0.25, 0.42],
        [-0.28, 0.7],
        [-0.16, 0.8],
        [0.16, 0.8],
        [0.28, 0.7],
        [0.25, 0.42],
        [0.22, 0.16],
      ],
      6,
    ),
    { fill: skin, c: dark, w: 4.6 },
  );
  push(
    smooth(
      [
        [-0.22, 0.28],
        [0, 0.52],
        [0.22, 0.28],
        [0.22, 0.46],
        [0, 0.62],
        [-0.22, 0.46],
      ],
      6,
    ),
    {
      fill: "rgba(120,70,45,.22)",
      c: "rgba(120,70,45,0)",
      w: 1.2,
    },
  );

  /* tai */
  push(A(-0.63, -0.02, 0.115, 0.16, 0, Math.PI * 2, 18), {
    fill: skin,
    c: dark,
    w: 4.2,
  });
  push(A(0.63, -0.02, 0.115, 0.16, 0, Math.PI * 2, 18), {
    fill: skin,
    c: dark,
    w: 4.2,
  });

  /* dau */
  push(
    smooth(
      [
        [-0.6, -0.3],
        [-0.63, -0.62],
        [-0.4, -0.9],
        [0, -1.0],
        [0.4, -0.9],
        [0.63, -0.62],
        [0.6, -0.3],
        [0.52, 0.1],
        [0.32, 0.44],
        [0, 0.58],
        [-0.32, 0.44],
        [-0.52, 0.1],
        [-0.6, -0.3],
      ],
      7,
    ),
    { fill: skin, c: dark, w: 5.2 },
  );

  /* toc mai */
  const bang = Math.floor(rnd() * 3);
  if (bang === 0) {
    push(
      smooth(
        [
          [-0.72, -0.32],
          [-0.56, -0.86],
          [-0.12, -1.06],
          [0.36, -1.0],
          [0.7, -0.58],
          [0.74, -0.28],
          [0.42, -0.58],
          [0.04, -0.72],
          [-0.32, -0.62],
          [-0.56, -0.34],
          [-0.72, -0.32],
        ],
        6,
      ),
      { fill: hair, c: dark, w: 4.4 },
    );
  } else if (bang === 1) {
    push(
      smooth(
        [
          [-0.74, -0.26],
          [-0.62, -0.82],
          [-0.16, -1.08],
          [0.28, -1.02],
          [0.56, -0.82],
          [0.66, -0.5],
          [0.3, -0.7],
          [-0.1, -0.8],
          [-0.44, -0.6],
          [-0.62, -0.28],
          [-0.74, -0.26],
        ],
        6,
      ),
      { fill: hair, c: dark, w: 4.4 },
    );
  } else {
    push(
      smooth(
        [
          [-0.76, -0.22],
          [-0.5, -0.94],
          [0.06, -1.1],
          [0.56, -0.88],
          [0.78, -0.46],
          [0.8, -0.18],
          [0.5, -0.5],
          [0.1, -0.66],
          [-0.3, -0.56],
          [-0.56, -0.24],
          [-0.76, -0.22],
        ],
        6,
      ),
      { fill: hair, c: dark, w: 4.4 },
    );
  }

  /* long may */
  push(
    smooth(
      [
        [-0.46, -0.42],
        [-0.28, -0.5],
        [-0.07, -0.43],
      ],
      5,
    ),
    { c: hair, w: 8.4 },
  );
  push(
    smooth(
      [
        [0.07, -0.43],
        [0.28, -0.5],
        [0.46, -0.42],
      ],
      5,
    ),
    { c: hair, w: 8.4 },
  );

  /* mat */
  function eye(sx) {
    push(
      smooth(
        [
          [sx * 0.375, -0.175],
          [sx * 0.21, -0.262],
          [sx * 0.05, -0.175],
          [sx * 0.21, -0.075],
          [sx * 0.375, -0.175],
        ],
        6,
      ),
      { fill: "#fffaf2", c: dark, w: 3.6 },
    );
    push(A(sx * 0.205, -0.168, 0.105, 0.112, 0, Math.PI * 2, 22), {
      fill: iris,
      c: dark,
      w: 2.4,
    });
    push(A(sx * 0.205, -0.168, 0.05, 0.052, 0, Math.PI * 2, 14), {
      fill: "#1a1109",
      c: "#1a1109",
      w: 1.6,
    });
    push(A(sx * 0.168, -0.212, 0.034, 0.034, 0, Math.PI * 2, 10), {
      fill: "#ffffff",
      c: "#ffffff",
      w: 1,
    });
    push(A(sx * 0.245, -0.128, 0.02, 0.02, 0, Math.PI * 2, 8), {
      fill: "rgba(255,255,255,.6)",
      c: "rgba(255,255,255,0)",
      w: 1,
    });
    push(
      smooth(
        [
          [sx * 0.392, -0.192],
          [sx * 0.21, -0.282],
          [sx * 0.036, -0.178],
        ],
        5,
      ),
      { c: dark, w: 6.6 },
    );
    push(
      smooth(
        [
          [sx * 0.34, -0.062],
          [sx * 0.2, -0.038],
          [sx * 0.09, -0.066],
        ],
        5,
      ),
      { c: "rgba(70,42,26,.55)", w: 3 },
    );
  }
  eye(-1);
  eye(1);

  /* mui */
  push(
    smooth(
      [
        [-0.02, -0.02],
        [0.075, 0.11],
        [-0.055, 0.165],
      ],
      4,
    ),
    { c: "rgba(120,70,45,.42)", w: 5.4 },
  );
  push(A(-0.062, 0.172, 0.03, 0.019, 0, Math.PI * 2, 10), {
    fill: "rgba(120,70,45,.4)",
    c: "rgba(120,70,45,.25)",
    w: 1.4,
  });
  push(A(0.066, 0.172, 0.03, 0.019, 0, Math.PI * 2, 10), {
    fill: "rgba(120,70,45,.4)",
    c: "rgba(120,70,45,.25)",
    w: 1.4,
  });

  /* moi */
  push(
    smooth(
      [
        [-0.2, 0.315],
        [-0.09, 0.272],
        [0, 0.302],
        [0.09, 0.272],
        [0.2, 0.315],
        [0, 0.358],
        [-0.2, 0.315],
      ],
      6,
    ),
    { fill: lip, c: "rgba(80,36,28,.85)", w: 2.6 },
  );
  push(
    smooth(
      [
        [-0.175, 0.338],
        [0, 0.452],
        [0.175, 0.338],
        [0, 0.362],
        [-0.175, 0.338],
      ],
      6,
    ),
    { fill: lip, c: "rgba(80,36,28,.85)", w: 2.6 },
  );
  push(
    smooth(
      [
        [-0.1, 0.372],
        [0, 0.398],
        [0.1, 0.372],
      ],
      5,
    ),
    { c: "rgba(255,255,255,.32)", w: 4 },
  );

  /* ma & khoi sang toi */
  push(A(-0.42, 0.12, 0.165, 0.105, 0, Math.PI * 2, 18), {
    fill: "rgba(226,110,90,.24)",
    c: "rgba(226,110,90,.12)",
    w: 1.4,
  });
  push(A(0.42, 0.12, 0.165, 0.105, 0, Math.PI * 2, 18), {
    fill: "rgba(226,110,90,.24)",
    c: "rgba(226,110,90,.12)",
    w: 1.4,
  });
  push(
    smooth(
      [
        [-0.62, -0.28],
        [-0.54, 0.06],
        [-0.36, 0.38],
        [-0.16, 0.52],
        [-0.3, 0.3],
        [-0.46, 0.02],
        [-0.54, -0.3],
      ],
      6,
    ),
    {
      fill: "rgba(120,70,45,.16)",
      c: "rgba(120,70,45,0)",
      w: 1,
    },
  );
  push(
    smooth(
      [
        [0.12, -0.68],
        [0.36, -0.46],
        [0.42, -0.12],
        [0.22, -0.22],
        [0.12, -0.46],
      ],
      6,
    ),
    {
      fill: "rgba(255,255,255,.2)",
      c: "rgba(255,255,255,0)",
      w: 1,
    },
  );

  /* phu kien */
  const acc = Math.floor(rnd() * 5);
  if (acc === 0) {
    push(A(-0.225, -0.165, 0.245, 0.215, 0, Math.PI * 2, 24), {
      fill: "rgba(255,255,255,.12)",
      c: dark,
      w: 4.8,
    });
    push(A(0.225, -0.165, 0.245, 0.215, 0, Math.PI * 2, 24), {
      fill: "rgba(255,255,255,.12)",
      c: dark,
      w: 4.8,
    });
    push(
      smooth(
        [
          [-0.04, -0.175],
          [0, -0.2],
          [0.04, -0.175],
        ],
        4,
      ),
      { c: dark, w: 4.8 },
    );
    push(
      smooth(
        [
          [-0.47, -0.22],
          [-0.66, -0.16],
        ],
        3,
      ),
      { c: dark, w: 4.8 },
    );
    push(
      smooth(
        [
          [0.47, -0.22],
          [0.66, -0.16],
        ],
        3,
      ),
      { c: dark, w: 4.8 },
    );
  } else if (acc === 1) {
    push(
      smooth(
        [
          [-0.86, -0.3],
          [-0.72, -0.86],
          [-0.28, -1.16],
          [0.28, -1.16],
          [0.72, -0.86],
          [0.86, -0.3],
        ],
        7,
      ),
      { fill: shirt, c: dark, w: 5 },
    );
    push(
      smooth(
        [
          [-1.02, -0.24],
          [-0.5, -0.4],
          [0.12, -0.4],
          [0.96, -0.2],
          [0.96, -0.02],
          [0.1, -0.22],
          [-0.5, -0.22],
          [-1.02, -0.06],
        ],
        7,
      ),
      { fill: shirt, c: dark, w: 4.6 },
    );
  } else if (acc === 2) {
    push(
      smooth(
        [
          [-0.86, -0.3],
          [-0.78, -0.72],
          [-0.5, -0.96],
          [-0.12, -1.06],
          [0.28, -1.0],
          [0.62, -0.82],
          [0.8, -0.5],
          [0.88, -0.24],
        ],
        7,
      ),
      { c: dark, w: 9, fill: "rgba(40,26,18,0)" },
    );
    push(A(-0.7, -0.16, 0.19, 0.24, 0, Math.PI * 2, 22), {
      fill: "#2c2c34",
      c: dark,
      w: 5,
    });
    push(A(0.7, -0.16, 0.19, 0.24, 0, Math.PI * 2, 22), {
      fill: "#2c2c34",
      c: dark,
      w: 5,
    });
    push(A(-0.7, -0.16, 0.11, 0.14, 0, Math.PI * 2, 16), {
      fill: theme.ring,
      c: theme.ring,
      w: 2.4,
    });
    push(A(0.7, -0.16, 0.11, 0.14, 0, Math.PI * 2, 16), {
      fill: theme.ring,
      c: theme.ring,
      w: 2.4,
    });
  } else if (acc === 3) {
    for (let i = 0; i < 3; i++) {
      const fx = -0.52 + i * 0.52,
        fy = -0.86 + Math.abs(i - 1) * 0.12;
      push(A(fx, fy, 0.115, 0.115, 0, Math.PI * 2, 14), {
        fill: theme.ring,
        c: dark,
        w: 3,
      });
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        push(
          A(
            fx + Math.cos(a) * 0.17,
            fy + Math.sin(a) * 0.17,
            0.085,
            0.085,
            0,
            Math.PI * 2,
            12,
          ),
          { fill: "#fff2f6", c: dark, w: 2.4 },
        );
      }
    }
  } else {
    push(A(-0.66, 0.12, 0.062, 0.062, 0, Math.PI * 2, 12), {
      fill: theme.ring,
      c: dark,
      w: 2.6,
    });
    push(A(0.66, 0.12, 0.062, 0.062, 0, Math.PI * 2, 12), {
      fill: theme.ring,
      c: dark,
      w: 2.6,
    });
    push(A(-0.66, 0.22, 0.036, 0.036, 0, Math.PI * 2, 10), {
      fill: theme.ring,
      c: dark,
      w: 2,
    });
    push(A(0.66, 0.22, 0.036, 0.036, 0, Math.PI * 2, 10), {
      fill: theme.ring,
      c: dark,
      w: 2,
    });
  }

  /* het vung clip */
  S[S.length - 1].restore = true;

  /* vien tron TikTok */
  pushAbs(arcPts(cx, cy, R * 1.055, R * 1.055, 0, Math.PI * 2, 84), {
    c: theme.ring,
    w: 8.5,
  });
  pushAbs(arcPts(cx, cy, R * 1.125, R * 1.125, 0, Math.PI * 2, 84), {
    c: "rgba(70,45,25,.22)",
    w: 3.2,
  });

  /* khung the + ten */
  pushAbs(
    roundRectPts(
      cx - cardW / 2,
      cy - cardH / 2,
      cardW,
      cardH,
      Math.min(cardW, cardH) * 0.062,
    ),
    { c: "rgba(78,52,32,.22)", w: 3.6 },
  );

  const name = NAMES[Math.floor(rnd() * NAMES.length)];
  const uy = nameDy + nameSize * 0.85;
  S.push({
    pts: [[cx, cy + nameDy + 5]],
    color: "rgba(50,30,18,.32)",
    w: 2,
    text: "♡  " + name + "  ♡",
    size: nameSize,
  });
  S.push({
    pts: [[cx, cy + nameDy]],
    color: theme.ring,
    w: 2,
    text: "♡  " + name + "  ♡",
    size: nameSize,
    cost: 44,
  });
  pushAbs(
    smooth(
      [
        [cx - 0.42 * R, cy + uy],
        [cx, cy + uy + 0.05 * R],
        [cx + 0.42 * R, cy + uy],
      ],
      5,
    ),
    { c: "rgba(78,52,32,.3)", w: 3 },
  );

  return S;
}

/* hoa trieng cho trang "1 anh lon" */
function fullDecor(S, theme) {
  const accent = theme.ring;
  function add(pts, o) {
    o = o || {};
    S.push({
      pts: pts,
      color: o.c || accent,
      w: o.w || 4,
      fill: o.fill,
      text: o.text,
      size: o.size,
      cost: o.cost,
      strokeIt: o.strokeIt,
    });
  }
  [128, CW - 128].forEach(function (x) {
    for (let i = 0; i < 6; i++) {
      const y = 168 + i * 138;
      add(arcPts(x, y, 24, 24, 0, Math.PI * 2, 20), {
        c: accent,
        w: 3.2,
        fill: "rgba(255,255,255,.10)",
      });
      add(arcPts(x, y, 8, 8, 0, Math.PI * 2, 10), {
        c: accent,
        w: 2.4,
        fill: accent,
      });
      if (i < 5)
        add(
          [
            [x, y + 42],
            [x, y + 96],
          ],
          { c: "rgba(120,84,52,.35)", w: 2.6 },
        );
    }
  });
  for (let i = 0; i < 8; i++) {
    const x = 300 + i * 132;
    add(
      [
        [x, 62],
        [x + 20, 84],
        [x, 106],
        [x - 20, 84],
        [x, 62],
      ],
      { c: accent, w: 2.8, fill: "rgba(255,255,255,.12)" },
    );
    add(
      [
        [x, CH - 62],
        [x + 20, CH - 84],
        [x, CH - 106],
        [x - 20, CH - 84],
        [x, CH - 62],
      ],
      { c: accent, w: 2.8, fill: "rgba(255,255,255,.12)" },
    );
  }
  add(roundRectPts(16, 16, CW - 32, CH - 32, 26), {
    c: "rgba(110,74,44,.42)",
    w: 5,
  });
}

/* ==================== KHO GIAY ==================== */
const PAPER_W = 9.0,
  PAPER_H = 6.0,
  CW = 2048,
  CH = 1365;

/* lop phat sang tren giay (muc moi ve se sang roi lanh dan) */
const GW = 512,
  GH = 342;
const glowC = document.createElement("canvas");
glowC.width = GW;
glowC.height = GH;
const glowCtx = glowC.getContext("2d");
const glowTex = new THREE.CanvasTexture(glowC);
glowTex.colorSpace = THREE.SRGBColorSpace;

function glowClear() {
  glowCtx.clearRect(0, 0, GW, GH);
  glowTex.needsUpdate = true;
}
function glowSeg(a, b, w, color) {
  const q = GW / CW;
  glowCtx.beginPath();
  glowCtx.moveTo(a[0] * q, a[1] * q);
  glowCtx.lineTo(b[0] * q, b[1] * q);
  glowCtx.strokeStyle = color || "rgba(255,196,132,.55)";
  glowCtx.lineWidth = Math.max(3, w * q * 2.4);
  glowCtx.lineCap = "round";
  glowCtx.stroke();
  glowTex.dirty = true;
}
function glowBurst(x, y, r) {
  const q = GW / CW;
  const gr = glowCtx.createRadialGradient(
    x * q,
    y * q,
    0,
    x * q,
    y * q,
    Math.max(6, r * q),
  );
  gr.addColorStop(0, "rgba(255,214,158,.85)");
  gr.addColorStop(1, "rgba(255,190,120,0)");
  glowCtx.fillStyle = gr;
  glowCtx.fillRect(x * q - r * q, y * q - r * q, r * q * 2, r * q * 2);
  glowTex.needsUpdate = true;
}
function glowFade() {
  glowCtx.globalCompositeOperation = "destination-out";
  glowCtx.fillStyle = "rgba(0,0,0,0.055)";
  glowCtx.fillRect(0, 0, GW, GH);
  glowCtx.globalCompositeOperation = "source-over";
  glowTex.needsUpdate = true;
}

class Sheet {
  constructor() {
    this.c = document.createElement("canvas");
    this.c.width = CW;
    this.c.height = CH;
    this.ctx = this.c.getContext("2d");
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(PAPER_W, PAPER_H, 1, 48);
    geo.rotateX(-Math.PI / 2);
    this.origZ = new Float32Array(geo.attributes.position.count);
    for (let i = 0; i < this.origZ.length; i++) {
      this.origZ[i] = geo.attributes.position.getZ(i);
    }
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: this.tex,
        roughness: 0.92,
        metalness: 0,
        transparent: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.receiveShadow = true;
    this.clipDepth = 0;
    this.mode = "grid";
    this.cardsCount = 6;
    this.baseY = Y_ACTIVE;
    this.offsetZ = 0;
    this.clear();
    this.setFeed(0);
  }
  setFeed(offsetZ) {
    this.offsetZ = offsetZ;
    const pos = this.mesh.geometry.attributes.position;
    const zEdge = 2.9; // Mep truoc cua ban in
    const R = 0.16;
    const maxArc = R * Math.PI * 0.5;
    for (let i = 0; i < pos.count; i++) {
      const curZ = this.origZ[i] + offsetZ;
      if (curZ <= zEdge) {
        pos.setZ(i, curZ);
        pos.setY(i, this.baseY);
      } else {
        const dz = curZ - zEdge;
        if (dz <= maxArc) {
          const a = dz / R;
          pos.setZ(i, zEdge + R * Math.sin(a));
          pos.setY(i, this.baseY - R * (1 - Math.cos(a)));
        } else {
          const hang = dz - maxArc;
          pos.setZ(i, zEdge + R);
          pos.setY(i, this.baseY - R - hang);
        }
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
  clear() {
    const g = this.ctx;
    while (this.clipDepth > 0) {
      g.restore();
      this.clipDepth--;
    }
    g.clearRect(0, 0, CW, CH);
    const theme = THEMES[state.theme] || THEMES[0];
    g.fillStyle = theme.paperBase || "#ebd8b3";
    g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 1800; i++) {
      const a = (Math.random() * 0.045 + 0.01).toFixed(3);
      g.fillStyle = i % 2 === 0 ? `rgba(130,95,55,${a})` : `rgba(80,55,30,${a})`;
      g.fillRect(Math.random() * CW, Math.random() * CH, 1.5, 1.5);
    }
    sheetDecor(g, THEMES[state.theme], this.mode);
    this.strokes = [];
    this.si = 0;
    this.seg = 0;
    this.segT = 0;
    this.lp = null;
    this.phase = "draw";
    this.stampT = 0;
    this.finished = false;
    this.slotDone = [false, false, false, false, false, false, false, false];
    this.tex.needsUpdate = true;
  }
}

function sheetDecor(g, theme, mode) {
  g.save();
  g.strokeStyle = theme.ring;
  g.lineWidth = 3.2;
  g.globalAlpha = 0.25;
  g.strokeRect(9, 9, CW - 18, CH - 18);
  g.globalAlpha = 1;
  g.restore();
}

function drawVipStamp(g, x, y) {
  g.save();
  g.translate(x, y);
  g.rotate((-15 * Math.PI) / 180);
  const w = 230,
    h = 105;
  g.strokeStyle = "#dc2626";
  g.lineWidth = 5;
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.lineWidth = 2;
  g.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
  g.fillStyle = "rgba(220, 38, 38, 0.09)";
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = "#dc2626";
  g.font = '700 15px "Space Grotesk",sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("★  ★  ★", 0, -h / 2 + 20);
  g.font = '900 44px "Archivo Black","Space Grotesk",sans-serif';
  g.fillText("V.I.P", 0, 3);
  g.font = '700 12px "Space Grotesk",sans-serif';
  g.fillText("LIMITED EDITION", 0, h / 2 - 18);
  g.fillStyle = "rgba(245, 238, 225, 0.85)";
  for (let k = 0; k < 16; k++) {
    const dx = Math.sin(k * 7.3) * (w / 2 - 8);
    const dy = Math.cos(k * 9.1) * (h / 2 - 8);
    g.fillRect(dx, dy, 2, 2);
  }
  g.restore();
}

function showVipNotice() {
  // Tat popup "Da dong dau VIP" theo yeu cau
}

// Vòng Nguyệt Quế Hoàng Gia bao quanh avatar VIP
function makeLaurelWreath(cx, cy, R, color) {
  const S = [];
  const wreathR = R * 1.15;
  const leafCount = 9;
  const gold = color || "#fbbf24";
  const darkGold = "#d97706";

  [-1, 1].forEach(function (side) {
    const startAng = Math.PI * 0.42;
    const endAng = -Math.PI * 0.38;
    const steps = 24;
    const branchPts = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = startAng + (endAng - startAng) * t;
      const r = wreathR + Math.sin(t * Math.PI) * (R * 0.06);
      branchPts.push([cx + side * Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }

    S.push({
      pts: branchPts,
      color: darkGold,
      w: 3.5,
      cost: 25,
    });

    for (let k = 1; k < leafCount; k++) {
      const t = k / leafCount;
      const ang = startAng + (endAng - startAng) * t;
      const rStem = wreathR + Math.sin(t * Math.PI) * (R * 0.06);
      const stemX = cx + side * Math.cos(ang) * rStem;
      const stemY = cy + Math.sin(ang) * rStem;

      const normX = side * Math.cos(ang);
      const normY = Math.sin(ang);
      const tanX = -normY * (side > 0 ? -1 : 1);
      const tanY = normX * (side > 0 ? -1 : 1);

      const leafLen = R * 0.22;
      const tipX = stemX + normX * leafLen * 0.7 + tanX * leafLen * 0.75;
      const tipY = stemY + normY * leafLen * 0.7 + tanY * leafLen * 0.75;

      const midX = (stemX + tipX) * 0.5 - tanY * (R * 0.06);
      const midY = (stemY + tipY) * 0.5 + tanX * (R * 0.06);

      S.push({
        pts: [
          [stemX, stemY],
          [midX, midY],
          [tipX, tipY],
          [stemX, stemY],
        ],
        fill: "rgba(251, 191, 36, 0.45)",
        color: gold,
        w: 2.2,
        strokeIt: true,
        cost: 18,
      });

      if (k % 2 === 1) {
        const inTipX = stemX - normX * leafLen * 0.25 + tanX * leafLen * 0.6;
        const inTipY = stemY - normY * leafLen * 0.25 + tanY * leafLen * 0.6;
        S.push({
          pts: [
            [stemX, stemY],
            [inTipX, inTipY],
          ],
          color: gold,
          w: 2,
          cost: 12,
        });
      }
    }
  });

  // Vương miện hoàng gia trên đỉnh avatar VIP
  const topY = cy - wreathR * 0.95;
  S.push({
    pts: [
      [cx - R * 0.22, topY],
      [cx - R * 0.26, topY - R * 0.16],
      [cx - R * 0.11, topY - R * 0.08],
      [cx, topY - R * 0.2],
      [cx + R * 0.11, topY - R * 0.08],
      [cx + R * 0.26, topY - R * 0.16],
      [cx + R * 0.22, topY],
      [cx - R * 0.22, topY],
    ],
    fill: "rgba(251, 191, 36, 0.85)",
    color: "#d97706",
    w: 2.8,
    strokeIt: true,
    cost: 35,
  });

  // Nơ ruy băng đỏ ở đáy vòng nguyệt quế
  const botY = cy + wreathR * 0.96;
  S.push({
    pts: [
      [cx, botY],
      [cx - R * 0.14, botY + R * 0.1],
      [cx - R * 0.09, botY + R * 0.18],
      [cx, botY + R * 0.06],
      [cx + R * 0.09, botY + R * 0.18],
      [cx + R * 0.14, botY + R * 0.1],
      [cx, botY],
    ],
    fill: "#dc2626",
    color: gold,
    w: 2.4,
    strokeIt: true,
    cost: 25,
  });

  return S;
}

function makeRealPhotoCard(cx, cy, R, person, theme, opt) {
  opt = opt || {};
  const S = [];
  const cardW = opt.cardW || 2.84 * R;
  const cardH = opt.cardH || 2.98 * R;
  const nameDy = typeof opt.nameDy === "number" ? opt.nameDy : 1.32 * R;
  const nameSize = opt.nameSize || R * 0.24;

  // Hết người trong hàng chờ -> không vẽ ô trống "CHỜ KHÁN GIẢ"
  if (!person) {
    return [];
  }

  const rawName = person.name || "Khán giả";
  const name = rawName.length > 18 ? rawName.slice(0, 16) + "…" : rawName;
  const maxTextW = cardW * 0.82;
  const photoUrl = person.photoUrl || "";

  // 1. Khung the nen
  S.push({
    pts: roundRectPts(
      cx - cardW / 2,
      cy - cardH / 2,
      cardW,
      cardH,
      Math.min(cardW, cardH) * 0.06,
    ),
    color: "rgba(100,70,40,.28)",
    w: 3.2,
    fill: theme.cardFill || "#f4e6cb",
    strokeIt: true,
  });

  // 2. Monogram fallback nen san neu anh chua kip load
  S.push({
    pts: [[cx, cy]],
    color: theme.ring,
    w: 2,
    monogram: true,
    initial: (name || "T").slice(0, 1).toUpperCase(),
    cx: cx,
    cy: cy,
    r: R,
    cost: 30,
  });

  // 3. Ten nguoi duoc dat tach biet ben duoi, ro rang khong bi che
  S.push({
    pts: [[cx, cy + nameDy + 2]],
    color: "rgba(50,30,18,.35)",
    w: 2,
    text: "♡  " + name + "  ♡",
    size: nameSize,
    maxW: maxTextW,
  });
  S.push({
    pts: [[cx, cy + nameDy]],
    color: theme.ring,
    w: 2,
    text: "♡  " + name + "  ♡",
    size: nameSize,
    maxW: maxTextW,
    cost: 28,
  });

  // 4. Vong tron vien TikTok bao quanh anh
  S.push({
    pts: arcPts(cx, cy, R * 1.05, R * 1.05, 0, Math.PI * 2, 72),
    color: theme.ring,
    w: 7.5,
  });

  // 4b. Vòng nguyệt quế hoàng gia dành riêng cho VIP
  if (person && person.isVip) {
    const wreathStrokes = makeLaurelWreath(cx, cy, R, "#fbbf24");
    S.push.apply(S, wreathStrokes);
  }

  // 5. CHAY DEN DAU RA HINH DEN DO voi anh thật
  if (photoUrl) {
    getOrLoadPhoto(photoUrl);
    const slices = R > 200 ? 48 : 28;
    const sh = (2 * R) / slices;

    for (let k = 0; k < slices; k++) {
      const yRel = -R + (k + 0.5) * sh;
      const halfW = Math.sqrt(Math.max(0, R * R - yRel * yRel));
      if (halfW < 2) continue;

      const destX = cx - halfW;
      const destY = cy + yRel - sh * 0.5;
      const destW = halfW * 2;
      const destH = sh + 1.2;

      const normSx = Math.max(0, (destX - (cx - R)) / (2 * R));
      const normSy = Math.max(0, (destY - (cy - R)) / (2 * R));
      const normSw = Math.min(1 - normSx, destW / (2 * R));
      const normSh = Math.min(1 - normSy, destH / (2 * R));

      const pStart =
        k % 2 === 0 ? [cx - halfW, cy + yRel] : [cx + halfW, cy + yRel];
      const pEnd =
        k % 2 === 0 ? [cx + halfW, cy + yRel] : [cx - halfW, cy + yRel];

      S.push({
        pts: [pStart, pEnd],
        color: "rgba(0,0,0,0)",
        w: 1,
        photoSlice: true,
        isFinalSlice: k === slices - 1,
        cx: cx,
        cy: cy,
        r: R,
        destX: destX,
        destY: destY,
        destW: destW,
        destH: destH,
        normSx: normSx,
        normSy: normSy,
        normSw: normSw,
        normSh: normSh,
        photoUrl: photoUrl,
      });
    }
  }

  return S;
}

function hasVipInQueue() {
  return userQueue.some(function (u) {
    return !!u.isVip;
  });
}

function popFromQueue(isVip) {
  if (userQueue.length === 0) {
    return null; // Khong dung mock - tra ve null khi khong co ai
  }
  if (isVip) {
    const vIdx = userQueue.findIndex(function (u) {
      return !!u.isVip;
    });
    if (vIdx !== -1) return userQueue.splice(vIdx, 1)[0];
    return null; // Không lấy người thường để in 1 ảnh VIP lớn
  }
  return userQueue.shift();
}

function buildBatch(sheet, batch) {
  const theme = THEMES[state.theme];
  sheet.strokes = [];
  sheet.batch = batch;

  // Nếu sheet được gán mode full nhưng hàng chờ không có VIP thì chuyển về in lưới thường
  if (sheet.mode === "full" && !hasVipInQueue()) {
    sheet.mode = "grid";
  }

  if (sheet.mode === "full") {
    const R = CH * 0.33; // Avatar nho hon mot chut de can doi va co cho de ten
    const cx = CW / 2,
      cy = CH * 0.53;
    const person = popFromQueue(true);
    if (!person) {
      sheet.strokes = [];
      sheet.finished = true;
      sheet.dirty = true;
      return;
    }
    const st = makeRealPhotoCard(cx, cy, R, person, theme, {
      cardW: CW * 0.94,
      cardH: CH * 0.91,
      nameDy: -1.26 * R, // Ten dat o tren avatar
      nameSize: R * 0.22,
    });
    fullDecor(st, theme);
    const stampX = CW - 240,
      stampY = 195;
    st.push({
      pts: [[stampX, stampY]],
      cost: 90,
      vipStamp: true,
      stampX: stampX,
      stampY: stampY,
      color: "#dc2626",
    });
    if (st.length > 0) {
      st[0].firstOfSlot = true;
    }
    st.forEach(function (s) {
      s.slot = 0;
      if (person && person.id) {
        s.userId = person.id;
        s.person = person;
      }
    });
    st[st.length - 1].lastOfSlot = true;
    sheet.strokes.push.apply(sheet.strokes, st);
  } else {
    const count = sheet.cardsCount || state.cardsPerSheet || 6;
    const cols = count === 4 ? 2 : count === 8 ? 4 : 3;
    const rows = 2;
    const cw = CW / cols,
      ch = CH / rows;
    // Thu nho R vua van va nang tam cy len de ten khong bi che
    const R = Math.min(cw * 0.28, ch * 0.28);
    const cardW = cw * 0.93;
    const cardH = ch * 0.91;
    let printedInThisSheet = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const person = popFromQueue(false);
        if (!person) {
          // Hết người trong hàng chờ -> dừng mẻ ngay tại đây, không in ô chờ khán giả
          break;
        }
        printedInThisSheet++;
        const cx = cw * (c + 0.5),
          cy = ch * (r + 0.42);
        const st = makeRealPhotoCard(cx, cy, R, person, theme, {
          cardW: cardW,
          cardH: cardH,
          nameDy: 1.34 * R,
          nameSize: R * 0.25,
        });
        if (st.length > 0) {
          st[0].firstOfSlot = true;
        }
        st.forEach(function (s) {
          s.slot = i;
          s.cx = cx;
          s.cy = cy;
          s.r = R;
          if (person && person.id) {
            s.userId = person.id;
            s.person = person;
          }
          if (person && person.photoUrl) s.photoUrl = person.photoUrl;
        });
        st[st.length - 1].lastOfSlot = true;
        sheet.strokes.push.apply(sheet.strokes, st);
      }
      if (userQueue.length === 0) {
        break;
      }
    }

    // Nếu hàng chờ hoàn toàn rỗng -> kết thúc mẻ và dừng máy in tại chỗ
    if (printedInThisSheet === 0) {
      sheet.strokes = [];
      sheet.finished = true;
      sheet.dirty = true;
      return;
    }

    sheet.strokes.push({
      pts: [[CW / 2, 42]],
      color: theme.ring,
      w: 2,
      text:
        "PRINT BOOTH  ·  " + theme.name.toUpperCase() + "  ·  SHEET " + count,
      size: 26,
      cost: 60,
    });
    sheet.strokes.push({
      pts: [[CW / 2, CH - 34]],
      color: "rgba(110,74,44,.6)",
      w: 2,
      text: "#" + String(batch).padStart(2, "0") + "  ·  TIKTOK REAL PORTRAIT",
      size: 22,
      cost: 50,
    });
  }

  sheet.si = 0;
  sheet.seg = 0;
  sheet.segT = 0;
  sheet.phase = "travel";
  sheet.stampT = 0;
  sheet.lp = [CW * 0.5, 34];
  sheet.finished = false;
  sheet.slotDone = [false, false, false, false, false, false, false, false];
  sheet.dirty = true;
}

/* ==================== BUT VE (muc ra dung noi but di) ==================== */
const TRAVEL_MULT = 2.6;

function seg(sheet, s, a, b) {
  const g = sheet.ctx;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.strokeStyle = s.color;
  g.lineWidth = s.w;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke();
  glowSeg(a, b, s.w);
  sheet.dirty = true;
}

function finalize(sheet, s) {
  const g = sheet.ctx;
  if (s.fill || s.grad) {
    const p = s.pts;
    g.beginPath();
    g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
    g.closePath();
    if (s.grad) {
      const gr = g.createLinearGradient(
        s.grad.x0,
        s.grad.y0,
        s.grad.x1,
        s.grad.y1,
      );
      s.grad.stops.forEach(function (kv) {
        gr.addColorStop(parseFloat(kv[0]), kv[1]);
      });
      g.fillStyle = gr;
    } else {
      g.fillStyle = s.fill;
    }
    g.fill();
    if (s.strokeIt !== false) {
      g.strokeStyle = s.color;
      g.lineWidth = s.w;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.stroke();
    }
  }
  if (s.text !== undefined) {
    g.font = "700 " + s.size + 'px "Space Grotesk","Segoe UI",sans-serif';
    g.fillStyle = s.color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (s.maxW) {
      g.fillText(s.text, s.pts[0][0], s.pts[0][1], s.maxW);
    } else {
      g.fillText(s.text, s.pts[0][0], s.pts[0][1]);
    }
    glowBurst(s.pts[0][0], s.pts[0][1], s.size * 1.4);
  }
  if (s.vipStamp) {
    drawVipStamp(sheet.ctx, s.stampX, s.stampY);
    glowBurst(s.stampX, s.stampY, 140);
    showVipNotice();
  }
  if (s.monogram) {
    const g = sheet.ctx;
    g.save();
    g.beginPath();
    g.arc(s.cx, s.cy, s.r * 0.98, 0, Math.PI * 2);
    g.fillStyle = "rgba(45, 30, 20, 0.08)";
    g.fill();
    g.fillStyle = s.color || "#e2412c";
    g.font = "900 " + Math.floor(s.r * 0.72) + 'px "Space Grotesk", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(s.initial || "★", s.cx, s.cy);
    g.restore();
    sheet.dirty = true;
  }
  if (s.photoSlice) {
    const g = sheet.ctx;
    const img = getOrLoadPhoto(s.photoUrl);
    if (img && img.complete && img.naturalWidth > 0) {
      const photoSrc = getEnhancedPhotoCanvas(img, s.r * 2) || img;
      g.save();
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.beginPath();
      g.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      g.clip();

      const nw = photoSrc.width || photoSrc.naturalWidth;
      const nh = photoSrc.height || photoSrc.naturalHeight;
      const sx = Math.max(0, (s.normSx !== undefined ? s.normSx : (s.srcX / 256)) * nw);
      const sy = Math.max(0, (s.normSy !== undefined ? s.normSy : (s.srcY / 256)) * nh);
      const sw = Math.min(nw - sx, (s.normSw !== undefined ? s.normSw : (s.destW / (2 * s.r))) * nw);
      const sh = Math.min(nh - sy, (s.normSh !== undefined ? s.normSh : (s.destH / (2 * s.r))) * nh);

      if (sw > 0 && sh > 0) {
        g.drawImage(
          photoSrc,
          sx,
          sy,
          sw,
          sh,
          s.destX,
          s.destY,
          s.destW,
          s.destH,
        );
      }
      if (s.isFinalSlice) {
        const minDim = Math.min(nw, nh);
        const cropX = (nw - minDim) / 2;
        const cropY = (nh - minDim) / 2;
        g.drawImage(
          photoSrc,
          cropX,
          cropY,
          minDim,
          minDim,
          s.cx - s.r,
          s.cy - s.r,
          s.r * 2,
          s.r * 2,
        );
      }
      g.restore();
    }
    glowBurst(s.pts[1][0], s.pts[1][1], 16);
    sheet.dirty = true;
  }
  if (s.lastOfSlot && s.photoUrl) {
    const drawSlotPhoto = function (imgObj) {
      if (!imgObj || !imgObj.complete || imgObj.naturalWidth === 0 || s.cx === undefined) return;
      const photoSrc = getEnhancedPhotoCanvas(imgObj, s.r * 2) || imgObj;
      const g = sheet.ctx;
      g.save();
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.beginPath();
      g.arc(s.cx, s.cy, s.r * 0.98, 0, Math.PI * 2);
      g.clip();
      const nw = photoSrc.width || photoSrc.naturalWidth;
      const nh = photoSrc.height || photoSrc.naturalHeight;
      const minDim = Math.min(nw, nh);
      const cropX = (nw - minDim) / 2;
      const cropY = (nh - minDim) / 2;
      g.drawImage(photoSrc, cropX, cropY, minDim, minDim, s.cx - s.r, s.cy - s.r, s.r * 2, s.r * 2);
      g.restore();
      sheet.dirty = true;
    };

    const finalImg = getOrLoadPhoto(s.photoUrl, drawSlotPhoto);
    if (finalImg && finalImg.complete && finalImg.naturalWidth > 0) {
      drawSlotPhoto(finalImg);
    }
  }
  if (s.restore && sheet.clipDepth > 0) {
    g.restore();
    sheet.clipDepth--;
  }
  if (s.lastOfSlot && !sheet.slotDone[s.slot]) {
    sheet.slotDone[s.slot] = true;
    state.printed++;
    state.score +=
      sheet.mode === "full" ? 70 + state.batch * 4 : 10 + state.batch * 2;
    markSlot(s.slot);
    updateHUD();

    if (s.userId && typeof window.sendLiveSocket === "function") {
      window.sendLiveSocket({
        type: "USER_PRINTED",
        userId: s.userId,
      });
    }
  }
  sheet.dirty = true;
}

function nextStroke(sheet) {
  sheet.si++;
  sheet.seg = 0;
  sheet.segT = 0;
  sheet.stampT = 0;
  sheet.phase = sheet.si < sheet.strokes.length ? "travel" : "idle";
}

function advance(sheet, budget) {
  let pen = sheet.lp || [CW * 0.5, CH * 0.5];

  while (budget > 0 && sheet.si < sheet.strokes.length) {
    const s = sheet.strokes[sheet.si];

    if (!s.opened) {
      s.opened = true;
      if (s.firstOfSlot && s.person && typeof window.sendLiveSocket === "function") {
        window.sendLiveSocket({
          type: "USER_PRINTING",
          user: {
            id: s.person.id,
            name: s.person.name,
            photoUrl: s.person.photoUrl,
            isVip: !!s.person.isVip,
            comment: s.person.comment,
            source: s.person.source,
            giftName: s.person.giftName,
          },
        });
      }
      if (s.clipStart && s.clip) {
        sheet.ctx.save();
        sheet.ctx.beginPath();
        sheet.ctx.arc(s.clip.cx, s.clip.cy, s.clip.r, 0, Math.PI * 2);
        sheet.ctx.clip();
        sheet.clipDepth++;
      }
    }

    if (sheet.phase === "travel") {
      const from = sheet.lp,
        to = s.pts[0];
      const dx = to[0] - from[0],
        dy = to[1] - from[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.8) {
        sheet.lp = to;
        pen = to;
        sheet.phase = s.cost ? "stamp" : "draw";
        continue;
      }
      const dist = budget * TRAVEL_MULT;
      if (dist >= len) {
        sheet.lp = to;
        pen = to;
        budget -= len / TRAVEL_MULT;
        sheet.phase = s.cost ? "stamp" : "draw";
      } else {
        const t = dist / len;
        sheet.lp = [from[0] + dx * t, from[1] + dy * t];
        pen = sheet.lp;
        budget = 0;
      }
      continue;
    }

    if (sheet.phase === "stamp") {
      const need = s.cost || 30;
      const use = Math.min(budget, need);
      sheet.stampT += use;
      budget -= use;
      pen = s.pts[0];
      sheet.lp = s.pts[0];
      if (sheet.stampT >= need - 1e-6) {
        finalize(sheet, s);
        nextStroke(sheet);
      }
      continue;
    }

    if (sheet.seg >= s.pts.length - 1) {
      finalize(sheet, s);
      nextStroke(sheet);
      continue;
    }

    const a = s.pts[sheet.seg],
      b = s.pts[sheet.seg + 1];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1e-3;
    const remain = (1 - sheet.segT) * len;
    if (budget >= remain) {
      seg(sheet, s, sheet.lp, b);
      sheet.lp = b;
      budget -= remain;
      sheet.seg++;
      sheet.segT = 0;
      pen = b;
    } else {
      const t = sheet.segT + budget / len;
      const p = [a[0] + dx * t, a[1] + dy * t];
      seg(sheet, s, sheet.lp, p);
      sheet.lp = p;
      pen = p;
      sheet.segT = t;
      budget = 0;
    }
  }

  if (sheet.si >= sheet.strokes.length) sheet.finished = true;
  return pen;
}

/* ==================== THREE.JS ==================== */
const canvas = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#2b0b0a");
scene.fog = new THREE.Fog("#2b0b0a", 22, 72);

const camera = new THREE.PerspectiveCamera(
  42,
  innerWidth / innerHeight,
  0.1,
  60,
);
camera.position.set(0, 7.8, 11.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0.3);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomSpeed = 0.05;
controls.minDistance = 3.2;
controls.maxDistance = 22;
controls.maxPolarAngle = 1.47;
controls.enablePan = false;

const hemi = new THREE.HemisphereLight("#ff9f7a", "#3a1210", 0.62);
scene.add(hemi);
const key = new THREE.DirectionalLight("#ffd7ab", 2.4);
key.position.set(7.5, 13, 9);
	key.castShadow = true;
	key.shadow.mapSize.set(1024, 1024);
	key.shadow.camera.near = 1;
	key.shadow.camera.far = 32;
	key.shadow.camera.left = -7.5;
	key.shadow.camera.right = 7.5;
	key.shadow.camera.top = 7;
	key.shadow.camera.bottom = -7;
	key.shadow.bias = -0.0008;
scene.add(key);
const fillL = new THREE.DirectionalLight("#ff7a5c", 0.55);
fillL.position.set(-10, 7, -7);
scene.add(fillL);
const rim = new THREE.PointLight("#ff4a24", 70, 26, 2);
rim.position.set(0, 5.5, -8);
scene.add(rim);

function woodTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d");
  x.fillStyle = "#7c5334";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 22; i++) {
    const y = i * 23.3;
    x.fillStyle = i % 2 ? "#835a37" : "#6f4a2c";
    x.fillRect(0, y, 512, 23.3);
    x.strokeStyle = "rgba(38,22,10,.45)";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(512, y);
    x.stroke();
    for (let g = 0; g < 9; g++) {
      x.strokeStyle = "rgba(52,30,14," + (0.06 + Math.random() * 0.12) + ")";
      x.lineWidth = 1 + Math.random() * 2;
      x.beginPath();
      const gy = y + Math.random() * 23;
      x.moveTo(0, gy);
      for (let s = 0; s < 8; s++)
        x.lineTo(s * 64, gy + Math.sin(s * 1.2 + g) * 3.2);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let customBrand = {
  title: "PRINT BOOTH",
  subtitle: "in avatar tiktok theo mau",
};

function signTexture(theme) {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 320;
  const x = c.getContext("2d");
  x.fillStyle = "#1b1310";
  x.fillRect(0, 0, 1280, 320);
  const g = x.createLinearGradient(0, 0, 1280, 320);
  g.addColorStop(0, theme.accent + "55");
  g.addColorStop(1, "rgba(20,12,10,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 1280, 320);
  x.fillStyle = "#f3ead9";
  x.font = '900 110px "Archivo Black","Space Grotesk",sans-serif';
  x.textBaseline = "middle";
  x.fillText(customBrand.title || "PRINT BOOTH", 60, 138);
  x.fillStyle = theme.accent;
  x.fillRect(60, 214, 560, 68);
  x.fillStyle = "#fff";
  x.font = '600 36px "Space Grotesk",sans-serif';
  x.fillText(customBrand.subtitle || "in avatar tiktok theo mau", 84, 250);
  x.fillStyle = "rgba(243,234,217,.34)";
  x.font = '500 30px "Space Grotesk",sans-serif';
  x.fillText(theme.name.toUpperCase() + "  ·  SHEET " + state.cardsPerSheet + "  ·  LIVE", 760, 258);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function updateBrand(title, subtitle) {
  if (title) customBrand.title = title;
  if (subtitle) customBrand.subtitle = subtitle;
  const bt = el("brand-title");
  if (bt) bt.innerHTML = (customBrand.title || "PRINT BOOTH").replace(/BOOTH/i, "<em>BOOTH</em>");
  const bs = el("brand-sub");
  if (bs) bs.textContent = customBrand.subtitle || "in avatar tiktok theo mẫu";
  if (typeof sign !== "undefined" && sign && sign.material) {
    if (sign.material.map) sign.material.map.dispose();
    sign.material.map = signTexture(THEMES[state.theme]);
    sign.material.needsUpdate = true;
  }
}

/* ---- san + ban + khung ---- */
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 20),
  new THREE.MeshStandardMaterial({
    map: woodTexture(),
    roughness: 0.92,
    metalness: 0.03,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -4.68;
floor.receiveShadow = true;
scene.add(floor);

/* Ban dat may in */
const tableGroup = new THREE.Group();
scene.add(tableGroup);

const matTableTop = new THREE.MeshStandardMaterial({
  color: "#5a3d28",
  roughness: 0.8,
  metalness: 0.06,
});
const tableTop = new THREE.Mesh(
  new RoundedBoxGeometry(12.2, 0.38, 8.2, 4, 0.08),
  matTableTop,
);
tableTop.position.set(0, -0.81, 0.2);
tableTop.receiveShadow = true;
tableTop.castShadow = true;
tableGroup.add(tableTop);

const matTableLeg = new THREE.MeshStandardMaterial({
  color: "#1a1310",
  roughness: 0.6,
  metalness: 0.4,
});
const legGeo = new RoundedBoxGeometry(0.45, 3.82, 0.45, 3, 0.05);
const legX = 5.5,
  legZ = 3.5;
[
  [-legX, -legZ + 0.2],
  [legX, -legZ + 0.2],
  [-legX, legZ],
  [legX, legZ],
].forEach(function (pos) {
  const leg = new THREE.Mesh(legGeo, matTableLeg);
  leg.position.set(pos[0], -2.76, pos[1]);
  leg.castShadow = true;
  leg.receiveShadow = true;
  tableGroup.add(leg);
});
const braceGeo = new THREE.BoxGeometry(11.0, 0.14, 0.22);
const brace1 = new THREE.Mesh(braceGeo, matTableLeg);
brace1.position.set(0, -3.8, -legZ + 0.2);
tableGroup.add(brace1);
const brace2 = brace1.clone();
brace2.position.z = legZ;
tableGroup.add(brace2);

/* Khay hung giay roi duoi mep truoc ban */
const tray = new THREE.Mesh(
  new RoundedBoxGeometry(6.6, 0.12, 4.4, 3, 0.04),
  new THREE.MeshStandardMaterial({
    color: "#32231a",
    roughness: 0.75,
    metalness: 0.2,
  }),
);
tray.position.set(0, -3.95, 3.7);
tray.rotation.x = 0.16;
tray.receiveShadow = true;
tableGroup.add(tray);

const machine = new THREE.Group();
scene.add(machine);
const matMetal = new THREE.MeshStandardMaterial({
  color: "#c2c7ce",
  metalness: 0.93,
  roughness: 0.27,
});
const matDark = new THREE.MeshStandardMaterial({
  color: "#2b2320",
  metalness: 0.38,
  roughness: 0.6,
});
const matAccent = new THREE.MeshStandardMaterial({
  color: "#d94430",
  metalness: 0.28,
  roughness: 0.46,
});
const matCream = new THREE.MeshStandardMaterial({
  color: "#e6d9c1",
  roughness: 0.86,
  metalness: 0.05,
});

const bed = new THREE.Mesh(
  new RoundedBoxGeometry(11.4, 0.62, 7.6, 4, 0.12),
  new THREE.MeshStandardMaterial({
    color: "#3b2c22",
    roughness: 0.72,
    metalness: 0.12,
  }),
);
bed.position.y = -0.31;
bed.receiveShadow = true;
bed.castShadow = true;
machine.add(bed);

const plate = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.07, 6.5), matCream);
plate.position.y = -0.025;
plate.receiveShadow = true;
machine.add(plate);

/* ---- Ray bien thap va gia do (CNC Plotter low profile) ---- */
const railGeo = new THREE.CylinderGeometry(0.075, 0.075, 7.8, 24);
const bracketGeo = new RoundedBoxGeometry(0.3, 0.38, 0.5, 3, 0.06);

[-5.15, 5.15].forEach(function (rx) {
  const rail = new THREE.Mesh(railGeo, matMetal);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(rx, 0.34, 0);
  rail.castShadow = true;
  machine.add(rail);

  [-3.6, 3.6].forEach(function (bz) {
    const brk = new THREE.Mesh(bracketGeo, matDark);
    brk.position.set(rx, 0.16, bz);
    brk.castShadow = true;
    machine.add(brk);
  });
});

/* ---- Cong truot Z thap ---- */
const gantry = new THREE.Group();
gantry.position.set(0, 0.34, 0);
machine.add(gantry);

/* 2 khoi con truot (CNC bearing slider blocks) hai ben ray */
const sliderBlockGeo = new RoundedBoxGeometry(0.42, 0.38, 0.76, 4, 0.08);
const sliderBushingGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 20);

[-5.15, 5.15].forEach(function (sx) {
  const sGrp = new THREE.Group();
  sGrp.position.set(sx, 0, 0);
  const sBlock = new THREE.Mesh(sliderBlockGeo, matDark);
  sBlock.castShadow = true;
  sGrp.add(sBlock);
  const sBush = new THREE.Mesh(sliderBushingGeo, matMetal);
  sBush.rotation.x = Math.PI / 2;
  sGrp.add(sBush);
  gantry.add(sGrp);
});

/* Thanh ray ngang X don duy nhat (single smooth rod) */
const bar = new THREE.Mesh(
  new THREE.CylinderGeometry(0.082, 0.082, 10.6, 24),
  matMetal,
);
bar.rotation.z = Math.PI / 2;
bar.castShadow = true;
gantry.add(bar);

/* Carriage dau in gon dep, sat mat giay */
const carriage = new THREE.Group();
gantry.add(carriage);

const carBody = new THREE.Mesh(
  new RoundedBoxGeometry(0.88, 0.36, 0.58, 4, 0.08),
  new THREE.MeshStandardMaterial({
    color: "#a855f7",
    roughness: 0.82,
    metalness: 0.12,
  }),
);
carBody.position.y = 0.04;
carBody.castShadow = true;
carriage.add(carBody);

const carClamp = new THREE.Mesh(
  new THREE.BoxGeometry(0.64, 0.18, 0.62),
  matDark,
);
carClamp.position.y = -0.06;
carriage.add(carClamp);

const head = new THREE.Group();
head.position.y = 0;
carriage.add(head);

const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.09, 0.045, 0.22, 18),
  matMetal,
);
nozzle.position.y = -0.21;
head.add(nozzle);

const tip = new THREE.Mesh(
  new THREE.SphereGeometry(0.042, 14, 14),
  new THREE.MeshStandardMaterial({
    color: "#ffe0b4",
    emissive: "#ffab63",
    emissiveIntensity: 2.6,
  }),
);
tip.position.y = -0.318;
head.add(tip);

// Anh sang hoi tu CHU YEU O PHIA DUOI NGOI BUT (khong chieu vao noc hop)
const tipLight = new THREE.PointLight("#ffc98f", 5.5, 2.0, 2);
tipLight.position.set(0, -0.3, 0);
head.add(tipLight);

// Vong sang nhe tren mat giay tai vi tri dau in
const tipRing = new THREE.Mesh(
  new THREE.RingGeometry(0.18, 0.32, 32),
  new THREE.MeshBasicMaterial({
    color: "#ffbe86",
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);
tipRing.rotation.x = -Math.PI / 2;
scene.add(tipRing);

const glowMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(PAPER_W, PAPER_H),
  new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.95,
  }),
);
glowMesh.rotation.x = -Math.PI / 2;
glowMesh.renderOrder = 3;
scene.add(glowMesh);

const sign = new THREE.Mesh(
  new THREE.PlaneGeometry(10.4, 2.6),
  new THREE.MeshBasicMaterial({
    map: signTexture(THEMES[0]),
    toneMapped: false,
  }),
);
sign.position.set(0, 4.9, -5.6);
machine.add(sign);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(52, 22),
  new THREE.MeshStandardMaterial({
    color: "#241812",
    roughness: 0.96,
  }),
);
backWall.position.set(0, 9, -7.6);
machine.add(backWall);

const sidePanel = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, 4.2, 7.2),
  new THREE.MeshStandardMaterial({
    color: "#2d2119",
    roughness: 0.8,
    metalness: 0.18,
  }),
);
sidePanel.position.set(-6.2, 1.4, -0.2);
sidePanel.castShadow = true;
// Mac dinh an 2 vach ben theo yeu cau user
sidePanel.visible = false;
machine.add(sidePanel);
const sidePanel2 = sidePanel.clone();
sidePanel2.position.x = 6.2;
sidePanel2.visible = false;
machine.add(sidePanel2);

function toggleSidePanels() {
  const vis = !sidePanel.visible;
  sidePanel.visible = vis;
  sidePanel2.visible = vis;
  const btn = el("btn-panels");
  if (btn) btn.classList.toggle("on", vis);
  toastKey(vis ? "Vách 2 bên: <b>HIỆN</b>" : "Vách 2 bên: <b>ẨN</b>");
}

/* ---- giay ---- */
const Y_ACTIVE = 0.022,
  Y_QUEUED = 0.006;
const sheetA = new Sheet(),
  sheetB = new Sheet();
sheetA.baseY = Y_ACTIVE;
sheetB.baseY = Y_ACTIVE;
sheetA.setFeed(0);
sheetB.setFeed(0);
sheetB.mesh.visible = false;
scene.add(sheetA.mesh);
scene.add(sheetB.mesh);
let active = sheetA,
  queued = sheetB;

/* ==================== TIEN TRINH ==================== */
const flow = { active: false, t: 0, sheet: null };
const fly = {
  active: false,
  t: 0,
  dur: 1.15,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  fromTgt: new THREE.Vector3(),
  toTgt: new THREE.Vector3(),
};
const headTarget = new THREE.Vector3(0, 0, -1.2);
let flowDelay = 0,
  time = 0,
  decor = null;

const VIEWS = {
  total: { pos: [0, 8.1, 12.1], target: [0, 1.05, 0.3] },
  head: { pos: [0, 6.2, 6.8], target: [0, 0.25, 0.6] },
  top: { pos: [0, 9.8, 1.2], target: [0, 0, 0.2] },
  side: { pos: [-8.8, 4.4, 5.2], target: [-0.8, 1.0, 0] },
  front: { pos: [0, 3.8, 9.8], target: [0, 1.2, 0] },
};
function flyTo(name) {
  const v = VIEWS[name];
  if (!v) return;
  fly.fromPos.copy(camera.position);
  fly.toPos.set(v.pos[0], v.pos[1], v.pos[2]);
  fly.fromTgt.copy(controls.target);
  fly.toTgt.set(v.target[0], v.target[1], v.target[2]);
  fly.t = 0;
  fly.active = true;
}
controls.addEventListener("start", function () {
  fly.active = false;
});

/* ==================== HUD ==================== */
const el = function (id) {
  return document.getElementById(id);
};
const slotEls = Array.prototype.slice.call(
  document.querySelectorAll("#slots .slot"),
);
const slotsWrap = el("slots");
const fullSlot = el("fullslot");

function markSlot(i) {
  if (active && active.mode === "full") {
    fullSlot.classList.add("done", "pop");
    setTimeout(function () {
      fullSlot.classList.remove("pop");
    }, 380);
    return;
  }
  const s = slotEls[i];
  if (!s) return;
  s.classList.add("done", "pop");
  setTimeout(function () {
    s.classList.remove("pop");
  }, 380);
}

function updateHUD() {
  el("st-batch").textContent = "#" + String(state.batch).padStart(2, "0");
  el("st-printed").textContent = state.printed;
  el("st-score").textContent = state.score;
  const qEl = el("st-queue");
  if (qEl) qEl.textContent = userQueue.length + " người";
  const count =
    active && active.mode === "full"
      ? 1
      : active && active.cardsCount
        ? active.cardsCount
        : state.cardsPerSheet;
  const full = !!(active && active.mode === "full");
  el("st-mode").textContent = full ? "1 ẢNH LỚN VIP" : count + " ẢNH";
  slotsWrap.classList.toggle("hide", full);
  fullSlot.classList.toggle("show", full);
  if (full) {
    fullSlot.classList.toggle("done", !!active.slotDone[0]);
  } else {
    slotEls.forEach(function (s, i) {
      if (i < count) {
        s.style.display = "";
        s.classList.toggle("done", !!(active && active.slotDone[i]));
      } else {
        s.style.display = "none";
      }
    });
  }
}

/* ==================== CHU DE ==================== */
function disposeGroup(g) {
  g.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(function (m) {
        if (m.map && m.map !== SPRITE) m.map.dispose();
        m.dispose();
      });
    }
  });
}

function applyTheme(i) {
  const t = THEMES[i];
  state.theme = i;
  scene.background.set(t.bg);
  scene.fog.color.set(t.fog);
  hemi.color.set(t.hemiSky);
  hemi.groundColor.set(t.hemiGround);
  hemi.intensity = t.hemiI;
  key.color.set(t.keyColor);
  key.intensity = t.keyI;
  fillL.color.set(t.fillColor);
  rim.color.set(t.rim);
  rim.intensity = t.rimI;

  tipLight.color.set(t.headColor);

  tipRing.material.color.set(t.ring);
  floor.material.color.set(t.floorTint);
  plate.material.color.set(t.paperTint);
  matAccent.color.set(t.accent);

  if (sign.material.map) sign.material.map.dispose();
  sign.material.map = signTexture(t);
  sign.material.needsUpdate = true;

  if (decor) {
    scene.remove(decor.group);
    disposeGroup(decor.group);
  }
  decor = t.build();
  scene.add(decor.group);

  document.documentElement.style.setProperty("--accent", t.accent);

  active.clear();
  active.setFeed(0);
  queued.clear();
  queued.setFeed(-PAPER_H);

  buildBatch(active, state.batch);
  flow.active = false;
  flowDelay = 0;
  glowClear();
  updateHUD();
}

/* ==================== SU KIEN ==================== */
el("btn-play").addEventListener("click", function () {
  state.paused = !state.paused;
  el("btn-play").textContent = state.paused ? "Chơi tiếp" : "Tạm dừng";
  el("btn-play").classList.toggle("on", state.paused);
});
el("btn-turbo").addEventListener("click", function () {
  state.turbo = !state.turbo;
  el("btn-turbo").classList.toggle("on", state.turbo);
  el("btn-turbo").textContent = state.turbo ? "Turbo đang bật" : "Turbo ×3";
});
el("btn-rotate").addEventListener("click", function () {
  controls.autoRotate = !controls.autoRotate;
  controls.autoRotateSpeed = 0.55;
  el("btn-rotate").classList.toggle("on", controls.autoRotate);
});
function triggerVipNow(vipUser) {
  state.rare = true;
  const rBtn = el("btn-rare");
  if (rBtn) {
    rBtn.classList.add("on");
    rBtn.textContent = "Ảnh lớn hiếm";
  }
  if (vipUser && vipUser.name) {
    userQueue.unshift({
      id: vipUser.id || nextUserId++,
      name: vipUser.name,
      photoUrl: vipUser.photoUrl || "",
      isVip: true,
      priority: 999,
      addedAt: Date.now(),
    });
  }
  active.mode = "full";
  active.clear();
  active.setFeed(0);
  flow.active = false;
  flowDelay = 0;
  buildBatch(active, state.batch);
  glowClear();
  updateHUD();
  toastKey("👑 KÍCH HOẠT: <b>IN 1 ẢNH LỚN VIP NGAY LẬP TỨC</b>");
}

function setRareMode(enable) {
  state.rare = enable;
  const rBtn = el("btn-rare");
  if (rBtn) {
    rBtn.classList.toggle("on", state.rare);
    rBtn.textContent = state.rare ? "Ảnh lớn hiếm" : "In bình thường";
  }
  if (!flow.active) {
    active.mode = nextMode();
    active.clear();
    active.setFeed(0);
    buildBatch(active, state.batch);
    glowClear();
    updateHUD();
  }
  toastKey(
    state.rare
      ? "Chế độ: <b>ẢNH LỚN HIẾM (CÓ DẤU VIP)</b>"
      : "Chế độ: <b>IN LƯỚI " + state.cardsPerSheet + " ẢNH</b>",
  );
}

const rBtn = el("btn-rare");
if (rBtn) {
  rBtn.addEventListener("click", function () {
    setRareMode(!state.rare);
  });
}

document.querySelectorAll(".btn-layout").forEach(function (b) {
  b.addEventListener("click", function () {
    const count = parseInt(b.dataset.count, 10);
    setLayoutCount(count);
  });
});
const pBtn = el("btn-panels");
if (pBtn) pBtn.addEventListener("click", toggleSidePanels);
const addPBtn = el("btn-add-person");
if (addPBtn)
  addPBtn.addEventListener("click", function () {
    addUserToQueue(false);
  });
const addVBtn = el("btn-add-vip");
if (addVBtn)
  addVBtn.addEventListener("click", function () {
    addUserToQueue(true);
  });
el("btn-reset").addEventListener("click", resetGame);
el("speed").addEventListener("input", function (e) {
  state.speed = parseFloat(e.target.value);
  el("speed-val").textContent = state.speed.toFixed(1) + "×";
});

document.querySelectorAll(".views button").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll(".views button").forEach(function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    flyTo(b.dataset.view);
  });
});

document.querySelectorAll("#themes .theme").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll("#themes .theme").forEach(function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    applyTheme(parseInt(b.dataset.theme, 10));
  });
});

let toastTimer = null;
function toastKey(text) {
  const k = el("key-toast");
  if (!k) return;
  k.innerHTML = text;
  k.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    k.classList.remove("show");
  }, 1800);
}

function setLayoutCount(count) {
  if (state.cardsPerSheet === count) return;
  state.cardsPerSheet = count;
  document.querySelectorAll(".btn-layout").forEach(function (x) {
    x.classList.toggle("on", parseInt(x.dataset.count, 10) === count);
  });
  if (!flow.active) {
    active.mode = "grid";
    active.cardsCount = count;
    active.clear();
    active.setFeed(0);
    buildBatch(active, state.batch);
    glowClear();
    updateHUD();
  }
  toastKey("Kiểu in: <b>" + count + " ảnh / trang</b>");
}

function cycleTheme() {
  const next = (state.theme + 1) % THEMES.length;
  document.querySelectorAll("#themes .theme").forEach(function (x) {
    x.classList.remove("on");
  });
  const nextBtn = document.querySelector(
    '#themes .theme[data-theme="' + next + '"]',
  );
  if (nextBtn) nextBtn.classList.add("on");
  applyTheme(next);
  toastKey("Chủ đề: <b>" + THEMES[next].name + "</b>");
}

addEventListener("keydown", function (e) {
  // Ctrl + M / Cmd + M : Toggle Menu HUD
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
    e.preventDefault();
    const hud = document.querySelector(".hud");
    if (hud) {
      hud.classList.toggle("show");
      const isShow = hud.classList.contains("show");
      toastKey(
        isShow
          ? "Menu: <b>HIỆN</b> (Ctrl+M để ẩn)"
          : "Menu: <b>ẨN</b> (Ctrl+M để hiện)",
      );
    }
    return;
  }

  // Space : Play / Pause
  if (e.code === "Space") {
    e.preventDefault();
    el("btn-play").click();
    toastKey(
      state.paused
        ? "Trạng thái: <b>TẠM DỪNG</b>"
        : "Trạng thái: <b>ĐANG IN</b>",
    );
    return;
  }

  // T : Turbo
  if (e.key && e.key.toLowerCase() === "t") {
    el("btn-turbo").click();
    toastKey(
      state.turbo ? "Tốc độ: <b>TURBO ×3 BẬT</b>" : "Tốc độ: <b>TURBO TẮT</b>",
    );
    return;
  }

  // O or A : Auto-rotate camera
  if (e.key && (e.key.toLowerCase() === "o" || e.key.toLowerCase() === "a")) {
    el("btn-rotate").click();
    toastKey(
      controls.autoRotate
        ? "Tự xoay góc nhìn: <b>BẬT</b>"
        : "Tự xoay góc nhìn: <b>TẮT</b>",
    );
    return;
  }

  // F : Rare full photo (co ngay lap tuc)
  if (e.key && e.key.toLowerCase() === "f") {
    setRareMode(!state.rare);
    return;
  }
  // P : Toggle side panels
  if (e.key && e.key.toLowerCase() === "p") {
    toggleSidePanels();
    return;
  }
  // N : Thêm người vẽ vào hàng chờ
  if (e.key && e.key.toLowerCase() === "n") {
    addUserToQueue(false);
    return;
  }
  // V : Thêm người VIP vào hàng chờ
  if (e.key && e.key.toLowerCase() === "v") {
    addUserToQueue(true);
    return;
  }

  // R : Reset
  if (e.key && e.key.toLowerCase() === "r") {
    resetGame();
    return;
  }

  // L or G : Cycle layout (4 -> 6 -> 8 -> 4)
  if (e.key && (e.key.toLowerCase() === "l" || e.key.toLowerCase() === "g")) {
    const nextCount =
      state.cardsPerSheet === 4 ? 6 : state.cardsPerSheet === 6 ? 8 : 4;
    setLayoutCount(nextCount);
    return;
  }

  // C or Tab : Cycle theme
  if (e.key && e.key.toLowerCase() === "c") {
    cycleTheme();
    return;
  }
  if (e.code === "Tab") {
    e.preventDefault();
    cycleTheme();
    return;
  }

  // Plus / Equal / UpArrow: Speed Up
  if (e.key === "+" || e.key === "=" || e.key === "ArrowUp") {
    e.preventDefault();
    state.speed = Math.min(4.0, parseFloat((state.speed + 0.2).toFixed(1)));
    el("speed").value = state.speed;
    el("speed-val").textContent = state.speed.toFixed(1) + "×";
    toastKey("Tốc độ in: <b>" + state.speed.toFixed(1) + "×</b>");
    return;
  }

  // Minus / Underscore / DownArrow: Speed Down
  if (e.key === "-" || e.key === "_" || e.key === "ArrowDown") {
    e.preventDefault();
    state.speed = Math.max(0.4, parseFloat((state.speed - 0.2).toFixed(1)));
    el("speed").value = state.speed;
    el("speed-val").textContent = state.speed.toFixed(1) + "×";
    toastKey("Tốc độ in: <b>" + state.speed.toFixed(1) + "×</b>");
    return;
  }

  // Shift + 4 / 6 / 8 for Layout selection directly
  if (e.shiftKey) {
    if (e.key === "4" || e.code === "Digit4") {
      setLayoutCount(4);
      return;
    }
    if (e.key === "6" || e.code === "Digit6") {
      setLayoutCount(6);
      return;
    }
    if (e.key === "8" || e.code === "Digit8") {
      setLayoutCount(8);
      return;
    }
  }

  // 1..5: Camera views
  const map = {
    1: "total",
    2: "head",
    3: "top",
    4: "side",
    5: "front",
  };
  const viewNames = {
    1: "Tổng thể",
    2: "Cận đầu in",
    3: "Nhìn từ trên",
    4: "Góc bên",
    5: "Mặt trước",
  };
  if (map[e.key]) {
    document.querySelectorAll(".views button").forEach(function (x) {
      x.classList.toggle("on", x.dataset.view === map[e.key]);
    });
    flyTo(map[e.key]);
    toastKey("Góc máy: <b>" + viewNames[e.key] + "</b>");
  }
});

function addUserToQueue(isVip, userObj) {
  if (!userObj || !userObj.name) return;

  const photoUrl = userObj.photoUrl || "";
  const name = userObj.name;

  // Pre-load photo vao cache
  if (photoUrl && !PHOTO_CACHE[photoUrl]) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = photoUrl;
    addPhotoToCache(photoUrl, img);
  }

  const person = {
    id: userObj.id || nextUserId++,
    name: name,
    photoUrl: photoUrl,
    isVip: !!isVip,
    priority: userObj.priority || (isVip ? 100 : 0),
    addedAt: Date.now(),
  };

  if (isVip) {
    userQueue.unshift(person);
    toastKey("👑 Đã thêm VIP <b>" + name + "</b> (Ưu tiên số 1)");
    if (state.rare && queued) {
      queued.mode = "full";
    }
  } else {
    userQueue.push(person);
    toastKey("👤 Đã thêm <b>" + name + "</b> vào hàng chờ");
  }
  updateHUD();

  // Neu may in dang o trang thai cho hoac da in xong me cu -> in ngay
  if (!flow.active && active) {
    if (active.finished && active.strokes.length > 0) {
      startFlow();
    } else if (active.strokes.length === 0) {
      buildBatch(active, state.batch);
    }
  }
}

function resetGame() {
  state.batch = 1;
  state.printed = 0;
  state.score = 0;
  flow.active = false;
  flowDelay = 0;
  active.mode = "grid";
  active.cardsCount = state.cardsPerSheet;
  active.clear();
  active.setFeed(0);
  queued.mode = "grid";
  queued.cardsCount = state.cardsPerSheet;
  queued.clear();
  queued.setFeed(-PAPER_H);
  buildBatch(active, state.batch);
  headTarget.set(0, 0, -1.2);
  glowClear();
  updateHUD();
  toastKey("Đã in lại từ đầu");
}

/* ==================== VONG LAP ==================== */
function paperToWorld(px, py, sheet) {
  const x = (px / CW - 0.5) * PAPER_W + (sheet ? sheet.mesh.position.x : 0);
  const z = (py / CH - 0.5) * PAPER_H + (sheet ? sheet.offsetZ || 0 : 0);
  return [x, z];
}

function nextMode() {
  if (state.rare && hasVipInQueue()) {
    return "full";
  }
  return "grid";
}

function startFlow() {
  flow.active = true;
  flow.t = 0;
  flow.sheet = active;
  flow.nextSheet = queued;
  flow.nextSheet.mode = nextMode();
  flow.nextSheet.cardsCount = state.cardsPerSheet;
  flow.nextSheet.clear();
  flow.nextSheet.setFeed(-PAPER_H);
  flow.nextSheet.mesh.visible = true;
  headTarget.set(0, 0, -2.4);
}

function endFlow() {
  const finishedSheet = flow.sheet;
  const newActive = flow.nextSheet;

  finishedSheet.mesh.visible = false;
  finishedSheet.setFeed(-PAPER_H);

  active = newActive;
  active.setFeed(0);
  active.mesh.visible = true;

  queued = finishedSheet;

  state.batch++;
  buildBatch(active, state.batch);
  flow.active = false;
  glowClear();
  updateHUD();
}

let lastAnimTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastAnimTime) / 1000, 0.05);
  lastAnimTime = now;
  time += dt;

  if (fly.active) {
    fly.t = Math.min(1, fly.t + dt / fly.dur);
    const e = easeInOut(fly.t);
    camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
    controls.target.lerpVectors(fly.fromTgt, fly.toTgt, e);
    if (fly.t >= 1) fly.active = false;
  }

  if (!flow.active && !state.paused) {
    if (active.finished) {
      if (userQueue.length > 0) {
        flowDelay += dt;
        if (flowDelay > 0.62) {
          flowDelay = 0;
          startFlow();
        }
      } else {
        flowDelay = 0;
      }
    } else {
      const boost = state.turbo ? 3 : 1;
      const dist =
        1250 * state.speed * boost * (1 + (state.batch - 1) * 0.05) * dt;
      const penPt = advance(active, dist);
      if (penPt) {
        const w = paperToWorld(penPt[0], penPt[1], active);
        headTarget.set(w[0], 0, w[1]);
      }
    }
  }

  if (flow.active) {
    flow.t += dt / 1.35;
    const t = clamp(flow.t, 0, 1);
    const e = easeInOut(t);
    // Giay cu truot thang ra mep truoc khong he bi nhoe
    flow.sheet.setFeed(e * PAPER_H);
    // Giay moi cuon noi tiep vao ban in
    if (flow.nextSheet) {
      flow.nextSheet.setFeed(-PAPER_H + e * PAPER_H);
    }
    if (flow.t >= 1) endFlow();
  }

  /* cong + dau in bam CHINH XAC diem but, khong lech toa do */
  gantry.position.z = headTarget.z;
  carriage.position.x = headTarget.x;
  head.position.y = Math.sin(time * 26) * 0.002;
  tip.material.emissiveIntensity = 2.4 + Math.sin(time * 13) * 0.55;

  tipLight.intensity = 7 + Math.sin(time * 15) * 1.8;

  /* Vong sang nhe duoi ngoi but */
  const pulse = 1 + Math.sin(time * 7) * 0.08;
  tipRing.position.set(headTarget.x, Y_ACTIVE + 0.015, headTarget.z);
  tipRing.scale.set(pulse, pulse, 1);

  glowFade();
  if (decor) decor.update(dt, time);

  // Chi update texture sang GPU dung 1 lan moi animation frame neu co net ve moi
  if (active && active.dirty) {
    active.tex.needsUpdate = true;
    active.dirty = false;
  }
  if (glowTex && glowTex.dirty) {
    glowTex.needsUpdate = true;
    glowTex.dirty = false;
  }

  controls.update();
  renderer.render(scene, camera);
}

function updateCameraFov() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  if (aspect < 1) {
    // Man hinh doc (TikTok 9:16 vertical stream)
    camera.fov = 58;
  } else {
    camera.fov = 40;
  }
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", updateCameraFov);
updateCameraFov();

/* khoi dong */
applyTheme(0);
buildBatch(active, state.batch);
updateHUD();
animate();
setTimeout(function () {
  document.getElementById("loader").classList.add("hide");
  toastKey("Bấm <b>Ctrl + M</b> để mở Menu HUD");
}, 800);

/* ==================== REALTIME WEBSOCKET BRIDGE (24/7 AUTO RETRY) ==================== */
(function initLiveSocket() {
  let ws = null;
  let syncInterval = null;
  let retryTimer = null;
  let retryDelay = 1500;
  const urlParams = new URLSearchParams(location.search);
  const streamKey = urlParams.get("key") || urlParams.get("session") || "live_default";

  function cleanup() {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }
  }

  function scheduleReconnect() {
    cleanup();
    retryDelay = Math.min(retryDelay * 1.5, 15000);
    retryTimer = setTimeout(connect, retryDelay);
  }

  function connect() {
    cleanup();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const host = location.host || "localhost:3210";
    const wsUrl = protocol + "//" + host + "/ws?key=" + encodeURIComponent(streamKey);

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      window.sendLiveSocket = function (data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const payload = typeof data === "string" ? JSON.parse(data) : { ...data };
          payload.streamKey = streamKey;
          ws.send(JSON.stringify(payload));
        }
      };
      retryDelay = 1500; // reset backoff
      ws.send(JSON.stringify({ type: "SUBSCRIBE", key: streamKey }));

      syncInterval = setInterval(function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "SYNC_STATUS",
              streamKey: streamKey,
              batch: state.batch,
              printed: state.printed,
              score: state.score,
              queueLength: userQueue.length,
              isPaused: state.paused,
              speed: state.speed,
              theme: state.theme,
            }),
          );
        }
      }, 1500);
    };

    ws.onmessage = function (event) {
      try {
        const msg = JSON.parse(event.data);
        handleSocketMessage(msg);
      } catch (e) {
        console.error("[Live Overlay] JSON error:", e);
      }
    };

    ws.onclose = function () {
      scheduleReconnect();
    };

    ws.onerror = function () {
      scheduleReconnect();
    };
  }

  function handleSocketMessage(msg) {
    if (!msg || !msg.type) return;

    if (window.LiveOverlay && typeof window.LiveOverlay.handleMessage === "function") {
      window.LiveOverlay.handleMessage(msg);
    }

    if (msg.type === "INIT_STATE") {
      if (msg.settings) applyRemoteSettings(msg.settings);
      userQueue.length = 0; // Xoa sach hang cho cu
      if (Array.isArray(msg.queue)) {
        msg.queue.forEach(function (user) {
          addUserToQueue(user.isVip, user);
        });
      }
      // Tai tao ngay me in voi nguoi that tu SQLite
      if (userQueue.length > 0 && active) {
        active.clear();
        active.setFeed(0);
        buildBatch(active, state.batch);
        glowClear();
        updateHUD();
      }
    } else if (msg.type === "SET_SETTINGS") {
      if (msg.settings) applyRemoteSettings(msg.settings);
    } else if (msg.type === "ADD_USER") {
      if (msg.user) {
        addUserToQueue(msg.user.isVip, msg.user);
      }
    } else if (msg.type === "REMOVE_USER") {
      const idx = userQueue.findIndex(function (u) {
        return u.id === msg.id;
      });
      if (idx !== -1) {
        userQueue.splice(idx, 1);
        updateHUD();
      }
    } else if (msg.type === "CLEAR_QUEUE") {
      userQueue.length = 0;
      updateHUD();
    } else if (msg.type === "PRIORITIZE_NOW" && msg.id) {
      const idx = userQueue.findIndex(function (u) {
        return u.id === msg.id;
      });
      if (idx !== -1) {
        const item = userQueue.splice(idx, 1)[0];
        item.isVip = true;
        item.priority = 99999;
        userQueue.unshift(item);
        if (state.rare && queued) {
          queued.mode = "full";
        }
        toastKey("⚡ Đẩy in ưu tiên: <b>" + item.name + "</b>");
        updateHUD();
      }
    } else if (msg.type === "SET_QUEUE" && Array.isArray(msg.queue)) {
      const idMap = {};
      userQueue.forEach(function (u) {
        idMap[u.id] = u;
      });
      userQueue.length = 0;
      msg.queue.forEach(function (u) {
        const item = idMap[u.id] || {
          id: u.id,
          name: u.name,
          photoUrl: u.photoUrl,
          isVip: !!u.isVip,
          priority: u.priority || 0,
          addedAt: Date.now(),
        };
        userQueue.push(item);
        if (item.photoUrl) {
          getOrLoadPhoto(item.photoUrl);
        }
      });
      updateHUD();
    } else if (msg.type === "ACTION") {
      handleAction(msg.action, msg.value);
    }
  }

  function applyRemoteSettings(s) {
    if (s.title || s.subtitle) {
      updateBrand(s.title, s.subtitle);
    }
    if (typeof s.theme === "number" && s.theme !== state.theme) {
      document.querySelectorAll("#themes .theme").forEach(function (x) {
        x.classList.toggle("on", parseInt(x.dataset.theme, 10) === s.theme);
      });
      applyTheme(s.theme);
    }
    if (typeof s.cardsPerSheet === "number" && s.cardsPerSheet !== state.cardsPerSheet) {
      setLayoutCount(s.cardsPerSheet);
    }
    if (typeof s.speed === "number") {
      state.speed = s.speed;
      const spEl = el("speed");
      if (spEl) spEl.value = s.speed;
      const spVal = el("speed-val");
      if (spVal) spVal.textContent = s.speed.toFixed(1) + "×";
    }
    if (typeof s.rare === "boolean" && s.rare !== state.rare) {
      setRareMode(s.rare);
    }
    if (typeof s.paused === "boolean" && s.paused !== state.paused) {
      el("btn-play").click();
    }
    if (typeof s.turbo === "boolean" && s.turbo !== state.turbo) {
      el("btn-turbo").click();
    }
    if (typeof s.rotate === "boolean" && s.rotate !== controls.autoRotate) {
      el("btn-rotate").click();
    }
  }

  function handleAction(action, val) {
    switch (action) {
      case "play":
        if (state.paused) {
          state.paused = false;
          const pb = el("btn-play");
          if (pb) {
            pb.classList.remove("on");
            pb.textContent = "Tạm dừng";
          }
          toastKey("Trạng thái: <b>TIẾP TỤC IN</b>");
        }
        break;
      case "pause":
        if (!state.paused) {
          state.paused = true;
          const pb = el("btn-play");
          if (pb) {
            pb.classList.add("on");
            pb.textContent = "Tiếp tục";
          }
          toastKey("Trạng thái: <b>ĐÃ TẠM DỪNG</b>");
        }
        break;
      case "toggle-play":
        state.paused = !state.paused;
        const pb = el("btn-play");
        if (pb) {
          pb.classList.toggle("on", state.paused);
          pb.textContent = state.paused ? "Tiếp tục" : "Tạm dừng";
        }
        toastKey(state.paused ? "Trạng thái: <b>ĐÃ TẠM DỪNG</b>" : "Trạng thái: <b>TIẾP TỤC IN</b>");
        break;
      case "turbo":
        state.turbo = typeof val === "boolean" ? val : !state.turbo;
        const tb = el("btn-turbo");
        if (tb) {
          tb.classList.toggle("on", state.turbo);
          tb.textContent = state.turbo ? "Turbo đang bật" : "Turbo ×3";
        }
        toastKey(state.turbo ? "Tốc độ: <b>TURBO ×3 BẬT</b>" : "Tốc độ: <b>TURBO TẮT</b>");
        break;
      case "rotate":
        controls.autoRotate = typeof val === "boolean" ? val : !controls.autoRotate;
        const rb = el("btn-rotate");
        if (rb) {
          rb.classList.toggle("on", controls.autoRotate);
        }
        toastKey(controls.autoRotate ? "Chế độ: <b>TỰ XOAY 3D BẬT</b>" : "Chế độ: <b>TỰ XOAY 3D TẮT</b>");
        break;
      case "reset":
        resetGame();
        toastKey("Lệnh: <b>IN LẠI MẺ TỪ ĐẦU</b>");
        break;
      case "vip":
        triggerVipNow(val);
        break;
      case "view":
        if (val) flyTo(val);
        break;
      case "theme":
        if (typeof val === "number") {
          document.querySelectorAll("#themes .theme").forEach(function (x) {
            x.classList.toggle("on", parseInt(x.dataset.theme, 10) === val);
          });
          applyTheme(val);
        }
        break;
      case "layout":
        if (typeof val === "number") setLayoutCount(val);
        break;
      case "speed":
        if (typeof val === "number") {
          state.speed = val;
          const spEl = el("speed");
          if (spEl) spEl.value = val;
          const spVal = el("speed-val");
          if (spVal) spVal.textContent = val.toFixed(1) + "×";
        }
        break;
    }
  }

  connect();
})();
