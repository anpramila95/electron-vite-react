import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector'
import { fakerVI, fakerEN } from '@faker-js/faker'
import { db, type DbLogItem, type DbQueueItem, type SessionRecord } from './db'

// Monkey patch to permanently prevent calling EulerStream paid endpoints
;(TikTokLiveConnection.prototype as any).fetchAvailableGifts = async function () {
  return []
}
;(TikTokLiveConnection.prototype as any).fetchRoomInfo = async function () {
  return { data: { status: 2 } }
}

export interface StreamSettings {
  title?: string
  subtitle?: string
  theme?: number
  speed?: number
  cardsPerSheet?: number
  rare?: boolean
  paused?: boolean
  turbo?: boolean
  rotate?: boolean
  greetingText?: string
  greetingInterval?: number
  [key: string]: any
}

export interface TikTokConfig {
  username: string
  // Priority & Entry rules
  onJoin: boolean            // Tham gia live -> vao hang cho
  onChat: boolean            // Binh luan -> vao hang cho
  chatKeywordOnly: boolean   // Chi khi chua tu khoa
  keyword: string            // Tu khoa binh luan
  onGift: boolean            // Tang qua -> vao hang cho uu tien
  bigGiftThreshold: number   // Nguong xu qua lon (>= nguong nay thanh VIP)
  onLike: boolean            // Tha tim -> vao hang cho
  onShare: boolean           // Chia se -> vao hang cho
  allowDuplicates: boolean   // Cho phep trung lap
  autoFaker?: boolean        // Tu dong sinh bot moi khi vang khach (24/7)
  autoFakerInterval?: number // Khoang thoi gian moi giay (mac dinh 20s)
  signApiKey?: string
  sessionId?: string
}

const BOT_GIFTS = [
  { name: 'Hoa hồng', diamonds: 1 },
  { name: 'Trái tim', diamonds: 1 },
  { name: 'Bắn tim', diamonds: 5 },
  { name: 'Trà sữa', diamonds: 10 },
  { name: 'Cây kem', diamonds: 1 },
  { name: 'Nước hoa', diamonds: 20 },
]

const getBestAvatar = (user: any): string => {
  if (!user) return ''
  if (typeof user === 'string' && user.startsWith('http')) return user

  // 1. ƯU TIÊN SỐ 1: avatarLarge (ảnh độ phân giải cao nhất do TikTok CDN trả về)
  const large =
    user.avatarLarge?.urlList?.[0] ||
    user.avatar_large?.url_list?.[0] ||
    (Array.isArray(user.avatarLarge) ? user.avatarLarge[0] : '')

  if (typeof large === 'string' && large.startsWith('http')) {
    return large
  }

  // 2. ƯU TIÊN SỐ 2: avatarMedium (ảnh kích thước trung bình 200x200 / 300x300)
  const medium =
    user.avatarMedium?.urlList?.[0] ||
    user.avatar_medium?.url_list?.[0] ||
    (Array.isArray(user.avatarMedium) ? user.avatarMedium[0] : '')

  if (typeof medium === 'string' && medium.startsWith('http')) {
    return medium
  }

  // 3. Fallback: avatarThumb hoặc profilePictureUrl (nếu chỉ có ảnh 72x72)
  const fallback =
    user.avatar?.urlList?.[0] ||
    user.profilePictureUrls?.[0] ||
    user.profilePictureUrl ||
    user.avatarUrl ||
    user.avatar ||
    user.picture ||
    user.avatarThumb?.urlList?.[0] ||
    user.avatar_thumb?.url_list?.[0] ||
    (Array.isArray(user.avatarThumb) ? user.avatarThumb[0] : '') ||
    user.avatarThumbUrl ||
    ''

  return typeof fallback === 'string' && fallback.startsWith('http') ? fallback : ''
}

export class LiveSessionInstance {
  public id: string
  public streamKey: string
  public templateId: string
  public name: string
  public settings: StreamSettings
  public tiktokConfig: TikTokConfig
  public status: 'idle' | 'running' | 'stopped' = 'idle'

  private connection: any = null
  private isConnected = false
  private viewerCount = 0
  private likeCount = 0
  private totalViewers = 0
  private onBroadcast: (event: string, data: any) => void
  private currentProxy = ''
  private lastFailedProxies = new Set<string>()

  // Điểm tích lũy thống nhất toàn hệ thống của người xem trong phiên live này
  private userScores = new Map<string, { uniqueId: string; name: string; avatarUrl: string; score: number; isVip: boolean }>()

  public getUserScore(uniqueId: string) {
    return this.userScores.get(uniqueId)?.score || 0
  }

  public getAllScores() {
    return Array.from(this.userScores.values()).sort((a, b) => b.score - a.score)
  }

  private addUserScore(uniqueId: string, name: string, avatarUrl: string, addPoints: number, isVip = false) {
    if (!uniqueId || addPoints <= 0) return
    const current = this.userScores.get(uniqueId) || {
      uniqueId,
      name,
      avatarUrl,
      score: 0,
      isVip: false,
    }
    current.score += addPoints
    if (name) current.name = name
    if (avatarUrl) current.avatarUrl = avatarUrl
    if (isVip) current.isVip = true
    this.userScores.set(uniqueId, current)

    this.onBroadcast('user_score', {
      sessionKey: this.streamKey,
      user: current,
    })
  }

