import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector'
import { db, type DbLogItem, type DbQueueItem, type SessionRecord } from './db'

// Monkey patch to permanently prevent calling EulerStream paid endpoints
;(TikTokLiveConnection.prototype as any).fetchAvailableGifts = async function () {
  return []
}
;(TikTokLiveConnection.prototype as any).fetchRoomInfo = async function () {
  return { data: { status: 2 } }
}

export interface StreamSettings {
  title: string
  subtitle: string
  theme: number
  speed: number
  cardsPerSheet: number
  rare: boolean
  paused: boolean
  turbo: boolean
  rotate: boolean
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
  signApiKey?: string
  sessionId?: string
}

const getBestAvatar = (user: any): string => {
  if (!user) return ''
  return (
    user.avatarLarge?.urlList?.[0] ||
    user.avatarMedium?.urlList?.[0] ||
    user.avatarThumb?.urlList?.[0] ||
    user.profilePictureUrl ||
    ''
  )
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

  // 24/7 Auto-retry & Reconnect engine
  private shouldRun = false
  private retryTimer: any = null
  private retryCount = 0
  private readonly maxRetryDelay = 30000

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

      if (this.tiktokConfig.signApiKey) {
        opts.signApiKey = this.tiktokConfig.signApiKey.trim()
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
      this.connection.on(WebcastEvent.GIFT, (data: any) => {
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
        const diamonds = data.extendedGiftInfo?.diamondCount || data.gift?.diamondCount || 0
        const repeat = data.repeatCount || data.comboCount || 1

        this.addLog(
          'gift',
          nickname,
          `Tặng ${repeat > 1 ? `${repeat}x ` : ''}${giftName} ${diamonds ? `(${diamonds} xu)` : ''} 🎁`,
          avatar,
        )

        if (this.tiktokConfig.onGift) {
          const isBigGift = diamonds >= (this.tiktokConfig.bigGiftThreshold || 10)
          const priority = isBigGift ? 100 : 60 // Quà lớn = 100 (#1 VIP), Quà nhỏ = 60

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
        if (!this.isConnected) {
          this.isConnected = true
          this.broadcastStatus()
        }

        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const avatar = getBestAvatar(data.user)

        this.addLog('member', nickname, 'đã tham gia xem Live 👋', avatar)

        if (this.tiktokConfig.onJoin) {
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
        if (!this.isConnected) {
          this.isConnected = true
          this.broadcastStatus()
        }

        if (typeof data.total === 'number') {
          this.viewerCount = data.total
        } else if (typeof data.viewerCount === 'number') {
          this.viewerCount = data.viewerCount
        }
        if (typeof data.totalUser === 'number') {
          this.totalViewers = data.totalUser
        }
        this.broadcastStats()
      })

      // 5. LIKE (Thả tim)
      this.connection.on(WebcastEvent.LIKE, (data: any) => {
        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const avatar = getBestAvatar(data.user)

        if (typeof data.totalLikeCount === 'number') {
          this.likeCount = data.totalLikeCount
        } else if (typeof data.likeCount === 'number') {
          this.likeCount += data.likeCount
        }
        this.broadcastStats()

        if (this.tiktokConfig.onLike) {
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
        const nickname = data.user?.nickname || data.user?.displayId || 'Khán giả'
        const uniqueId = data.user?.displayId || data.user?.id || ''
        const avatar = getBestAvatar(data.user)
        const isShare = data.actionType === 1
        const action = isShare ? 'đã chia sẻ phiên Live 🔄' : 'đã theo dõi streamer ❤️'

        this.addLog('member', nickname, action, avatar)

        if (this.tiktokConfig.onShare && isShare) {
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

      // 7. DISCONNECTED -> Auto 24/7 Retry
      this.connection.on('disconnected', () => {
        this.isConnected = false
        this.broadcastStatus()
        if (this.shouldRun) {
          this.scheduleRetry('TikTok đã ngắt kết nối. Đang tự động kết nối lại...')
        }
      })

      // 8. STREAM_END -> Auto 24/7 Retry
      this.connection.on(WebcastEvent.STREAM_END, () => {
        this.isConnected = false
        this.broadcastStatus()
        if (this.shouldRun) {
          this.scheduleRetry('Phiên Live tạm ngưng. Sẽ tự động kết nối lại khi mở lại live...')
        }
      })

      // 9. ERROR -> Auto Retry
      this.connection.on('error', (err: any) => {
        const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
        this.addLog('system', 'Lỗi', `Sự cố mạng: ${msg}`)
        if (this.shouldRun && !this.isConnected) {
          this.scheduleRetry('Lỗi socket. Đang tự động kết nối lại...')
        }
      })

      // Connect
      const state = await this.connection.connect()
      this.isConnected = true
      this.retryCount = 0
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

  // Exponential backoff scheduler (2s -> 4s -> 8s -> ... -> 30s max)
  private scheduleRetry(reason: string) {
    if (!this.shouldRun) return
    if (this.retryTimer) clearTimeout(this.retryTimer)

    this.retryCount++
    const delay = Math.min(2000 * Math.pow(1.5, Math.min(this.retryCount, 8)), this.maxRetryDelay)
    const seconds = (delay / 1000).toFixed(0)

    this.addLog('system', 'Tự động kết nối lại', `${reason} (Thử lại sau ${seconds}s - Lần ${this.retryCount})`)

    this.retryTimer = setTimeout(() => {
      const user = LiveSessionInstance.cleanUsername(this.tiktokConfig.username)
      if (user && this.shouldRun) {
        this.executeConnect(user)
      }
    }, delay)
  }

  private cleanupConnection() {
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

    // Check if user already in queue
    if (!this.tiktokConfig.allowDuplicates && item.uniqueId) {
      const existing = queue.find((q) => q.unique_id === item.uniqueId)
      if (existing) {
        // Cap nhat binh luan moi nhat cua nguoi dung
        if (item.comment) {
          db.updateQueueComment(existing.id, item.comment)
          const updatedQueue = this.getQueue()
          this.onBroadcast('queue', { sessionKey: this.streamKey, queue: updatedQueue })
        }

        // Upgrade user priority if they take higher action (e.g. from member to chat, or from chat to gift)
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

    const fullQueue = this.getQueue()
    this.onBroadcast('queue', { sessionKey: this.streamKey, queue: fullQueue })
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
  }

  public updateConfig(newConfig: Partial<TikTokConfig>) {
    this.tiktokConfig = { ...this.tiktokConfig, ...newConfig }
    if (this.tiktokConfig.username) {
      this.tiktokConfig.username = LiveSessionInstance.cleanUsername(this.tiktokConfig.username)
    }
    this.saveToDb()
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

  private broadcastStats() {
    this.onBroadcast('stats', {
      sessionKey: this.streamKey,
      viewerCount: this.viewerCount,
      likeCount: this.likeCount,
    })
  }
}

// Manager managing all Live Sessions
export class TikTokManager {
  private sessions: Map<string, LiveSessionInstance> = new Map()
  private onBroadcast: (event: string, data: any) => void

  constructor(onBroadcast: (event: string, data: any) => void) {
    this.onBroadcast = onBroadcast
    this.loadSessionsFromDb()
  }

  private loadSessionsFromDb() {
    const list = db.getAllSessions()
    if (list.length === 0) {
      const defaultId = 'session_default'
      const defaultKey = 'live_default'
      const defaultRec: SessionRecord = {
        id: defaultId,
        stream_key: defaultKey,
        template_id: 'print_booth_3d',
        name: 'Phiên Live Mặc Định #1',
        username: 'hanh.huynhgomsu',
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
        }),
        tiktok_config_json: JSON.stringify({
          username: 'hanh.huynhgomsu',
          onJoin: true,
          onChat: true,
          chatKeywordOnly: false,
          keyword: 'in, in anh, ve, avatar',
          onGift: true,
          bigGiftThreshold: 10,
          onLike: false,
          onShare: true,
          allowDuplicates: false,
        }),
        status: 'idle',
        created_at: Date.now(),
        updated_at: Date.now(),
      }
      db.saveSession(defaultRec)
      const instance = new LiveSessionInstance(defaultRec, this.onBroadcast)
      this.sessions.set(defaultId, instance)
    } else {
      for (const rec of list) {
        const instance = new LiveSessionInstance(rec, this.onBroadcast)
        this.sessions.set(rec.id, instance)
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
    this.sessions.set(id, instance)
    return instance
  }

  public deleteSession(id: string) {
    const session = this.sessions.get(id)
    if (session) {
      session.stop()
      this.sessions.delete(id)
      db.deleteSession(id)
    }
  }

  public stopAll() {
    for (const session of this.sessions.values()) {
      session.stop()
    }
  }
}
