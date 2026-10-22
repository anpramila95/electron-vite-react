/**
 * ĐUA XE AVATAR 3D — GRAND PRIX TIKTOK LIVE (PRO V2)
 * Three.js 3D Procedural Racing Engine:
 * - Ultra-crisp bright avatar billboards (no fog dimming, full sRGB)
 * - Distinct Top 1-2-3 visuals (3D crowns, neon underglow, gold/silver/bronze trails)
 * - Dynamic race audio (engine revving, tire screeches, nitro whooshes, collision thuds)
 * - 3 Switchable Themes: Cyberpunk Neon, Desert Canyon, F1 Circuit
 * - Aggressive competitive physics (drafting/slipstream, lane dueling, lateral bumps)
 * - Camera bar toggle controls
 */

(function () {
  const canvas = document.getElementById('three-canvas');
  const params = new URLSearchParams(location.search);
  const streamKey = params.get('key') || 'live_default';

  // HUD Elements
  const hudLaps = document.getElementById('hud-laps');
  const hudStatus = document.getElementById('hud-status');
  const hudQueue = document.getElementById('hud-queue');
  const racersListEl = document.getElementById('racers-list');
  const nitroBanner = document.getElementById('nitro-banner');
  const nitroUserText = document.getElementById('nitro-user');
  const podiumModal = document.getElementById('podium-modal');
  const p1Name = document.getElementById('p1-name');
  const p1Avatar = document.getElementById('p1-avatar');
  const p2Name = document.getElementById('p2-name');
  const p2Avatar = document.getElementById('p2-avatar');
  const p3Name = document.getElementById('p3-name');
  const p3Avatar = document.getElementById('p3-avatar');
  const podiumTimer = document.getElementById('podium-next-timer');
  const cameraBar = document.getElementById('camera-bar');
  const btnHideCam = document.getElementById('btn-hide-cam');
  const btnShowCam = document.getElementById('btn-show-cam');

  // ==================== REALTIME RACE AUDIO SYNTHESIZER ====================
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let engineOsc = null;
  let engineGain = null;
  let enableAudio = true;
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const hudSoundText = document.getElementById('hud-sound-text');

  function toggleAudio(forceState) {
    if (typeof forceState === 'boolean') {
      enableAudio = forceState;
    } else {
      enableAudio = !enableAudio;
    }
    if (hudSoundText) {
      hudSoundText.textContent = enableAudio ? '🔊 BẬT' : '🔇 TẮT';
    }
    if (!enableAudio) {
      if (engineGain) {
        try {
          engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
        } catch (_) {}
      }
    } else {
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (engineGain && raceActive) {
          engineGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        }
      } catch (_) {}
    }
  }

  btnSoundToggle?.addEventListener('click', () => toggleAudio());

  function initEngineAudio() {
    try {
      if (!enableAudio) return;
      if (engineOsc) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      engineOsc = audioCtx.createOscillator();
      engineGain = audioCtx.createGain();

      engineOsc.type = 'sawtooth';
      engineOsc.frequency.setValueAtTime(65, audioCtx.currentTime);
      engineGain.gain.setValueAtTime(0.04, audioCtx.currentTime);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, audioCtx.currentTime);

      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();
    } catch (_) {}
  }

  function updateEngineSound(speedRatio) {
    if (!enableAudio || !engineOsc || !engineGain) return;
    try {
      const targetFreq = 55 + Math.min(speedRatio * 50, 180);
      engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
    } catch (_) {}
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.1) {
    if (!enableAudio) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function playTireScreech() {
    if (!enableAudio) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (_) {}
  }

  function playNitroSound() {
    if (!enableAudio) return;
    playTone(180, 0.4, 'sawtooth', 0.22);
    setTimeout(() => playTone(420, 0.5, 'triangle', 0.18), 80);
  }

  function playBumpSound() {
    if (!enableAudio) return;
    playTone(85, 0.18, 'square', 0.12);
  }

  function playWinFanfare() {
    if (!enableAudio) return;
    playTone(523.25, 0.25, 'triangle', 0.2);
    setTimeout(() => playTone(659.25, 0.25, 'triangle', 0.2), 150);
    setTimeout(() => playTone(783.99, 0.5, 'triangle', 0.25), 300);
    setTimeout(() => playTone(1046.50, 0.8, 'triangle', 0.3), 500);
  }

  // ==================== THREE.JS 3D SCENE ====================
  let scene, camera, renderer;
  let trackCurve;
  let trackMesh, railsMesh, railMat, groundMesh, envGroup;
  let dirLight, ambientLight;
  let racers = [];
  let waitingQueue = [];
  let cameraMode = 'chase';
  let raceActive = false;
  let raceFinished = false;
  let currentLap = 1;
  let maxLaps = 3;
  let racersPerHeat = 30;
  let baseSpeed = 1.8;
  let currentTheme = 'galaxy';
  let currentWeather = 'none';
  let showCameraBarConfig = true;
  let nitroBannerTimer = null;

  // Weather System
  let weatherParticles = null;
  let weatherGeo = null;
  let weatherSpeeds = [];

  const CAR_COLORS = [
    0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899,
    0x06b6d4, 0x84cc16, 0xf97316, 0x14b8a6, 0x6366f1, 0xd946ef,
    0xeab308, 0x0ea5e9, 0xa855f7, 0x22c55e, 0xf43f5e, 0x38bdf8,
    0x4ade80, 0xfb7185, 0x38bdf8, 0xa3e635, 0xc084fc, 0xf472b6
  ];

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.005);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 600);
    camera.position.set(0, 40, 70);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lighting
    ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(50, 80, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    buildRacetrack();
    buildEnvironment();
    initWeatherSystem();
    applyTheme(currentTheme);
    applyWeather(currentWeather);

    window.addEventListener('resize', onWindowResize);
    setupCameraControls();
    animate();
  }

  // ==================== WEATHER PARTICLE SYSTEM ====================
  function initWeatherSystem() {
    const particleCount = 1200;
    weatherGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    weatherSpeeds = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 400;
      positions[i * 3 + 1] = Math.random() * 90;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 400;
      weatherSpeeds.push({
        vy: 1 + Math.random() * 2,
        vx: (Math.random() - 0.5) * 0.8,
        vz: (Math.random() - 0.5) * 0.8,
        wobble: Math.random() * Math.PI * 2,
      });
    }

    weatherGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const weatherMat = new THREE.PointsMaterial({
      size: 1.4,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });

    weatherParticles = new THREE.Points(weatherGeo, weatherMat);
    weatherParticles.visible = false;
    scene.add(weatherParticles);
  }

  function applyWeather(weatherName) {
    currentWeather = weatherName || 'none';
    if (!weatherParticles) return;

    if (currentWeather === 'none') {
      weatherParticles.visible = false;
      return;
    }

    weatherParticles.visible = true;
    const mat = weatherParticles.material;

    if (currentWeather === 'rain') {
      mat.color.set(0x7dd3fc);
      mat.size = 1.6;
      mat.opacity = 0.8;
    } else if (currentWeather === 'snow') {
      mat.color.set(0xffffff);
      mat.size = 2.4;
      mat.opacity = 0.9;
    } else if (currentWeather === 'sandstorm') {
      mat.color.set(0xf59e0b);
      mat.size = 2.2;
      mat.opacity = 0.75;
    } else if (currentWeather === 'stars') {
      mat.color.set(0xfacc15);
      mat.size = 2.8;
      mat.opacity = 0.95;
    }
  }

  function updateWeather(dt) {
    if (!weatherParticles || !weatherParticles.visible || currentWeather === 'none') return;
    const positions = weatherGeo.attributes.position.array;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const sp = weatherSpeeds[i];
      if (currentWeather === 'rain') {
        positions[i * 3 + 1] -= sp.vy * dt * 110;
        positions[i * 3] += sp.vx * dt * 30;
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3 + 1] = 85 + Math.random() * 20;
          positions[i * 3] = (Math.random() - 0.5) * 400;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 400;
        }
      } else if (currentWeather === 'snow') {
        sp.wobble += dt * 2.5;
        positions[i * 3 + 1] -= sp.vy * dt * 16;
        positions[i * 3] += Math.sin(sp.wobble) * dt * 12;
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3 + 1] = 85;
        }
      } else if (currentWeather === 'sandstorm') {
        positions[i * 3] += sp.vy * dt * 140;
        positions[i * 3 + 1] -= dt * 8;
        if (positions[i * 3] > 200) {
          positions[i * 3] = -200;
          positions[i * 3 + 1] = Math.random() * 55;
        }
      } else if (currentWeather === 'stars') {
        sp.wobble += dt * 3;
        positions[i * 3 + 1] += Math.sin(sp.wobble) * dt * 4;
        positions[i * 3] += dt * 5;
        if (positions[i * 3] > 200) positions[i * 3] = -200;
      }
    }
    weatherGeo.attributes.position.needsUpdate = true;
  }

  function buildRacetrack() {
    const points = [
      new THREE.Vector3(0, 0, -85),
      new THREE.Vector3(65, 2, -65),
      new THREE.Vector3(95, 4, 0),
      new THREE.Vector3(75, 0, 75),
      new THREE.Vector3(10, 3, 95),
      new THREE.Vector3(-55, 0, 75),
      new THREE.Vector3(-95, 4, 20),
      new THREE.Vector3(-75, 1, -55),
      new THREE.Vector3(-20, 0, -80),
    ];

    trackCurve = new THREE.CatmullRomCurve3(points, true);

    const trackWidth = 15;
    const segments = 260;
    const trackGeo = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

      const pLeft = point.clone().add(binormal.clone().multiplyScalar(trackWidth / 2));
      const pRight = point.clone().add(binormal.clone().multiplyScalar(-trackWidth / 2));

      positions.push(pLeft.x, pLeft.y, pLeft.z);
      positions.push(pRight.x, pRight.y, pRight.z);
      uvs.push(0, t * 24);
      uvs.push(1, t * 24);
    }

    const indices = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }

    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    trackGeo.setIndex(indices);
    trackGeo.computeVertexNormals();

    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
      metalness: 0.1,
    });
    trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    // Guardrails
    railsMesh = new THREE.Group();
    railMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const innerPoints = [];
    const outerPoints = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      innerPoints.push(point.clone().add(binormal.clone().multiplyScalar(trackWidth / 2 + 0.5)).add(new THREE.Vector3(0, 0.8, 0)));
      outerPoints.push(point.clone().add(binormal.clone().multiplyScalar(-trackWidth / 2 - 0.5)).add(new THREE.Vector3(0, 0.8, 0)));
    }

    const railGeo1 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(innerPoints, true), 220, 0.3, 6, true);
    const railGeo2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outerPoints, true), 220, 0.3, 6, true);
    railsMesh.add(new THREE.Mesh(railGeo1, railMat));
    railsMesh.add(new THREE.Mesh(railGeo2, railMat));
    scene.add(railsMesh);

    // Finish Line Arch
    const startPoint = trackCurve.getPointAt(0);
    const archMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 });
    const archMesh = new THREE.Mesh(new THREE.BoxGeometry(trackWidth + 3, 6.5, 1.5), archMat);
    archMesh.position.copy(startPoint).add(new THREE.Vector3(0, 4.2, 0));
    archMesh.lookAt(trackCurve.getPointAt(0.01));
    scene.add(archMesh);
  }

  function buildEnvironment() {
    const groundGeo = new THREE.PlaneGeometry(550, 550);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x050811, roughness: 0.95 });
    groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.2;
    scene.add(groundMesh);

    envGroup = new THREE.Group();
    scene.add(envGroup);
  }

  // Dynamic Terrain Themes (Galaxy / Mars / Arctic / Cyberpunk Neon / Desert Canyon / F1 Circuit)
  function applyTheme(themeName) {
    currentTheme = themeName || 'galaxy';

    // Clear environment items
    while (envGroup.children.length > 0) {
      envGroup.remove(envGroup.children[0]);
    }

    if (currentTheme === 'galaxy') {
      scene.background.set(0x02020a);
      scene.fog.color.set(0x02020a);
      scene.fog.density = 0.002;
      dirLight.color.set(0x38bdf8);
      dirLight.intensity = 2.4;
      ambientLight.color.set(0xc084fc);
      ambientLight.intensity = 1.6;

      trackMesh.material.color.set(0x0a0f1d);
      groundMesh.material.color.set(0x02040a);
      if (railMat) railMat.color.set(0xa855f7);

      // 1. Giant Saturn-like Planet with Orbiting Ring
      const saturnGroup = new THREE.Group();
      const saturnBody = new THREE.Mesh(
        new THREE.SphereGeometry(28, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.6, metalness: 0.2 })
      );
      const ringGeo = new THREE.RingGeometry(34, 56, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xd97706, side: THREE.DoubleSide });
      const saturnRing = new THREE.Mesh(ringGeo, ringMat);
      saturnRing.rotation.x = Math.PI / 2.8;
      saturnGroup.add(saturnBody);
      saturnGroup.add(saturnRing);
      saturnGroup.position.set(180, 85, -220);
      envGroup.add(saturnGroup);

      // 2. Terra Blue Planet
      const terraPlanet = new THREE.Mesh(
        new THREE.SphereGeometry(18, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5, metalness: 0.3 })
      );
      terraPlanet.position.set(-190, 70, 180);
      envGroup.add(terraPlanet);

      // 3. Purple Nebula Moon
      const purpleMoon = new THREE.Mesh(
        new THREE.SphereGeometry(10, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.7 })
      );
      purpleMoon.position.set(90, 95, 200);
      envGroup.add(purpleMoon);

      // 4. Floating Asteroids Belt
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9, metalness: 0.2 });
      for (let i = 0; i < 35; i++) {
        const rad = 100 + Math.random() * 110;
        const angle = Math.random() * Math.PI * 2;
        const h = 6 + Math.random() * 32;
        const size = 5 + Math.random() * 9;
        const asteroid = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 1), rockMat);
        asteroid.position.set(Math.cos(angle) * rad, h, Math.sin(angle) * rad);
        asteroid.rotation.set(Math.random(), Math.random(), Math.random());
        envGroup.add(asteroid);
      }

      // 5. Orbital Space Relay Station
      const stationGroup = new THREE.Group();
      const stationHub = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 4, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 })
      );
      stationGroup.add(stationHub);
      const solarMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
      for (let i = -1; i <= 1; i += 2) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 6), solarMat);
        wing.position.set(i * 12, 0, 0);
        stationGroup.add(wing);
      }
      stationGroup.position.set(0, 48, 0);
      envGroup.add(stationGroup);
    } else if (currentTheme === 'mars') {
      scene.background.set(0x2d0c03);
      scene.fog.color.set(0x2d0c03);
      scene.fog.density = 0.0035;
      dirLight.color.set(0xffedd5);
      dirLight.intensity = 2.2;
      ambientLight.color.set(0x9a3412);
      ambientLight.intensity = 1.8;

      trackMesh.material.color.set(0x3a1407);
      groundMesh.material.color.set(0x7c2d12);
      if (railMat) railMat.color.set(0xf97316);

      // 1. Martian Red Sun & Phobos Moons
      const marsSun = new THREE.Mesh(
        new THREE.SphereGeometry(16, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xfed7aa })
      );
      marsSun.position.set(150, 60, -220);
      envGroup.add(marsSun);

      const phobos = new THREE.Mesh(
        new THREE.DodecahedronGeometry(8, 1),
        new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 })
      );
      phobos.position.set(-130, 85, 140);
      envGroup.add(phobos);

      // 2. Colony Bio-Domes (Geodesic Domes)
      const domeMat = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.65,
        roughness: 0.1,
        metalness: 0.9,
      });
      const domeBaseMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
      const domePositions = [
        [70, 0, -50, 16],
        [-80, 0, 50, 14],
        [0, 0, 80, 12],
      ];
      domePositions.forEach(([x, y, z, r]) => {
        const dGroup = new THREE.Group();
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 1, r + 1, 2, 16), domeBaseMat);
        base.position.y = 1;
        dGroup.add(dome);
        dGroup.add(base);
        dGroup.position.set(x, y, z);
        envGroup.add(dGroup);
      });

      // 3. Mars Rovers beside the track
      const roverMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.7 });
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
      for (let k = 0; k < 2; k++) {
        const rover = new THREE.Group();
        const rBody = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6), roverMat);
        rBody.position.y = 2.2;
        rover.add(rBody);
        const rMast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4), roverMat);
        rMast.position.set(0, 4.5, 2);
        rover.add(rMast);
        const rPanel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0x0284c7 }));
        rPanel.position.set(0, 3.4, -0.5);
        rover.add(rPanel);
        rover.position.set(k === 0 ? 45 : -45, 0, k === 0 ? 30 : -30);
        rover.rotation.y = k * Math.PI;
        envGroup.add(rover);
      }

      // 4. Martian Basalt Boulders
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.95 });
      for (let i = 0; i < 35; i++) {
        const rad = 105 + Math.random() * 85;
        const angle = Math.random() * Math.PI * 2;
        const h = 12 + Math.random() * 35;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(8 + Math.random() * 10, 1), rockMat);
        rock.scale.set(1, h / 12, 1);
        rock.position.set(Math.cos(angle) * rad, h / 2 - 2, Math.sin(angle) * rad);
        envGroup.add(rock);
      }
    } else if (currentTheme === 'arctic') {
      scene.background.set(0x0c1e33);
      scene.fog.color.set(0x0c1e33);
      scene.fog.density = 0.003;
      dirLight.color.set(0xf0fdfa);
      dirLight.intensity = 2.6;
      ambientLight.color.set(0x7dd3fc);
      ambientLight.intensity = 1.7;

      trackMesh.material.color.set(0x1e293b);
      groundMesh.material.color.set(0xf8fafc);
      if (railMat) railMat.color.set(0x38bdf8);

      // 1. Crystal Glaciers & Icebergs
      const iceMat = new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        roughness: 0.15,
        metalness: 0.3,
        transparent: true,
        opacity: 0.9,
      });
      for (let i = 0; i < 30; i++) {
        const rad = 105 + Math.random() * 95;
        const angle = Math.random() * Math.PI * 2;
        const h = 18 + Math.random() * 45;
        const r = 8 + Math.random() * 12;
        const iceberg = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), iceMat);
        iceberg.position.set(Math.cos(angle) * rad, h / 2 - 1, Math.sin(angle) * rad);
        iceberg.rotation.y = Math.random() * Math.PI;
        envGroup.add(iceberg);
      }

      // 2. Polar Research Station Outpost
      const outpostMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5 });
      const hut = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), outpostMat);
      hut.position.set(-50, 2.5, 40);
      const hutRadar = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hutRadar.position.set(-50, 6.5, 40);
      envGroup.add(hut);
      envGroup.add(hutRadar);
    } else if (currentTheme === 'desert') {
      scene.background.set(0x382312);
      scene.fog.color.set(0x382312);
      scene.fog.density = 0.0035;
      dirLight.color.set(0xffeedd);
      ambientLight.color.set(0xffe0bb);

      trackMesh.material.color.set(0x5c3619);
      groundMesh.material.color.set(0x9a4b18);
      if (railMat) railMat.color.set(0xfbbf24);

      // Red canyon rock boulders
      const rockMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
      for (let i = 0; i < 35; i++) {
        const rad = 110 + Math.random() * 80;
        const angle = Math.random() * Math.PI * 2;
        const h = 20 + Math.random() * 45;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(12 + Math.random() * 12, 1), rockMat);
        rock.scale.set(1, h / 15, 1);
        rock.position.set(Math.cos(angle) * rad, h / 2 - 2, Math.sin(angle) * rad);
        envGroup.add(rock);
      }

      // Giant Saguaro Cacti
      const cactusMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
      for (let i = 0; i < 16; i++) {
        const rad = 95 + Math.random() * 60;
        const angle = Math.random() * Math.PI * 2;
        const cGroup = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 12, 8), cactusMat);
        trunk.position.y = 6;
        cGroup.add(trunk);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 6), cactusMat);
        arm.position.set(1.8, 7, 0);
        cGroup.add(arm);
        cGroup.position.set(Math.cos(angle) * rad, 0, Math.sin(angle) * rad);
        envGroup.add(cGroup);
      }
    } else if (currentTheme === 'circuit') {
      scene.background.set(0x0f172a);
      scene.fog.color.set(0x0f172a);
      scene.fog.density = 0.0035;
      dirLight.color.set(0xffffff);
      ambientLight.color.set(0xe2e8f0);

      trackMesh.material.color.set(0x1e293b);
      groundMesh.material.color.set(0x15803d);
      if (railMat) railMat.color.set(0xef4444);

      // Stadium floodlights
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 });
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      for (let i = 0; i < 14; i++) {
        const t = i / 14;
        const pt = trackCurve.getPointAt(t);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 28), poleMat);
        pole.position.set(pt.x * 1.35, 14, pt.z * 1.35);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2), lampMat);
        lamp.position.set(pt.x * 1.35, 28, pt.z * 1.35);
        envGroup.add(pole);
        envGroup.add(lamp);
      }

      // Grandstands
      const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      for (let s = 0; s < 3; s++) {
        const stand = new THREE.Mesh(new THREE.BoxGeometry(35, 12, 10), standMat);
        const t = (s * 0.3 + 0.1) % 1.0;
        const pt = trackCurve.getPointAt(t);
        stand.position.set(pt.x * 1.45, 6, pt.z * 1.45);
        stand.lookAt(pt);
        envGroup.add(stand);
      }
    } else {
      // Default Cyberpunk Neon
      scene.background.set(0x060913);
      scene.fog.color.set(0x060913);
      scene.fog.density = 0.0045;
      dirLight.color.set(0xffffff);
      ambientLight.color.set(0x818cf8);

      trackMesh.material.color.set(0x111827);
      groundMesh.material.color.set(0x050811);
      if (railMat) railMat.color.set(0x06b6d4);

      // Cyberpunk Skyscrapers
      const bldMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
      for (let i = 0; i < 45; i++) {
        const w = 8 + Math.random() * 14;
        const h = 25 + Math.random() * 70;
        const d = 8 + Math.random() * 14;
        const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldMat);
        const angle = Math.random() * Math.PI * 2;
        const rad = 110 + Math.random() * 100;
        bld.position.set(Math.cos(angle) * rad, h / 2, Math.sin(angle) * rad);
        envGroup.add(bld);
      }

      // Floating Neon Rings
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xec4899 });
      for (let r = 0; r < 6; r++) {
        const t = (r / 6);
        const pt = trackCurve.getPointAt(t);
        const neonRing = new THREE.Mesh(new THREE.TorusGeometry(12, 0.4, 8, 24), ringMat);
        neonRing.position.set(pt.x, 8, pt.z);
        neonRing.lookAt(trackCurve.getPointAt((t + 0.01) % 1.0));
        envGroup.add(neonRing);
      }
    }
  }

  // ==================== 3D CAR & AVATAR BILLBOARD ====================
  function create3DCar(userData, index) {
    const car = new THREE.Group();
    const color = CAR_COLORS[index % CAR_COLORS.length];

    // Streamlined aerodynamic sports car body
    const bodyGeo = new THREE.BoxGeometry(2.4, 0.75, 4.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.7,
      roughness: 0.25,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    car.add(body);

    // Front Nose hood taper
    const noseGeo = new THREE.BoxGeometry(2.2, 0.45, 1.4);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.position.set(0, 0.48, 2.2);
    car.add(nose);

    // Cockpit / Tinted Windshield
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.65, 2.0);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, metalness: 0.9, roughness: 0.1 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.15, -0.2);
    car.add(cabin);

    // Rear Spoiler
    const spoilerGeo = new THREE.BoxGeometry(2.4, 0.12, 0.8);
    const spoiler = new THREE.Mesh(spoilerGeo, bodyMat);
    spoiler.position.set(0, 1.45, -1.9);
    car.add(spoiler);

    // 4 Wheels with Rims
    const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.42, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 });
    const wheels = [];
    const offsets = [
      [-1.32, 0.48, 1.4],
      [1.32, 0.48, 1.4],
      [-1.32, 0.48, -1.4],
      [1.32, 0.48, -1.4],
    ];

    offsets.forEach((pos) => {
      const wGroup = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.44, 8), rimMat);
      rim.rotation.z = Math.PI / 2;
      wGroup.add(tire);
      wGroup.add(rim);
      wGroup.position.set(pos[0], pos[1], pos[2]);
      car.add(wGroup);
      wheels.push(wGroup);
    });

    // Bright Headlights
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd });
    const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), hlMat);
    const hl2 = hl1.clone();
    hl1.position.set(-0.8, 0.55, 2.85);
    hl2.position.set(0.8, 0.55, 2.85);
    car.add(hl1);
    car.add(hl2);

    // Dual Exhaust Nitro Flamer
    const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0 });
    const flameGeo = new THREE.ConeGeometry(0.3, 1.6, 8);
    const flame1 = new THREE.Mesh(flameGeo, exhaustMat);
    const flame2 = flame1.clone();
    flame1.rotation.x = -Math.PI / 2;
    flame2.rotation.x = -Math.PI / 2;
    flame1.position.set(-0.6, 0.5, -2.8);
    flame2.position.set(0.6, 0.5, -2.8);
    car.add(flame1);
    car.add(flame2);

    // Neon Underglow Light for Top racers
    const underLight = new THREE.PointLight(0x38bdf8, 0, 10);
    underLight.position.set(0, 0.3, 0);
    car.add(underLight);

    // 3D Floating Gold Crown Mesh for Top 1
    const crownGroup = create3DCrownMesh();
    crownGroup.position.set(0, 4.6, 0);
    crownGroup.visible = false;
    car.add(crownGroup);

    // Crystal Clear High-Contrast Avatar Billboard
    const avatarPlane = createAvatarBillboard(userData.photoUrl, userData.name, !!userData.isVip);
    avatarPlane.position.set(0, 3.2, 0);
    car.add(avatarPlane);

    // Multi-row starting grid calculation (4 cars per row across 15m track)
    const cols = 4;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const startLane = (col - (cols - 1) / 2) * 2.8;

    return {
      mesh: car,
      flame1: flame1,
      flame2: flame2,
      wheels: wheels,
      underLight: underLight,
      crownMesh: crownGroup,
      userData: userData,
      progress: -0.010 * (row + 1),
      laneOffset: startLane,
      targetLane: startLane,
      currentSpeed: baseSpeed * (0.95 + Math.random() * 0.1),
      targetSpeed: baseSpeed,
      nitroTimer: 0,
      bumpTimer: 0,
      personality: 0.9 + Math.random() * 0.25, // AI individual speed behavior
      laneSwitchTimer: 1.5 + Math.random() * 3,
      currentRank: index + 1,
      finished: false,
    };
  }

  // 3D Floating Crown Mesh
  function create3DCrownMesh() {
    const crown = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.15,
    });

    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.75, 0.3, 16), goldMat);
    crown.add(baseRing);

    // 5 Crown Spikes
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), goldMat);
      spike.position.set(Math.cos(angle) * 0.75, 0.45, Math.sin(angle) * 0.75);
      crown.add(spike);
    }
    return crown;
  }

  // Crystal-Clear Avatar Billboard (Unlit, zero-fog, 100% bright sRGB)
  function createAvatarBillboard(photoUrl, name, isVip) {
    const canvasObj = document.createElement('canvas');
    canvasObj.width = 180;
    canvasObj.height = 180;
    const ctx = canvasObj.getContext('2d');

    // Solid Crisp Border with Halo
    ctx.beginPath();
    ctx.arc(90, 80, 68, 0, Math.PI * 2);
    ctx.fillStyle = isVip ? '#f59e0b' : '#38bdf8';
    ctx.fill();

    // White Inner Contrast Ring
    ctx.beginPath();
    ctx.arc(90, 80, 64, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Clipped Avatar Circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(90, 80, 60, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 180, 180);

    const tex = new THREE.CanvasTexture(canvasObj);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;

    function drawNamePlate() {
      ctx.restore();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
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
        drawNamePlate();
      };
      img.src = photoUrl;
    } else {
      drawNamePlate();
    }

    // Crucial: fog = false, toneMapped = false guarantees 100% full brightness!
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      fog: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.8, 3.8, 1);
    return sprite;
  }

  // ==================== HEAT & RACE LIFECYCLE ====================
  function prepareNewHeat() {
    raceFinished = false;
    raceActive = false;
    currentLap = 1;
    podiumModal.classList.remove('show');
    hudStatus.textContent = 'SẴN SÀNG';
    hudStatus.className = 'status-ready';

    racers.forEach((r) => scene.remove(r.mesh));
    racers = [];

    // 1. Sort all candidates by priority & VIP (highest score first)
    waitingQueue.sort((a, b) => {
      const pA = (a.priority || 0) + (a.isVip ? 5000 : 0);
      const pB = (b.priority || 0) + (b.isVip ? 5000 : 0);
      return pB - pA;
    });

    // 2. Select top racers up to racersPerHeat (default 30)
    const heatRacers = waitingQueue.splice(0, racersPerHeat);

    // 3. Clear remainder of queue so it never balloons!
    waitingQueue.length = 0;

    // 4. Notify server to CLEAR_QUEUE so database queue in app resets
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'CLEAR_QUEUE',
        streamKey: streamKey,
      }));
    }

    // 5. Fill with bot racers if fewer than racersPerHeat (or minimum 8 if racersPerHeat is large)
    const minSlots = Math.min(racersPerHeat, Math.max(8, heatRacers.length));
    while (heatRacers.length < minSlots) {
      const idx = heatRacers.length + 1;
      heatRacers.push({
        id: `bot_${Date.now()}_${idx}`,
        name: `Tay Đua #${idx}`,
        photoUrl: '',
        isVip: false,
        priority: 0,
      });
    }

    heatRacers.forEach((userData, i) => {
      const racer = create3DCar(userData, i);
      updateCarPosition(racer);
      scene.add(racer.mesh);
      racers.push(racer);
    });

    updateHUD();
    renderLeaderboard();

    setTimeout(() => {
      startRace();
    }, 2500);
  }

  function startRace() {
    if (raceActive) return;
    initEngineAudio();
    raceActive = true;
    hudStatus.textContent = 'ĐANG ĐUA 🏁';
    hudStatus.className = 'status-racing';

    // 3..2..1..GO buzzer
    playTone(440, 0.2, 'square', 0.25);
    setTimeout(() => playTone(440, 0.2, 'square', 0.25), 400);
    setTimeout(() => playTone(880, 0.5, 'square', 0.35), 800);
  }

  function triggerNitro(racer, intensity = 1.6) {
    if (!racer || racer.finished) return;
    racer.nitroTimer = 4.0;
    racer.targetSpeed = baseSpeed * (1.8 + intensity * 0.4);
    playNitroSound();

    nitroUserText.textContent = racer.userData.name;
    nitroBanner.classList.add('show');
    if (nitroBannerTimer) clearTimeout(nitroBannerTimer);
    nitroBannerTimer = setTimeout(() => {
      nitroBanner.classList.remove('show');
    }, 2500);
  }

  function triggerNitroAll() {
    racers.forEach((r) => triggerNitro(r, 1.2));
  }

  // Update dynamic position & ranking decorations
  function updateCarPosition(racer) {
    const totalProg = Math.max(0, racer.progress);
    const lapT = totalProg % 1.0;
    const point = trackCurve.getPointAt(lapT);
    const tangent = trackCurve.getTangentAt(lapT).normalize();
    const normal = new THREE.Vector3(0, 1, 0);
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    const finalPos = point.clone().add(binormal.clone().multiplyScalar(racer.laneOffset));
    finalPos.y += 0.1;
    racer.mesh.position.copy(finalPos);

    const lookAtPos = finalPos.clone().add(tangent);
    racer.mesh.lookAt(lookAtPos);

    racer.wheels.forEach((w) => {
      w.rotation.x += racer.currentSpeed * 0.12;
    });

    // Exhaust nitro flames
    if (racer.nitroTimer > 0) {
      const op = 0.85 + Math.random() * 0.15;
      racer.flame1.material.opacity = op;
      racer.flame2.material.opacity = op;
      const sc = 1 + Math.random() * 0.5;
      racer.flame1.scale.set(sc, sc, 1);
      racer.flame2.scale.set(sc, sc, 1);
    } else {
      racer.flame1.material.opacity = 0;
      racer.flame2.material.opacity = 0;
    }

    // Top 1 Golden Crown & Underglow
    if (racer.currentRank === 1) {
      racer.crownMesh.visible = true;
      racer.crownMesh.rotation.y += 0.04;
      racer.underLight.color.set(0xfacc15);
      racer.underLight.intensity = 2.5;
    } else if (racer.currentRank === 2) {
      racer.crownMesh.visible = false;
      racer.underLight.color.set(0x38bdf8);
      racer.underLight.intensity = 1.8;
    } else if (racer.currentRank === 3) {
      racer.crownMesh.visible = false;
      racer.underLight.color.set(0xf97316);
      racer.underLight.intensity = 1.5;
    } else {
      racer.crownMesh.visible = false;
      racer.underLight.intensity = 0;
    }
  }

  function onRaceFinished() {
    raceActive = false;
    raceFinished = true;
    hudStatus.textContent = 'KẾT THÚC';
    playWinFanfare();

    const sorted = [...racers].sort((a, b) => b.progress - a.progress);
    const p1 = sorted[0];
    const p2 = sorted[1];
    const p3 = sorted[2];

    if (p1) {
      p1Name.textContent = p1.userData.name;
      p1Avatar.src = p1.userData.photoUrl || '';
    }
    if (p2) {
      p2Name.textContent = p2.userData.name;
      p2Avatar.src = p2.userData.photoUrl || '';
    }
    if (p3) {
      p3Name.textContent = p3.userData.name;
      p3Avatar.src = p3.userData.photoUrl || '';
    }

    podiumModal.classList.add('show');

    sorted.forEach((r) => {
      if (r.userData.id && !String(r.userData.id).startsWith('bot_')) {
        notifyUserFinished(r.userData.id);
      }
    });

    // Also tell server to clear queue completely after heat
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'CLEAR_QUEUE',
        streamKey: streamKey,
      }));
    }

    let sec = 6;
    const cd = setInterval(() => {
      sec--;
      podiumTimer.innerHTML = `Chặng tiếp theo sẽ bắt đầu sau: <b>${sec}s</b>`;
      if (sec <= 0) {
        clearInterval(cd);
        prepareNewHeat();
      }
    }, 1000);
  }

  function notifyUserFinished(userId) {
    if (ws && ws.readyState === WebSocket.OPEN && userId) {
      ws.send(JSON.stringify({
        type: 'USER_PRINTED',
        streamKey: streamKey,
        userId: userId,
      }));
    }
  }

  function updateHUD() {
    hudLaps.textContent = `${Math.min(currentLap, maxLaps)} / ${maxLaps}`;
    hudQueue.textContent = `${racers.length || racersPerHeat} Xe`;
  }

  function renderLeaderboard() {
    const sorted = [...racers].sort((a, b) => b.progress - a.progress);
    racersListEl.innerHTML = sorted.map((r, i) => {
      r.currentRank = i + 1;
      const isLead = i === 0;
      const isNitro = r.nitroTimer > 0;
      const rankBadge = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      return `
        <div class="racer-row ${isLead ? 'rank-1' : ''} ${isNitro ? 'is-nitro' : ''}">
          <span class="racer-pos">${rankBadge}</span>
          <img class="racer-img" src="${r.userData.photoUrl || '/api/proxy-img?url='}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 32 32\\'><circle cx=\\'16\\' cy=\\'16\\' r=\\'16\\' fill=\\'%23334155\\'/></svg>'" alt="" />
          <span class="racer-name">${r.userData.name}</span>
          <span class="racer-nitro-tag">⚡ NITRO</span>
        </div>
      `;
    }).join('');
  }

  // Camera Management & Toggle
  function updateCamera() {
    if (racers.length === 0) return;
    const leadRacer = [...racers].sort((a, b) => b.progress - a.progress)[0];
    const carPos = leadRacer.mesh.position;

    if (cameraMode === 'chase') {
      const targetCamPos = carPos.clone().add(new THREE.Vector3(0, 9, 16));
      camera.position.lerp(targetCamPos, 0.08);
      camera.lookAt(carPos.clone().add(new THREE.Vector3(0, 1.5, -4)));
    } else if (cameraMode === 'fly') {
      camera.position.set(0, 85, 95);
      camera.lookAt(0, 0, 0);
    } else if (cameraMode === 'side') {
      camera.position.set(50, 16, 30);
      camera.lookAt(carPos);
    } else if (cameraMode === 'cockpit') {
      const hoodPos = carPos.clone().add(new THREE.Vector3(0, 1.8, -1.2));
      camera.position.copy(hoodPos);
      camera.lookAt(carPos.clone().add(new THREE.Vector3(0, 1.5, -12)));
    }
  }

  function setupCameraControls() {
    document.querySelectorAll('.cam-btn:not(.cam-close-btn)').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        cameraMode = btn.dataset.cam;
      });
    });

    btnHideCam?.addEventListener('click', () => {
      cameraBar.style.display = 'none';
      if (btnShowCam) btnShowCam.style.display = 'block';
    });

    btnShowCam?.addEventListener('click', () => {
      cameraBar.style.display = 'flex';
      btnShowCam.style.display = 'none';
    });
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ==================== AGGRESSIVE RACING & BUMPING PHYSICS ====================
  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.08);
    lastTime = now;

    if (raceActive && !raceFinished) {
      let maxProg = 0;

      // 1. Physics update for each car
      racers.forEach((racer) => {
        // Nitro decay
        if (racer.nitroTimer > 0) {
          racer.nitroTimer -= dt;
          if (racer.nitroTimer <= 0) {
            racer.targetSpeed = baseSpeed * racer.personality;
          }
        } else {
          // Dynamic AI speed fluctuation (+/- 15%)
          racer.targetSpeed = baseSpeed * racer.personality * (0.95 + Math.sin(now * 0.002 + racer.laneOffset) * 0.12);
        }

        // 2. Slipstream / Drafting: if right behind another car, boost speed!
        racers.forEach((other) => {
          if (other === racer) return;
          const diff = other.progress - racer.progress;
          const laneDiff = Math.abs(other.laneOffset - racer.laneOffset);
          if (diff > 0.005 && diff < 0.035 && laneDiff < 1.2) {
            // In draft tunnel!
            racer.targetSpeed *= 1.25;
            // Attempt lane change to overtake
            racer.laneSwitchTimer -= dt * 3;
          }
        });

        // 3. Lane switching AI
        racer.laneSwitchTimer -= dt;
        if (racer.laneSwitchTimer <= 0) {
          racer.laneSwitchTimer = 2.0 + Math.random() * 3.5;
          const randomLane = (Math.floor(Math.random() * 5) - 2) * 1.6;
          racer.targetLane = Math.max(-5.5, Math.min(5.5, randomLane));
        }

        racer.laneOffset += (racer.targetLane - racer.laneOffset) * dt * 2.5;

        // Smooth speed acceleration/deceleration
        racer.currentSpeed += (racer.targetSpeed - racer.currentSpeed) * dt * 3.0;

        // Progress increment around track spline
        const deltaProg = racer.currentSpeed * dt * 0.038;
        racer.progress += deltaProg;
        updateCarPosition(racer);

        if (racer.progress > maxProg) {
          maxProg = racer.progress;
        }
      });

      // 4. Lateral Bumping & Collision physics between cars
      for (let i = 0; i < racers.length; i++) {
        for (let j = i + 1; j < racers.length; j++) {
          const r1 = racers[i];
          const r2 = racers[j];
          const dist = r1.mesh.position.distanceTo(r2.mesh.position);
          if (dist < 2.8) {
            // Collision bump!
            const push = (2.8 - dist) * 0.6;
            if (r1.laneOffset < r2.laneOffset) {
              r1.laneOffset -= push;
              r2.laneOffset += push;
            } else {
              r1.laneOffset += push;
              r2.laneOffset -= push;
            }
            playBumpSound();
            playTireScreech();
          }
        }
      }

      // Update engine audio pitch with leader
      updateEngineSound(maxProg * 10);

      // Check lap progression
      const leadLap = Math.floor(maxProg) + 1;
      if (leadLap !== currentLap && leadLap <= maxLaps) {
        currentLap = leadLap;
        playTone(660, 0.25, 'triangle', 0.2);
        updateHUD();
      }

      if (maxProg >= maxLaps) {
        onRaceFinished();
      }

      renderLeaderboard();
    }

    updateWeather(dt);
    updateCamera();
    renderer.render(scene, camera);
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

        if (window.LiveOverlay && typeof window.LiveOverlay.handleMessage === 'function') {
          window.LiveOverlay.handleMessage(msg);
        }

        if (msg.type === 'INIT_STATE') {
          if (msg.settings) applySettings(msg.settings);
          if (Array.isArray(msg.queue)) {
            waitingQueue = [...msg.queue];
            updateHUD();
          }
          prepareNewHeat();
        } else if (msg.type === 'ADD_USER' && msg.user) {
          waitingQueue.push(msg.user);
          updateHUD();

          const activeRacer = racers.find((r) => r.userData.id === msg.user.id || r.userData.name === msg.user.name);
          if (activeRacer) {
            triggerNitro(activeRacer, 2.2);
          }
        } else if (msg.type === 'ADD_LOG' && msg.log) {
          const activeRacer = racers.find((r) => r.userData.name === msg.log.userName);
          if (activeRacer) {
            triggerNitro(activeRacer, msg.log.type === 'gift' ? 2.5 : 1.3);
          }
        } else if (msg.type === 'ACTION') {
          if (msg.action === 'start_race') {
            startRace();
          } else if (msg.action === 'nitro_all') {
            triggerNitroAll();
          } else if (msg.action === 'reset_race') {
            prepareNewHeat();
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
        console.error('[Racing3D] WS Error:', err);
      }
    };

    ws.onclose = () => setTimeout(connect, 2000);
  }

  function applySettings(s) {
    if (s.laps) maxLaps = parseInt(s.laps, 10) || 3;
    if (s.racersPerHeat) racersPerHeat = parseInt(s.racersPerHeat, 10) || 30;
    if (s.speed) baseSpeed = parseFloat(s.speed) || 1.8;
    if (s.trackTheme && s.trackTheme !== currentTheme) {
      applyTheme(s.trackTheme);
    }
    if (s.weather !== undefined && s.weather !== currentWeather) {
      applyWeather(s.weather);
    }
    if (s.enableAudio !== undefined) {
      toggleAudio(Boolean(s.enableAudio));
    }
    if (s.showCameraBar !== undefined) {
      showCameraBarConfig = !!s.showCameraBar;
      if (cameraBar) {
        cameraBar.style.display = showCameraBarConfig ? 'flex' : 'none';
      }
      if (btnShowCam) {
        btnShowCam.style.display = 'none';
      }
    }
    updateHUD();
  }

  // Boot
  initThree();
  connect();
})();
