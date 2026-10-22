import { useState, useEffect, useRef } from 'react'

interface TemplateOptionField {
  key: string
  label: string
  type: 'select' | 'range' | 'boolean' | 'buttons'
  defaultValue: any
  options?: { label: string; value: any; color?: string }[]
  min?: number
  max?: number
  step?: number
  unit?: string
}

interface TemplateAction {
  id: string
  label: string
  icon?: string
  variant?: 'primary' | 'danger' | 'warning' | 'secondary' | 'accent'
  actionKey: string
  payload?: any
  group?: string
}

interface StreamTemplate {
  id: string
  name: string
  description: string
  icon: string
  entryFile: string
  badge: string
  features: string[]
  settingsSchema: TemplateOptionField[]
  actions: TemplateAction[]
}

interface TikTokConfig {
  username: string
  onJoin: boolean
  onChat: boolean
  chatKeywordOnly: boolean
  keyword: string
  onGift: boolean
  bigGiftThreshold: number
  onLike: boolean
  onShare: boolean
  allowDuplicates: boolean
  signApiKey?: string
  sessionId?: string
}

interface QueueItem {
  id: number
  session_id: string
  unique_id: string
  name: string
  photo_url: string
  is_vip: number
  priority: number
  source: string
  comment: string | null
  gift_name: string | null
  created_at: number
}

interface ActivityLog {
  id: string
  session_id: string
  type: string
  user: string
  message: string
  avatar: string | null
  time: string
  created_at: number
}

interface SessionData {
  id: string
  streamKey: string
  templateId: string
  name: string
  status: 'idle' | 'running' | 'stopped'
  isConnected: boolean
  username: string
  viewerCount: number
  likeCount: number
  totalViewers: number
  queueCount: number
  queue: QueueItem[]
  logs: ActivityLog[]
  settings: Record<string, any>
  tiktokConfig: TikTokConfig
}

interface ServerInfo {
  port: number
  baseObsUrl: string
}

const QUEUE_ITEM_HEIGHT = 62

