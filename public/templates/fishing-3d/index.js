/**
 * CÂU CÁ AVATAR 3D — FISHERMAN KING (PRO THREE.JS WATER ENGINE)
 * - 3D procedural water surface with wave simulation, reflections, and splashes
 * - 5 dynamic map themes: River, Sunset Lake, Deep Ocean, Arctic Ice, Mystic Night
 * - Interactive angler state machine (Cast -> Wait -> Bite -> Reel -> Catch -> Celebrate)
 * - Real-time leaderboard & HUD stats
 * - Dynamic catch banner & trophy showcase card
 * - Web Audio procedural sound effects (reeling, splash, fanfare)
 * - WebSocket bridge to live stream events (ADD_USER, ADD_LOG, ACTION, SET_SETTINGS)
 */

(function () {
  'use strict';

  // ==================== CONFIG & STATE ====================
  const canvas = document.getElementById('three-canvas');
  if (!canvas) return;

  const params = new URLSearchParams(location.search);
  const streamKey = params.get('key') || 'live_default';

  // HUD Elements
  const hudMapName = document.getElementById('hud-map-name');
  const hudAnglersCount = document.getElementById('hud-anglers-count');
  const hudTotalFish = document.getElementById('hud-total-fish');
  const anglersListEl = document.getElementById('anglers-list');
  const catchBanner = document.getElementById('catch-banner');
  const bannerIcon = document.getElementById('banner-icon');
  const bannerUser = document.getElementById('banner-user');
  const bannerFish = document.getElementById('banner-fish');
  const bannerTier = document.getElementById('banner-tier');
  const trophyCard = document.getElementById('trophy-card');
  const trophyRarity = document.getElementById('trophy-rarity');
  const trophyAvatar = document.getElementById('trophy-avatar');
  const trophyUsername = document.getElementById('trophy-username');
  const trophyVipTag = document.getElementById('trophy-vip-tag');
  const trophyFishEmoji = document.getElementById('trophy-fish-emoji');
  const trophyFishName = document.getElementById('trophy-fish-name');
  const trophyFishWeight = document.getElementById('trophy-fish-weight');
  const cameraBar = document.getElementById('camera-bar');
  const btnHideCam = document.getElementById('btn-hide-cam');
  const btnShowCam = document.getElementById('btn-show-cam');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const hudSoundText = document.getElementById('hud-sound-text');
  const hudTopEl = document.querySelector('.hud-top');
  const leaderboardBox = document.getElementById('leaderboard-box');
  const btnLbScaleUp = document.getElementById('btn-lb-scale-up');
  const btnLbScaleDown = document.getElementById('btn-lb-scale-down');
  const btnLbToggle = document.getElementById('btn-lb-toggle');

  // Config parameters
  let maxAnglers = 20;
  let currentMapTheme = 'river';
  let catchSpeedMode = 'normal'; // slow, normal, fast
  let fishDensity = 30;
  let enableAudio = true;
  let showCameraBarConfig = true;
  let cameraMode = 'overview'; // overview, top1, water, fly

  let totalFishCaught = 0;
  let waitingQueue = [];
  const anglers = []; // active angler objects
  const swimmingFish = [];
  const splashParticles = [];

  // ==================== AUDIO SYNTHESIZER ====================
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) audioCtx = new AudioCtor();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!enableAudio) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (type === 'cast') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.25);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'splash') {
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
      } else if (type === 'reel') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.setValueAtTime(1200, now + 0.04);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'fanfare') {
        [440, 554, 659, 880].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          gain.gain.setValueAtTime(0.12, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.35);
        });
      }
    } catch (_) {}
  }

  function toggleAudio(forceState) {
    enableAudio = typeof forceState === 'boolean' ? forceState : !enableAudio;
    if (hudSoundText) {
      hudSoundText.textContent = enableAudio ? '🔊 BẬT' : '🔇 TẮT';
    }
    if (enableAudio) getAudioCtx();
  }
  btnSoundToggle?.addEventListener('click', () => toggleAudio());

  // ==================== FISH SPECIES CATALOG ====================
  const FISH_TIERS = {
    COMMON: {
      name: 'Phổ Thông',
      badge: 'PHỔ THÔNG',
      minKg: 0.5,
      maxKg: 4.5,
      species: [
        { name: 'Cá Rô Phi', emoji: '🐟', color: 0x64748b },
        { name: 'Cá Diếc Bạc', emoji: '🐟', color: 0x94a3b8 },
        { name: 'Cá Bống Biển', emoji: '🐡', color: 0xa1a1aa },
        { name: 'Cá Chim Trắng', emoji: '🐠', color: 0x38bdf8 },
      ],
    },
    RARE: {
      name: 'Hiếm',
      badge: 'HIẾM ⭐',
      minKg: 5.0,
      maxKg: 18.0,
      species: [
        { name: 'Cá Chép Vàng', emoji: '🐠', color: 0xfacc15 },
        { name: 'Cá Trắm Đen', emoji: '🐟', color: 0x1e293b },
        { name: 'Cá Hồi Đại Tây Dương', emoji: '🍣', color: 0xfb7185 },
        { name: 'Cá Vược Hoàng Đế', emoji: '🐟', color: 0x0284c7 },
      ],
    },
    EPIC: {
      name: 'Sử Thi',
      badge: 'SỬ THI 🔥',
      minKg: 20.0,
      maxKg: 75.0,
      species: [
        { name: 'Cá Tầm Hoàng Gia', emoji: '🦈', color: 0x475569 },
        { name: 'Cá Tra Dầu Khổng Lồ', emoji: '🐋', color: 0x334155 },
        { name: 'Cá Hổ Tigerfish', emoji: '🐅', color: 0xf97316 },
        { name: 'Cá Đao Kiếm Bạc', emoji: '🗡️', color: 0xe2e8f0 },
      ],
    },
    LEGENDARY: {
      name: 'Huyền Thoại',
      badge: 'HUYỀN THOẠI 👑',
      minKg: 80.0,
      maxKg: 350.0,
      species: [
        { name: 'Cá Rồng Huyết Long', emoji: '🐉', color: 0xef4444 },
        { name: 'Cá Mập Trắng Cổ Đại', emoji: '🦈', color: 0x64748b },
        { name: 'Cá Arapaima Nam Mỹ', emoji: '🐊', color: 0x059669 },
        { name: 'Bạch Tuộc Khổng Lồ', emoji: '🐙', color: 0xd946ef },
      ],
    },
    MYTHIC: {
      name: 'Thần Thoại',
      badge: 'THẦN THOẠI ⚡🐋',
      minKg: 400.0,
      maxKg: 1500.0,
      species: [
        { name: 'Cá Voi Lưng Gù Hoàng Gia', emoji: '🐋', color: 0x0ea5e9 },
        { name: 'Thủy Quái Kraken Huyền Bí', emoji: '🦑', color: 0x8b5cf6 },
        { name: 'Kim Long Thần Ngư', emoji: '✨🐉', color: 0xfbbf24 },
        { name: 'Cá Voi Sát Thủ Phantom', emoji: '🌊🐬', color: 0x1e1b4b },
      ],
    },
  };

  function rollFish(isVip, interactionScore = 0, giftBoost = 1) {
    const roll = Math.random();
    let tierKey = 'COMMON';

    // Tính bonus tier dựa trên điểm tương tác (quà tặng xu + comment tích lũy)
    // Càng tặng nhiều quà hoặc comment nhiều, cơ hội câu cá khổng lồ càng cao
    const bonus = Math.min((interactionScore || 0) / 500, 0.45); // tối đa +45% rate

    if (isVip) {
      const mythicRate = Math.min(0.25 + bonus * 0.6, 0.6);
      const legRate = Math.min(0.55 + bonus * 0.4, 0.85);
      if (roll < mythicRate) tierKey = 'MYTHIC';
      else if (roll < legRate) tierKey = 'LEGENDARY';
      else if (roll < 0.9) tierKey = 'EPIC';
      else tierKey = 'RARE';
    } else {
      const mythicRate = 0.02 + bonus * 0.15;
      const legRate = 0.08 + bonus * 0.25;
      const epicRate = 0.25 + bonus * 0.35;
      if (roll < mythicRate) tierKey = 'MYTHIC';
      else if (roll < legRate) tierKey = 'LEGENDARY';
      else if (roll < epicRate) tierKey = 'EPIC';
      else if (roll < 0.65) tierKey = 'RARE';
      else tierKey = 'COMMON';
    }

    const tier = FISH_TIERS[tierKey];
    const picked = tier.species[Math.floor(Math.random() * tier.species.length)];
    const weightBoost = Math.max(1, giftBoost);
    const weight = +(tier.minKg + Math.random() * (tier.maxKg - tier.minKg) * weightBoost).toFixed(1);
    return {
      tierKey,
      tierBadge: tier.badge,
      name: picked.name,
      emoji: picked.emoji,
      color: picked.color,
      weight,
    };
  }

  // ==================== THREE.JS SCENE SETUP ====================
  let scene, camera, renderer;
  let waterMesh, waterGeom, waterMat;
  let terrainGroup, lakeGroup, fishGroup, anglersGroup;
  let dirLight, hemiLight, ambientLight;
  let lakeRadius = 26;

  const MAP_PRESETS = {
    river: {
      name: '🌿 Sông Lam Xanh Mát',
      skyColor: 0x7dd3fc,
      fogColor: 0xbae6fd,
      waterColor: 0x0284c7,
      shoreColor: 0x15803d,
      rockColor: 0x475569,
      waterOpacity: 0.82,
      lightIntensity: 1.1,
    },
    lake: {
      name: '🌅 Hồ Hoàng Hôn Lãng Mạn',
      skyColor: 0xfdba74,
      fogColor: 0xfed7aa,
      waterColor: 0xc2410c,
      shoreColor: 0x78350f,
      rockColor: 0x451a03,
      waterOpacity: 0.86,
      lightIntensity: 0.95,
    },
    ocean: {
      name: '🌊 Biển Khơi Đại Dương',
      skyColor: 0x38bdf8,
      fogColor: 0x0284c7,
      waterColor: 0x0c4a6e,
      shoreColor: 0xfef08a,
      rockColor: 0x334155,
      waterOpacity: 0.88,
      lightIntensity: 1.25,
    },
    ice: {
      name: '❄️ Hồ Băng Cực Bắc',
      skyColor: 0xe0f2fe,
      fogColor: 0xbae6fd,
      waterColor: 0x38bdf8,
      shoreColor: 0xf1f5f9,
      rockColor: 0x64748b,
      waterOpacity: 0.9,
      lightIntensity: 1.3,
    },
    mystic: {
      name: '🌌 Đầm Lầy Đêm Neon',
      skyColor: 0x0f172a,
      fogColor: 0x090d16,
      waterColor: 0x3b0764,
      shoreColor: 0x14532d,
      rockColor: 0x1e1b4b,
      waterOpacity: 0.85,
      lightIntensity: 0.75,
    },
  };

  function initThree() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 500);
    camera.position.set(0, 24, 38);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // Groups
    lakeGroup = new THREE.Group();
    terrainGroup = new THREE.Group();
    fishGroup = new THREE.Group();
    anglersGroup = new THREE.Group();
    scene.add(lakeGroup);
    scene.add(terrainGroup);
    scene.add(fishGroup);
    scene.add(anglersGroup);

    // Lights
    ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.45);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xfffbeb, 1.1);
    dirLight.position.set(30, 45, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -35;
    dirLight.shadow.camera.right = 35;
    dirLight.shadow.camera.top = 35;
    dirLight.shadow.camera.bottom = -35;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    createWaterAndPond();
    createEnvironment();
    createUnderwaterDecor();
    applyTheme(currentMapTheme);

    window.addEventListener('resize', onWindowResize);
    setupCameraControls();
    animate();
  }

  // ==================== WATER AND POND ====================
  function createWaterAndPond() {
    // Water surface plane with many subdivisions for wave simulation
    const segs = 70;
    waterGeom = new THREE.PlaneGeometry(lakeRadius * 2.1, lakeRadius * 2.1, segs, segs);
    waterGeom.rotateX(-Math.PI / 2);

    waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.82,
      roughness: 0.12,
      metalness: 0.1,
      transmission: 0.6,
      ior: 1.333,
      reflectivity: 0.8,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      depthWrite: false,
    });

    waterMesh = new THREE.Mesh(waterGeom, waterMat);
    waterMesh.position.y = 0;
    waterMesh.receiveShadow = true;
    lakeGroup.add(waterMesh);

    // Lake Bed (đáy hồ cát & đá)
    const bedGeom = new THREE.CylinderGeometry(lakeRadius * 0.95, lakeRadius * 0.75, 4.5, 48, 1, false);
    const bedMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.95,
      metalness: 0.05,
    });
    const bedMesh = new THREE.Mesh(bedGeom, bedMat);
    bedMesh.position.y = -2.25;
    bedMesh.receiveShadow = true;
    lakeGroup.add(bedMesh);
  }

  // ==================== SURROUNDING ENVIRONMENT ====================
  function createEnvironment() {
    terrainGroup.clear();

    // Shore ring (bờ bao quanh hồ hình tròn/đa giác tự nhiên)
    const shoreInner = lakeRadius * 0.98;
    const shoreOuter = lakeRadius * 1.7;
    const shoreGeom = new THREE.RingGeometry(shoreInner, shoreOuter, 64);
    shoreGeom.rotateX(-Math.PI / 2);

    // Modulate outer radius for natural wavy edge
    const pos = shoreGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const dist = Math.hypot(x, z);
      if (dist > shoreInner + 0.5) {
        const angle = Math.atan2(z, x);
        const bump = Math.sin(angle * 5) * 1.5 + Math.cos(angle * 9) * 0.8;
        pos.setY(i, 0.4 + Math.sin(angle * 7) * 0.3);
        pos.setX(i, x + (x / dist) * bump);
        pos.setZ(i, z + (z / dist) * bump);
      } else {
        pos.setY(i, 0.15);
      }
    }
    shoreGeom.computeVertexNormals();

    const shoreMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    });
    const shoreMesh = new THREE.Mesh(shoreGeom, shoreMat);
    shoreMesh.receiveShadow = true;
    terrainGroup.add(shoreMesh);

    // Decorative Rocks around shore
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.15;
      const dist = lakeRadius + 0.4 + Math.random() * 2.2;
      const rockGeom = new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.9, 0);
      const rock = new THREE.Mesh(rockGeom, rockMat);
      rock.position.set(Math.cos(angle) * dist, 0.3 + Math.random() * 0.4, Math.sin(angle) * dist);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.castShadow = true;
      rock.receiveShadow = true;
      terrainGroup.add(rock);
    }

    // Pine Trees on outer rim
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.2;
      const dist = lakeRadius + 4.5 + Math.random() * 4.5;
      const tree = createTree();
      tree.position.set(Math.cos(angle) * dist, 0.4, Math.sin(angle) * dist);
      terrainGroup.add(tree);
    }
  }

  function createTree() {
    const group = new THREE.Group();
    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
    const trunkGeom = new THREE.CylinderGeometry(0.2, 0.3, 1.8, 6);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    group.add(trunk);

    // Leaves layers
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8, flatShading: true });
    [
      { r: 1.4, h: 1.6, y: 2.2 },
      { r: 1.1, h: 1.4, y: 3.1 },
      { r: 0.7, h: 1.2, y: 3.9 },
    ].forEach((layer) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(layer.r, layer.h, 6), leafMat);
      cone.position.y = layer.y;
      cone.castShadow = true;
      group.add(cone);
    });

    const scale = 0.85 + Math.random() * 0.45;
    group.scale.set(scale, scale, scale);
    return group;
  }

  function createUnderwaterDecor() {
    // Water lilies on lake
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * (lakeRadius - 10);
      const lily = new THREE.Group();
      const padMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.8 + Math.random() * 0.4, 12), padMat);
      pad.rotateX(-Math.PI / 2);
      lily.add(pad);

      // Pink Lotus flower
      if (Math.random() > 0.4) {
        const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.5 });
        const flower = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 6), flowerMat);
        flower.position.y = 0.15;
        lily.add(flower);
      }
      lily.position.set(Math.cos(angle) * dist, 0.05, Math.sin(angle) * dist);
      lakeGroup.add(lily);
    }
  }

  // ==================== FISH SCHOOL UNDERWATER ====================
  function updateFishSchool() {
    // Maintain fish count based on fishDensity
    while (swimmingFish.length < fishDensity) {
      const fish = createSwimmingFishMesh();
      fishGroup.add(fish);
      swimmingFish.push(fish);
    }
    while (swimmingFish.length > fishDensity) {
      const fish = swimmingFish.pop();
      fishGroup.remove(fish);
    }
  }

  function createSwimmingFishMesh() {
    const group = new THREE.Group();
    const fishColors = [0xfacc15, 0x38bdf8, 0xf97316, 0xef4444, 0x10b981, 0xd946ef];
    const color = fishColors[Math.floor(Math.random() * fishColors.length)];

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.3,
    });

    // Thân cá hình bầu dục thuôn dài chuẩn giải phẫu (thay vì hình chóp nón tam giác)
    const bodyGeom = new THREE.SphereGeometry(0.3, 10, 8);
    bodyGeom.scale(0.55, 0.85, 2.2); // dẹp hai bên, thuôn dài về trước/sau
    const body = new THREE.Mesh(bodyGeom, mat);
    group.add(body);

    // Vây lưng (Dorsal fin)
    const finMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const dFinGeom = new THREE.BufferGeometry();
    const dFinVerts = new Float32Array([
      0, 0.22, 0.2,
      0, 0.5, -0.1,
      0, 0.15, -0.4,
    ]);
    dFinGeom.setAttribute('position', new THREE.BufferAttribute(dFinVerts, 3));
    const dFin = new THREE.Mesh(dFinGeom, finMat);
    group.add(dFin);

    // Vây ngực 2 bên (Pectoral fins)
    [-1, 1].forEach((side) => {
      const pFinGeom = new THREE.BufferGeometry();
      const pFinVerts = new Float32Array([
        0, 0, 0.2,
        side * 0.35, -0.15, -0.05,
        0, -0.1, -0.15,
      ]);
      pFinGeom.setAttribute('position', new THREE.BufferAttribute(pFinVerts, 3));
      const pFin = new THREE.Mesh(pFinGeom, finMat);
      group.add(pFin);
    });

    // Khớp đuôi & Vây đuôi mềm mại uốn lượn (Caudal fin)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -0.65);

    const tailGeom = new THREE.BufferGeometry();
    const tailVerts = new Float32Array([
      0, 0, 0,
      0, 0.38, -0.55,
      0, 0, -0.35,
      0, -0.38, -0.55,
      0, 0, 0,
    ]);
    const tailIndices = [0, 1, 2, 0, 2, 3];
    tailGeom.setAttribute('position', new THREE.BufferAttribute(tailVerts, 3));
    tailGeom.setIndex(tailIndices);
    const tail = new THREE.Mesh(tailGeom, finMat);
    tailPivot.add(tail);
    group.add(tailPivot);

    // Mắt cá
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    [-0.14, 0.14].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
      eye.position.set(side, 0.08, 0.42);
      group.add(eye);
    });

    const orbitRadius = 4 + Math.random() * (lakeRadius - 8);
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.25 + Math.random() * 0.4) * (Math.random() > 0.5 ? 1 : -1);
    const depth = -0.5 - Math.random() * 1.8;

    group.userData = {
      orbitRadius,
      angle,
      speed,
      depth,
      tailPivot,
      wiggleOffset: Math.random() * 10,
    };
    group.position.set(Math.cos(angle) * orbitRadius, depth, Math.sin(angle) * orbitRadius);

    const scale = 0.8 + Math.random() * 0.8;
    group.scale.set(scale, scale, scale);
    return group;
  }

  // ==================== AVATAR BILLBOARD ====================
  function createAvatarBillboard(photoUrl, name, isVip) {
    const canvasObj = document.createElement('canvas');
    canvasObj.width = 180;
    canvasObj.height = 180;
    const ctx = canvasObj.getContext('2d');

    // Outer Glow / Ring
    ctx.beginPath();
    ctx.arc(90, 80, 68, 0, Math.PI * 2);
    ctx.fillStyle = isVip ? '#f59e0b' : '#38bdf8';
    ctx.fill();

    // Inner White Ring
    ctx.beginPath();
    ctx.arc(90, 80, 64, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Avatar Circle Clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(90, 80, 60, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 180, 180);

    const tex = new THREE.CanvasTexture(canvasObj);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;

    function drawNamePlate() {
      ctx.restore();

      // VIP Crown if VIP
      if (isVip) {
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', 90, 24);
      }

      // Name badge
      ctx.fillStyle = 'rgba(6, 18, 32, 0.95)';
      ctx.beginPath();
      ctx.roundRect(10, 142, 160, 30, 8);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isVip ? '#f59e0b' : '#38bdf8';
      ctx.stroke();

      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.slice(0, 13), 90, 157);
      tex.needsUpdate = true;
    }

    if (photoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 28, 18, 124, 124);
        drawNamePlate();
      };
      img.onerror = () => {
        // Fallback initials
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.slice(0, 2).toUpperCase(), 90, 80);
        drawNamePlate();
      };
      img.src = photoUrl;
    } else {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.slice(0, 2).toUpperCase(), 90, 80);
      drawNamePlate();
    }

    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      fog: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.2, 3.2, 1);
    return sprite;
  }

  // Top 1, 2, 3 Crown Marker
  function createTopRankMarker() {
    const cObj = document.createElement('canvas');
    cObj.width = 128;
    cObj.height = 128;
    const cCtx = cObj.getContext('2d');
    cCtx.font = '64px sans-serif';
    cCtx.textAlign = 'center';
    cCtx.textBaseline = 'middle';
    cCtx.fillText('👑', 64, 64);

    const tex = new THREE.CanvasTexture(cObj);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 2.2, 1);
    sprite.userData = { canvas: cObj, ctx: cCtx, tex };
    return sprite;
  }

  function updateTopRankMarker(sprite, rank) {
    if (!sprite || !sprite.userData || !sprite.userData.ctx) return;
    const ctx = sprite.userData.ctx;
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = '56px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (rank === 1) {
      ctx.fillText('👑', 64, 50);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.fillText('TOP 1', 64, 105);
    } else if (rank === 2) {
      ctx.fillText('🥈', 64, 50);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText('TOP 2', 64, 105);
    } else if (rank === 3) {
      ctx.fillText('🥉', 64, 50);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('TOP 3', 64, 105);
    }
    sprite.userData.tex.needsUpdate = true;
  }

  // ==================== 3D ANGLER CREATION ====================
  function createAngler(userData, slotIndex, totalSlots) {
    const anglerGroup = new THREE.Group();

    // Position around lake shore
    const angle = (slotIndex / totalSlots) * Math.PI * 2;
    const shoreDist = lakeRadius - 0.5; // Đặt đúng mép bờ/cầu gỗ chạm mặt nước
    const x = Math.cos(angle) * shoreDist;
    const z = Math.sin(angle) * shoreDist;

    anglerGroup.position.set(x, 0.25, z);
    // Quay mặt hướng về tâm hồ (0, 0, 0)
    // Trong Three.js, khi gọi lookAt(0, 0, 0): trục +Z sẽ chĩa thẳng vào tâm hồ!
    // Trục -Z chĩa ra bờ cỏ phía sau lưng cần thủ.
    anglerGroup.lookAt(0, 0.25, 0);

    // Wooden Pier / Dock underneath (chĩa về phía mặt hồ: trục +Z)
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 3.6), pierMat);
    pier.position.set(0, 0, 0.6); // Nhô ra phía mặt nước (+Z)
    pier.receiveShadow = true;
    pier.castShadow = true;
    anglerGroup.add(pier);

    // Dock Pilings (cọc gỗ cắm xuống nước ở đầu cầu phía hồ: +Z)
    const postMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.95 });
    [-0.9, 0.9].forEach((px) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 6), postMat);
      post.position.set(px, -1.0, 1.8);
      anglerGroup.add(post);
    });

    // Fisherman Character (Đứng/ngồi ở cầu hướng mặt ra hồ: +Z)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: userData.isVip ? 0xf59e0b : 0x0284c7,
      roughness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8), bodyMat);
    body.position.set(0, 0.85, 0);
    body.castShadow = true;
    anglerGroup.add(body);

    // Fisherman Hat / Head
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffedd5, roughness: 0.8 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), headMat);
    head.position.set(0, 1.65, 0);
    anglerGroup.add(head);

    const hatMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.35, 12), hatMat);
    hat.position.set(0, 1.9, 0);
    anglerGroup.add(hat);

    // Fishing Rod (Cần câu chĩa thẳng ra mặt hồ: hướng trục +Z)
    const rodPivot = new THREE.Group();
    // Đặt gốc cần câu ngay tay cầm của cần thủ
    rodPivot.position.set(0.35, 0.95, 0.2);

    const rodMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
    const rodLength = 4.2;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, rodLength, 6), rodMat);
    // Tâm hình trụ nằm giữa, đưa tâm về gốc cần câu để quay pivot quanh tay cầm
    rod.position.set(0, rodLength / 2, 0);

    // Xoay cần câu chúi ra mặt hồ (+Z)
    const rodHolder = new THREE.Group();
    rodHolder.rotation.x = Math.PI / 3.4; // chúc về phía trước +Z
    rodHolder.add(rod);
    rodPivot.add(rodHolder);
    anglerGroup.add(rodPivot);

    // Tính chính xác vị trí ngọn cần câu (Rod Tip) theo vector
    // ngọn cần ở độ dài rodLength dọc theo góc nghiêng
    const rodAngle = Math.PI / 3.4;
    const rodTipLocal = new THREE.Vector3(
      0.35,
      0.95 + Math.cos(rodAngle) * rodLength,
      0.2 + Math.sin(rodAngle) * rodLength
    );

    // Fishing Line (Dây cước từ đầu cần thả ra xa trong lòng hồ: +Z)
    const bobberDistance = 5.0 + Math.random() * 4.0; // Thả sâu vào hồ 5-9 mét
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const lineGeom = new THREE.BufferGeometry();
    const linePoints = [rodTipLocal, new THREE.Vector3(0, 0, bobberDistance)];
    lineGeom.setFromPoints(linePoints);
    const fishingLine = new THREE.Line(lineGeom, lineMat);
    anglerGroup.add(fishingLine);

    // Float / Bobber (Phao câu nổi trong hồ: +Z)
    const bobberGroup = new THREE.Group();
    const bobberTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    const bobberBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.14, 0.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    bobberBottom.position.y = -0.22;
    bobberGroup.add(bobberTop);
    bobberGroup.add(bobberBottom);
    bobberGroup.position.set(0, 0, bobberDistance);
    anglerGroup.add(bobberGroup);

    // Caught Fish (3D Fish giật lên từ mặt hồ: +Z)
    const caughtFishGroup = new THREE.Group();
    const fishBodyMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.25,
      metalness: 0.4,
    });
    // Thân cá bầu dục
    const fBodyGeom = new THREE.SphereGeometry(0.38, 12, 10);
    fBodyGeom.scale(0.55, 0.85, 2.2);
    const fBody = new THREE.Mesh(fBodyGeom, fishBodyMat);
    caughtFishGroup.add(fBody);

    // Vây lưng
    const fFinMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
    const fFinGeom = new THREE.BufferGeometry();
    const fFinVerts = new Float32Array([0, 0.3, -0.2, 0, 0.7, 0.2, 0, 0.2, 0.6]);
    fFinGeom.setAttribute('position', new THREE.BufferAttribute(fFinVerts, 3));
    const fFin = new THREE.Mesh(fFinGeom, fFinMat);
    caughtFishGroup.add(fFin);

    // Vây đuôi
    const fTailGeom = new THREE.BufferGeometry();
    const fTailVerts = new Float32Array([
      0, 0, 0.85,
      0, 0.5, 1.5,
      0, 0, 1.2,
      0, -0.5, 1.5,
      0, 0, 0.85,
    ]);
    fTailGeom.setAttribute('position', new THREE.BufferAttribute(fTailVerts, 3));
    fTailGeom.setIndex([0, 1, 2, 0, 2, 3]);
    const fTail = new THREE.Mesh(fTailGeom, fFinMat);
    caughtFishGroup.add(fTail);

    // Mắt cá
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    [-0.2, 0.2].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
      eye.position.set(ex, 0.15, -0.55);
      caughtFishGroup.add(eye);
    });

    caughtFishGroup.visible = false;
    caughtFishGroup.position.set(0, 0, bobberDistance);
    anglerGroup.add(caughtFishGroup);

    // Avatar Billboard above angler
    const billboard = createAvatarBillboard(userData.photoUrl, userData.name, !!userData.isVip);
    billboard.position.set(0, 3.2, 0);
    anglerGroup.add(billboard);

    // Crown / Podium aura for Top 1, 2, 3
    const crownSprite = createTopRankMarker();
    crownSprite.position.set(0, 5.1, 0);
    crownSprite.visible = false;
    anglerGroup.add(crownSprite);

    // Underglow ring on pier for Top rank
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 24), ringMat);
    ring.rotateX(-Math.PI / 2);
    ring.position.set(0, 0.26, 0.6);
    ring.visible = false;
    anglerGroup.add(ring);

    // Angler State Object
    const anglerState = {
      userData: {
        id: userData.id,
        name: userData.name,
        photoUrl: userData.photoUrl,
        isVip: !!userData.isVip,
        score: userData.score || 0,
        totalCaught: 0,
        biggestKg: 0,
        interactionScore: 0, // Điểm tương tác từ cmt và quà tặng
      },
      group: anglerGroup,
      rodPivot,
      rodTipLocal,
      fishingLine,
      bobberGroup,
      caughtFishGroup,
      billboard,
      crownSprite,
      ring,
      state: 'WAITING', // CASTING, WAITING, BITING, REELING, CELEBRATING
      stateTimer: 2.0 + Math.random() * 4.0,
      targetBobberDist: bobberDistance,
      currentFish: null,
      bobberBaseY: 0,
    };

    return anglerState;
  }

  // ==================== ANGLER STATE MACHINE & FISHING LOGIC ====================
  function updateAnglers(delta) {
    const speedMult = catchSpeedMode === 'fast' ? 2.2 : catchSpeedMode === 'slow' ? 0.6 : 1.2;

    anglers.forEach((a) => {
      a.stateTimer -= delta * speedMult;

      // Bobber floating ripple motion
      const bobberTime = performance.now() * 0.005;
      const waveY = Math.sin(bobberTime * 3 + a.userData.name.length) * 0.08;

      if (a.state === 'WAITING') {
        a.bobberGroup.position.y = waveY;
        a.rodPivot.rotation.x = Math.sin(bobberTime * 0.8) * 0.02;

        if (a.stateTimer <= 0) {
          // Fish is biting!
          a.state = 'BITING';
          a.stateTimer = 1.8 + Math.random() * 1.5;
          playSound('splash');
          spawnSplash(a.bobberGroup.getWorldPosition(new THREE.Vector3()), 8);
        }
      } else if (a.state === 'BITING') {
        // Phao nhấp nháy chìm sâu dưới nước, cần câu rung lắc
        a.bobberGroup.position.y = -0.45 + Math.sin(bobberTime * 22) * 0.2;
        a.rodPivot.rotation.x = 0.2 + Math.sin(bobberTime * 26) * 0.12;

        if (a.stateTimer <= 0) {
          // Reel in the catch!
          a.state = 'REELING';
          a.stateTimer = 1.8;
          a.currentFish = rollFish(a.userData.isVip, a.userData.interactionScore || 0);
          playSound('reel');
          spawnSplash(a.bobberGroup.getWorldPosition(new THREE.Vector3()), 14);
        }
      } else if (a.state === 'REELING') {
        // Cần uốn cong mạnh về sau, giật cá lên
        a.rodPivot.rotation.x = -0.45 + Math.sin(bobberTime * 28) * 0.15;
        a.bobberGroup.position.y = waveY;

        if (Math.random() < 0.3) playSound('reel');

        if (a.stateTimer <= 0) {
          // Kéo cá tung bọt nước vọt lên không trung
          onFishCaught(a);
        }
      } else if (a.state === 'CELEBRATING') {
        // Animation cá giật tung lên từ mặt hồ (+Z) bay vút lên trời rồi lượn tới cần thủ
        const totalDuration = 3.2;
        const progress = 1 - Math.max(a.stateTimer, 0) / totalDuration; // 0 -> 1

        const startPos = new THREE.Vector3(0, 0, a.targetBobberDist);
        const endPos = new THREE.Vector3(0, 2.4, 0); // Đưa cá về trước ngực cần thủ
        const arcHeight = 5.5 + Math.min(a.currentFish?.weight || 0, 150) * 0.04;

        // Quỹ đạo parabol giật vọt lên cao rồi rơi về tay cần thủ
        a.caughtFishGroup.position.lerpVectors(startPos, endPos, progress);
        a.caughtFishGroup.position.y = Math.sin(progress * Math.PI) * arcHeight;

        // Cá giãy đập đuôi xoay tròn như thật
        a.caughtFishGroup.rotation.x = Math.sin(progress * Math.PI * 4) * 0.8;
        a.caughtFishGroup.rotation.y += delta * 12;
        a.caughtFishGroup.rotation.z = Math.cos(progress * Math.PI * 3) * 0.5;

        // Cần câu giật ngược ra sau rồi hạ xuống ăn mừng
        if (progress < 0.35) {
          a.rodPivot.rotation.x = 0.7 - progress * 0.8; // Giật bổng cần câu
        } else {
          a.rodPivot.rotation.x = 0.2 + Math.sin(progress * 10) * 0.1;
        }

        // Cập nhật phao bám theo cá khi cá bị nhấc lên
        a.bobberGroup.position.copy(a.caughtFishGroup.position);

        if (a.stateTimer <= 0) {
          // Reset to casting new line
          a.caughtFishGroup.visible = false;
          a.bobberGroup.position.set(0, 0, a.targetBobberDist);
          a.state = 'CASTING';
          a.stateTimer = 1.0;
        }
      } else if (a.state === 'CASTING') {
        // Vung cần quăng mồi trở lại lòng hồ (+Z)
        const castProg = 1 - a.stateTimer / 1.0;
        a.rodPivot.rotation.x = 0.5 - castProg * 0.3;
        a.bobberGroup.position.y = (1 - castProg) * 1.5;

        if (a.stateTimer <= 0) {
          a.state = 'WAITING';
          a.stateTimer = 3.0 + Math.random() * 5.0;
          a.bobberGroup.position.set(0, 0, a.targetBobberDist);
          playSound('cast');
          spawnSplash(a.bobberGroup.getWorldPosition(new THREE.Vector3()), 6);
        }
      }

      // Update 3D fishing line connection from rod tip to bobber/fish
      // Tính ngọn cần khi cần uốn cong quay quanh rodPivot
      const currentRodAngle = Math.PI / 3.4 + a.rodPivot.rotation.x;
      const rodLength = 4.2;
      const tipPos = new THREE.Vector3(
        0.35,
        0.95 + Math.cos(currentRodAngle) * rodLength,
        0.2 + Math.sin(currentRodAngle) * rodLength
      );
      const targetPos = a.state === 'CELEBRATING' ? a.caughtFishGroup.position : a.bobberGroup.position;
      const positions = a.fishingLine.geometry.attributes.position.array;
      positions[0] = tipPos.x;
      positions[1] = tipPos.y;
      positions[2] = tipPos.z;
      positions[3] = targetPos.x;
      positions[4] = targetPos.y;
      positions[5] = targetPos.z;
      a.fishingLine.geometry.attributes.position.needsUpdate = true;
    });
  }

  function onFishCaught(angler) {
    const fish = angler.currentFish;
    if (!fish) return;

    angler.state = 'CELEBRATING';
    angler.stateTimer = 3.2;

    // Show caught 3D fish mesh with scale & color based on tier
    angler.caughtFishGroup.visible = true;
    angler.caughtFishGroup.position.set(0, 0, angler.targetBobberDist);

    // Đổi màu thân cá theo tier
    angler.caughtFishGroup.children.forEach((child) => {
      if (child.material && child.material.color) {
        child.material.color.setHex(fish.color || 0xfacc15);
      }
    });

    const fishScale = Math.min(0.8 + Math.log10(Math.max(fish.weight, 1)) * 0.5, 3.2);
    angler.caughtFishGroup.scale.set(fishScale, fishScale, fishScale);

    // Update stats
    totalFishCaught++;
    angler.userData.totalCaught++;
    angler.userData.score += Math.round(fish.weight * 10);
    if (fish.weight > angler.userData.biggestKg) {
      angler.userData.biggestKg = fish.weight;
    }

    playSound('splash');
    playSound('fanfare');
    // Bọt nước nổ tung hoành tráng tại vị trí cá cắn câu
    spawnSplash(angler.bobberGroup.getWorldPosition(new THREE.Vector3()), 26);

    updateHUD();

    // Trigger Catch Banner for Epic+ or VIP
    if (fish.tierKey !== 'COMMON' || angler.userData.isVip) {
      showCatchBanner(angler.userData, fish);
    }

    // Trigger Trophy Card Modal for Legendary & Mythic
    if (fish.tierKey === 'LEGENDARY' || fish.tierKey === 'MYTHIC') {
      showTrophyCard(angler.userData, fish);
    }
  }

  // ==================== CATCH BANNER & TROPHY CARD ====================
  let bannerTimeout = null;
  function showCatchBanner(user, fish) {
    if (!catchBanner) return;
    if (bannerTimeout) clearTimeout(bannerTimeout);

    bannerIcon.textContent = fish.emoji;
    bannerUser.textContent = `${user.isVip ? '👑 VIP ' : ''}${user.name}`;
    bannerFish.textContent = `VỪA KÉO LÊN ${fish.name.toUpperCase()} — ${fish.weight.toLocaleString()} KG!`;
    bannerTier.textContent = fish.tierBadge;

    catchBanner.classList.add('show');
    bannerTimeout = setTimeout(() => {
      catchBanner.classList.remove('show');
    }, 4500);
  }

  let trophyTimeout = null;
  function showTrophyCard(user, fish) {
    if (!trophyCard) return;
    if (trophyTimeout) clearTimeout(trophyTimeout);

    trophyRarity.textContent = fish.tierBadge;
    trophyAvatar.src = user.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.name)}`;
    trophyUsername.textContent = user.name;
    trophyVipTag.textContent = user.isVip ? '⭐ VIP MEMBER' : '🎣 CẦN THỦ VÀNG';
    trophyFishEmoji.textContent = fish.emoji;
    trophyFishName.textContent = fish.name;
    trophyFishWeight.innerHTML = `${fish.weight.toLocaleString()} <span>KG</span>`;

    trophyCard.classList.add('show');
    trophyTimeout = setTimeout(() => {
      trophyCard.classList.remove('show');
    }, 5500);
  }

  // ==================== SPLASH PARTICLES ====================
  function spawnSplash(pos, count = 12) {
    const splashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + Math.random() * 0.08, 0), splashMat);
      p.position.copy(pos);
      p.userData = {
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 2.2,
          1.8 + Math.random() * 2.5,
          (Math.random() - 0.5) * 2.2
        ),
        life: 0.6 + Math.random() * 0.4,
      };
      scene.add(p);
      splashParticles.push(p);
    }
  }

  function updateSplashes(delta) {
    for (let i = splashParticles.length - 1; i >= 0; i--) {
      const p = splashParticles[i];
      p.userData.life -= delta;
      p.userData.vel.y -= 9.8 * delta; // Gravity
      p.position.addScaledVector(p.userData.vel, delta);
      p.scale.multiplyScalar(0.96);

      if (p.userData.life <= 0 || p.position.y < -0.5) {
        scene.remove(p);
        splashParticles.splice(i, 1);
      }
    }
  }

  // ==================== POPULATE & REFRESH ANGLERS ====================
  function rebuildAnglersFromQueue() {
    anglersGroup.clear();
    anglers.length = 0;

    const activeCount = Math.min(waitingQueue.length, maxAnglers);
    for (let i = 0; i < activeCount; i++) {
      const user = waitingQueue[i];
      const angler = createAngler(user, i, activeCount);
      anglersGroup.add(angler.group);
      anglers.push(angler);
    }

    updateHUD();
  }

  // ==================== HUD LEADERBOARD & STATS ====================
  function updateHUD() {
    if (hudAnglersCount) {
      hudAnglersCount.textContent = `${anglers.length} / ${maxAnglers}`;
    }
    if (hudTotalFish) {
      hudTotalFish.textContent = `${totalFishCaught} Con`;
    }

    if (!anglersListEl) return;

    if (anglers.length === 0) {
      anglersListEl.innerHTML = '<div class="empty-state">Đang chờ cần thủ thả mồi...</div>';
      return;
    }

    // Sort anglers by score / biggest catch
    const sorted = [...anglers].sort((a, b) => b.userData.score - a.userData.score);

    // Cập nhật hiệu ứng Top 1, 2, 3 nổi bật trên 3D hồ nước
    anglers.forEach((a) => {
      const rankIdx = sorted.indexOf(a);
      const rank = rankIdx + 1;
      if (rank <= 3) {
        a.crownSprite.visible = true;
        updateTopRankMarker(a.crownSprite, rank);
        a.ring.visible = true;
        if (a.ring.material && a.ring.material.color) {
          a.ring.material.color.setHex(rank === 1 ? 0xfacc15 : rank === 2 ? 0xe2e8f0 : 0xf59e0b);
        }
        // Avatar billboard to hơn
        a.billboard.scale.set(4.0, 4.0, 1);
      } else {
        a.crownSprite.visible = false;
        a.ring.visible = false;
        a.billboard.scale.set(3.2, 3.2, 1);
      }
    });

    anglersListEl.innerHTML = sorted
      .map((a, idx) => {
        const u = a.userData;
        const rank = idx + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        const avatarSrc = u.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.name)}`;

        return `
          <div class="angler-card ${rankClass}">
            <div class="angler-rank">${rankIcon}</div>
            <div class="angler-avatar-wrap">
              <img class="angler-avatar" src="${avatarSrc}" alt="${u.name}" />
              ${u.isVip ? '<span class="angler-vip-badge">VIP</span>' : ''}
            </div>
            <div class="angler-info">
              <div class="angler-name">${u.name}</div>
              <div class="angler-meta">
                <span>🎣 ${u.totalCaught} con</span>
                <span>⭐ ${u.biggestKg} kg</span>
              </div>
            </div>
            <div class="angler-score">${u.score.toLocaleString()} <span style="font-size: 10px; color: #94a3b8;">Đ</span></div>
          </div>
        `;
      })
      .join('');
  }

  // ==================== MAP THEMES ====================
  function applyTheme(themeKey) {
    const t = MAP_PRESETS[themeKey] || MAP_PRESETS.river;
    currentMapTheme = themeKey;

    if (hudMapName) hudMapName.textContent = t.name;

    scene.background = new THREE.Color(t.skyColor);
    scene.fog = new THREE.FogExp2(t.fogColor, 0.012);

    if (waterMat) {
      waterMat.color.setHex(t.waterColor);
      waterMat.opacity = t.waterOpacity;
    }

    if (dirLight) {
      dirLight.intensity = t.lightIntensity;
    }

    // Recreate terrain with theme-specific colors
    createEnvironment();
  }

  // ==================== CAMERA CONTROLS ====================
  function setupCameraControls() {
    document.querySelectorAll('.cam-btn:not(.cam-close-btn)').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        cameraMode = btn.dataset.cam;
        isUserInteracting = false; // Quay lại chế độ cam tự động đã chọn
      });
    });

    btnHideCam?.addEventListener('click', () => {
      cameraBar.style.display = 'none';
      if (btnShowCam) btnShowCam.style.display = 'block';
      if (hudTopEl) hudTopEl.classList.add('hidden'); // Ẩn luôn thanh top khi ẩn menu
    });

    btnShowCam?.addEventListener('click', () => {
      cameraBar.style.display = 'flex';
      btnShowCam.style.display = 'none';
      if (hudTopEl) hudTopEl.classList.remove('hidden'); // Hiện lại thanh top
    });

    // Bảng xếp hạng: phóng to / thu nhỏ / thu gọn
    let lbScale = 1.0;
    btnLbScaleUp?.addEventListener('click', (e) => {
      e.stopPropagation();
      lbScale = Math.min(lbScale + 0.1, 1.5);
      if (leaderboardBox) leaderboardBox.style.transform = `scale(${lbScale})`;
    });

    btnLbScaleDown?.addEventListener('click', (e) => {
      e.stopPropagation();
      lbScale = Math.max(lbScale - 0.1, 0.7);
      if (leaderboardBox) leaderboardBox.style.transform = `scale(${lbScale})`;
    });

    btnLbToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!leaderboardBox) return;
      leaderboardBox.classList.toggle('collapsed');
      btnLbToggle.textContent = leaderboardBox.classList.contains('collapsed') ? '□' : '_';
    });

    setupMouseOrbitControls();
  }

  // ==================== MOUSE ORBIT & ZOOM CONTROLS ====================
  // Cho phép dùng chuột kéo xoay và lăn chuột phóng to thu nhỏ đến bất kỳ vị trí nào
  let isUserInteracting = false;
  let isDraggingMouse = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let cameraSpherical = {
    radius: 46,
    theta: 0, // góc xoay quanh trục Y
    phi: Math.PI / 3.2, // góc nâng lên hạ xuống
    target: new THREE.Vector3(0, 0, 0),
  };

  function setupMouseOrbitControls() {
    window.addEventListener('mousedown', (e) => {
      // Bỏ qua nếu click trúng UI HUD
      if (e.target.closest && (e.target.closest('.hud-top') || e.target.closest('.leaderboard-sidebar') || e.target.closest('.camera-bar') || e.target.closest('.trophy-card'))) {
        return;
      }
      isDraggingMouse = true;
      isUserInteracting = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingMouse) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      cameraSpherical.theta -= dx * 0.005;
      cameraSpherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraSpherical.phi - dy * 0.005));
    });

    window.addEventListener('mouseup', () => {
      isDraggingMouse = false;
    });

    // Lăn chuột zoom in/out
    window.addEventListener(
      'wheel',
      (e) => {
        // Nếu chuột đang rê trên danh sách BXH thì cho cuộn danh sách, không zoom camera
        if (e.target.closest && e.target.closest('.anglers-list')) {
          return;
        }
        isUserInteracting = true;
        const zoomDelta = e.deltaY * 0.04;
        cameraSpherical.radius = Math.max(8, Math.min(95, cameraSpherical.radius + zoomDelta));
      },
      { passive: true }
    );
  }

  function updateCamera(delta) {
    if (isUserInteracting) {
      // Người dùng đang điều khiển camera thủ công bằng chuột
      const sinPhiRadius = cameraSpherical.radius * Math.sin(cameraSpherical.phi);
      camera.position.x = cameraSpherical.target.x + sinPhiRadius * Math.sin(cameraSpherical.theta);
      camera.position.y = cameraSpherical.target.y + cameraSpherical.radius * Math.cos(cameraSpherical.phi);
      camera.position.z = cameraSpherical.target.z + sinPhiRadius * Math.cos(cameraSpherical.theta);
      camera.lookAt(cameraSpherical.target);
      return;
    }

    if (cameraMode === 'overview') {
      const time = performance.now() * 0.00015;
      const targetX = Math.sin(time) * 38;
      const targetZ = Math.cos(time) * 38;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.03);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 22, 0.03);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.03);
      camera.lookAt(0, 0, 0);
    } else if (cameraMode === 'top1') {
      // Focus on rank 1 angler
      const topAngler = anglers.length > 0 ? anglers[0] : null;
      if (topAngler) {
        const wp = topAngler.group.getWorldPosition(new THREE.Vector3());
        const camTarget = new THREE.Vector3(wp.x * 1.25, wp.y + 4.5, wp.z * 1.25);
        camera.position.lerp(camTarget, 0.04);
        camera.lookAt(wp.x * 0.6, 1.2, wp.z * 0.6);
      } else {
        cameraMode = 'overview';
      }
    } else if (cameraMode === 'water') {
      // Close to water surface looking across the lake
      camera.position.lerp(new THREE.Vector3(0, 1.8, 20), 0.04);
      camera.lookAt(0, 0.5, -8);
    } else if (cameraMode === 'fly') {
      // High bird-eye view straight down
      camera.position.lerp(new THREE.Vector3(0, 48, 1), 0.04);
      camera.lookAt(0, 0, 0);
    }
  }

  // ==================== ANIMATION LOOP ====================
  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // Procedural wave simulation on water plane
    if (waterGeom) {
      const pos = waterGeom.attributes.position;
      const time = now * 0.0025;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i);
        const w = pos.getZ(i);
        const dist = Math.hypot(u, w);
        if (dist < lakeRadius) {
          const wave =
            Math.sin(u * 0.35 + time * 1.5) * 0.12 +
            Math.cos(w * 0.4 + time * 1.2) * 0.1 +
            Math.sin((u + w) * 0.2 + time) * 0.08;
          pos.setY(i, wave);
        } else {
          pos.setY(i, 0);
        }
      }
      waterGeom.computeVertexNormals();
      pos.needsUpdate = true;
    }

    // Swimming fish underwater
    swimmingFish.forEach((fish) => {
      const ud = fish.userData;
      ud.angle += ud.speed * delta;
      fish.position.x = Math.cos(ud.angle) * ud.orbitRadius;
      fish.position.z = Math.sin(ud.angle) * ud.orbitRadius;
      fish.rotation.y = -ud.angle + (ud.speed > 0 ? Math.PI / 2 : -Math.PI / 2);

      // Tail wiggle & body roll
      const wiggle = Math.sin(now * 0.018 + ud.wiggleOffset) * 0.45;
      if (ud.tailPivot) {
        ud.tailPivot.rotation.y = wiggle;
      }
      fish.rotation.y += wiggle * 0.35;
      fish.rotation.z = Math.sin(now * 0.008 + ud.wiggleOffset) * 0.08;
    });

    updateAnglers(delta);
    updateSplashes(delta);
    updateCamera(delta);

    renderer.render(scene, camera);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ==================== WEBSOCKET BRIDGE ====================
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws?key=${encodeURIComponent(streamKey)}`;
  let ws = null;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', key: streamKey }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Forward to LiveOverlay HUD if available
        if (window.LiveOverlay && typeof window.LiveOverlay.handleMessage === 'function') {
          window.LiveOverlay.handleMessage(msg);
        }

        if (msg.type === 'INIT_STATE') {
          if (msg.settings) applySettings(msg.settings);
          if (Array.isArray(msg.userScores)) {
            msg.userScores.forEach((us) => {
              const a = anglers.find((x) => x.userData.name === us.name);
              if (a) {
                a.userData.score = us.score;
                a.userData.isVip = us.isVip || a.userData.isVip;
              }
            });
          }
          if (Array.isArray(msg.queue)) {
            waitingQueue = [...msg.queue];
            rebuildAnglersFromQueue();
          }
        } else if (msg.type === 'USER_SCORE_UPDATE' && msg.user) {
          const u = msg.user;
          const target = anglers.find((a) => a.userData.name === u.name);
          if (target) {
            target.userData.score = u.score;
            target.userData.interactionScore = u.score;
            if (u.isVip) target.userData.isVip = true;
            updateHUD();
          }
        } else if (msg.type === 'ADD_USER' && msg.user) {
          // Check if user already exists
          const existing = waitingQueue.find((u) => u.id === msg.user.id || u.name === msg.user.name);
          if (!existing) {
            waitingQueue.push(msg.user);
            rebuildAnglersFromQueue();
          } else {
            // Priority boost for VIP or gifts
            existing.isVip = !!msg.user.isVip || existing.isVip;
            const angler = anglers.find((a) => a.userData.name === existing.name);
            if (angler) {
              angler.userData.isVip = true;
              angler.state = 'BITING';
              angler.stateTimer = 0.5;
            }
          }
        } else if (msg.type === 'SET_QUEUE') {
          if (Array.isArray(msg.queue)) {
            waitingQueue = [...msg.queue];
            rebuildAnglersFromQueue();
          }
        } else if (msg.type === 'CLEAR_QUEUE') {
          waitingQueue = [];
          rebuildAnglersFromQueue();
        } else if (msg.type === 'ADD_LOG' && msg.log) {
          // Khi khán giả chat đúng hoặc tặng quà: tăng điểm tương tác -> tăng tỉ lệ cá to
          const activeAngler = anglers.find((a) => a.userData.name === msg.log.userName);
          if (activeAngler) {
            if (msg.log.type === 'gift') {
              activeAngler.userData.isVip = true;
              // Rút số xu từ text "(10 xu)"
              const match = (msg.log.message || '').match(/\((\d+)\s*xu\)/i);
              const dia = match ? parseInt(match[1], 10) : 10;
              activeAngler.userData.interactionScore = (activeAngler.userData.interactionScore || 0) + dia * 15 + 100;
              // Kích hoạt cắn câu cá khủng ngay lập tức
              activeAngler.state = 'BITING';
              activeAngler.stateTimer = 0.2;
              activeAngler.currentFish = rollFish(true, activeAngler.userData.interactionScore, 1.0 + Math.min(dia * 0.05, 3.0));
              playSound('fanfare');
            } else {
              // Comment / tương tác
              activeAngler.userData.interactionScore = (activeAngler.userData.interactionScore || 0) + 15;
              if (activeAngler.state === 'WAITING') {
                activeAngler.stateTimer = Math.min(activeAngler.stateTimer, 0.6);
              }
            }
          }
        } else if (msg.type === 'ACTION') {
          if (msg.action === 'cast_all') {
            anglers.forEach((a) => {
              a.state = 'BITING';
              a.stateTimer = 0.5 + Math.random() * 0.8;
            });
          } else if (msg.action === 'bite_vip') {
            const vips = anglers.filter((a) => a.userData.isVip);
            (vips.length > 0 ? vips : anglers).forEach((a) => {
              a.state = 'BITING';
              a.stateTimer = 0.2;
              a.currentFish = rollFish(true, 1.8);
            });
          } else if (msg.action === 'reset_scores') {
            totalFishCaught = 0;
            anglers.forEach((a) => {
              a.userData.score = 0;
              a.userData.totalCaught = 0;
              a.userData.biggestKg = 0;
            });
            updateHUD();
          } else if (msg.action === 'change_camera' && msg.value) {
            cameraMode = msg.value;
            document.querySelectorAll('.cam-btn').forEach((b) => {
              b.classList.toggle('active', b.dataset.cam === cameraMode);
            });
          }
        } else if (msg.type === 'SET_SETTINGS' && msg.settings) {
          applySettings(msg.settings);
        }
      } catch (err) {
        console.error('[Fishing3D] WS Error:', err);
      }
    };

    ws.onclose = () => setTimeout(connect, 2000);
  }

  function applySettings(s) {
    if (s.maxAnglers) {
      const val = parseInt(s.maxAnglers, 10);
      if (val > 0 && val !== maxAnglers) {
        maxAnglers = val;
        rebuildAnglersFromQueue();
      }
    }
    if (s.mapTheme && s.mapTheme !== currentMapTheme) {
      applyTheme(s.mapTheme);
    }
    if (s.catchSpeed) {
      catchSpeedMode = s.catchSpeed;
    }
    if (s.fishDensity) {
      fishDensity = parseInt(s.fishDensity, 10) || 30;
      updateFishSchool();
    }
    if (s.enableAudio !== undefined) {
      toggleAudio(Boolean(s.enableAudio));
    }
    if (s.showCameraBar !== undefined) {
      showCameraBarConfig = !!s.showCameraBar;
      if (cameraBar) {
        cameraBar.style.display = showCameraBarConfig ? 'flex' : 'none';
      }
      if (hudTopEl) {
        if (!showCameraBarConfig) hudTopEl.classList.add('hidden');
        else hudTopEl.classList.remove('hidden');
      }
      if (btnShowCam) {
        btnShowCam.style.display = 'none';
      }
    }
  }

  // ==================== BOOT ====================
  initThree();
  updateFishSchool();
  connect();
})();
