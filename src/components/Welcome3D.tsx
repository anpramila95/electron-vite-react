import React, { useEffect, useRef } from 'react'

interface Welcome3DProps {
  onOpenCreate: (templateId?: string) => void
  onOpenSettings?: () => void
}

export const Welcome3D: React.FC<Welcome3DProps> = ({ onOpenCreate, onOpenSettings }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const THREE = (window as any).THREE
    if (!THREE || !canvasRef.current || !containerRef.current) return

    let animId: number
    const canvas = canvasRef.current
    const container = containerRef.current

    // Scene & Camera
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030712, 0.0035)

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 5, 45)

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambientLight)

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 2.5)
    dirLight1.position.set(30, 40, 30)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0xf43f5e, 2.0)
    dirLight2.position.set(-30, -20, 20)
    scene.add(dirLight2)

    // Center Core Group
    const coreGroup = new THREE.Group()
    scene.add(coreGroup)

    // Inner Gem
    const innerGeo = new THREE.IcosahedronGeometry(7, 0)
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0369a1,
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.2,
      wireframe: false,
    })
    const innerMesh = new THREE.Mesh(innerGeo, innerMat)
    coreGroup.add(innerMesh)

    // Wireframe Outer Cage
    const cageGeo = new THREE.IcosahedronGeometry(10.5, 1)
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    })
    const cageMesh = new THREE.Mesh(cageGeo, cageMat)
    coreGroup.add(cageMesh)

    // Gyroscope Neon Rings
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide })
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(14, 0.25, 12, 64), ringMat1)
    coreGroup.add(ring1)

    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide })
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(17, 0.25, 12, 64), ringMat2)
    ring2.rotation.x = Math.PI / 2.5
    coreGroup.add(ring2)

    const ringMat3 = new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide })
    const ring3 = new THREE.Mesh(new THREE.TorusGeometry(20, 0.2, 12, 64), ringMat3)
    ring3.rotation.y = Math.PI / 3
    coreGroup.add(ring3)

    // Orbiting Satellites (4 Interactive Template Orbs)
    const orbGroup = new THREE.Group()
    scene.add(orbGroup)

    const orbsData = [
      { color: 0xef4444, rad: 26, speed: 0.8, phase: 0 },
      { color: 0x10b981, rad: 29, speed: -0.6, phase: Math.PI * 0.5 },
      { color: 0xfbbf24, rad: 32, speed: 0.7, phase: Math.PI },
      { color: 0xa855f7, rad: 35, speed: -0.5, phase: Math.PI * 1.5 },
    ]

    const orbMeshes = orbsData.map((d) => {
      const g = new THREE.Group()
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 16, 16),
        new THREE.MeshStandardMaterial({
          color: d.color,
          emissive: d.color,
          emissiveIntensity: 0.8,
          metalness: 0.5,
          roughness: 0.2,
        })
      )
      g.add(mesh)
      const glow = new THREE.PointLight(d.color, 1.5, 15)
      g.add(glow)
      orbGroup.add(g)
      return { group: g, data: d }
    })

    // Cosmic Particles Starfield
    const starCount = 500
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 250
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 150
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 200
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({
      size: 1.2,
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.6,
    })
    const starField = new THREE.Points(starGeo, starMat)
    scene.add(starField)

    // Interactive Mouse Parallax
    let targetMouseX = 0
    let targetMouseY = 0
    let mouseX = 0
    let mouseY = 0

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      targetMouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 12
      targetMouseY = ((e.clientY - rect.top) / rect.height - 0.5) * -8
    }

    window.addEventListener('mousemove', handleMouseMove)

    const handleResize = () => {
      if (!container || !renderer) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }

    window.addEventListener('resize', handleResize)

    // Animation Loop
    let time = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
      time += 0.01

      // Rotate core elements
      coreGroup.rotation.y = time * 0.4
      coreGroup.rotation.x = Math.sin(time * 0.3) * 0.2
      innerMesh.rotation.y = -time * 0.8
      cageMesh.rotation.z = time * 0.5

      ring1.rotation.z = time * 0.6
      ring2.rotation.y = time * 0.7
      ring3.rotation.x = -time * 0.5

      // Orbiting orbs
      orbMeshes.forEach(({ group, data }) => {
        const angle = time * data.speed + data.phase
        group.position.x = Math.cos(angle) * data.rad
        group.position.z = Math.sin(angle) * (data.rad * 0.8)
        group.position.y = Math.sin(time * 1.5 + data.phase) * 5
      })

      // Starfield drift
      starField.rotation.y = time * 0.03

      // Smooth mouse parallax
      mouseX += (targetMouseX - mouseX) * 0.05
      mouseY += (targetMouseY - mouseY) * 0.05
      camera.position.x = mouseX
      camera.position.y = 5 + mouseY
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

  const quickTemplates = [
    {
      id: 'racing_3d',
      name: 'Đua Xe Grand Prix 3D',
      icon: '🏎️',
      desc: 'Top 30 tay đua đua xe F1, bám camera top 1, nitro rực lửa, 6 map thiên hà / sao hỏa',
      badge: 'Cực Hot',
      color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 hover:border-amber-400',
    },
    {
      id: 'print_booth_3d',
      name: 'Máy In Avatar 3D',
      icon: '🖨️',
      desc: 'Máy in 3D cơ khí tự động gắp và in ảnh avatar TikTok của khán giả theo hàng chờ',
      badge: 'Thịnh Hành',
      color: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 hover:border-cyan-400',
    },
    {
      id: 'plinko_3d',
      name: 'Thả Bi Plinko 3D',
      icon: '⚪',
      desc: 'Bàn thả bi vật lý nảy qua dàn đinh neon rớt vào các ô x10, x50, Jackpot nổ hũ',
      badge: 'Vật Lý 3D',
      color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 hover:border-emerald-400',
    },
    {
      id: 'tram_pha_che',
      name: 'Trạm Pha Chế 3D',
      icon: '🍹',
      desc: 'Mô phỏng pha chế sinh tố, cà phê, trà sữa tương tác 3D theo từng lượt tặng quà',
      badge: 'Mới Lạ',
      color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30 hover:border-purple-400',
    },
  ]

  return (
    <div ref={containerRef} className='relative flex-1 w-full h-full overflow-hidden bg-slate-950 select-none'>
      {/* 3D WebGL Background Canvas */}
      <canvas ref={canvasRef} className='absolute inset-0 w-full h-full pointer-events-none' />

      {/* Radial Gradient overlay to ensure text contrast */}
      <div className='absolute inset-0 bg-radial from-transparent via-slate-950/40 to-slate-950/90 pointer-events-none' />

      {/* Main Foreground Content */}
      <div className='relative z-10 flex flex-col items-center justify-center h-full max-w-5xl mx-auto px-6 py-8 text-center'>
        {/* Glow pill */}
        <div className='inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-bold uppercase tracking-wider shadow-lg shadow-cyan-950/50 mb-5 animate-pulse'>
          <span className='w-2 h-2 rounded-full bg-cyan-400' />
          TIKTOK LIVE MULTI-TEMPLATES 3D ENGINE
        </div>

        {/* Hero Title */}
        <h1 className='text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight max-w-2xl'>
          Chào Mừng Bạn Đến Với <span className='text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-pink-500'>Hệ Thống Live Stream 3D</span>
        </h1>

        {/* Subtitle */}
        <p className='mt-3 text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed'>
          Hiện tại chưa có phiên Live nào được lưu. Hãy khởi tạo phiên Live Stream đầu tiên để kết nối với TikTok Live và OBS Browser Source!
        </p>

        {/* Primary CTA Button */}
        <div className='mt-6 flex flex-wrap items-center justify-center gap-3'>
          <button
            onClick={() => onOpenCreate()}
            className='cursor-pointer group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200'
          >
            <span className='text-lg group-hover:rotate-90 transition-transform duration-200'>＋</span>
            <span>Tạo Phiên Live Đầu Tiên</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className='cursor-pointer inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 font-semibold text-xs transition'
            >
              <span>⚙️</span>
              <span>Cài Đặt Proxy & EulerStream</span>
            </button>
          )}
        </div>

        {/* Quick-Start Template Grid */}
        <div className='mt-10 w-full'>
          <div className='flex items-center justify-between mb-3 px-1'>
            <span className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
              Hoặc chọn nhanh một mẫu Template 3D bên dưới:
            </span>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left'>
            {quickTemplates.map((t) => (
              <div
                key={t.id}
                onClick={() => onOpenCreate(t.id)}
                className={`cursor-pointer group relative rounded-xl border bg-gradient-to-b ${t.color} bg-slate-900/60 p-4 backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl`}
              >
                <div className='flex items-center justify-between mb-2'>
                  <span className='text-2xl group-hover:scale-110 transition-transform'>{t.icon}</span>
                  <span className='text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60'>
                    {t.badge}
                  </span>
                </div>
                <h3 className='text-sm font-bold text-white group-hover:text-cyan-300 transition-colors'>
                  {t.name}
                </h3>
                <p className='mt-1 text-[11px] text-slate-400 line-clamp-2 leading-relaxed'>
                  {t.desc}
                </p>
                <div className='mt-3 flex items-center gap-1 text-[11px] font-bold text-cyan-400 group-hover:translate-x-1 transition-transform'>
                  <span>Khởi tạo ngay</span>
                  <span>→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
