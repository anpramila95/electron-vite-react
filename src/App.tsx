import { useState, useEffect, useRef } from 'react'
import { MusicPlayer } from './components/MusicPlayer'
import { FakerBatchModal } from './components/FakerBatchModal'
import { Welcome3D } from './components/Welcome3D'

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
  printingUsers?: any[]
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
  const rafRef = useRef<number | null>(null)
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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setScrollTop(top)
    })
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
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
                  <button
                    title='Đẩy in luôn (Ưu tiên số 1)'
                    onClick={() =>
                      window.ipcRenderer?.invoke('queue:force-print', {
                        sessionId,
                        id: item.id,
                      })
                    }
                    className='flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer transition'
                  >
                    <span>⚡</span>
                    <span className='hidden sm:inline'>In luôn</span>
                  </button>

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
  const [queueTab, setQueueTab] = useState<'waiting' | 'running'>('waiting')
  const [showMusicPlayer, setShowMusicPlayer] = useState(false)
  const [showFakerModal, setShowFakerModal] = useState(false)
  const [previewClientCounts, setPreviewClientCounts] = useState<Record<string, number>>({})
  const [actionNotice, setActionNotice] = useState<{ text: string; isError?: boolean } | null>(null)

  // Proxy & EulerStream Settings
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [proxyUrl, setProxyUrl] = useState('')
  const [signApiKey, setSignApiKey] = useState('')
  const [signApiUrl, setSignApiUrl] = useState('')
  const [settingsSavedToast, setSettingsSavedToast] = useState(false)
  const [eulerUsage, setEulerUsage] = useState<{
    day?: { max: number; remaining: number; reset_at: string | null }
    hour?: { max: number; remaining: number; reset_at: string | null }
    minute?: { max: number; remaining: number; reset_at: string | null }
    isCustomKey: boolean
  } | null>(null)
  const [eulerUsageLoading, setEulerUsageLoading] = useState(false)
  const [eulerUsageError, setEulerUsageError] = useState<string | null>(null)

  // Cloudflare Public Quick Tunnel
  const [tunnelUrl, setTunnelUrl] = useState('')
  const [tunnelLoading, setTunnelLoading] = useState(false)
  const [copyTunnelToast, setCopyTunnelToast] = useState(false)

  // AI & TTS Assistant State
  const [aiConfig, setAiConfig] = useState<{
    enabled: boolean
    provider: 'openai' | 'gemini' | 'ollama' | 'deepseek' | 'custom' | 'rule_based'
    apiKey: string
    baseUrl: string
    model: string
    batchInterval: number
    maxBatchSize: number
    ttsEnabled: boolean
    ttsEngine: 'webspeech' | 'google' | 'openai' | 'elevenlabs' | 'custom_remote'
    ttsVoice: string
    ttsSpeed: number
    ttsVolume: number
    ttsDuckMusic: boolean
    ttsApiKey: string
    ttsBaseUrl: string
    ttsModel: string
    ttsCustomMethod: 'GET' | 'POST'
    playInApp: boolean
    playInObs: boolean
    templatePrompts: Record<string, string>
  }>({
    enabled: true,
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    batchInterval: 6,
    maxBatchSize: 6,
    ttsEnabled: true,
    ttsEngine: 'webspeech',
    ttsVoice: 'vi-VN',
    ttsSpeed: 1.0,
    ttsVolume: 1.0,
    ttsDuckMusic: true,
    ttsApiKey: '',
    ttsBaseUrl: 'https://api.openai.com/v1',
    ttsModel: 'tts-1',
    ttsCustomMethod: 'POST',
    playInApp: false,
    playInObs: true,
    templatePrompts: {},
  })
  const [defaultPrompts, setDefaultPrompts] = useState<Record<string, string>>({})
  const [settingsModalTab, setSettingsModalTab] = useState<'network' | 'ai' | 'tts' | 'prompts'>('network')
  const [promptTemplateEditId, setPromptTemplateEditId] = useState<string>('print_booth_3d')
  const [lastSpokenText, setLastSpokenText] = useState<string>('')
  const [isSpeakingNow, setIsSpeakingNow] = useState(false)
  const [testSpeechInput, setTestSpeechInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

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

  const refreshSessions = async (): Promise<SessionData[]> => {
    if (!window.ipcRenderer) return []
    const list: SessionData[] = await window.ipcRenderer.invoke('sessions:get-all')
    const final = list || []
    setSessions(final)
    if (final.length > 0) {
      setCurrentSessionId((prev) => (final.some((s) => s.id === prev) ? prev : final[0].id))
    } else {
      setCurrentSessionId('')
    }
    return final
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

    window.ipcRenderer.invoke('config:get-all').then((cfg: Record<string, string>) => {
      if (cfg) {
        if (cfg.proxyUrl) setProxyUrl(cfg.proxyUrl)
        if (cfg.signApiKey) setSignApiKey(cfg.signApiKey)
        if (cfg.signApiUrl) setSignApiUrl(cfg.signApiUrl)
      }
    })

    window.ipcRenderer.invoke('tunnel:get-status').then((res: any) => {
      if (res?.url) setTunnelUrl(res.url)
    })

    window.ipcRenderer.invoke('ai:get-config').then((res: any) => {
      if (res?.config) setAiConfig(res.config)
      if (res?.defaultPrompts) setDefaultPrompts(res.defaultPrompts)
    })

    refreshSessions()

    const handleClientsChange = (_: any, counts: Record<string, number>) => {
      if (counts) setPreviewClientCounts(counts)
    }

    const pendingEvents: { event: string; data: any }[] = []
    let flushTimer: NodeJS.Timeout | null = null

    const flushEvents = () => {
      if (pendingEvents.length === 0) return
      const batch = pendingEvents.splice(0, pendingEvents.length)

      setSessions((prevSessions) => {
        let updated = [...prevSessions]
        for (const { event, data } of batch) {
          updated = updated.map((s) => {
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
              const currentLogs = s.logs || []
              if (currentLogs.some((l) => l.id === data.log?.id)) {
                return s
              }
              const newLogs = [data.log, ...currentLogs]
              newLogs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
              return {
                ...s,
                logs: newLogs.slice(0, 100),
              }
            } else if (event === 'user_printing') {
              const currentPrinting = s.printingUsers || []
              const exists = currentPrinting.some((u: any) => u.id === data.user?.id)
              return {
                ...s,
                printingUsers: exists ? currentPrinting : [data.user, ...currentPrinting],
              }
            } else if (event === 'user_printed' || event === 'user_removed') {
              const currentPrinting = s.printingUsers || []
              const targetId = data.userId ?? data.id
              return {
                ...s,
                printingUsers: currentPrinting.filter((u: any) => u.id !== targetId),
              }
            } else if (event === 'queue_cleared') {
              return {
                ...s,
                printingUsers: [],
              }
            }
            return s
          })
        }
        return updated
      })
    }

    const handleSessionEvent = (_: any, item: { event: string; data: any }) => {
      pendingEvents.push(item)
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null
          flushEvents()
        }, 150)
      }
    }

    window.ipcRenderer.on('session:event', handleSessionEvent)
    window.ipcRenderer.on('preview:clients-change', handleClientsChange)

    const handleAiSpeak = (_: any, payload: any) => {
      if (!payload || !payload.text) return
      setLastSpokenText(payload.text)
      setIsSpeakingNow(true)

      // Play audio locally in Electron if enabled
      if (payload.playInApp !== false) {
        try {
          if (payload.engine === 'webspeech' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel()
            const utter = new SpeechSynthesisUtterance(payload.text)
            utter.lang = 'vi-VN'
            utter.rate = payload.speed || 1.0
            utter.volume = typeof payload.volume === 'number' ? payload.volume : 1.0
            utter.onend = () => setIsSpeakingNow(false)
            utter.onerror = () => setIsSpeakingNow(false)
            window.speechSynthesis.speak(utter)
          } else if (payload.audioUrl) {
            const audio = new Audio(payload.audioUrl)
            audio.volume = typeof payload.volume === 'number' ? payload.volume : 1.0
            audio.playbackRate = payload.speed || 1.0
            audio.onended = () => setIsSpeakingNow(false)
            audio.onerror = () => setIsSpeakingNow(false)
            audio.play().catch(() => {})
          }
        } catch (e) {
          console.warn('In-app TTS error:', e)
        }
      }

      setTimeout(() => {
        setIsSpeakingNow(false)
      }, Math.max(3500, payload.text.length * 90))
    }

    window.ipcRenderer.on('ai:speak', handleAiSpeak)

    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      window.ipcRenderer?.off('session:event', handleSessionEvent)
      window.ipcRenderer?.off('preview:clients-change', handleClientsChange)
      window.ipcRenderer?.off('ai:speak', handleAiSpeak)
    }
  }, [])

  useEffect(() => {
    if (showSettingsModal) {
      checkEulerUsage()
    }
  }, [showSettingsModal])

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
  const isPrinterTemplate =
    currentTemplate.id?.includes('print') ||
    currentTemplate.actions?.some((a) => a.group === 'printer_flow')

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

  // Cloudflare Tunnel & Settings Handlers
  const handleToggleTunnel = async () => {
    setTunnelLoading(true)
    try {
      const res = await window.ipcRenderer?.invoke('tunnel:toggle')
      if (res?.url) {
        setTunnelUrl(res.url)
        showNotice(`🌐 Đã bật Cloudflare Tunnel: ${res.url}`)
      } else {
        setTunnelUrl('')
        showNotice(res?.error ? `❌ ${res.error}` : 'Đã tắt Cloudflare Tunnel')
      }
    } catch (e: any) {
      showNotice(`❌ Lỗi bật tunnel: ${e.message}`, true)
    } finally {
      setTunnelLoading(false)
    }
  }

  const getOnlineObsUrl = (session?: SessionData) => {
    if (!tunnelUrl) return ''
    const s = session || currentSession
    const key = s?.streamKey || 'live_default'
    return `${tunnelUrl}/preview?key=${key}`
  }

  const copyOnlineObsUrl = (session?: SessionData) => {
    const url = getOnlineObsUrl(session)
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopyTunnelToast(true)
    setTimeout(() => setCopyTunnelToast(false), 2000)
  }

  const checkEulerUsage = async (overrideKey?: string) => {
    setEulerUsageLoading(true)
    setEulerUsageError(null)
    try {
      const res = await window.ipcRenderer?.invoke('euler:check-usage', {
        apiKey: overrideKey !== undefined ? overrideKey : signApiKey,
        apiUrl: signApiUrl,
      })
      if (res?.success) {
        setEulerUsage(res.data)
      } else {
        setEulerUsage(null)
        setEulerUsageError(res?.error || 'Lỗi kiểm tra API')
      }
    } catch (err: any) {
      setEulerUsage(null)
      setEulerUsageError(err?.message || 'Lỗi kết nối')
    } finally {
      setEulerUsageLoading(false)
    }
  }

  const handleSaveConfigs = async () => {
    await window.ipcRenderer?.invoke('config:set', { key: 'proxyUrl', value: proxyUrl.trim() })
    await window.ipcRenderer?.invoke('config:set', { key: 'signApiKey', value: signApiKey.trim() })
    await window.ipcRenderer?.invoke('config:set', { key: 'signApiUrl', value: signApiUrl.trim() })
    setSettingsSavedToast(true)
    setTimeout(() => setSettingsSavedToast(false), 2000)
    showNotice('✅ Đã lưu cấu hình Proxy & EulerStream')
    checkEulerUsage(signApiKey.trim())
  }

  // AI & TTS Assistant Helper Methods
  const updateAiConfig = async (partial: Partial<typeof aiConfig>) => {
    const updated = { ...aiConfig, ...partial }
    setAiConfig(updated)
    const res = await window.ipcRenderer?.invoke('ai:update-config', partial)
    if (res?.config) {
      setAiConfig(res.config)
    }
  }

  const handleTestSpeak = async (customText?: string) => {
    const textToSpeak = customText || testSpeechInput || 'Xin chào toàn thể anh em đang xem livestream nhé!'
    showNotice('🔊 Đang phát giọng nói thử nghiệm...')
    await window.ipcRenderer?.invoke('ai:test-speak', {
      text: textToSpeak,
      templateId: currentSession?.templateId || 'print_booth_3d',
    })
  }

  const handleResetPrompt = (templateId: string) => {
    let def = defaultPrompts[templateId]
    if (!def) {
      if (templateId === 'default') {
        def = defaultPrompts['default'] || ''
      } else {
        const tmpl = templates.find((t) => t.id === templateId)
        const tmplName = tmpl?.name || templateId
        const tmplDesc = tmpl?.description || 'Tương tác trực tiếp với khán giả phòng live'
        def = `Bạn là AI Bình Luận Viên đồng hành cho trò chơi ${tmplName} trên TikTok Live.
Nhiệm vụ: ${tmplDesc.slice(0, 100)}.
Phong cách: Hào hứng, thân thiện, tràn đầy năng lượng, xưng Em gọi Khán giả hoặc tên người xem.
Quy tắc:
- Trả lời đúng 1 câu ngắn gọn (dưới 25 từ).
- Cảm ơn và gọi tên người vừa tặng quà hoặc bình luận nổi bật.
- Nhắc khán giả thả tim và tương tác để tham gia ${tmplName}.
- Không lặp lại nguyên văn câu hỏi hay đọc icon rác.`
      }
    }

    if (!def) return
    updateAiConfig({
      templatePrompts: {
        ...aiConfig.templatePrompts,
        [templateId]: def,
      },
    })
    showNotice(`✅ Đã khôi phục kịch bản mặc định cho "${templateId}"`)
  }

  const getPersonaInfo = (templateId?: string) => {
    if (!templateId || templateId === 'default') {
      return {
        icon: '💬',
        badge: 'Trợ Lý Chat Chung',
        desc: 'Giao lưu trò chuyện tự nhiên, phản hồi dí dỏm với khán giả',
        border: 'border-slate-700 bg-slate-900/60 text-slate-300',
      }
    }

    const tmpl = templates.find((t) => t.id === templateId)
    if (tmpl) {
      let border = 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300'
      const id = tmpl.id.toLowerCase()
      if (id.includes('racing')) border = 'border-amber-500/40 bg-amber-950/30 text-amber-300'
      else if (id.includes('fish')) border = 'border-sky-500/40 bg-sky-950/30 text-sky-300'
      else if (id.includes('plinko')) border = 'border-indigo-500/40 bg-indigo-950/30 text-indigo-300'
      else if (id.includes('pha_che') || id.includes('bar')) border = 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'

      return {
        icon: tmpl.icon || '🎮',
        badge: tmpl.name,
        desc: tmpl.description ? tmpl.description.slice(0, 85) + '...' : 'Tương tác theo sự kiện của template',
        border,
      }
    }

    return {
      icon: '🎮',
      badge: templateId,
      desc: 'Tương tác theo sự kiện phòng live',
      border: 'border-slate-800 bg-slate-950 text-slate-400',
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
      const list = await refreshSessions()
      if (list.length === 0) {
        setCurrentSessionId('')
        setViewMode('sessions')
      } else if (currentSessionId === id) {
        setCurrentSessionId(list[0].id)
      }
      showNotice(`🗑️ Đã xóa phiên "${name}"`)
    }
  }

  const handleDeleteAllSessions = async () => {
    if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa TẤT CẢ các phiên live stream hiện có?')) {
      await window.ipcRenderer?.invoke('sessions:delete-all')
      await refreshSessions()
      setCurrentSessionId('')
      setViewMode('sessions')
      showNotice('🗑️ Đã xóa toàn bộ phiên live stream')
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

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentSession || !window.ipcRenderer) return

    if (!manualName.trim()) {
      setShowFakerModal(true)
      return
    }

    window.ipcRenderer.invoke('queue:add-manual', {
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
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
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
      {/* ==================== COMPACT HEADER ==================== */}
      <header className='flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/95 px-4 backdrop-blur gap-3'>
        {/* Left: Brand & Template Pill */}
        <div className='flex items-center gap-2.5 shrink-0'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-tr from-cyan-500 to-blue-600 font-black text-xs text-white shadow-md shadow-cyan-500/20'>
            3D
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-bold tracking-tight text-white hidden sm:inline'>TIKTOK LIVE</span>
            <span className='rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-800/50 max-w-[150px] truncate'>
              {currentTemplate?.name}
            </span>
          </div>
        </div>

        {/* Center: Session selector & View Switcher */}
        <div className='flex items-center gap-2 shrink-0'>
          <div className='flex items-center gap-1.5 rounded-lg bg-slate-950 px-2 py-1 border border-slate-800 text-xs'>
            <span className='text-slate-400 text-[11px]'>Phiên:</span>
            {sessions.length > 0 ? (
              <select
                value={currentSession?.id || ''}
                onChange={(e) => {
                  setCurrentSessionId(e.target.value)
                  setViewMode('control')
                }}
                className='bg-transparent text-xs font-bold text-cyan-300 focus:outline-none cursor-pointer max-w-[130px] truncate'
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id} className='bg-slate-900 text-white'>
                    {s.status === 'running' ? '🟢' : '⚪'} {getTemplate(s.templateId)?.icon} {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className='text-[11px] font-semibold text-slate-500 italic'>Chưa có phiên</span>
            )}
          </div>

          <div className='flex items-center gap-1 rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs'>
            <button
              onClick={() => {
                if (currentSession) {
                  setViewMode('control')
                } else {
                  setViewMode('sessions')
                }
              }}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === 'control'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🎮 Điều khiển
            </button>
            <button
              onClick={() => setViewMode('sessions')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === 'sessions'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📑 Phiên ({sessions.length})
            </button>
            <button
              onClick={() => setViewMode('create')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === 'create'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              + Mới
            </button>
          </div>
        </div>

        {/* Right: Quick actions */}
        <div className='flex items-center gap-1.5 shrink-0'>
          {/* Cloudflare Tunnel Toggle */}
          <button
            onClick={handleToggleTunnel}
            disabled={tunnelLoading}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              tunnelUrl
                ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60'
                : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={tunnelUrl ? `Tunnel đang bật: ${tunnelUrl}` : 'Bật Cloudflare Tunnel tạo link OBS online'}
          >
            <span>{tunnelLoading ? '⏳' : tunnelUrl ? '🌐' : '⚪'}</span>
            <span>{tunnelLoading ? 'Đang bật...' : tunnelUrl ? 'Tunnel' : 'Tunnel'}</span>
          </button>

          {tunnelUrl && (
            <button
              onClick={() => copyOnlineObsUrl()}
              className='flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition cursor-pointer'
              title='Chép link OBS online'
            >
              <span>{copyTunnelToast ? '✅ Đã chép' : '📋 Link Online'}</span>
            </button>
          )}

          {/* Proxy & Network Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className='flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white cursor-pointer'
            title='Cài đặt danh sách Proxy & EulerStream Key'
          >
            <span>⚙️ Proxy</span>
            {proxyUrl && <span className='h-1.5 w-1.5 rounded-full bg-cyan-400' />}
          </button>

          {/* Copy Localhost OBS URL */}
          <button
            onClick={() => copyObsUrl()}
            className='flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-2.5 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/60 cursor-pointer'
          >
            {copyToast ? '✅ Đã chép' : '📋 Link OBS'}
          </button>
        </div>
      </header>

      {/* ==================== BODY CONTENT ==================== */}
      <div className='flex flex-1 overflow-hidden'>
        {/* VIEW 1: QUẢN LÝ DANH SÁCH CÁC PHIÊN LIVE HOẶC WELCOME 3D */}
        {viewMode === 'sessions' &&
          (sessions.length === 0 ? (
            <Welcome3D
              onOpenCreate={(tmplId) => {
                if (tmplId) setSelectedTemplateId(tmplId)
                setViewMode('create')
              }}
              onOpenSettings={() => setShowSettingsModal(true)}
            />
          ) : (
            <div className='flex-1 overflow-y-auto p-8'>
              <div className='mx-auto max-w-5xl space-y-6'>
                <div className='flex items-center justify-between border-b border-slate-800 pb-4'>
                  <div>
                    <h2 className='text-lg font-bold text-white'>Danh Sách Các Phiên Live Stream</h2>
                    <p className='text-xs text-slate-400'>
                      Mỗi phiên được cố định một mẫu Template riêng biệt và link OBS `/preview?key=...` thống nhất
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <button
                      onClick={handleDeleteAllSessions}
                      className='rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-950/50 hover:border-red-500/60 transition cursor-pointer'
                      title='Xóa sạch tất cả các phiên live'
                    >
                      🗑️ Xóa Tất Cả
                    </button>
                    <button
                      onClick={() => setViewMode('create')}
                      className='rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition cursor-pointer'
                    >
                      + Tạo Phiên Live Mới
                    </button>
                  </div>
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
                            className='rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 cursor-pointer'
                          >
                            Vào điều khiển 🎮
                          </button>
                          <button
                            onClick={() => handleDeleteSession(s.id, s.name)}
                            className='rounded-lg border border-red-500/30 p-1.5 text-xs text-red-400 hover:bg-red-950/40 hover:border-red-500 transition cursor-pointer'
                            title='Xóa phiên này'
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}

        {/* VIEW 2: TẠO PHIÊN MỚI (FULL WIDTH 2 CỘT) */}
        {viewMode === 'create' && (
          <div className='flex-1 overflow-hidden p-6 flex flex-col'>
            <div className='w-full max-w-7xl mx-auto flex flex-col flex-1 overflow-hidden space-y-4'>
              <div className='flex items-center justify-between border-b border-slate-800 pb-3 shrink-0'>
                <div>
                  <h2 className='text-lg font-bold text-white flex items-center gap-2'>
                    <span>✨</span>
                    <span>Tạo Phiên Live Stream Mới</span>
                  </h2>
                  <p className='text-xs text-slate-400'>
                    Chọn mẫu template 3D tương tác bên trái và điền thông tin phiên ở cột bên phải
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => setViewMode('sessions')}
                  className='rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer'
                >
                  ✕ Đóng / Quay lại
                </button>
              </div>

              {/* 2-Column Split: Left (Templates Grid with Scroll), Right (Form Input) */}
              <form onSubmit={handleCreateSession} className='flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden'>
                {/* CỘT TRÁI: CHỌN TEMPLATES (2 ITEM 1 DÒNG, MAX HEIGHT SCROLL) */}
                <div className='lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4'>
                  <div className='flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80 shrink-0'>
                    <label className='text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5'>
                      <span className='inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 text-[10px] font-black border border-cyan-800/60'>1</span>
                      <span>Chọn Mẫu Template Live Stream ({templates.length} mẫu có sẵn)</span>
                    </label>
                    <span className='text-[11px] text-cyan-400 font-medium'>
                      Đang chọn: <strong>{getTemplate(selectedTemplateId)?.name}</strong>
                    </span>
                  </div>

                  {/* Scrollable Templates Grid (2 item / dòng) */}
                  <div className='flex-1 overflow-y-auto pr-2 grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[calc(100vh-230px)]'>
                    {templates.map((tmpl) => {
                      const isSelected = selectedTemplateId === tmpl.id
                      return (
                        <div
                          key={tmpl.id}
                          onClick={() => setSelectedTemplateId(tmpl.id)}
                          className={`cursor-pointer rounded-2xl border p-4.5 transition-all duration-200 relative flex flex-col justify-between ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-950/40 shadow-xl shadow-cyan-500/10 ring-1 ring-cyan-400/50'
                              : 'border-slate-800/90 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900/60'
                          }`}
                        >
                          <div>
                            <div className='flex items-center justify-between mb-2.5'>
                              <span className='text-3xl'>{tmpl.icon}</span>
                              <div className='flex items-center gap-1.5'>
                                {isSelected && (
                                  <span className='rounded-full bg-cyan-500 text-slate-950 px-2 py-0.5 text-[9.5px] font-extrabold uppercase shadow-sm'>
                                    ✓ Đã chọn
                                  </span>
                                )}
                                <span className='rounded-lg bg-slate-800/80 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-slate-700'>
                                  {tmpl.badge}
                                </span>
                              </div>
                            </div>
                            <h4 className='text-sm font-bold text-white group-hover:text-cyan-300 transition-colors'>
                              {tmpl.name}
                            </h4>
                            <p className='text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed'>
                              {tmpl.description}
                            </p>
                          </div>

                          <div className='mt-3.5 pt-2.5 border-t border-slate-800/60 flex flex-wrap gap-1'>
                            {tmpl.features.slice(0, 3).map((f, i) => (
                              <span key={i} className='rounded-md bg-slate-900/90 px-1.5 py-0.5 text-[9.5px] text-slate-400 border border-slate-800/60'>
                                ✓ {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* CỘT PHẢI: NHẬP THÔNG TIN PHIÊN */}
                <div className='lg:col-span-5 xl:col-span-4 flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-xl space-y-4 overflow-y-auto max-h-[calc(100vh-230px)]'>
                  <div className='space-y-4'>
                    <div className='pb-3 border-b border-slate-800/80'>
                      <label className='text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5'>
                        <span className='inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 text-[10px] font-black border border-cyan-800/60'>2</span>
                        <span>Thông Tin Phiên Live Stream</span>
                      </label>
                      <p className='text-[11px] text-slate-400 mt-1'>
                        Điền tên nhận diện và tài khoản TikTok phát sóng
                      </p>
                    </div>

                    {/* Template Summary Card */}
                    {(() => {
                      const cur = getTemplate(selectedTemplateId)
                      return (
                        <div className='rounded-xl border border-cyan-500/30 bg-cyan-950/25 p-3 flex items-center gap-3'>
                          <span className='text-2xl p-2 rounded-lg bg-cyan-950/80 border border-cyan-800/60'>
                            {cur?.icon}
                          </span>
                          <div className='flex-1 min-w-0'>
                            <div className='text-[10px] text-cyan-400 font-semibold uppercase tracking-wider'>
                              Template sẽ sử dụng
                            </div>
                            <div className='text-xs font-bold text-white truncate'>
                              {cur?.name}
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Field 1: Tên phiên */}
                    <div className='space-y-1.5'>
                      <label className='block text-xs font-bold text-slate-300'>
                        Tên Phiên Live <span className='text-rose-400'>*</span>
                      </label>
                      <input
                        type='text'
                        required
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        placeholder='Ví dụ: Ca tối - Đua xe Grand Prix, Máy in 3D...'
                        className='w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition'
                      />
                    </div>

                    {/* Field 2: TikTok Username */}
                    <div className='space-y-1.5'>
                      <div className='flex items-center justify-between'>
                        <label className='block text-xs font-bold text-slate-300'>
                          TikTok @username
                        </label>
                        <span className='text-[10px] text-slate-500'>(Tùy chọn, điền sau được)</span>
                      </div>
                      <div className='relative'>
                        <span className='absolute left-3.5 top-2.5 text-slate-500 text-xs font-mono'>@</span>
                        <input
                          type='text'
                          value={newSessionUser}
                          onChange={(e) => setNewSessionUser(e.target.value)}
                          placeholder='username (ví dụ: no1kalista)'
                          className='w-full rounded-xl border border-slate-700 bg-slate-950 pl-8 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono transition'
                        />
                      </div>
                      <p className='text-[10px] text-slate-500'>
                        Hệ thống sẽ tự động quét trạng thái phòng live khi bấm Bắt đầu.
                      </p>
                    </div>

                    <div className='rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400 leading-relaxed'>
                      💡 <strong className='text-slate-300'>Lưu ý:</strong> Mẫu template và Link nguồn OBS Browser Source được tạo sẽ gắn cố định với phiên này để không phải cấu hình lại OBS giữa các buổi live.
                    </div>
                  </div>

                  {/* Submit / Cancel Buttons */}
                  <div className='pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2.5'>
                    <button
                      type='button'
                      onClick={() => setViewMode('sessions')}
                      className='rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer'
                    >
                      Hủy
                    </button>
                    <button
                      type='submit'
                      disabled={isSubmitting}
                      className='cursor-pointer rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 active:scale-95 transition disabled:opacity-50'
                    >
                      {isSubmitting ? 'Đang tạo...' : 'Tạo Phiên Mới 🚀'}
                    </button>
                  </div>
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
                  onClick={() => setShowMusicPlayer(true)}
                  className='rounded-lg border border-indigo-500/40 bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/50 flex items-center gap-1.5 transition cursor-pointer'
                  title='Mở trình phát nhạc nền YouTube / MP3 / Thư mục máy'
                >
                  <span>🎵</span>
                  <span>Nhạc nền</span>
                </button>
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

            {/* AI & TTS LIVE ASSISTANT CONTROL BAR */}
            {(() => {
              const persona = getPersonaInfo(currentSession.templateId)
              return (
                <div className='mx-4 mt-2.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 shadow-sm'>
                  {/* Left: Toggles & Persona Badge */}
                  <div className='flex items-center gap-2.5 flex-wrap'>
                    <div className='flex items-center gap-1.5'>
                      <button
                        type='button'
                        onClick={() => updateAiConfig({ enabled: !aiConfig.enabled })}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                          aiConfig.enabled
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs'
                            : 'bg-slate-950 text-slate-500 border-slate-800'
                        }`}
                        title={aiConfig.enabled ? 'Nhấn để tắt AI tự động' : 'Nhấn để bật AI tự động'}
                      >
                        <span className={`h-2 w-2 rounded-full ${aiConfig.enabled ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span>🤖 AI: {aiConfig.enabled ? 'BẬT' : 'TẮT'}</span>
                      </button>

                      <button
                        type='button'
                        onClick={() => updateAiConfig({ ttsEnabled: !aiConfig.ttsEnabled })}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                          aiConfig.ttsEnabled
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                            : 'bg-slate-950 text-slate-500 border-slate-800'
                        }`}
                        title={aiConfig.ttsEnabled ? 'Nhấn để tắt giọng đọc TTS' : 'Nhấn để bật giọng đọc TTS'}
                      >
                        <span className={`h-2 w-2 rounded-full ${aiConfig.ttsEnabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span>🔊 TTS: {aiConfig.ttsEnabled ? 'BẬT' : 'TẮT'}</span>
                      </button>
                    </div>

                    {/* Persona Badge for this template */}
                    <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${persona.border}`}>
                      <span>{persona.icon}</span>
                      <span>{persona.badge}</span>
                      <span className='hidden xl:inline text-[10px] opacity-80'>· {persona.desc}</span>
                    </div>
                  </div>

                  {/* Center: Live Speech / Status animation */}
                  <div className='flex-1 min-w-[200px] flex items-center justify-center'>
                    {isSpeakingNow ? (
                      <div className='flex items-center gap-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 px-3 py-1 text-xs text-emerald-300 animate-pulse'>
                        <span className='text-sm'>🗣️</span>
                        <span className='font-bold'>Đang nói:</span>
                        <span className='italic font-medium text-white truncate max-w-xs md:max-w-md'>"{lastSpokenText}"</span>
                      </div>
                    ) : (
                      <div className='flex items-center gap-1.5 text-xs text-slate-400'>
                        <span className='h-1.5 w-1.5 rounded-full bg-slate-500' />
                        <span className='text-[11px]'>
                          {aiConfig.enabled
                            ? `AI đang gom chat mỗi ${aiConfig.batchInterval || 6}s để tương tác...`
                            : 'AI đang tạm tắt (nhấn nút Bật AI phía trên)'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Quick Test & Edit Prompt Button */}
                  <div className='flex items-center gap-2'>
                    <button
                      type='button'
                      onClick={() => handleTestSpeak()}
                      className='rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1 cursor-pointer'
                      title='Phát thử 1 câu mẫu tương ứng với template hiện tại'
                    >
                      <span>🗣️</span>
                      <span>Nói thử</span>
                    </button>

                    <button
                      type='button'
                      onClick={() => {
                        setPromptTemplateEditId(currentSession.templateId)
                        setSettingsModalTab('prompts')
                        setShowSettingsModal(true)
                      }}
                      className='rounded-lg border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/50 px-2.5 py-1 text-xs font-semibold text-indigo-300 transition flex items-center gap-1 cursor-pointer'
                      title='Mở trình soạn thảo Kịch bản / Prompt cho template này'
                    >
                      <span>📝</span>
                      <span>Sửa Kịch Bản</span>
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Panels (3 columns) */}
            <div className='grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12 lg:overflow-hidden'>
              {/* CỘT 1: OPTIONS & ACTIONS THEO ĐÚNG TEMPLATE (4 cols) */}
              <div className='flex flex-col gap-4 lg:col-span-4 lg:overflow-y-auto dark-scroll pr-1'>
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
                            onClick={() => {
                              if (act.actionKey === 'vip') {
                                const topPerson = currentSession.queue[0]
                                  ? {
                                      id: currentSession.queue[0].id,
                                      name: currentSession.queue[0].name,
                                      photoUrl: currentSession.queue[0].photo_url || '',
                                      isVip: true,
                                    }
                                  : null
                                sendAction(act.actionKey, topPerson, act.label)
                              } else {
                                sendAction(act.actionKey, act.payload, act.label)
                              }
                            }}
                            className='w-full rounded-xl py-2.5 text-xs font-black transition flex items-center justify-center gap-1.5 bg-linear-to-r from-red-600 to-rose-600 text-white hover:brightness-110 shadow-lg shadow-red-600/25 active:scale-[0.98] cursor-pointer'
                          >
                            {act.icon && <span>{act.icon}</span>}
                            <span>{act.label}</span>
                          </button>
                        ))}

                      {/* Action Buttons: Printer Flow or Template Actions */}
                      {isPrinterTemplate ? (
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
                      ) : (
                        /* Dynamic Actions for Non-Printer Templates (e.g. Photo Wall, Lucky Wheel) */
                        currentTemplate.actions.filter((a) => a.variant !== 'danger' && a.variant !== 'accent').length > 0 && (
                          <div className='grid grid-cols-2 gap-2'>
                            {currentTemplate.actions
                              .filter((a) => a.variant !== 'danger' && a.variant !== 'accent')
                              .map((act) => (
                                <button
                                  key={act.id}
                                  onClick={() => sendAction(act.actionKey, act.payload, act.label)}
                                  className={`rounded-xl py-2 px-2 text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer truncate ${
                                    act.variant === 'warning'
                                      ? 'border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                      : 'border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                                  }`}
                                >
                                  {act.icon && <span>{act.icon}</span>}
                                  <span>{act.label}</span>
                                </button>
                              ))}
                          </div>
                        )
                      )}

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
                          const isSubOption = field.key === 'showTopUsers'
                          return (
                            <label
                              key={field.key}
                              className={`flex items-center gap-2 text-xs cursor-pointer pt-1 transition ${
                                isSubOption ? 'ml-4 pl-2.5 border-l-2 border-cyan-500/50 py-0.5' : ''
                              }`}
                            >
                              <input
                                type='checkbox'
                                checked={!!val}
                                onChange={(e) => {
                                  updateSettingField(field.key, e.target.checked)
                                  sendAction(field.key, e.target.checked)
                                }}
                                className='h-3.5 w-3.5 rounded accent-cyan-500 cursor-pointer'
                              />
                              <span
                                className={`text-[11px] ${
                                  isSubOption
                                    ? val
                                      ? 'text-amber-300 font-semibold'
                                      : 'text-amber-200/70'
                                    : val
                                      ? 'text-white font-medium'
                                      : 'text-slate-300'
                                }`}
                              >
                                {field.label}
                              </span>
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
                        title={
                          isLiveConnected
                            ? 'Dữ liệu đang tự động nhận realtime 24/7! Chỉ bấm nút này khi bạn muốn đổi sang kênh TikTok khác.'
                            : 'Bắt đầu kết nối với kênh TikTok này'
                        }
                        className='rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500 shrink-0 shadow-sm cursor-pointer'
                      >
                        {isLiveConnected ? 'Đổi kênh 🔁' : 'Kết nối ngay ⚡'}
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
                    {/* 2 Tab: Hàng chờ (mặc định) & Đang chạy */}
                    <div className='flex items-center gap-1.5'>
                      <button
                        type='button'
                        onClick={() => setQueueTab('waiting')}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          queueTab === 'waiting'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                            : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800/80'
                        }`}
                      >
                        <span>👥 Hàng chờ</span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                            queueTab === 'waiting'
                              ? 'bg-cyan-500 text-slate-950 font-black'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {currentSession.queueCount}
                        </span>
                      </button>

                      <button
                        type='button'
                        onClick={() => setQueueTab('running')}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition relative ${
                          queueTab === 'running'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                            : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800/80'
                        }`}
                      >
                        <span className='flex items-center gap-1'>
                          {(currentSession.printingUsers || []).length > 0 && (
                            <span className='relative flex h-2 w-2'>
                              <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75'></span>
                              <span className='relative inline-flex rounded-full h-2 w-2 bg-amber-500'></span>
                            </span>
                          )}
                          ⚡ Đang in
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                            queueTab === 'running'
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {Math.min(
                            30,
                            (currentSession.printingUsers || []).length + (currentSession.queue || []).length,
                          )}
                        </span>
                      </button>
                    </div>

                    {queueTab === 'waiting' && currentSession.queueCount > 0 && (
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

                  {queueTab === 'waiting' ? (
                    <>
                      {/* Form thêm thủ công & Faker AI */}
                      <form onSubmit={handleManualAdd} className='mb-3 flex gap-2'>
                        <input
                          type='text'
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          placeholder='Tên khán giả test (hoặc bấm +Thêm để tạo hàng loạt)...'
                          className='flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none'
                        />
                        <button
                          type='button'
                          onClick={() => setManualIsVip(!manualIsVip)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border transition cursor-pointer ${
                            manualIsVip
                              ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {manualIsVip ? '★ VIP' : 'Thường'}
                        </button>
                        <button
                          type='submit'
                          className='rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500 cursor-pointer'
                        >
                          + Thêm
                        </button>
                        <button
                          type='button'
                          onClick={() => setShowFakerModal(true)}
                          title='Mở modal tạo hàng loạt khán giả test bằng Faker AI'
                          className='rounded-lg border border-purple-500/40 bg-purple-500/20 px-2.5 py-1.5 text-xs font-bold text-purple-300 hover:bg-purple-500/30 cursor-pointer flex items-center gap-1 shrink-0'
                        >
                          <span>🎲</span>
                          <span className='hidden sm:inline'>Faker AI</span>
                        </button>
                      </form>

                      {/* Virtualized Queue List */}
                      <VirtualQueueList
                        items={currentSession.queue}
                        sessionId={currentSession.id}
                        getSourceBadge={getSourceBadge}
                      />
                    </>
                  ) : (
                    /* Tab 2: Danh sách 30 người cần in gần nhất */
                    <div className='flex-1 overflow-y-auto dark-scroll space-y-2 pr-1'>
                      {(() => {
                        const printingList = currentSession.printingUsers || []
                        const maxUpcoming = Math.max(0, 30 - printingList.length)
                        const upcomingList = (currentSession.queue || []).slice(0, maxUpcoming)

                        if (printingList.length === 0 && upcomingList.length === 0) {
                          return (
                            <div className='flex h-64 flex-col items-center justify-center text-center text-slate-500'>
                              <span className='text-3xl mb-2'>🖨️</span>
                              <p className='text-xs font-medium text-slate-300 mb-1'>
                                Chưa có khán giả nào trong danh sách in
                              </p>
                              <p className='text-[11px] text-slate-500 max-w-xs'>
                                {isPrinterTemplate
                                  ? 'Khi có khán giả trong hàng chờ hoặc máy in bắt đầu vẽ, 30 lượt in gần nhất sẽ hiển thị tại đây.'
                                  : 'Khán giả bình luận hoặc tặng quà sẽ xuất hiện trong hàng chờ tại đây.'}
                              </p>
                            </div>
                          )
                        }

                        return (
                          <>
                            <div className='flex items-center justify-between text-[11px] font-bold text-slate-400 pb-1 border-b border-slate-800/80'>
                              <span className='flex items-center gap-1'>
                                <span>
                                  {isPrinterTemplate
                                    ? '⚡ TIẾN TRÌNH IN'
                                    : `📋 HÀNG CHỜ ${currentTemplate?.name?.toUpperCase() || 'LIVE'}`}
                                </span>
                                <span className='text-slate-500'>(30 người gần nhất)</span>
                              </span>
                              <span className='text-amber-400 font-mono'>
                                {isPrinterTemplate
                                  ? `${printingList.length} đang vẽ · ${upcomingList.length} sắp in`
                                  : `${upcomingList.length} người chờ`}
                              </span>
                            </div>

                            {/* 1. Những người ĐANG VẼ trên máy in */}
                            {printingList.map((user: any) => (
                              <div
                                key={`printing_${user.id}`}
                                className='flex items-center gap-3 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 p-2.5 shadow-md ring-1 ring-amber-500/30'
                              >
                                <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-amber-400 bg-slate-800 shadow-sm'>
                                  {user.photoUrl ? (
                                    <img
                                      src={user.photoUrl}
                                      alt={user.name}
                                      className='h-full w-full object-cover'
                                      onError={(e) => {
                                        ;(e.target as HTMLElement).style.display = 'none'
                                      }}
                                    />
                                  ) : (
                                    <div className='flex h-full w-full items-center justify-center text-sm font-bold text-slate-300'>
                                      {user.name?.charAt(0) || '👤'}
                                    </div>
                                  )}
                                  <div className='absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border border-slate-900' />
                                </div>

                                <div className='min-w-0 flex-1'>
                                  <div className='flex items-center gap-1.5'>
                                    <span className='truncate text-xs font-bold text-white'>
                                      {user.name}
                                    </span>
                                    {user.isVip ? (
                                      <span className='rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold text-amber-300 border border-amber-500/40'>
                                        👑 VIP
                                      </span>
                                    ) : (
                                      <span className='rounded bg-cyan-500/20 px-1 py-0.2 text-[9px] font-bold text-cyan-300 border border-cyan-500/40'>
                                        {user.source === 'gift' ? '🎁 QUÀ' : '💬 CHAT'}
                                      </span>
                                    )}
                                  </div>
                                  <div className='mt-0.5 flex items-center gap-2 text-[11px] text-amber-300'>
                                    <span className='flex items-center gap-1 font-bold'>
                                      <span className='relative flex h-2 w-2'>
                                        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75'></span>
                                        <span className='relative inline-flex rounded-full h-2 w-2 bg-amber-500'></span>
                                      </span>
                                      ⚡ ĐANG VẼ TRÊN MÁY IN...
                                    </span>
                                    {user.comment && (
                                      <span className='truncate text-[10px] text-slate-400 italic'>
                                        "{user.comment}"
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* 2. Những người TIẾP THEO trong hàng chờ sắp được in */}
                            {upcomingList.map((item, idx) => (
                              <div
                                key={`upcoming_${item.id}`}
                                className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 transition ${
                                  item.is_vip === 1
                                    ? 'border-amber-500/30 bg-amber-950/15'
                                    : item.source === 'gift'
                                    ? 'border-pink-500/25 bg-pink-950/10'
                                    : 'border-slate-800/80 bg-slate-950/50'
                                }`}
                              >
                                <div className='flex items-center gap-2.5 overflow-hidden'>
                                  <div className='flex flex-col items-center justify-center w-8 shrink-0'>
                                    <span className='font-mono text-[10px] font-bold text-cyan-400'>
                                      #{idx + 1}
                                    </span>
                                    <span className='text-[8px] uppercase tracking-wider text-slate-500 font-semibold'>
                                      {isPrinterTemplate ? 'Sắp in' : 'Chờ lượt'}
                                    </span>
                                  </div>

                                  <div className='relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-700 bg-slate-800'>
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
                                      <span className='absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-amber-400 border border-slate-950' />
                                    )}
                                  </div>

                                  <div className='truncate'>
                                    <div className='flex items-center gap-1.5'>
                                      <span className='text-xs font-semibold text-white truncate'>
                                        {item.name}
                                      </span>
                                      {getSourceBadge(item)}
                                    </div>
                                    <div className='text-[10px] text-slate-400 truncate'>
                                      {item.comment ? `"${item.comment}"` : item.gift_name ? `🎁 ${item.gift_name}` : 'Chờ in'}
                                    </div>
                                  </div>
                                </div>

                                <div className='flex items-center gap-1 shrink-0'>
                                  <button
                                    title='Đẩy ưu tiên ngay'
                                    onClick={() =>
                                      window.ipcRenderer?.invoke('queue:force-print', {
                                        sessionId: currentSession.id,
                                        id: item.id,
                                      })
                                    }
                                    className='flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer transition'
                                  >
                                    <span>⚡</span>
                                    <span>
                                      {isPrinterTemplate ? 'In luôn' : 'Ưu tiên'}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </>
                        )
                      })()}
                    </div>
                  )}
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

        {viewMode === 'control' && !currentSession && (
          <Welcome3D
            onOpenCreate={(tmplId) => {
              if (tmplId) setSelectedTemplateId(tmplId)
              setViewMode('create')
            }}
            onOpenSettings={() => setShowSettingsModal(true)}
          />
        )}

        {/* Modal Faker Batch Test Audience */}
        {currentSession && (
          <FakerBatchModal
            isOpen={showFakerModal}
            onClose={() => setShowFakerModal(false)}
            sessionId={currentSession.id}
            onSuccess={(num) => {
              // Toast or notification
              console.log(`Đã thêm thành công ${num} khán giả test`)
            }}
          />
        )}

        {/* Modal Trình phát nhạc nền (YouTube / MP3 / Thư mục máy) */}
        {currentSession && (
          <MusicPlayer
            isOpen={showMusicPlayer}
            onClose={() => setShowMusicPlayer(false)}
            streamKey={currentSession.streamKey}
          />
        )}

        {/* Modal Cài Đặt Hệ Thống: Mạng, AI Provider, TTS & Kịch Bản Template */}
        {showSettingsModal && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4'>
            <div className='w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col'>
              <div className='flex items-center justify-between border-b border-slate-800 pb-3'>
                <div className='flex items-center gap-2'>
                  <span className='text-lg'>⚙️</span>
                  <h3 className='text-sm font-bold text-white uppercase tracking-wider'>
                    Cài Đặt Hệ Thống, AI & TTS Giọng Nói
                  </h3>
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className='rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition'
                >
                  ✕
                </button>
              </div>

              {/* Modal Tabs Bar */}
              <div className='flex items-center gap-1.5 border-b border-slate-800 pb-2.5 overflow-x-auto text-xs font-semibold'>
                {[
                  { id: 'network', label: '🌐 Mạng & Proxy' },
                  { id: 'ai', label: '🤖 AI Provider' },
                  { id: 'tts', label: '🔊 Giọng Nói (TTS)' },
                  { id: 'prompts', label: '📝 Kịch Bản Theo Template' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type='button'
                    onClick={() => setSettingsModalTab(t.id as any)}
                    className={`rounded-lg px-3 py-1.5 transition whitespace-nowrap cursor-pointer ${
                      settingsModalTab === t.id
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Mạng & Proxy (EulerStream, Proxy, Cloudflare) */}
              {settingsModalTab === 'network' && (
                <div className='flex-1 overflow-y-auto dark-scroll space-y-4 pr-1 text-xs'>
                  <p className='text-slate-400 text-[11.5px]'>
                    Cấu hình giúp vượt qua giới hạn kết nối (Rate Limit) và duy trì kết nối TikTok Live 24/7 ổn định.
                  </p>

                  {/* Field 1: EulerStream API Key */}
                  <div className='space-y-1.5'>
                    <div className='flex items-center justify-between'>
                      <label className='font-bold text-slate-300'>
                        EulerStream API Key (Tăng giới hạn request)
                      </label>
                      <a
                        href='https://www.eulerstream.com/pricing'
                        target='_blank'
                        rel='noreferrer'
                        className='text-[10px] text-cyan-400 hover:underline'
                      >
                        Đăng ký miễn phí (2,500 req/ngày) ↗
                      </a>
                    </div>
                    <div className='flex gap-2'>
                      <input
                        type='text'
                        value={signApiKey}
                        onChange={(e) => setSignApiKey(e.target.value)}
                        placeholder='Ví dụ: euler_live_xxxxxx hoặc để trống'
                        className='flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none'
                      />
                      <button
                        type='button'
                        onClick={() => checkEulerUsage()}
                        disabled={eulerUsageLoading}
                        className='px-3 py-2 text-xs font-semibold rounded-xl bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 hover:bg-cyan-900 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0'
                        title='Kiểm tra quota và số request còn lại'
                      >
                        {eulerUsageLoading ? (
                          <>
                            <span className='animate-spin text-xs'>⏳</span>
                            <span>Đang check...</span>
                          </>
                        ) : (
                          <>
                            <span>📊</span>
                            <span>Check Quota</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quota Usage Status Card */}
                    {eulerUsage && (
                      <div className='rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3 space-y-2 text-xs'>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-1.5'>
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${eulerUsage.isCustomKey ? 'bg-emerald-400' : 'bg-amber-400'}`}
                            />
                            <span className='font-bold text-white text-[11px]'>
                              {eulerUsage.isCustomKey ? 'Key Riêng Hợp Lệ' : 'Dùng Chung (Chưa có Key)'}
                            </span>
                          </div>
                          {eulerUsage.day?.reset_at && (
                            <span className='text-[10px] text-slate-400 font-mono'>
                              Reset ngày:{' '}
                              {new Date(eulerUsage.day.reset_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>

                        <div className='grid grid-cols-2 gap-2'>
                          <div className='rounded-lg bg-slate-900/90 border border-slate-800 p-2'>
                            <div className='text-[10px] text-slate-400'>Hạn Mức Hôm Nay</div>
                            <div className='text-sm font-black text-cyan-300 font-mono mt-0.5'>
                              {eulerUsage.day
                                ? `${eulerUsage.day.remaining.toLocaleString()} / ${eulerUsage.day.max.toLocaleString()}`
                                : '—'}
                            </div>
                            <div className='text-[9.5px] text-slate-400 mt-1 flex justify-between'>
                              <span>Còn lại</span>
                              <span className='font-bold text-cyan-400'>
                                {eulerUsage.day
                                  ? `${Math.round((eulerUsage.day.remaining / Math.max(1, eulerUsage.day.max)) * 100)}%`
                                  : '0%'}
                              </span>
                            </div>
                            <div className='h-1 w-full bg-slate-800 rounded-full mt-1 overflow-hidden'>
                              <div
                                className='h-full bg-cyan-400 transition-all duration-300'
                                style={{
                                  width: `${eulerUsage.day ? Math.min(100, Math.round((eulerUsage.day.remaining / Math.max(1, eulerUsage.day.max)) * 100)) : 0}%`,
                                }}
                              />
                            </div>
                          </div>

                          <div className='rounded-lg bg-slate-900/90 border border-slate-800 p-2'>
                            <div className='text-[10px] text-slate-400'>Hạn Mức Trong Giờ</div>
                            <div className='text-sm font-black text-emerald-300 font-mono mt-0.5'>
                              {eulerUsage.hour
                                ? `${eulerUsage.hour.remaining.toLocaleString()} / ${eulerUsage.hour.max.toLocaleString()}`
                                : '—'}
                            </div>
                            <div className='text-[9.5px] text-slate-400 mt-1 flex justify-between'>
                              <span>Còn lại</span>
                              <span className='font-bold text-emerald-400'>
                                {eulerUsage.hour
                                  ? `${Math.round((eulerUsage.hour.remaining / Math.max(1, eulerUsage.hour.max)) * 100)}%`
                                  : '0%'}
                              </span>
                            </div>
                            <div className='h-1 w-full bg-slate-800 rounded-full mt-1 overflow-hidden'>
                              <div
                                className='h-full bg-emerald-400 transition-all duration-300'
                                style={{
                                  width: `${eulerUsage.hour ? Math.min(100, Math.round((eulerUsage.hour.remaining / Math.max(1, eulerUsage.hour.max)) * 100)) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {eulerUsageError && (
                      <div className='rounded-xl border border-rose-500/30 bg-rose-950/30 p-2 text-xs text-rose-300 flex items-center gap-2'>
                        <span>⚠️</span>
                        <span className='font-mono text-[11px]'>{eulerUsageError}</span>
                      </div>
                    )}
                  </div>

                  {/* Field 2: HTTP / HTTPS Multi-Proxy */}
                  <div className='space-y-1.5'>
                    <div className='flex items-center justify-between'>
                      <label className='font-bold text-slate-300'>
                        Danh sách Proxy HTTP / HTTPS (Mỗi dòng 1 Proxy)
                      </label>
                      <span className='text-[10px] text-slate-400 font-mono'>
                        {proxyUrl.split('\n').filter((l) => Boolean(l.trim())).length} proxy
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={proxyUrl}
                      onChange={(e) => setProxyUrl(e.target.value)}
                      placeholder='http://user:pass@123.45.67.89:8080&#10;http://user:pass@98.76.54.32:8888'
                      className='w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-cyan-300 placeholder-slate-600 focus:border-cyan-500 focus:outline-none resize-y'
                    />
                  </div>

                  {/* Field 3: Custom Sign Server URL */}
                  <div className='space-y-1.5'>
                    <label className='font-bold text-slate-300'>
                      Custom Sign Server URL (Tùy chọn nâng cao)
                    </label>
                    <input
                      type='text'
                      value={signApiUrl}
                      onChange={(e) => setSignApiUrl(e.target.value)}
                      placeholder='Mặc định: https://api.eulerstream.com'
                      className='w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none'
                    />
                  </div>

                  {/* Cloudflare Tunnel */}
                  <div className='rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2'>
                    <div className='flex items-center justify-between text-xs'>
                      <span className='font-bold text-slate-300'>🌐 Cloudflare Tunnel Online</span>
                      <span className={`font-mono text-[10px] ${tunnelUrl ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {tunnelUrl ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                      </span>
                    </div>
                    {tunnelUrl ? (
                      <div className='flex items-center gap-2'>
                        <input
                          type='text'
                          readOnly
                          value={getOnlineObsUrl()}
                          className='flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-cyan-300 truncate'
                        />
                        <button
                          onClick={() => copyOnlineObsUrl()}
                          className='rounded-lg bg-cyan-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-cyan-500 transition cursor-pointer'
                        >
                          {copyTunnelToast ? 'Đã chép' : 'Chép'}
                        </button>
                      </div>
                    ) : (
                      <p className='text-[10.5px] text-slate-500'>
                        Bật Tunnel ở thanh trên cùng để tạo link public HTTPS mở từ xa trên máy khác.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: AI Provider (OpenAI, Gemini, Ollama, DeepSeek, Rule-based) */}
              {settingsModalTab === 'ai' && (
                <div className='flex-1 overflow-y-auto dark-scroll space-y-4 pr-1 text-xs'>
                  {/* Master AI Toggle */}
                  <div className='flex items-center justify-between rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3'>
                    <div>
                      <div className='font-bold text-cyan-300 flex items-center gap-1.5'>
                        <span>🤖</span>
                        <span>Trợ Lý Ảo Tương Tác AI Livestream</span>
                      </div>
                      <p className='text-[11px] text-slate-400 mt-0.5'>
                        Tự động lắng nghe chat và quà tặng, chọn lọc phản hồi dí dỏm bằng giọng nói tự nhiên.
                      </p>
                    </div>
                    <label className='relative inline-flex items-center cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={aiConfig.enabled}
                        onChange={(e) => updateAiConfig({ enabled: e.target.checked })}
                        className='sr-only peer'
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                  </div>

                  {/* Provider Selector */}
                  <div className='space-y-1.5'>
                    <label className='font-bold text-slate-300'>
                      Nhà Cung Cấp AI (AI Provider)
                    </label>
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-2'>
                      {[
                        { id: 'openai', name: 'OpenAI (GPT-4o)', desc: 'Chuẩn quốc tế, phản hồi thông minh' },
                        { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 1.5 Flash cực nhanh & rẻ' },
                        { id: 'ollama', name: 'Ollama Local (Offline)', desc: 'Miễn phí trên máy, không cần API Key' },
                        { id: 'deepseek', name: 'DeepSeek AI', desc: 'Rất thông minh tiếng Việt, giá cực rẻ' },
                        { id: 'custom', name: 'Tùy Chỉnh (OpenRouter/Groq)', desc: 'Chuẩn OpenAI compatible bất kỳ' },
                        { id: 'rule_based', name: 'Cố Định (Không cần Key)', desc: 'Tự động nói kịch bản không tốn tiền' },
                      ].map((prov) => (
                        <button
                          key={prov.id}
                          type='button'
                          onClick={() => {
                            const updates: any = { provider: prov.id }
                            if (prov.id === 'gemini') {
                              updates.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai'
                              updates.model = 'gemini-1.5-flash'
                            } else if (prov.id === 'ollama') {
                              updates.baseUrl = 'http://localhost:11434/v1'
                              updates.model = 'qwen2.5:3b'
                            } else if (prov.id === 'deepseek') {
                              updates.baseUrl = 'https://api.deepseek.com/v1'
                              updates.model = 'deepseek-chat'
                            } else if (prov.id === 'openai') {
                              updates.baseUrl = 'https://api.openai.com/v1'
                              updates.model = 'gpt-4o-mini'
                            }
                            updateAiConfig(updates)
                          }}
                          className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                            aiConfig.provider === prov.id
                              ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300 shadow-sm'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className='font-bold text-[11.5px]'>{prov.name}</div>
                          <div className='text-[10px] opacity-75 mt-0.5 line-clamp-1'>{prov.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {aiConfig.provider !== 'rule_based' && (
                    <div className='space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3'>
                      {/* API Key */}
                      <div className='space-y-1'>
                        <div className='flex items-center justify-between'>
                          <label className='font-bold text-slate-300'>
                            API Key {aiConfig.provider === 'ollama' ? '(Ollama không bắt buộc)' : ''}
                          </label>
                          <button
                            type='button'
                            onClick={() => setShowApiKey(!showApiKey)}
                            className='text-[10px] text-slate-400 hover:text-white cursor-pointer'
                          >
                            {showApiKey ? 'Ẩn' : 'Hiện'}
                          </button>
                        </div>
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={aiConfig.apiKey}
                          onChange={(e) => updateAiConfig({ apiKey: e.target.value })}
                          placeholder={aiConfig.provider === 'ollama' ? 'Không cần điền đối với Ollama' : 'sk-...'}
                          className='w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-mono text-cyan-300 placeholder-slate-600 focus:border-cyan-500 focus:outline-none'
                        />
                      </div>

                      {/* Base URL & Model */}
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                        <div className='space-y-1'>
                          <label className='font-bold text-slate-300'>Base URL API</label>
                          <input
                            type='text'
                            value={aiConfig.baseUrl}
                            onChange={(e) => updateAiConfig({ baseUrl: e.target.value })}
                            placeholder='https://api.openai.com/v1'
                            className='w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none'
                          />
                        </div>

                        <div className='space-y-1'>
                          <label className='font-bold text-slate-300'>Tên Model</label>
                          <input
                            type='text'
                            value={aiConfig.model}
                            onChange={(e) => updateAiConfig({ model: e.target.value })}
                            placeholder='gpt-4o-mini'
                            className='w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none'
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Batching & Rate Limit handling for crowd */}
                  <div className='rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-3'>
                    <div className='font-bold text-slate-300 flex items-center justify-between'>
                      <span>⏱️ Cơ Chế Gom Bình Luận (Chống Tràn & Chống Quá Tải Khi Đông Người)</span>
                      <span className='rounded bg-cyan-950 border border-cyan-800 px-2 py-0.5 text-cyan-400 font-mono text-[11px] font-bold'>
                        Mỗi {aiConfig.batchInterval || 6} giây
                      </span>
                    </div>

                    <p className='text-[11px] text-slate-400'>
                      Khi phòng live có hàng nghìn comment, AI không đọc từng câu một mà gom lại trong cửa sổ thời gian này, ưu tiên người gửi quà & VIP rồi đúc kết thành 1 câu nói tự nhiên.
                    </p>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                      <div className='space-y-1'>
                        <div className='flex justify-between text-[11px] text-slate-400'>
                          <span>Khoảng cách gom chat:</span>
                          <span className='font-bold text-cyan-400'>{aiConfig.batchInterval || 6} giây</span>
                        </div>
                        <input
                          type='range'
                          min={3}
                          max={15}
                          step={1}
                          value={aiConfig.batchInterval || 6}
                          onChange={(e) => updateAiConfig({ batchInterval: parseInt(e.target.value, 10) || 6 })}
                          className='w-full accent-cyan-500 cursor-pointer'
                        />
                      </div>

                      <div className='space-y-1'>
                        <div className='flex justify-between text-[11px] text-slate-400'>
                          <span>Số bình luận tối đa lấy mỗi đợt:</span>
                          <span className='font-bold text-cyan-400'>{aiConfig.maxBatchSize || 6} comment</span>
                        </div>
                        <input
                          type='range'
                          min={1}
                          max={10}
                          step={1}
                          value={aiConfig.maxBatchSize || 6}
                          onChange={(e) => updateAiConfig({ maxBatchSize: parseInt(e.target.value, 10) || 6 })}
                          className='w-full accent-cyan-500 cursor-pointer'
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Giọng Nói TTS */}
              {settingsModalTab === 'tts' && (
                <div className='flex-1 overflow-y-auto dark-scroll space-y-4 pr-1 text-xs'>
                  {/* Master TTS Toggle */}
                  <div className='flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3'>
                    <div>
                      <div className='font-bold text-emerald-300 flex items-center gap-1.5'>
                        <span>🔊</span>
                        <span>Đọc Bằng Giọng Nói (Text-to-Speech)</span>
                      </div>
                      <p className='text-[11px] text-slate-400 mt-0.5'>
                        Phát âm thanh câu trả lời của AI ra loa hoặc truyền trực tiếp vào OBS Browser Source.
                      </p>
                    </div>
                    <label className='relative inline-flex items-center cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={aiConfig.ttsEnabled}
                        onChange={(e) => updateAiConfig({ ttsEnabled: e.target.checked })}
                        className='sr-only peer'
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* Engine Selection */}
                  <div className='space-y-1.5'>
                    <label className='font-bold text-slate-300'>Nhà Cung Cấp & Công Nghệ Đọc (TTS Engine)</label>
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-2'>
                      {[
                        { id: 'webspeech', name: '⚡ Web Speech (Bản Địa)', desc: '0ms trễ, miễn phí, tích hợp Windows & Chrome' },
                        { id: 'google', name: '☁️ Google TTS (Free MP3)', desc: 'Giọng chuẩn Google tiếng Việt, không cần Key' },
                        { id: 'openai', name: '🤖 OpenAI Audio Speech', desc: 'Mô hình tts-1 / tts-1-hd, giọng rất mượt' },
                        { id: 'elevenlabs', name: '🎙️ ElevenLabs AI', desc: 'Giọng nói AI truyền cảm, hỗ trợ Voice ID' },
                        { id: 'custom_remote', name: '🌐 Custom Remote API', desc: 'Gọi API endpoint âm thanh riêng (GET/POST)' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type='button'
                          onClick={() => {
                            const updates: any = { ttsEngine: item.id }
                            if (item.id === 'openai') {
                              updates.ttsBaseUrl = 'https://api.openai.com/v1'
                              updates.ttsModel = 'tts-1'
                              updates.ttsVoice = 'nova'
                            } else if (item.id === 'elevenlabs') {
                              updates.ttsModel = 'eleven_multilingual_v2'
                              updates.ttsVoice = '21m00Tcm4TlvDq8ikWAM'
                            }
                            updateAiConfig(updates)
                          }}
                          className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                            aiConfig.ttsEngine === item.id
                              ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300 shadow-sm'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className='font-bold text-[11.5px]'>{item.name}</div>
                          <div className='text-[10px] opacity-75 mt-0.5 line-clamp-1'>{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Remote TTS Configuration Card */}
                  {(aiConfig.ttsEngine === 'openai' || aiConfig.ttsEngine === 'elevenlabs' || aiConfig.ttsEngine === 'custom_remote') && (
                    <div className='space-y-3 rounded-xl border border-emerald-500/30 bg-slate-950/70 p-3'>
                      <div className='font-bold text-emerald-300 flex items-center justify-between'>
                        <span>⚙️ Cấu Hình Remote TTS API ({aiConfig.ttsEngine.toUpperCase()})</span>
                        <span className='text-[10px] text-slate-400 font-normal'>Tự động fallback về Google TTS nếu lỗi API</span>
                      </div>

                      {/* API Key */}
                      <div className='space-y-1'>
                        <label className='font-bold text-slate-300'>
                          API Key / Token {aiConfig.ttsEngine === 'elevenlabs' ? '(xi-api-key)' : '(Bearer Token)'}
                        </label>
                        <input
                          type='password'
                          value={aiConfig.ttsApiKey}
                          onChange={(e) => updateAiConfig({ ttsApiKey: e.target.value })}
                          placeholder={aiConfig.ttsEngine === 'openai' ? 'sk-...' : 'Nhập API key'}
                          className='w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-mono text-emerald-300 placeholder-slate-600 focus:border-emerald-500 focus:outline-none'
                        />
                      </div>

                      {/* Endpoint Base URL & Model & Voice */}
                      <div className='grid grid-cols-1 md:grid-cols-3 gap-2.5'>
                        <div className='space-y-1'>
                          <label className='font-bold text-slate-300'>
                            {aiConfig.ttsEngine === 'custom_remote' ? 'Endpoint URL (HTTP/S)' : 'Base URL'}
                          </label>
                          <input
                            type='text'
                            value={aiConfig.ttsBaseUrl}
                            onChange={(e) => updateAiConfig({ ttsBaseUrl: e.target.value })}
                            placeholder={
                              aiConfig.ttsEngine === 'openai'
                                ? 'https://api.openai.com/v1'
                                : aiConfig.ttsEngine === 'elevenlabs'
                                ? 'https://api.elevenlabs.io/v1'
                                : 'http://my-tts-server/api/speak'
                            }
                            className='w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none'
                          />
                        </div>

                        <div className='space-y-1'>
                          <label className='font-bold text-slate-300'>Model</label>
                          <input
                            type='text'
                            value={aiConfig.ttsModel}
                            onChange={(e) => updateAiConfig({ ttsModel: e.target.value })}
                            placeholder={aiConfig.ttsEngine === 'openai' ? 'tts-1' : 'eleven_multilingual_v2'}
                            className='w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none'
                          />
                        </div>

                        <div className='space-y-1'>
                          <label className='font-bold text-slate-300'>
                            {aiConfig.ttsEngine === 'elevenlabs' ? 'Voice ID' : 'Voice Name'}
                          </label>
                          <input
                            type='text'
                            value={aiConfig.ttsVoice}
                            onChange={(e) => updateAiConfig({ ttsVoice: e.target.value })}
                            placeholder={aiConfig.ttsEngine === 'openai' ? 'nova, alloy, shimmer' : 'Voice ID'}
                            className='w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none'
                          />
                        </div>
                      </div>

                      {aiConfig.ttsEngine === 'custom_remote' && (
                        <div className='flex items-center gap-4 text-slate-300 pt-1'>
                          <span className='font-bold'>Phương thức HTTP:</span>
                          <label className='flex items-center gap-1 cursor-pointer'>
                            <input
                              type='radio'
                              name='customMethod'
                              checked={aiConfig.ttsCustomMethod !== 'GET'}
                              onChange={() => updateAiConfig({ ttsCustomMethod: 'POST' })}
                              className='accent-emerald-500'
                            />
                            <span>POST (JSON body)</span>
                          </label>
                          <label className='flex items-center gap-1 cursor-pointer'>
                            <input
                              type='radio'
                              name='customMethod'
                              checked={aiConfig.ttsCustomMethod === 'GET'}
                              onChange={() => updateAiConfig({ ttsCustomMethod: 'GET' })}
                              className='accent-emerald-500'
                            />
                            <span>GET (?text=...)</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Audio Ducking Control */}
                  <div className='rounded-xl border border-slate-800 bg-slate-950/70 p-3'>
                    <label className='flex items-start gap-2.5 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={aiConfig.ttsDuckMusic !== false}
                        onChange={(e) => updateAiConfig({ ttsDuckMusic: e.target.checked })}
                        className='h-4 w-4 rounded accent-emerald-500 mt-0.5'
                      />
                      <div>
                        <div className='font-bold text-slate-200 flex items-center gap-1.5'>
                          <span>🎵</span>
                          <span>Tự Động Giảm Nhỏ Nhạc Nền Khi Có Giọng Đọc (Music Ducking)</span>
                        </div>
                        <p className='text-[10.5px] text-slate-400 mt-0.5 leading-relaxed'>
                          Khi AI bắt đầu nói, âm lượng nhạc nền (YouTube hoặc MP3) trong OBS sẽ tự động hạ xuống <b>18%</b> để khán giả nghe rõ lời thoại, và tự động khôi phục lại âm lượng ban đầu khi đọc xong.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Speed & Volume Controls */}
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3'>
                    <div className='space-y-1.5'>
                      <div className='flex justify-between text-slate-300 font-semibold'>
                        <span>Tốc độ đọc (Speed):</span>
                        <span className='font-mono font-bold text-emerald-400'>{aiConfig.ttsSpeed || 1.0}×</span>
                      </div>
                      <input
                        type='range'
                        min={0.8}
                        max={1.5}
                        step={0.1}
                        value={aiConfig.ttsSpeed || 1.0}
                        onChange={(e) => updateAiConfig({ ttsSpeed: parseFloat(e.target.value) || 1.0 })}
                        className='w-full accent-emerald-500 cursor-pointer'
                      />
                      <div className='flex justify-between text-[10px] text-slate-500'>
                        <span>0.8× (Chậm rãi)</span>
                        <span>1.0× (Bình thường)</span>
                        <span>1.5× (Nhanh, dồn dập)</span>
                      </div>
                    </div>

                    <div className='space-y-1.5'>
                      <div className='flex justify-between text-slate-300 font-semibold'>
                        <span>Âm lượng (Volume):</span>
                        <span className='font-mono font-bold text-emerald-400'>
                          {Math.round((aiConfig.ttsVolume || 1.0) * 100)}%
                        </span>
                      </div>
                      <input
                        type='range'
                        min={0.2}
                        max={1.0}
                        step={0.05}
                        value={aiConfig.ttsVolume || 1.0}
                        onChange={(e) => updateAiConfig({ ttsVolume: parseFloat(e.target.value) || 1.0 })}
                        className='w-full accent-emerald-500 cursor-pointer'
                      />
                      <div className='flex justify-between text-[10px] text-slate-500'>
                        <span>20%</span>
                        <span>60%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>

                  {/* Playback Destinations */}
                  <div className='rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5'>
                    <label className='font-bold text-slate-300'>Nơi Phát Âm Thanh</label>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                      <label className='flex items-center gap-2 rounded-lg bg-slate-900/80 p-2.5 border border-slate-800 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={aiConfig.playInApp}
                          onChange={(e) => updateAiConfig({ playInApp: e.target.checked })}
                          className='h-4 w-4 rounded accent-emerald-500'
                        />
                        <div>
                          <div className='font-bold text-slate-200'>Phát trên máy tính này</div>
                          <div className='text-[10px] text-slate-400'>Streamer nghe trực tiếp qua loa / tai nghe máy</div>
                        </div>
                      </label>

                      <label className='flex items-center gap-2 rounded-lg bg-slate-900/80 p-2.5 border border-slate-800 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={aiConfig.playInObs}
                          onChange={(e) => updateAiConfig({ playInObs: e.target.checked })}
                          className='h-4 w-4 rounded accent-emerald-500'
                        />
                        <div>
                          <div className='font-bold text-slate-200'>Phát qua OBS Preview / Overlay</div>
                          <div className='text-[10px] text-slate-400'>OBS Browser Source tự thu âm thanh vào luồng phát</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Test Speak Sandbox */}
                  <div className='rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2'>
                    <label className='font-bold text-slate-300'>Thử Giọng Đọc</label>
                    <div className='flex gap-2'>
                      <input
                        type='text'
                        value={testSpeechInput}
                        onChange={(e) => setTestSpeechInput(e.target.value)}
                        placeholder='Ví dụ: Chào mừng anh em đã đến với giải đua xe ngày hôm nay!'
                        className='flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none'
                      />
                      <button
                        type='button'
                        onClick={() => handleTestSpeak(testSpeechInput)}
                        className='px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition shadow flex items-center gap-1.5 cursor-pointer shrink-0'
                      >
                        <span>🗣️</span>
                        <span>Nói Thử</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Kịch Bản Prompt Theo Từng Loại Template */}
              {settingsModalTab === 'prompts' && (
                <div className='flex-1 overflow-y-auto dark-scroll space-y-3.5 pr-1 text-xs'>
                  <p className='text-slate-400 text-[11.5px]'>
                    Mỗi template có phong cách (Persona) và kịch bản tương tác khác nhau. Chọn template dưới đây để tùy biến prompt cho AI:
                  </p>

                  {/* Dynamic Template Picker */}
                  <div className='flex items-center gap-2 overflow-x-auto pb-1.5'>
                    {templates.map((item) => (
                      <button
                        key={item.id}
                        type='button'
                        onClick={() => setPromptTemplateEditId(item.id)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border whitespace-nowrap cursor-pointer ${
                          promptTemplateEditId === item.id
                            ? 'border-indigo-500 bg-indigo-950 text-indigo-300 shadow-sm'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>{item.icon || '🎮'}</span>
                        <span>{item.name}</span>
                      </button>
                    ))}

                    <button
                      type='button'
                      onClick={() => setPromptTemplateEditId('default')}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border whitespace-nowrap cursor-pointer ${
                        promptTemplateEditId === 'default'
                          ? 'border-indigo-500 bg-indigo-950 text-indigo-300 shadow-sm'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>💬</span>
                      <span>Chat Chung / Mặc Định</span>
                    </button>
                  </div>

                  {/* Persona Overview Box */}
                  {(() => {
                    const info = getPersonaInfo(promptTemplateEditId)
                    return (
                      <div className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${info.border}`}>
                        <div className='flex items-center gap-2'>
                          <span className='text-xl'>{info.icon}</span>
                          <div>
                            <div className='font-bold text-[12px]'>{info.badge}</div>
                            <div className='text-[10.5px] opacity-80 mt-0.5'>{info.desc}</div>
                          </div>
                        </div>
                        <button
                          type='button'
                          onClick={() => handleResetPrompt(promptTemplateEditId)}
                          className='rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white transition cursor-pointer shrink-0'
                          title='Khôi phục nội dung prompt ban đầu do hệ thống soạn sẵn'
                        >
                          🔄 Khôi phục mặc định
                        </button>
                      </div>
                    )
                  })()}

                  {/* Prompt Textarea */}
                  <div className='space-y-1.5'>
                    <div className='flex items-center justify-between text-slate-300 font-bold'>
                      <label>System Prompt (Chỉ dẫn hành vi cho AI)</label>
                      <span className='text-[10px] text-slate-500 font-mono'>
                        {(aiConfig.templatePrompts[promptTemplateEditId] || defaultPrompts[promptTemplateEditId] || '').length} ký tự
                      </span>
                    </div>

                    <textarea
                      rows={8}
                      value={aiConfig.templatePrompts[promptTemplateEditId] || defaultPrompts[promptTemplateEditId] || ''}
                      onChange={(e) => {
                        const newPrompts = {
                          ...aiConfig.templatePrompts,
                          [promptTemplateEditId]: e.target.value,
                        }
                        updateAiConfig({ templatePrompts: newPrompts })
                      }}
                      placeholder='Nhập prompt chỉ dẫn cho AI khi chạy template này...'
                      className='w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-cyan-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none resize-y leading-relaxed'
                    />

                    <div className='rounded-lg bg-slate-950/60 border border-slate-800/80 p-2.5 text-[10.5px] text-slate-400 space-y-1'>
                      <p className='font-bold text-slate-300'>💡 Mẹo viết prompt cho TTS chuẩn & cuốn hút:</p>
                      <ul className='list-disc list-inside space-y-0.5 text-slate-400'>
                        <li><b>Giới hạn độ dài:</b> Yêu cầu AI trả lời dưới 25 từ để TTS đọc dứt khoát, không bị dài dòng.</li>
                        <li><b>Cá tính hóa:</b> Đặt tên xưng hô rõ ràng (Em/Quản đốc/Caster F1/Bartender).</li>
                        <li><b>Kêu gọi tương tác:</b> Nhắc người xem bình luận từ khóa, thả tim hoặc tặng quà tiếp Nitro/nhận ảnh.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer Buttons */}
              <div className='flex items-center justify-between pt-3 border-t border-slate-800'>
                <div className='text-[11px] text-slate-500'>
                  {settingsSavedToast ? '✅ Đã lưu cấu hình tự động' : 'Tất cả thay đổi đều được lưu vào máy'}
                </div>

                <div className='flex items-center gap-2'>
                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className='rounded-xl border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer'
                  >
                    Đóng
                  </button>
                  <button
                    onClick={async () => {
                      await handleSaveConfigs()
                      await updateAiConfig({})
                      showNotice('✅ Đã lưu toàn bộ cấu hình')
                    }}
                    className='rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition shadow flex items-center gap-1.5 cursor-pointer'
                  >
                    {settingsSavedToast ? '✅ Đã Lưu Thành Công' : '💾 Lưu Cấu Hình'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