  private pickProxy(): string {
    const raw = db.getConfig('proxyUrl')
    if (!raw) return ''
    const list = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => Boolean(l) && !l.startsWith('#'))
    if (list.length === 0) return ''

    const available = list.filter((p) => !this.lastFailedProxies.has(p))
    const pool = available.length > 0 ? available : list
    if (available.length === 0) this.lastFailedProxies.clear()

    const picked = pool[Math.floor(Math.random() * pool.length)]
    this.currentProxy = picked
    return picked
  }

  public rotateProxy(failedReason?: string): string {
    if (this.currentProxy) {
      this.lastFailedProxies.add(this.currentProxy)
    }
    const next = this.pickProxy()
    if (next) {
      const masked = next.replace(/:\/\/[^@]*@/, '://***:***@')
      this.addLog(
        'system',
        'Đổi Proxy',
        `Chuyển sang Proxy: ${masked} (${failedReason || 'Luân phiên tự động'})`,
      )
    }
    return next
  }

  // 24/7 Auto-retry & Reconnect engine
  private shouldRun = false
  private retryTimer: any = null
  private retryCount = 0
  private readonly maxRetryDelay = 15000 // Max 15 seconds
  private lastMessageTime = Date.now()
  private watchdogTimer: NodeJS.Timeout | null = null

  private startWatchdog() {
    this.stopWatchdog()
    this.lastMessageTime = Date.now()
    this.watchdogTimer = setInterval(() => {
      if (!this.shouldRun) {
        this.stopWatchdog()
        return
      }
      // If 30s passed without any message from TikTok -> dead/frozen socket
      if (Date.now() - this.lastMessageTime > 30000) {
        this.addLog(
          'system',
          'Tự phục hồi kết nối 24/7',
          'Quá 30s không nhận được tín hiệu từ TikTok. Đang tự động kết nối lại ngay...',
        )
        this.isConnected = false
        this.broadcastStatus()
        this.stopWatchdog()
        this.scheduleRetry('TikTok socket bị đóng băng')
      }
    }, 10000)
  }

  private stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
  }

  // 24/7 Auto-Faker engine
  private aiEngine?: any
  private autoFakerTimer: NodeJS.Timeout | null = null
  private lastRealInteractionTime = Date.now()

  public setAiEngine(ai: any) {
    this.aiEngine = ai
  }

  public startAutoFaker() {
    this.stopAutoFaker()
    this.lastRealInteractionTime = Date.now()
    this.autoFakerTimer = setInterval(async () => {
      if (!this.shouldRun || this.status !== 'running') {
        this.stopAutoFaker()
        return
      }
      if (this.tiktokConfig.autoFaker === false) return

      // Yêu cầu: Nếu không bật AI setting thì KHÔNG chạy auto faker
      if (!this.aiEngine || !this.aiEngine.isAiEnabled()) {
        return
      }

      const intervalSec = this.tiktokConfig.autoFakerInterval || 20
      const idleTime = (Date.now() - this.lastRealInteractionTime) / 1000
      const currentQueue = db.getQueue(this.id)

      if (idleTime >= intervalSec || currentQueue.length === 0) {
        await this.triggerFakeInteraction()
      }
    }, 4000)
  }

  public stopAutoFaker() {
    if (this.autoFakerTimer) {
      clearInterval(this.autoFakerTimer)
      this.autoFakerTimer = null
    }
  }

  private async triggerFakeInteraction() {
    this.lastRealInteractionTime = Date.now()

    // 1. Kiểm tra AI Engine có bật không - nếu không bật thì không chạy auto faker
    if (!this.aiEngine || !this.aiEngine.isAiEnabled()) {
      return
    }

    // 2. Sinh tên tự nhiên bằng thư viện faker (@faker-js/faker)
    const faker = Math.random() < 0.85 ? fakerVI : fakerEN
    const name = faker.person.fullName()
    const avatarId = Math.floor(Math.random() * 70) + 1
    const photoUrl = `https://i.pravatar.cc/150?img=${avatarId}`
    const uniqueId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    // Roll action: 75% comment AI, 15% quà nhỏ, 10% tham gia phòng
    const roll = Math.random()
    if (roll < 0.75) {
      // 3. Bình luận hoàn toàn do AI sinh theo đúng Template và Stream Name
      const comment = await this.aiEngine.getAiBotComment(this.templateId, this.name)
      if (!comment) return

      this.addUserScore(uniqueId, name, photoUrl, 3, false)
      this.addToQueue({
        uniqueId,
        name,
        photoUrl,
        priority: 30,
        isVip: false,
        source: 'chat',
        comment,
      })
      this.addLog('chat', name, comment, photoUrl)
    } else if (roll < 0.90) {
      const gift = BOT_GIFTS[Math.floor(Math.random() * BOT_GIFTS.length)]
      const isBig = gift.diamonds >= (this.tiktokConfig.bigGiftThreshold || 10)
      this.addUserScore(uniqueId, name, photoUrl, gift.diamonds * 10, isBig)
      this.addToQueue({
        uniqueId,
        name,
        photoUrl,
        priority: isBig ? 10000 + gift.diamonds : 2000 + gift.diamonds,
        isVip: isBig,
        source: 'gift',
        giftName: `${gift.name} (${gift.diamonds} xu)`,
      })
      this.addLog('gift', name, `Tặng ${gift.name} (${gift.diamonds} xu) 🎁`, photoUrl)
    } else {
      this.addUserScore(uniqueId, name, photoUrl, 1, false)
      this.addToQueue({
        uniqueId,
        name,
        photoUrl,
        priority: 10,
        isVip: false,
        source: 'member',
      })
      this.addLog('member', name, 'Vừa tham gia phòng live', photoUrl)
    }
  }

  // Periodic Greeting Engine per session
  private greetingTimer: NodeJS.Timeout | null = null

  public restartGreetingLoop() {
    if (this.greetingTimer) {
      clearInterval(this.greetingTimer)
      this.greetingTimer = null
    }

    const minutes = Number(this.settings.greetingInterval) || 0
    const text = (this.settings.greetingText || '').trim()

    if (minutes > 0 && text && this.status === 'running') {
      const intervalMs = Math.max(1, minutes) * 60 * 1000
      this.greetingTimer = setInterval(() => {
        this.triggerGreeting()
      }, intervalMs)
    }
  }

  public triggerGreeting() {
    const text = (this.settings.greetingText || '').trim()
    if (!text) return
    this.onBroadcast('stream_greeting', {
      sessionKey: this.streamKey,
      text,
      templateId: this.templateId,
    })
  }

  constructor(
    record: SessionRecord,
    onBroadcast: (event: string, data: any) => void,
  ) {
    this.id = record.id
    this.streamKey = record.stream_key
    this.templateId = record.template_id || 'print_booth_3d'
    this.name = record.name
    this.status = record.status
    this.onBroadcast = onBroadcast

    try {
      this.settings = JSON.parse(record.settings_json)
    } catch {
      this.settings = {
        title: 'PRINT BOOTH 3D',
        subtitle: 'in avatar tiktok theo mẫu',
        theme: 0,
        speed: 1.6,
        cardsPerSheet: 6,
        rare: true,
        paused: false,
        turbo: false,
        rotate: false,
      }
    }

    try {
      this.tiktokConfig = {
        username: record.username || '',
        onJoin: true,
        onChat: true,
        chatKeywordOnly: false,
        keyword: 'in, in anh, ve, avatar',
        onGift: true,
        bigGiftThreshold: 10,
        onLike: false,
        onShare: true,
        allowDuplicates: false,
        ...JSON.parse(record.tiktok_config_json),
      }
    } catch {
      this.tiktokConfig = {
        username: record.username || '',
        onJoin: true,
        onChat: true,
        chatKeywordOnly: false,
        keyword: 'in, in anh, ve, avatar',
        onGift: true,
        bigGiftThreshold: 10,
        onLike: false,
        onShare: true,
        allowDuplicates: false,
      }
    }

    if (this.tiktokConfig.username) {
      this.tiktokConfig.username = LiveSessionInstance.cleanUsername(this.tiktokConfig.username)
    }
  }

  public static cleanUsername(input: string): string {
    if (!input) return ''
    let cleaned = input.trim()
    const match = cleaned.match(/tiktok\.com\/@([^/?#]+)/i)
    if (match) return match[1]
    if (cleaned.startsWith('@')) return cleaned.slice(1)
    return cleaned
  }

  public addLog(type: string, user: string, message: string, avatar?: string) {
    const logItem: DbLogItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      session_id: this.id,
      type,
      user,
      message,
      avatar: avatar || null,
      time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
      created_at: Date.now(),
    }
    db.addLog(logItem)
    this.onBroadcast('log', { sessionKey: this.streamKey, log: logItem })
  }

  public async start(): Promise<{ success: boolean; error?: string }> {
    this.shouldRun = true
    this.status = 'running'
    this.retryCount = 0
    this.restartGreetingLoop()

    if (this.tiktokConfig.autoFaker !== false) {
      this.startAutoFaker()
    }

    const username = LiveSessionInstance.cleanUsername(this.tiktokConfig.username)
    this.tiktokConfig.username = username
    this.saveToDb()

    if (!username) {
      this.addLog(
        'system',
        'Sẵn sàng',
        'Phiên live đã mở. Bạn có thể copy link OBS để chuẩn bị giao diện trước. Hãy nhập @username hoặc dán link TikTok khi phát live để kết nối!',
      )
      this.broadcastStatus()
      return { success: true }
    }

    return await this.executeConnect(username)
  }

  private async executeConnect(username: string): Promise<{ success: boolean; error?: string }> {
    if (!this.shouldRun) return { success: false }

    this.cleanupConnection()
    this.addLog('system', 'Hệ thống', `Đang kết nối tới TikTok Live của @${username}...`)

    try {
      const opts: any = {
        processInitialData: true,
        enableExtendedGiftInfo: false,
        fetchRoomInfoOnConnect: false,
      }

      const globalApiKey = db.getConfig('signApiKey')
      const globalSignUrl = db.getConfig('signApiUrl')

      if (this.tiktokConfig.signApiKey || globalApiKey) {
        opts.signApiKey = (this.tiktokConfig.signApiKey || globalApiKey).trim()
      }

      if (globalSignUrl) {
        process.env.SIGN_API_URL = globalSignUrl.trim()
      }

      const proxyToUse = this.pickProxy()
      if (proxyToUse) {
        try {
          const { HttpsProxyAgent } = require('https-proxy-agent')
          const agent = new HttpsProxyAgent(proxyToUse.trim())
          opts.webClientOptions = {
            agent: {
              http: agent,
              https: agent,
            },
          }
        } catch (e: any) {
          console.error('[Proxy Agent Error]', e.message)
        }
      }

      if (this.tiktokConfig.sessionId) {
        opts.session = {
          cookie: {
            sessionId: this.tiktokConfig.sessionId.trim(),
            ttTargetIdc: 'useast2a',
          },
        }
      }

      this.connection = new TikTokLiveConnection(username, opts)

      // 1. CHAT (Bình luận thật từ khán giả)
      this.connection.on(WebcastEvent.CHAT, (data: any) => {
        this.lastMessageTime = Date.now()
        this.lastRealInteractionTime = Date.now()
        if (!this.isConnected) {
          this.isConnected = true
          this.broadcastStatus()
        }

        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const comment = (data.content || data.comment || '').trim()
        const avatar = getBestAvatar(data.user)

        this.addLog('chat', nickname, comment, avatar)

        if (this.tiktokConfig.onChat) {
          // Cộng điểm: comment +3 điểm (khi bật tính năng onChat)
          this.addUserScore(uniqueId, nickname, avatar, 3)

          let shouldAdd = true
          if (this.tiktokConfig.chatKeywordOnly) {
            const keywords = (this.tiktokConfig.keyword || '')
              .toLowerCase()
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean)
            const lowerComment = comment.toLowerCase()
            shouldAdd = keywords.some((k) => lowerComment.includes(k))
          }

          if (shouldAdd) {
            this.addToQueue({
              uniqueId,
              name: nickname,
              photoUrl: avatar,
              priority: 30, // Priority cho bình luận
              isVip: false,
              source: 'chat',
              comment,
            })
          }
        }
      })

      // 2. GIFT (Quà tặng thật)
      // 2. GIFT (Quà tặng từ khán giả)
      this.connection.on(WebcastEvent.GIFT, (data: any) => {
        this.lastMessageTime = Date.now()
        this.lastRealInteractionTime = Date.now()
        if (!this.isConnected) {
          this.isConnected = true
          this.broadcastStatus()
        }

        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả VIP'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const avatar = getBestAvatar(data.user)

        const giftName =
          data.extendedGiftInfo?.name ||
          data.gift?.name ||
          data.giftDetails?.giftName ||
          (data.giftId ? `Quà #${data.giftId}` : 'Món quà')
        const unitDiamonds =
          data.extendedGiftInfo?.diamondCount ||
          data.gift?.diamondCount ||
          (typeof data.diamondCount === 'number' ? data.diamondCount : 0) ||
          (data.fanTicketCount ? Math.round(data.fanTicketCount / 2) : 0) ||
          1
        const repeat = data.repeatCount || data.comboCount || 1
        const totalDiamonds = unitDiamonds * repeat

        this.addLog(
          'gift',
          nickname,
          `Tặng ${repeat > 1 ? `${repeat}x ` : ''}${giftName} (${totalDiamonds} xu) 🎁`,
          avatar,
        )

        if (this.tiktokConfig.onGift) {
          const isBigGift = totalDiamonds >= (this.tiktokConfig.bigGiftThreshold || 10)
          // Cộng điểm: Tặng quà (tùy giá quà xu) * 10
          const giftScore = totalDiamonds * 10
          this.addUserScore(uniqueId, nickname, avatar, giftScore, isBigGift)

          // Quà càng lớn priority càng cao vượt trội để lập tức lên #1 hàng chờ
          const priority = isBigGift ? 10000 + totalDiamonds : 2000 + totalDiamonds

          this.addToQueue({
            uniqueId,
            name: nickname,
            photoUrl: avatar,
            priority,
            isVip: isBigGift,
            source: 'gift',
            giftName: `${repeat > 1 ? `${repeat}x ` : ''}${giftName}`,
          })
        }
      })

      // 3. MEMBER (Khán giả tham gia phòng live)
      this.connection.on(WebcastEvent.MEMBER, (data: any) => {
        this.lastMessageTime = Date.now()
        this.lastRealInteractionTime = Date.now()
        if (!this.isConnected) {
          this.isConnected = true
          this.broadcastStatus()
        }

        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const avatar = getBestAvatar(data.user)

        this.addLog('member', nickname, 'đã tham gia xem Live 👋', avatar)

        if (this.tiktokConfig.onJoin) {
          // Mới tham gia: +1 điểm (khi bật onJoin)
          this.addUserScore(uniqueId, nickname, avatar, 1)

          this.addToQueue({
            uniqueId,
            name: nickname,
            photoUrl: avatar,
            priority: 10, // Priority cho người vừa vào xem
            isVip: false,
            source: 'member',
            comment: 'Vừa vào xem live',
          })
        }
      })

      // 4. ROOM_USER (Mắt xem thật)
      this.connection.on(WebcastEvent.ROOM_USER, (data: any) => {
        this.lastMessageTime = Date.now()
        if (!this.isConnected) {
          this.isConnected = true
          this.broadcastStatus()
        }

        const total = Number(data.totalUser ?? data.total ?? data.viewerCount ?? data.total_user)
        if (!Number.isNaN(total) && total >= 0) {
          this.viewerCount = total
          this.totalViewers = total
        }
        this.broadcastStats()
      })

      // 4. LIKE (Thả tim)
      this.connection.on(WebcastEvent.LIKE, (data: any) => {
        this.lastMessageTime = Date.now()
        this.lastRealInteractionTime = Date.now()
        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const avatar = getBestAvatar(data.user)

        const totalLike = Number(data.total ?? data.totalLikeCount)
        const likeAdd = Number(data.count ?? data.likeCount ?? 1)
        if (!Number.isNaN(totalLike) && totalLike > 0) {
          this.likeCount = totalLike
        } else if (!Number.isNaN(likeAdd) && likeAdd > 0) {
          this.likeCount += likeAdd
        }
        this.broadcastStats()

        if (this.tiktokConfig.onLike) {
          // Like: +2 điểm (khi bật onLike)
          this.addUserScore(uniqueId, nickname, avatar, 2)

          this.addToQueue({
            uniqueId,
            name: nickname,
            photoUrl: avatar,
            priority: 20,
            isVip: false,
            source: 'like',
            comment: 'Đã thả tim',
          })
        }
      })

      // 6. SOCIAL (Follow / Chia sẻ)
      this.connection.on(WebcastEvent.SOCIAL, (data: any) => {
        this.lastMessageTime = Date.now()
        this.lastRealInteractionTime = Date.now()
        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const avatar = getBestAvatar(data.user)
        const isShare = data.actionType === 1
        const action = isShare ? 'đã chia sẻ phiên Live 🔄' : 'đã theo dõi streamer ❤️'

        this.addLog('member', nickname, action, avatar)

        if (this.tiktokConfig.onShare && isShare) {
          // Chia sẻ: +2 điểm (khi bật onShare)
          this.addUserScore(uniqueId, nickname, avatar, 2)

          this.addToQueue({
            uniqueId,
            name: nickname,
            photoUrl: avatar,
            priority: 25,
            isVip: false,
            source: 'share',
            comment: 'Đã chia sẻ live',
          })
        }
      })

      // Heartbeat packets to keep watchdog alive
      this.connection.on('websocketData', () => {
        this.lastMessageTime = Date.now()
      })
      this.connection.on('rawData', () => {
        this.lastMessageTime = Date.now()
      })

      // 7. DISCONNECTED -> Auto 24/7 Retry
      this.connection.on('disconnected', () => {
        this.isConnected = false
        this.stopWatchdog()
        this.broadcastStatus()
        if (this.shouldRun) {
          this.scheduleRetry('TikTok đã ngắt kết nối. Đang tự động kết nối lại 24/7...')
        }
      })

      // 8. STREAM_END
      this.connection.on(WebcastEvent.STREAM_END, () => {
        this.isConnected = false
        this.stopWatchdog()
        this.broadcastStatus()
        if (this.shouldRun) {
          this.scheduleRetry('Phiên Live tạm ngưng. Sẽ tự động kết nối lại khi mở lại live...')
        }
      })

      // 9. ERROR
      this.connection.on('error', (err: any) => {
        const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
        this.addLog('system', 'Lỗi', `Sự cố mạng: ${msg}`)
        if (this.shouldRun && !this.isConnected) {
          this.stopWatchdog()
          this.scheduleRetry('Lỗi socket. Đang tự động kết nối lại...')
        }
      })

      // Connect with 15-second timeout safeguard to prevent hanging
      const connectPromise = this.connection.connect()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Hết thời gian chờ kết nối TikTok (15s timeout)')), 15000),
      )
      const state: any = await Promise.race([connectPromise, timeoutPromise])

      this.isConnected = true
      this.retryCount = 0
      this.startWatchdog()
      this.addLog(
        'system',
        'TikTok Live',
        `🟢 Đã kết nối thành công với phòng Live #${state.roomId} của @${username}! Cơ chế 24/7 tự phục hồi đang chạy.`,
      )
      this.broadcastStatus()
      return { success: true }
    } catch (err: any) {
      this.isConnected = false
      const errorDetail = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
      this.addLog('system', 'Lỗi kết nối', errorDetail)
      this.broadcastStatus()

      if (this.shouldRun) {
        this.scheduleRetry('Chưa thể kết nối live (có thể streamer chưa bấm phát). Sẽ tự động thử lại sau vài giây...')
      }

      return { success: false, error: errorDetail }
    }
  }

  // Exponential backoff scheduler (Rate limit aware)
  private scheduleRetry(reason: string) {
    if (!this.shouldRun) return
    if (this.retryTimer) clearTimeout(this.retryTimer)

    const isRateLimited =
      reason.toLowerCase().includes('rate limit') ||
      reason.toLowerCase().includes('signatureratelimiterror') ||
      reason.toLowerCase().includes('too many connections') ||
      reason.toLowerCase().includes('429')

    if (isRateLimited || reason.includes('Proxy') || reason.includes('socket')) {
      this.rotateProxy('Gặp Rate Limit hoặc lỗi kết nối')
    }

    this.retryCount++

    // If rate limited by EulerStream sign server: backoff at least 30s-60s
    const baseDelay = isRateLimited ? 35000 : 2000
    const maxDelay = isRateLimited ? 120000 : this.maxRetryDelay
    const delay = Math.min(baseDelay * Math.pow(1.5, Math.min(this.retryCount, 6)), maxDelay)
    const seconds = (delay / 1000).toFixed(0)

    const notice = isRateLimited
      ? `Bị giới hạn kết nối (Rate Limit từ EulerStream). Chờ ${seconds}s trước khi thử lại để tránh bị chặn. (Gợi ý: Thêm Proxy hoặc EulerStream API Key ở Cài đặt)`
      : `${reason} (Thử lại sau ${seconds}s - Lần ${this.retryCount})`

    this.addLog('system', isRateLimited ? 'Giới hạn tốc độ' : 'Tự động kết nối lại', notice)

    this.retryTimer = setTimeout(() => {
      const user = LiveSessionInstance.cleanUsername(this.tiktokConfig.username)
      if (user && this.shouldRun) {
        this.executeConnect(user)
      }
    }, delay)
  }

  private cleanupConnection() {
    this.stopWatchdog()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }

    if (this.connection) {
      try {
        this.connection.removeAllListeners()
        this.connection.disconnect()
      } catch {
        // Ignore
      }
      this.connection = null
    }
    this.isConnected = false
  }

  public stop() {
    this.shouldRun = false
    if (this.greetingTimer) {
      clearInterval(this.greetingTimer)
      this.greetingTimer = null
    }
    this.stopAutoFaker()
    this.cleanupConnection()
    this.status = 'stopped'
    this.saveToDb()
    this.addLog('system', 'Hệ thống', 'Đã dừng phiên Live')
    this.broadcastStatus()
  }

  public addToQueue(item: {
    uniqueId: string
    name: string
    photoUrl: string
    priority: number
    isVip: boolean
    source: string
    comment?: string
    giftName?: string
  }) {
    const queue = db.getQueue(this.id)

    // 0. Chống phình to bộ nhớ: Giới hạn hàng chờ tối đa 250 người
    if (queue.length >= 250) {
      const nonVips = queue.filter((q) => q.is_vip !== 1)
      if (nonVips.length > 0) {
        const oldestNormal = nonVips[nonVips.length - 1]
        db.removeQueueItem(oldestNormal.id)
      } else {
        const oldest = queue[queue.length - 1]
        db.removeQueueItem(oldest.id)
      }
    }

    // 1. Tặng quà luôn luôn cho phép lặp lại (1 người tặng nhiều lần in nhiều lần)
    // 2. Các nguồn khác: kiểm tra allowDuplicates
    const isGiftSource = item.source === 'gift';
    if (!isGiftSource && !this.tiktokConfig.allowDuplicates && item.uniqueId) {
      const existing = queue.find((q) => q.unique_id === item.uniqueId)
      if (existing) {
        // Cap nhat binh luan moi nhat cua nguoi dung
        if (item.comment) {
          db.updateQueueComment(existing.id, item.comment)
          const updatedQueue = this.getQueue()
          this.onBroadcast('queue', { sessionKey: this.streamKey, queue: updatedQueue })
        }

        // Upgrade user priority if they take higher action (e.g. from member to chat)
        if (item.priority > existing.priority) {
          db.removeQueueItem(existing.id)
          // Re-insert with higher priority below
        } else {
          return // Already in queue with equal or higher priority
        }
      }
    }

    const insertedId = db.addQueueItem({
      session_id: this.id,
      unique_id: item.uniqueId,
      name: item.name,
      photo_url: item.photoUrl,
      is_vip: item.isVip ? 1 : 0,
      priority: item.priority || 0,
      source: item.source,
      comment: item.comment || null,
      gift_name: item.giftName || null,
      created_at: Date.now(),
    })

    this.scheduleQueueBroadcast()
    this.onBroadcast('user_added', {
      sessionKey: this.streamKey,
      user: {
        id: insertedId,
        name: item.name,
        photoUrl: item.photoUrl,
        priority: item.priority,
        isVip: item.isVip,
      },
    })
  }

  private queueBroadcastTimer: NodeJS.Timeout | null = null
  private scheduleQueueBroadcast() {
    if (this.queueBroadcastTimer) return
    this.queueBroadcastTimer = setTimeout(() => {
      this.queueBroadcastTimer = null
      const fullQueue = this.getQueue()
      this.onBroadcast('queue', { sessionKey: this.streamKey, queue: fullQueue })
    }, 250)
  }

  public removeFromQueue(id: number) {
    db.removeQueueItem(id)
    const fullQueue = this.getQueue()
    this.onBroadcast('queue', { sessionKey: this.streamKey, queue: fullQueue })
    this.onBroadcast('user_removed', { sessionKey: this.streamKey, id })
  }

  public prioritizeVip(id: number) {
    db.prioritizeVip(id)
    const fullQueue = this.getQueue()
    this.onBroadcast('queue', { sessionKey: this.streamKey, queue: fullQueue })
  }

  public forcePrint(id: number) {
    db.prioritizeVip(id)
    const fullQueue = this.getQueue()
    this.onBroadcast('queue', { sessionKey: this.streamKey, queue: fullQueue })
  }

  public clearQueue() {
    db.clearQueue(this.id)
    this.onBroadcast('queue', { sessionKey: this.streamKey, queue: [] })
    this.onBroadcast('queue_cleared', { sessionKey: this.streamKey })
  }

  public addBatchToQueue(items: Array<{
    uniqueId: string
    name: string
    photoUrl: string
    priority: number
    isVip: boolean
    source: string
    comment?: string
    giftName?: string
  }>) {
    for (const item of items) {
      db.addQueueItem({
        session_id: this.id,
        unique_id: item.uniqueId,
        name: item.name,
        photo_url: item.photoUrl,
        is_vip: item.isVip ? 1 : 0,
        priority: item.priority || 0,
        source: item.source,
        comment: item.comment || null,
        gift_name: item.giftName || null,
        created_at: Date.now(),
      })
      this.addLog(
        item.giftName ? 'gift' : 'chat',
        item.name,
        item.giftName ? `Tặng ${item.giftName} 🎁` : (item.comment || 'Vào hàng chờ'),
        item.photoUrl,
      )
    }

    const fullQueue = this.getQueue()
    this.onBroadcast('queue', { sessionKey: this.streamKey, queue: fullQueue })
    this.onBroadcast('queue_updated', { sessionKey: this.streamKey })
  }

  public getQueue(): DbQueueItem[] {
    return db.getQueue(this.id)
  }

  public getLogs(): DbLogItem[] {
    return db.getLogs(this.id, 100)
  }

  public updateTemplate(templateId: string) {
    this.templateId = templateId || 'print_booth_3d'
    this.saveToDb()
    this.broadcastStatus()
  }

  public updateSettings(newSettings: Partial<StreamSettings>) {
    this.settings = { ...this.settings, ...newSettings }
    this.saveToDb()
    this.onBroadcast('settings', { sessionKey: this.streamKey, settings: this.settings })
    this.restartGreetingLoop()
  }

  public updateConfig(newConfig: Partial<TikTokConfig>) {
    const oldThreshold = this.tiktokConfig.bigGiftThreshold
    this.tiktokConfig = { ...this.tiktokConfig, ...newConfig }
    if (this.tiktokConfig.username) {
      this.tiktokConfig.username = LiveSessionInstance.cleanUsername(this.tiktokConfig.username)
    }
    this.saveToDb()

    // Tự động tính toán lại VIP & độ ưu tiên cho các người dùng hiện có trong hàng chờ
    if (newConfig.bigGiftThreshold !== undefined && newConfig.bigGiftThreshold !== oldThreshold) {
      this.recalculateQueueVip(newConfig.bigGiftThreshold)
    }

    if (newConfig.autoFaker !== undefined || newConfig.autoFakerInterval !== undefined) {
      if (this.tiktokConfig.autoFaker !== false && this.status === 'running') {
        this.startAutoFaker()
      } else {
        this.stopAutoFaker()
      }
    }
  }

  public recalculateQueueVip(newThreshold: number) {
    const queue = this.getQueue()
    let changed = false

    for (const item of queue) {
      if (item.source === 'gift') {
        // Trích xuất số xu thực tế từ priority đã lưu (10000 + diamonds hoặc 2000 + diamonds)
        const diamonds = item.priority >= 10000 ? item.priority - 10000 : (item.priority >= 2000 ? item.priority - 2000 : 0)
        const shouldBeVip = diamonds >= newThreshold
        const newPriority = shouldBeVip ? 10000 + diamonds : 2000 + diamonds

        if (item.is_vip !== (shouldBeVip ? 1 : 0) || item.priority !== newPriority) {
          db.updateQueueItemVipAndPriority(item.id, shouldBeVip ? 1 : 0, newPriority)
          changed = true
        }
      }
    }

    if (changed) {
      const updatedQueue = this.getQueue()
      this.onBroadcast('queue', { sessionKey: this.streamKey, queue: updatedQueue })
      this.addLog(
        'system',
        'Cập nhật điều kiện VIP',
        `Đã tính toán lại hàng chờ theo ngưỡng mới: Quà >= ${newThreshold} xu là VIP.`,
      )
    }
  }

  public saveToDb() {
    db.saveSession({
      id: this.id,
      stream_key: this.streamKey,
      template_id: this.templateId,
      name: this.name,
      username: this.tiktokConfig.username,
      settings_json: JSON.stringify(this.settings),
      tiktok_config_json: JSON.stringify(this.tiktokConfig),
      status: this.status,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
  }

  public getStatus() {
    return {
      id: this.id,
      streamKey: this.streamKey,
      templateId: this.templateId,
      name: this.name,
      status: this.status,
      isConnected: this.isConnected,
      username: this.tiktokConfig.username,
      viewerCount: this.viewerCount,
      likeCount: this.likeCount,
      totalViewers: this.totalViewers,
      queueCount: this.getQueue().length,
      queue: this.getQueue(),
      logs: this.getLogs(),
      settings: this.settings,
      tiktokConfig: this.tiktokConfig,
    }
  }

  private broadcastStatus() {
    this.onBroadcast('status', {
      sessionKey: this.streamKey,
      status: this.getStatus(),
    })
  }

  private statsTimer: NodeJS.Timeout | null = null
  private broadcastStats() {
    if (this.statsTimer) return
    this.statsTimer = setTimeout(() => {
      this.statsTimer = null
      this.onBroadcast('stats', {
        sessionKey: this.streamKey,
        viewerCount: this.viewerCount,
        likeCount: this.likeCount,
      })
    }, 800)
  }
}

// Manager managing all Live Sessions
export class TikTokManager {
  private sessions: Map<string, LiveSessionInstance> = new Map()
  private onBroadcast: (event: string, data: any) => void
  private aiEngine?: any

  constructor(onBroadcast: (event: string, data: any) => void) {
    this.onBroadcast = onBroadcast
    this.loadSessionsFromDb()
  }

  public setAiEngine(ai: any) {
    this.aiEngine = ai
    for (const session of this.sessions.values()) {
      session.setAiEngine(ai)
    }
  }

  private loadSessionsFromDb() {
    const list = db.getAllSessions()
    for (const rec of list) {
      const instance = new LiveSessionInstance(rec, this.onBroadcast)
      if (this.aiEngine) {
        instance.setAiEngine(this.aiEngine)
      }
      this.sessions.set(rec.id, instance)
      // Auto-reconnect previously running sessions 24/7 on app startup
      if (instance.status === 'running') {
        instance.start()
      }
    }
  }

  public getSession(id: string): LiveSessionInstance | undefined {
    return this.sessions.get(id)
  }

  public getSessionByStreamKey(key: string): LiveSessionInstance | undefined {
    for (const s of this.sessions.values()) {
      if (s.streamKey === key) return s
    }
    return undefined
  }

  public getAllSessions(): LiveSessionInstance[] {
    return Array.from(this.sessions.values())
  }

  public createSession(data: {
    name: string
    templateId?: string
    username?: string
    settings?: Partial<StreamSettings>
    tiktokConfig?: Partial<TikTokConfig>
  }) {
    const id = `session_${Date.now()}`
    const streamKey = `live_${Math.random().toString(36).slice(2, 8)}`
    const cleanUser = LiveSessionInstance.cleanUsername(data.username || '')
    const rec: SessionRecord = {
      id,
      stream_key: streamKey,
      template_id: data.templateId || 'print_booth_3d',
      name: data.name || `Phiên Live #${this.sessions.size + 1}`,
      username: cleanUser,
      settings_json: JSON.stringify({
        title: 'PRINT BOOTH 3D',
        subtitle: 'in avatar tiktok theo mẫu',
        theme: 0,
        speed: 1.6,
        cardsPerSheet: 6,
        rare: true,
        paused: false,
        turbo: false,
        rotate: false,
        ...(data.settings || {}),
      }),
      tiktok_config_json: JSON.stringify({
        username: cleanUser,
        onJoin: true,
        onChat: true,
        chatKeywordOnly: false,
        keyword: 'in, in anh, ve, avatar',
        onGift: true,
        bigGiftThreshold: 10,
        onLike: false,
        onShare: true,
        allowDuplicates: false,
        ...(data.tiktokConfig || {}),
      }),
      status: 'idle',
      created_at: Date.now(),
      updated_at: Date.now(),
    }

    db.saveSession(rec)
    const instance = new LiveSessionInstance(rec, this.onBroadcast)
    if (this.aiEngine) {
      instance.setAiEngine(this.aiEngine)
    }
    this.sessions.set(id, instance)
    return instance
  }

  public deleteSession(id: string) {
    const session = this.sessions.get(id)
    if (session) {
      session.stop()
      this.sessions.delete(id)
    }
    db.deleteSession(id)
  }

  public deleteAllSessions() {
    for (const [, session] of this.sessions) {
      try {
        session.stop()
      } catch (_) {}
    }
    this.sessions.clear()
    db.deleteAllSessions()
  }

  public stopAll() {
    for (const session of this.sessions.values()) {
      session.stop()
    }
  }
}