function VirtualQueueList({
  items,
  sessionId,
  getSourceBadge,
}: {
  items: QueueItem[]
  sessionId: string
  getSourceBadge: (item: QueueItem) => React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(480)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportHeight(el.clientHeight || 480)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (items.length === 0) {
    return (
      <div className='flex h-52 flex-col items-center justify-center text-center text-slate-500'>
        <span className='text-3xl mb-1'>📭</span>
        <p className='text-xs font-semibold'>Hàng chờ hiện đang trống</p>
        <p className='text-[11px] text-slate-400 max-w-xs mt-1'>
          Khán giả tương tác trên TikTok Live sẽ tự động xuất hiện tại đây theo thứ tự ưu tiên
        </p>
      </div>
    )
  }

  const totalCount = items.length
  const totalHeight = totalCount * QUEUE_ITEM_HEIGHT
  const buffer = 4
  const startIndex = Math.max(0, Math.floor(scrollTop / QUEUE_ITEM_HEIGHT) - buffer)
  const visibleCount = Math.ceil(viewportHeight / QUEUE_ITEM_HEIGHT) + buffer * 2
  const endIndex = Math.min(totalCount, startIndex + visibleCount)

  const visibleItems = items.slice(startIndex, endIndex)
  const offsetY = startIndex * QUEUE_ITEM_HEIGHT

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className='flex-1 overflow-y-auto dark-scroll relative pr-1'
    >
      <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${offsetY}px)`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {visibleItems.map((item, idx) => {
            const actualIndex = startIndex + idx
            return (
              <div
                key={item.id}
                style={{ height: QUEUE_ITEM_HEIGHT - 8 }}
                className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 transition ${
                  item.is_vip === 1
                    ? 'border-amber-500/40 bg-amber-950/20'
                    : item.source === 'gift'
                    ? 'border-pink-500/30 bg-pink-950/15'
                    : 'border-slate-800/80 bg-slate-950/60'
                }`}
              >
                <div className='flex items-center gap-2.5 overflow-hidden'>
                  <span className='w-5 text-center font-mono text-xs font-bold text-slate-500'>
                    #{actualIndex + 1}
                  </span>
                  <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-700 bg-slate-800'>
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className='h-full w-full object-cover'
                        loading='lazy'
                      />
                    ) : (
                      <div className='flex h-full w-full items-center justify-center text-xs font-bold text-cyan-400'>
                        {item.name.slice(0, 1)}
                      </div>
                    )}
                    {item.is_vip === 1 && (
                      <span className='absolute bottom-0 right-0 h-3 w-3 rounded-full bg-amber-400 border border-slate-950' />
                    )}
                  </div>
                  <div className='truncate'>
                    <div className='flex items-center gap-1.5'>
                      <span className='text-xs font-bold text-white truncate'>{item.name}</span>
                      {getSourceBadge(item)}
                    </div>
                    <div className='text-[10px] text-slate-400 truncate'>
                      {item.comment ? `"${item.comment}"` : item.gift_name ? `🎁 ${item.gift_name}` : 'Chờ hiển thị'}
                    </div>
                  </div>
                </div>

                <div className='flex items-center gap-1 shrink-0'>
                  {item.is_vip !== 1 && (
                    <button
                      title='Ưu tiên lên VIP'
                      onClick={() =>
                        window.ipcRenderer?.invoke('queue:prioritize-vip', {
                          sessionId,
                          id: item.id,
                        })
                      }
                      className='rounded p-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-amber-400 cursor-pointer'
                    >
                      👑
                    </button>
                  )}
                  <button
                    title='Xóa khỏi hàng'
                    onClick={() =>
                      window.ipcRenderer?.invoke('queue:remove', {
                        sessionId,
                        id: item.id,
                      })
                    }
                    className='rounded p-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-red-400 cursor-pointer'
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [templates, setTemplates] = useState<StreamTemplate[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [serverInfo, setServerInfo] = useState<ServerInfo>({
    port: 3210,
    baseObsUrl: 'http://localhost:3210',
  })

  const [viewMode, setViewMode] = useState<'control' | 'sessions' | 'create'>('control')
  const [copyToast, setCopyToast] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [logFilter, setLogFilter] = useState<'all' | 'chat' | 'gift' | 'member'>('all')
  const [previewClientCounts, setPreviewClientCounts] = useState<Record<string, number>>({})
  const [actionNotice, setActionNotice] = useState<{ text: string; isError?: boolean } | null>(null)

  const showNotice = (text: string, isError = false) => {
    setActionNotice({ text, isError })
    setTimeout(() => setActionNotice(null), 3000)
  }

  // Active camera view tracking
  const [activeCameraView, setActiveCameraView] = useState<string>('total')

  // Create new session form state
  const [newSessionName, setNewSessionName] = useState('')
  const [newSessionUser, setNewSessionUser] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('print_booth_3d')

  // Manual Add Queue User
  const [manualName, setManualName] = useState('')
  const [manualAvatar, setManualAvatar] = useState('')
  const [manualIsVip, setManualIsVip] = useState(false)

  // Active Session
  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0]

  // Connected preview clients
  const activePreviewClients = currentSession ? previewClientCounts[currentSession.streamKey] || 0 : 0
  const hasActivePreview = activePreviewClients > 0

  // Real connection status
  const isLiveConnected =
    currentSession &&
    (currentSession.isConnected ||
      (currentSession.status === 'running' && (currentSession.queueCount > 0 || currentSession.viewerCount > 0)))

  const cleanUsername = (str: string) => {
    if (!str) return ''
    let cleaned = str.trim()
    const match = cleaned.match(/tiktok\.com\/@([^/?#]+)/i)
    if (match) return match[1]
    if (cleaned.startsWith('@')) return cleaned.slice(1)
    return cleaned
  }

  const refreshSessions = async () => {
    if (!window.ipcRenderer) return
    const list: SessionData[] = await window.ipcRenderer.invoke('sessions:get-all')
    setSessions(list || [])
    if (list && list.length > 0 && !currentSessionId) {
      setCurrentSessionId(list[0].id)
    }
  }

  useEffect(() => {
    if (!window.ipcRenderer) return

    window.ipcRenderer.invoke('server:get-info').then((info) => {
      if (info) setServerInfo(info)
    })

    window.ipcRenderer.invoke('templates:get-all').then((tmps) => {
      if (tmps) setTemplates(tmps)
    })

    window.ipcRenderer.invoke('preview:get-clients').then((counts) => {
      if (counts) setPreviewClientCounts(counts)
    })

    refreshSessions()

    const handleClientsChange = (_: any, counts: Record<string, number>) => {
      if (counts) setPreviewClientCounts(counts)
    }

    const handleSessionEvent = (_: any, { event, data }: { event: string; data: any }) => {
      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.streamKey !== data?.sessionKey) return s

          if (event === 'status') {
            return {
              ...s,
              ...data.status,
            }
          } else if (event === 'stats') {
            return {
              ...s,
              viewerCount: data.viewerCount ?? s.viewerCount,
              likeCount: data.likeCount ?? s.likeCount,
            }
          } else if (event === 'queue') {
            return {
              ...s,
              queue: data.queue || [],
              queueCount: (data.queue || []).length,
            }
          } else if (event === 'log') {
            return {
              ...s,
              logs: [data.log, ...(s.logs || []).slice(0, 99)],
            }
          }
          return s
        }),
      )
    }

    window.ipcRenderer.on('session:event', handleSessionEvent)
    window.ipcRenderer.on('preview:clients-change', handleClientsChange)

    return () => {
      window.ipcRenderer?.off('session:event', handleSessionEvent)
      window.ipcRenderer?.off('preview:clients-change', handleClientsChange)
    }
  }, [currentSessionId])

  const getTemplate = (id?: string) => {
    return (
      templates.find((t) => t.id === id) ||
      templates[0] || {
        id: 'print_booth_3d',
        name: 'Máy In Avatar 3D',
        icon: '🖨️',
        entryFile: 'templates/print-booth-3d/index.html',
        badge: 'Mặc định',
        features: [],
        settingsSchema: [],
        actions: [],
      }
    )
  }

  const currentTemplate = getTemplate(currentSession?.templateId)

  // Unified OBS URL: permanent fixed URL for any template
  const getObsUrl = (session?: SessionData) => {
    const s = session || currentSession
    const key = s?.streamKey || 'live_default'
    return `${serverInfo.baseObsUrl}/preview?key=${key}`
  }

  const copyObsUrl = (session?: SessionData) => {
    const url = getObsUrl(session)
    navigator.clipboard.writeText(url)
    setCopyToast(true)
    setTimeout(() => setCopyToast(false), 2000)
  }

  const openObsPreview = (session?: SessionData) => {
    const s = session || currentSession
    const key = s?.streamKey || 'live_default'
    if (window.ipcRenderer) {
      window.ipcRenderer.invoke('preview:open', key)
    } else {
      window.open(getObsUrl(s), '_blank')
    }
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSessionName.trim()) {
      alert('Vui lòng nhập tên phiên Live')
      return
    }

    setIsSubmitting(true)
    const newSession = await window.ipcRenderer?.invoke('sessions:create', {
      name: newSessionName.trim(),
      templateId: selectedTemplateId,
      username: cleanUsername(newSessionUser),
    })
    setIsSubmitting(false)

    if (newSession) {
      await refreshSessions()
      setCurrentSessionId(newSession.id)
      setViewMode('control')
      setNewSessionName('')
      setNewSessionUser('')
    }
  }

  const handleDeleteSession = async (id: string, name: string) => {
    if (confirm(`Bạn có chắc muốn xóa phiên live "${name}"?`)) {
      await window.ipcRenderer?.invoke('sessions:delete', id)
      await refreshSessions()
      if (currentSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id)
        if (remaining.length > 0) setCurrentSessionId(remaining[0].id)
      }
    }
  }

  const handleStartLive = async () => {
    if (!currentSession) return
    setIsSubmitting(true)
    await window.ipcRenderer?.invoke('sessions:start', { id: currentSession.id })
    setIsSubmitting(false)
    await refreshSessions()
  }

  const handleStopLive = async () => {
    if (!currentSession) return
    if (confirm(`Dừng phiên live "${currentSession.name}"?`)) {
      await window.ipcRenderer?.invoke('sessions:stop', { id: currentSession.id })
      await refreshSessions()
    }
  }

  const updateSettingField = async (key: string, value: any) => {
    if (!currentSession) return
    const updated = { ...currentSession.settings, [key]: value }
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSession.id ? { ...s, settings: updated } : s)),
    )
    await window.ipcRenderer?.invoke('sessions:update-settings', {
      id: currentSession.id,
      settings: updated,
    })
  }

  const updateConfig = async (partial: Partial<TikTokConfig>) => {
    if (!currentSession) return
    const updated = { ...currentSession.tiktokConfig, ...partial }
    if (updated.username) {
      updated.username = cleanUsername(updated.username)
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSession.id ? { ...s, tiktokConfig: updated } : s)),
    )
    await window.ipcRenderer?.invoke('sessions:update-config', {
      id: currentSession.id,
      config: updated,
    })
  }

  const sendAction = async (actionKey: string, payload?: any, actionLabel?: string) => {
    if (!currentSession) return

    if (!hasActivePreview) {
      showNotice('⚠️ Chưa mở Preview OBS! Hãy mở Preview OBS trước để lệnh có hiệu lực.', true)
    }

    // Track active camera view
    if (actionKey === 'view' && typeof payload === 'string') {
      setActiveCameraView(payload)
    }

    try {
      await window.ipcRenderer?.invoke('control:send-action', {
        streamKey: currentSession.streamKey,
        action: actionKey,
        value: payload,
      })
      if (actionLabel) {
        showNotice(`✓ Đã kích hoạt: ${actionLabel}`)
      }
    } catch (err: any) {
      showNotice(`✕ Lỗi gửi lệnh: ${err?.message || err}`, true)
    }
  }

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualName.trim() || !currentSession) return

    await window.ipcRenderer?.invoke('queue:add-manual', {
      sessionId: currentSession.id,
      name: manualName.trim(),
      photoUrl: manualAvatar.trim(),
      isVip: manualIsVip,
    })

    setManualName('')
    setManualAvatar('')
    setManualIsVip(false)
  }

  const filteredLogs = (currentSession?.logs || [])
    .filter((log) => {
      if (logFilter === 'all') return true
      return log.type === logFilter
    })
    .slice(0, 100)

  const getSourceBadge = (item: QueueItem) => {
    if (item.is_vip === 1) {
      return <span className='rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold text-amber-300 border border-amber-500/40'>👑 VIP</span>
    }
    if (item.source === 'gift') {
      return <span className='rounded bg-pink-500/20 px-1 py-0.2 text-[9px] font-bold text-pink-300 border border-pink-500/40'>🎁 QUÀ</span>
    }
    if (item.source === 'chat') {
      return <span className='rounded bg-cyan-500/20 px-1 py-0.2 text-[9px] font-bold text-cyan-300 border border-cyan-500/40'>💬 CHAT</span>
    }
    if (item.source === 'share') {
      return <span className='rounded bg-purple-500/20 px-1 py-0.2 text-[9px] font-bold text-purple-300 border border-purple-500/40'>🔄 SHARE</span>
    }
    if (item.source === 'member') {
      return <span className='rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-bold text-emerald-300 border border-emerald-500/40'>👋 VÀO XEM</span>
    }
    return <span className='rounded bg-slate-800 px-1 py-0.2 text-[9px] font-bold text-slate-400'>THƯỜNG</span>
  }

  return (
    <div className='flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100 font-sans'>
      {/* ==================== TOP NAVIGATION ==================== */}
      <header className='flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/95 px-6 backdrop-blur'>
        <div className='flex items-center gap-3'>
          <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-tr from-cyan-500 to-blue-600 font-black text-white shadow-lg shadow-cyan-500/25'>
            3D
          </div>
          <div>
            <h1 className='text-sm font-bold tracking-tight text-white flex items-center gap-2'>
              TIKTOK LIVE MULTI-TEMPLATES
              <span className='rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-800/50'>
                {currentTemplate?.name}
              </span>
            </h1>
            <p className='text-[11px] text-slate-400'>
              Hệ thống điều khiển tương tác trực tiếp theo từng giao diện Template
            </p>
          </div>
        </div>

        {/* View Switcher / Session Selector */}
        <div className='flex items-center gap-3'>
          <div className='flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-1.5 border border-slate-800'>
            <span className='text-xs text-slate-400'>Phiên:</span>
            <select
              value={currentSession?.id || ''}
              onChange={(e) => {
                setCurrentSessionId(e.target.value)
                setViewMode('control')
              }}
              className='bg-transparent text-xs font-bold text-cyan-300 focus:outline-none cursor-pointer'
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id} className='bg-slate-900 text-white'>
                  {s.status === 'running' ? '🟢' : '⚪'} {getTemplate(s.templateId)?.icon} {s.name} ({s.streamKey})
                </option>
              ))}
            </select>
          </div>

          <div className='flex items-center gap-1.5 rounded-xl bg-slate-950 p-1 border border-slate-800'>
            <button
              onClick={() => setViewMode('control')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                viewMode === 'control'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🎮 Điều khiển Live
            </button>
            <button
              onClick={() => setViewMode('sessions')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                viewMode === 'sessions'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📑 Danh sách phiên ({sessions.length})
            </button>
            <button
              onClick={() => setViewMode('create')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                viewMode === 'create'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              + Tạo phiên mới
            </button>
          </div>
        </div>

        {/* Quick OBS Action */}
        <div className='flex items-center gap-2'>
          <button
            onClick={() => copyObsUrl()}
            className='flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/50 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/60'
          >
            {copyToast ? '✅ Đã chép link OBS' : '📋 Chép Link OBS'}
          </button>
        </div>
      </header>

      {/* ==================== BODY CONTENT ==================== */}
      <div className='flex flex-1 overflow-hidden'>
        {/* VIEW 1: QUẢN LÝ DANH SÁCH CÁC PHIÊN LIVE */}
        {viewMode === 'sessions' && (
          <div className='flex-1 overflow-y-auto p-8'>
            <div className='mx-auto max-w-5xl space-y-6'>
              <div className='flex items-center justify-between border-b border-slate-800 pb-4'>
                <div>
                  <h2 className='text-lg font-bold text-white'>Danh Sách Các Phiên Live Stream</h2>
                  <p className='text-xs text-slate-400'>
                    Mỗi phiên được cố định một mẫu Template riêng biệt và link OBS `/preview?key=...` thống nhất
                  </p>
                </div>
                <button
                  onClick={() => setViewMode('create')}
                  className='rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition'
                >
                  + Tạo Phiên Live Mới
                </button>
              </div>

              <div className='grid gap-4 md:grid-cols-2'>
                {sessions.map((s) => {
                  const tmpl = getTemplate(s.templateId)
                  return (
                    <div
                      key={s.id}
                      className={`rounded-2xl border p-5 transition shadow-lg ${
                        s.id === currentSession?.id
                          ? 'border-cyan-500/60 bg-slate-900/90'
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                      }`}
                    >
                      <div className='flex items-start justify-between'>
                        <div>
                          <div className='flex items-center gap-2'>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                s.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                              }`}
                            />
                            <h3 className='font-bold text-white text-sm flex items-center gap-1.5'>
                              <span>{tmpl.icon}</span>
                              <span>{s.name}</span>
                            </h3>
                          </div>
                          <div className='flex items-center gap-2 mt-1'>
                            <span className='rounded bg-cyan-950/80 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-800/40'>
                              Mẫu: {tmpl.name}
                            </span>
                            <span className='text-xs text-slate-400'>
                              TikTok: <strong className='text-slate-300'>@{s.username || 'Chưa gắn'}</strong>
                            </span>
                          </div>
                        </div>

                        <span className='rounded-full bg-slate-800 px-2.5 py-0.5 font-mono text-[11px] text-cyan-400 border border-slate-700'>
                          Key: {s.streamKey}
                        </span>
                      </div>

                      <div className='mt-4 rounded-xl bg-slate-950/80 p-3 border border-slate-800 text-xs'>
                        <div className='text-[10px] text-slate-500 uppercase font-semibold mb-1'>
                          Link nguồn OBS Browser Source cố định:
                        </div>
                        <div className='flex items-center justify-between gap-2'>
                          <span className='font-mono text-cyan-300 truncate'>
                            {getObsUrl(s)}
                          </span>
                          <button
                            onClick={() => copyObsUrl(s)}
                            className='shrink-0 rounded bg-cyan-950 px-2 py-1 text-[11px] font-bold text-cyan-400 border border-cyan-800 hover:bg-cyan-900'
                          >
                            Chép link
                          </button>
                        </div>
                      </div>

                      <div className='mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3'>
                        <div className='flex gap-3 text-xs text-slate-400'>
                          <span>
                            Chờ: <strong className='text-amber-400'>{s.queueCount || 0}</strong>
                          </span>
                          <span>
                            Mắt: <strong className='text-cyan-400'>{s.viewerCount || 0}</strong>
                          </span>
                        </div>

                        <div className='flex items-center gap-2'>
                          <button
                            onClick={() => {
                              setCurrentSessionId(s.id)
                              setViewMode('control')
                            }}
                            className='rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500'
                          >
                            Vào điều khiển 🎮
                          </button>
                          {sessions.length > 1 && (
                            <button
                              onClick={() => handleDeleteSession(s.id, s.name)}
                              className='rounded-lg border border-red-500/30 p-1.5 text-xs text-red-400 hover:bg-red-950/40'
                              title='Xóa phiên này'
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: TẠO PHIÊN MỚI */}
        {viewMode === 'create' && (
          <div className='flex-1 overflow-y-auto p-8'>
            <div className='mx-auto max-w-2xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl'>
              <div>
                <h2 className='text-lg font-bold text-white'>Tạo Phiên Live Stream Mới</h2>
                <p className='text-xs text-slate-400'>
                  Chọn mẫu template tương tác cố định cho phiên live này
                </p>
              </div>

              <form onSubmit={handleCreateSession} className='space-y-5'>
                <div className='space-y-2'>
                  <label className='block text-xs font-bold uppercase tracking-wider text-slate-300'>
                    1. Chọn Mẫu Template Live Stream (Cố định sau khi tạo)
                  </label>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    {templates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        onClick={() => setSelectedTemplateId(tmpl.id)}
                        className={`cursor-pointer rounded-2xl border p-4 transition ${
                          selectedTemplateId === tmpl.id
                            ? 'border-cyan-400 bg-cyan-950/40 shadow-lg shadow-cyan-500/10'
                            : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                        }`}
                      >
                        <div className='flex items-center justify-between mb-2'>
                          <span className='text-3xl'>{tmpl.icon}</span>
                          <span className='rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-slate-700'>
                            {tmpl.badge}
                          </span>
                        </div>
                        <h4 className='text-sm font-bold text-white'>{tmpl.name}</h4>
                        <p className='text-xs text-slate-400 mt-1 line-clamp-2'>{tmpl.description}</p>
                        <div className='mt-3 flex flex-wrap gap-1'>
                          {tmpl.features.slice(0, 3).map((f, i) => (
                            <span key={i} className='rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-slate-400'>
                              ✓ {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='space-y-1.5'>
                  <label className='block text-xs font-bold uppercase tracking-wider text-slate-300'>
                    2. Tên Phiên Live
                  </label>
                  <input
                    type='text'
                    required
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder='Ví dụ: Ca sáng - Máy in 3D, Vòng quay may mắn...'
                    className='w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none'
                  />
                </div>

                <div className='space-y-1.5'>
                  <div className='flex items-center justify-between'>
                    <label className='block text-xs font-bold uppercase tracking-wider text-slate-300'>
                      3. TikTok @username hoặc Link phòng Live
                    </label>
                    <span className='text-[10px] text-cyan-400'>(Không bắt buộc, nhập sau được)</span>
                  </div>
                  <input
                    type='text'
                    value={newSessionUser}
                    onChange={(e) => setNewSessionUser(e.target.value)}
                    placeholder='Ví dụ: em.th5031 hoặc để trống rồi dán sau khi bắt đầu live...'
                    className='w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none'
                  />
                </div>

                <div className='flex justify-end gap-3 pt-4 border-t border-slate-800'>
                  <button
                    type='button'
                    onClick={() => setViewMode('sessions')}
                    className='rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white'
                  >
                    Hủy
                  </button>
                  <button
                    type='submit'
                    disabled={isSubmitting}
                    className='rounded-xl bg-cyan-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 shadow-lg shadow-cyan-500/20'
                  >
                    {isSubmitting ? 'Đang tạo...' : 'Tạo Phiên Mới 🚀'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* VIEW 3: BẢNG ĐIỀU KHIỂN REALTIME */}
        {viewMode === 'control' && currentSession && (
          <div className='flex flex-1 flex-col overflow-hidden'>
            {/* Status Header */}
            <div className='flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/70 px-6 py-2.5'>
              <div className='flex items-center gap-4'>
                <div className='flex items-center gap-2'>
                  <span
                    className={`h-3 w-3 rounded-full ${
                      isLiveConnected
                        ? 'bg-emerald-400 animate-pulse'
                        : currentSession.status === 'running'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-slate-600'
                    }`}
                  />
                  <div>
                    <div className='text-xs font-bold text-white flex items-center gap-1.5'>
                      <span>{currentTemplate?.icon}</span>
                      <span>{currentSession.name}</span>
                      <span className='rounded bg-slate-800 px-1.5 font-mono text-[10px] text-cyan-300'>
                        Key: {currentSession.streamKey}
                      </span>
                    </div>
                    <div className='text-[10px] text-slate-400 flex items-center gap-2'>
                      <span>
                        Mẫu: <strong className='text-cyan-300'>{currentTemplate?.name}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        TikTok:{' '}
                        <strong className='text-slate-300'>
                          @{currentSession.tiktokConfig.username || 'Chưa gắn'}
                        </strong>
                      </span>
                      <span>·</span>
                      <span className={isLiveConnected ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        {isLiveConnected ? '🟢 Đang nhận dữ liệu Live 24/7' : '⚪ Chờ kết nối'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className='h-6 w-px bg-slate-800' />

                {/* Stats */}
                <div className='flex items-center gap-2.5 text-xs'>
                  <div className='rounded-lg bg-slate-950 px-2.5 py-1 border border-slate-800'>
                    <span className='text-slate-400'>Mắt xem: </span>
                    <strong className='text-cyan-400'>{currentSession.viewerCount.toLocaleString()}</strong>
                  </div>
                  <div className='rounded-lg bg-slate-950 px-2.5 py-1 border border-slate-800'>
                    <span className='text-slate-400'>Thích: </span>
                    <strong className='text-pink-400'>{currentSession.likeCount.toLocaleString()}</strong>
                  </div>
                  <div className='rounded-lg bg-slate-950 px-2.5 py-1 border border-slate-800'>
                    <span className='text-slate-400'>Hàng chờ: </span>
                    <strong className='text-amber-400'>{currentSession.queueCount} người</strong>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className='flex items-center gap-2'>
                <button
                  onClick={() => copyObsUrl()}
                  className='rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-3 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60'
                >
                  {copyToast ? '✅ Đã chép' : '📋 Copy Link OBS'}
                </button>
                <button
                  onClick={() => openObsPreview()}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    hasActivePreview
                      ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/60'
                      : 'border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50'
                  }`}
                  title={hasActivePreview ? `Preview OBS đang mở (${activePreviewClients} client)` : 'Chưa mở Preview OBS (nhấn để mở)'}
                >
                  {hasActivePreview ? (
                    <>
                      <span className='h-2 w-2 rounded-full bg-emerald-400 animate-pulse' />
                      <span>OBS Preview ({activePreviewClients})</span>
                    </>
                  ) : (
                    <>
                      <span className='inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent' />
                      <span>Mở Preview OBS</span>
                    </>
                  )}
                </button>
                {currentSession.status === 'running' ? (
                  <button
                    onClick={handleStopLive}
                    className='rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/60'
                  >
                    ⏹️ Dừng Live
                  </button>
                ) : (
                  <button
                    onClick={handleStartLive}
                    disabled={isSubmitting}
                    className='rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20'
                  >
                    🚀 Bắt Đầu Live
                  </button>
                )}
              </div>
            </div>

            {/* Panels (3 columns) */}
            <div className='grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12 lg:overflow-hidden'>
              {/* CỘT 1: OPTIONS & ACTIONS THEO ĐÚNG TEMPLATE (4 cols) */}
              <div className='flex flex-col gap-4 lg:col-span-4 lg:overflow-y-auto pr-1'>
                {/* 1.1: BẢNG ĐIỀU KHIỂN ĐỘNG THEO SCHEMA CỦA TEMPLATE */}
                <div className='rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-md space-y-4'>
                  <div className='flex items-center justify-between border-b border-slate-800 pb-2.5'>
                    <h3 className='text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5'>
                      <span>{currentTemplate?.icon}</span>
                      <span>OPTIONS: {currentTemplate?.name?.toUpperCase()}</span>
                    </h3>
                    {hasActivePreview ? (
                      <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400'>
                        <span className='h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse' />
                        Realtime Socket ({activePreviewClients})
                      </span>
                    ) : (
                      <span className='inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400'>
                        <span className='inline-block h-2 w-2 animate-spin rounded-full border border-amber-400 border-t-transparent' />
                        Đang chờ Preview OBS
                      </span>
                    )}
                  </div>

                  {/* Action feedback notification */}
                  {actionNotice && (
                    <div
                      className={`rounded-xl px-3 py-2 text-xs font-semibold flex items-center justify-between border transition ${
                        actionNotice.isError
                          ? 'border-red-500/50 bg-red-950/80 text-red-300'
                          : 'border-emerald-500/50 bg-emerald-950/80 text-emerald-300'
                      }`}
                    >
                      <span>{actionNotice.text}</span>
                      <button
                        onClick={() => setActionNotice(null)}
                        className='text-[10px] opacity-70 hover:opacity-100 ml-2 cursor-pointer'
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Cảnh báo khi chưa có preview client nào mở */}
                  {!hasActivePreview && (
                    <div className='rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs space-y-2.5 shadow-inner'>
                      <div className='flex items-start gap-2.5'>
                        <span className='mt-0.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent' />
                        <div className='space-y-0.5'>
                          <p className='font-bold text-amber-300'>Chưa có Client Preview / OBS</p>
                          <p className='text-[11px] text-amber-200/80 leading-relaxed'>
                            Các tùy chọn và nút điều khiển chỉ có tác dụng khi có ít nhất 1 client Preview hoặc OBS Browser Source đang mở.
                          </p>
                        </div>
                      </div>
                      <div className='flex items-center gap-2 pt-0.5'>
                        <button
                          onClick={() => openObsPreview()}
                          className='flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow flex items-center justify-center gap-1.5 cursor-pointer'
                        >
                          <span>👁️ Mở Preview OBS ngay</span>
                        </button>
                        <button
                          onClick={() => copyObsUrl()}
                          className='rounded-lg border border-amber-400/40 bg-amber-900/40 px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/70 transition cursor-pointer'
                        >
                          {copyToast ? 'Đã chép' : 'Chép Link'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions Buttons Grouped with clear ACTIVE States */}
                  {currentTemplate.actions.length > 0 && (
                    <div className='space-y-2.5'>
                      {/* VIP / Main Trigger Action */}
                      {currentTemplate.actions
                        .filter((a) => a.variant === 'danger' || a.variant === 'accent')
                        .map((act) => (
                          <button
                            key={act.id}
                            onClick={() => sendAction(act.actionKey, act.payload, act.label)}
                            className='w-full rounded-xl py-2.5 text-xs font-black transition flex items-center justify-center gap-1.5 bg-linear-to-r from-red-600 to-rose-600 text-white hover:brightness-110 shadow-lg shadow-red-600/25 active:scale-[0.98] cursor-pointer'
                          >
                            {act.icon && <span>{act.icon}</span>}
                            <span>{act.label}</span>
                          </button>
                        ))}

                      {/* General Action Buttons with ACTIVE State Highlighting */}
                      <div className='grid grid-cols-2 gap-2'>
                        {/* Play/Pause Button */}
                        <button
                          onClick={() => {
                            const newPaused = !currentSession.settings.paused
                            updateSettingField('paused', newPaused)
                            sendAction(newPaused ? 'pause' : 'play', undefined, newPaused ? 'Tạm dừng máy in' : 'Tiếp tục in')
                          }}
                          className={`rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                            currentSession.settings.paused
                              ? 'border-amber-400 bg-amber-500/25 text-amber-300 shadow-md shadow-amber-500/20'
                              : 'border-emerald-500/30 bg-emerald-600 text-white hover:bg-emerald-500'
                          }`}
                        >
                          <span>{currentSession.settings.paused ? '▶️ Tiếp tục in' : '⏸️ Tạm dừng'}</span>
                        </button>

                        {/* Turbo Button */}
                        <button
                          onClick={() => {
                            const newTurbo = !currentSession.settings.turbo
                            updateSettingField('turbo', newTurbo)
                            sendAction('turbo', newTurbo, newTurbo ? 'Bật Turbo ×3' : 'Tắt Turbo')
                          }}
                          className={`rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                            currentSession.settings.turbo
                              ? 'border-amber-400 bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/30'
                              : 'border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          <span>⚡ Turbo ×3 {currentSession.settings.turbo ? '●' : ''}</span>
                        </button>

                        {/* Rotate 3D Button */}
                        <button
                          onClick={() => {
                            const newRotate = !currentSession.settings.rotate
                            updateSettingField('rotate', newRotate)
                            sendAction('rotate', newRotate, newRotate ? 'Bật tự xoay 3D' : 'Tắt tự xoay 3D')
                          }}
                          className={`rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                            currentSession.settings.rotate
                              ? 'border-cyan-400 bg-cyan-500 text-slate-950 font-black shadow-lg shadow-cyan-500/30'
                              : 'border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          <span>🔄 Tự xoay 3D {currentSession.settings.rotate ? '●' : ''}</span>
                        </button>

                        {/* Reset Button */}
                        <button
                          onClick={() => sendAction('reset', undefined, 'In lại mẻ mới từ đầu')}
                          className='rounded-xl py-2 text-xs font-bold border border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer'
                        >
                          <span>🔁 In lại từ đầu</span>
                        </button>
                      </div>

                      {/* Camera Views Group with ACTIVE State */}
                      {currentTemplate.actions.some((a) => a.group === 'camera_views') && (
                        <div className='space-y-1.5 pt-1'>
                          <div className='flex items-center justify-between'>
                            <label className='text-[10px] font-semibold uppercase text-slate-400'>
                              Góc máy quay (Camera Views)
                            </label>
                            <span className='text-[10px] text-amber-300 font-bold'>
                              Active: {activeCameraView}
                            </span>
                          </div>
                          <div className='grid grid-cols-5 gap-1'>
                            {currentTemplate.actions
                              .filter((a) => a.group === 'camera_views')
                              .map((act) => {
                                const isActive = activeCameraView === act.payload
                                return (
                                  <button
                                    key={act.id}
                                    onClick={() => sendAction(act.actionKey, act.payload)}
                                    className={`rounded py-1 text-center text-xs font-semibold border transition ${
                                      isActive
                                        ? 'border-amber-400 bg-amber-500/25 text-amber-300 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    {act.label}
                                  </button>
                                )
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Settings Schema Controls with ACTIVE States */}
                  {currentTemplate.settingsSchema.length > 0 && (
                    <div className='space-y-3 pt-2 border-t border-slate-800'>
                      <div className='text-[10px] font-bold text-slate-400 uppercase tracking-wider'>
                        ⚙️ Cài Đặt Thông Số Template
                      </div>

                      {currentTemplate.settingsSchema.map((field) => {
                        const val = currentSession.settings[field.key] ?? field.defaultValue

                        if (field.type === 'range') {
                          return (
                            <div key={field.key} className='space-y-1'>
                              <div className='flex justify-between text-xs'>
                                <span className='text-slate-400'>{field.label}:</span>
                                <strong className='text-cyan-400 font-bold'>
                                  {val} {field.unit || ''}
                                </strong>
                              </div>
                              <input
                                type='range'
                                min={field.min}
                                max={field.max}
                                step={field.step || 1}
                                value={val}
                                onChange={(e) => {
                                  const num = parseFloat(e.target.value)
                                  updateSettingField(field.key, num)
                                  sendAction(field.key, num)
                                }}
                                className='w-full accent-cyan-500 cursor-pointer'
                              />
                            </div>
                          )
                        }

                        if (field.type === 'buttons') {
                          return (
                            <div key={field.key} className='space-y-1'>
                              <label className='text-[10px] text-slate-400'>{field.label}</label>
                              <div className='flex flex-wrap gap-1'>
                                {field.options?.map((opt) => {
                                  const isActive = val === opt.value
                                  return (
                                    <button
                                      key={opt.value}
                                      onClick={() => {
                                        updateSettingField(field.key, opt.value)
                                        sendAction(field.key, opt.value)
                                      }}
                                      className={`flex-1 rounded py-1.5 px-2 text-xs font-bold border transition truncate ${
                                        isActive
                                          ? 'border-cyan-400 bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400'
                                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }

                        if (field.type === 'select') {
                          return (
                            <div key={field.key} className='space-y-1'>
                              <label className='text-[10px] text-slate-400'>{field.label}</label>
                              <select
                                value={val}
                                onChange={(e) => {
                                  updateSettingField(field.key, e.target.value)
                                  sendAction(field.key, e.target.value)
                                }}
                                className='w-full rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-xs text-white'
                              >
                                {field.options?.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        }

                        if (field.type === 'boolean') {
                          return (
                            <label key={field.key} className='flex items-center gap-2 text-xs cursor-pointer pt-1'>
                              <input
                                type='checkbox'
                                checked={!!val}
                                onChange={(e) => {
                                  updateSettingField(field.key, e.target.checked)
                                  sendAction(field.key, e.target.checked)
                                }}
                                className='h-3.5 w-3.5 rounded accent-cyan-500'
                              />
                              <span className='text-[11px] text-slate-300'>{field.label}</span>
                            </label>
                          )
                        }

                        return null
                      })}
                    </div>
                  )}
                </div>

                {/* 1.2: Kênh TikTok & Quy tắc ưu tiên nạp avatar */}
                <div className='rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-md space-y-3'>
                  <h3 className='text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between'>
                    <span>📡 Kênh TikTok Live & Ưu Tiên</span>
                    <span className={`text-[10px] font-bold ${isLiveConnected ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {isLiveConnected ? '🟢 24/7' : '⚪ Chờ kết nối'}
                    </span>
                  </h3>

                  <div>
                    <div className='flex items-center justify-between mb-1'>
                      <label className='block text-[11px] font-semibold text-slate-400'>
                        TikTok @username hoặc Link phòng Live
                      </label>
                      {!currentSession.tiktokConfig.username && (
                        <span className='text-[10px] text-amber-400 font-medium'>
                          Có thể dán link khi phát live
                        </span>
                      )}
                    </div>
                    <div className='flex gap-2'>
                      <input
                        type='text'
                        value={currentSession.tiktokConfig.username}
                        onChange={(e) => updateConfig({ username: e.target.value })}
                        placeholder='Ví dụ: em.th5031'
                        className='flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none'
                      />
                      <button
                        onClick={handleStartLive}
                        disabled={isSubmitting}
                        className='rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500 shrink-0 shadow-sm'
                      >
                        {isLiveConnected ? 'Đồng bộ 🔄' : 'Kết nối ngay ⚡'}
                      </button>
                    </div>
                  </div>

                  <div className='rounded-xl bg-slate-950/70 p-2.5 border border-slate-800 space-y-2'>
                    <div className='text-[11px] font-bold text-amber-300'>
                      ⭐ Điều kiện & Thứ tự ưu tiên:
                    </div>

                    <div className='flex items-center justify-between text-xs'>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={currentSession.tiktokConfig.onGift}
                          onChange={(e) => updateConfig({ onGift: e.target.checked })}
                          className='h-3.5 w-3.5 rounded accent-cyan-500'
                        />
                        <span className='text-[11px] text-slate-200'>🎁 <strong>Tặng quà</strong> (Ưu tiên cao nhất)</span>
                      </label>
                      <div className='flex items-center gap-1 text-[10px] text-slate-400'>
                        <span>VIP ≥</span>
                        <input
                          type='number'
                          min='1'
                          value={currentSession.tiktokConfig.bigGiftThreshold || 10}
                          onChange={(e) =>
                            updateConfig({ bigGiftThreshold: parseInt(e.target.value, 10) || 10 })
                          }
                          className='w-10 rounded border border-slate-800 bg-slate-900 px-1 py-0.5 text-center text-xs text-amber-400 font-bold'
                        />
                        <span>xu</span>
                      </div>
                    </div>

                    <div className='flex items-center justify-between text-xs'>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={currentSession.tiktokConfig.onChat}
                          onChange={(e) => updateConfig({ onChat: e.target.checked })}
                          className='h-3.5 w-3.5 rounded accent-cyan-500'
                        />
                        <span className='text-[11px] text-slate-200'>💬 <strong>Bình luận</strong> (Xếp sau quà)</span>
                      </label>
                      <label className='flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={currentSession.tiktokConfig.chatKeywordOnly}
                          onChange={(e) => updateConfig({ chatKeywordOnly: e.target.checked })}
                          className='h-3 w-3 rounded accent-cyan-500'
                        />
                        <span>Lọc từ khóa</span>
                      </label>
                    </div>

                    {currentSession.tiktokConfig.chatKeywordOnly && (
                      <input
                        type='text'
                        value={currentSession.tiktokConfig.keyword}
                        onChange={(e) => updateConfig({ keyword: e.target.value })}
                        placeholder='in, in anh, ve, avatar'
                        className='w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-white'
                      />
                    )}

                    <div className='flex items-center justify-between text-xs'>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={currentSession.tiktokConfig.onJoin}
                          onChange={(e) => updateConfig({ onJoin: e.target.checked })}
                          className='h-3.5 w-3.5 rounded accent-cyan-500'
                        />
                        <span className='text-[11px] text-slate-200'>👋 <strong>Tham gia phòng</strong> (Tự động vào hàng)</span>
                      </label>
                    </div>

                    <div className='flex items-center justify-between text-xs'>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={currentSession.tiktokConfig.onShare}
                          onChange={(e) => updateConfig({ onShare: e.target.checked })}
                          className='h-3.5 w-3.5 rounded accent-cyan-500'
                        />
                        <span className='text-[11px] text-slate-200'>🔄 <strong>Chia sẻ live</strong></span>
                      </label>
                    </div>

                    <div className='flex items-center justify-between text-xs pt-1 border-t border-slate-800/80'>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={currentSession.tiktokConfig.allowDuplicates || false}
                          onChange={(e) => updateConfig({ allowDuplicates: e.target.checked })}
                          className='h-3.5 w-3.5 rounded accent-cyan-500'
                        />
                        <span className='text-[11px] text-amber-300'>
                          🔁 <strong>Cho phép lặp lại:</strong> Thêm slot mới mỗi lần comment
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* CỘT 2: Quản lý hàng chờ (5 cols) */}
              <div className='flex flex-col gap-3 lg:col-span-5 lg:overflow-hidden'>
                <div className='flex flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-md overflow-hidden'>
                  <div className='mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5'>
                    <div>
                      <h3 className='text-xs font-bold uppercase tracking-wider text-slate-300'>
                        👥 Hàng Chờ Tương Tác ({currentSession.queueCount})
                      </h3>
                      <p className='text-[10px] text-slate-400'>
                        Sắp xếp theo thứ tự: Quà lớn (VIP) → Quà nhỏ → Bình luận → Tham gia
                      </p>
                    </div>

                    {currentSession.queueCount > 0 && (
                      <button
                        onClick={() =>
                          window.ipcRenderer?.invoke('queue:clear', { sessionId: currentSession.id })
                        }
                        className='text-[11px] text-red-400 hover:underline'
                      >
                        Xóa tất cả
                      </button>
                    )}
                  </div>

                  {/* Form thêm thủ công */}
                  <form onSubmit={handleManualAdd} className='mb-3 flex gap-2'>
                    <input
                      type='text'
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder='Tên khán giả test...'
                      className='flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none'
                    />
                    <button
                      type='button'
                      onClick={() => setManualIsVip(!manualIsVip)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border transition ${
                        manualIsVip
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {manualIsVip ? '★ VIP' : 'Thường'}
                    </button>
                    <button
                      type='submit'
                      className='rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500'
                    >
                      + Thêm
                    </button>
                  </form>

                  {/* Virtualized Queue List */}
                  <VirtualQueueList
                    items={currentSession.queue}
                    sessionId={currentSession.id}
                    getSourceBadge={getSourceBadge}
                  />
                </div>
              </div>

              {/* CỘT 3: Nhật ký tương tác Live (3 cols) */}
              <div className='flex flex-col gap-3 lg:col-span-3 lg:overflow-hidden'>
                <div className='flex flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-md overflow-hidden'>
                  <div className='mb-2.5 flex items-center justify-between border-b border-slate-800 pb-2'>
                    <h3 className='text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5'>
                      <span>💬 Nhật Ký Tương Tác ({filteredLogs.length})</span>
                    </h3>
                  </div>

                  <div className='flex gap-1 mb-2.5 border-b border-slate-800/80 pb-2 text-[10px]'>
                    {[
                      { id: 'all', label: 'Tất cả' },
                      { id: 'chat', label: 'Bình luận' },
                      { id: 'gift', label: 'Quà tặng' },
                      { id: 'member', label: 'Khán giả' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setLogFilter(tab.id as any)}
                        className={`rounded px-2 py-0.5 font-semibold transition ${
                          logFilter === tab.id
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className='flex-1 overflow-y-auto dark-scroll space-y-2 pr-1'>
                    {filteredLogs.length === 0 ? (
                      <div className='flex h-52 flex-col items-center justify-center text-center text-slate-500'>
                        <span className='text-2xl mb-1'>💭</span>
                        <p className='text-xs'>Chưa có hoạt động nào</p>
                      </div>
                    ) : (
                      filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          className='rounded-lg bg-slate-950/70 p-2 text-xs border border-slate-800/60'
                        >
                          <div className='flex items-center justify-between text-[10px] text-slate-500 mb-0.5'>
                            <span className='font-semibold text-slate-400 flex items-center gap-1 truncate'>
                              {log.type === 'gift' && '🎁'}
                              {log.type === 'chat' && '💬'}
                              {log.type === 'member' && '👋'}
                              {log.type === 'system' && '⚙️'}
                              {log.user}
                            </span>
                            <span className='shrink-0 ml-1'>{log.time}</span>
                          </div>
                          <p
                            className={`text-xs wrap-break-word ${
                              log.type === 'gift'
                                ? 'text-amber-300 font-medium'
                                : log.type === 'system'
                                ? 'text-cyan-300'
                                : 'text-slate-200'
                            }`}
                          >
                            {log.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
