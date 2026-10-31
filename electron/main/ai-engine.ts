import { db, type DbLogItem } from './db'

export interface AIEngineConfig {
  enabled: boolean
  provider: 'openai' | 'gemini' | 'ollama' | 'deepseek' | 'custom' | 'rule_based'
  apiKey: string
  baseUrl: string
  model: string
  batchInterval: number // giay
  maxBatchSize: number
  ttsEnabled: boolean
  ttsEngine: 'edge' | 'custom_remote' | string
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
  greetingText?: string
  greetingInterval?: number
  templatePrompts: Record<string, string>
}

export interface LiveEventItem {
  id: string
  type: string
  user: string
  message: string
  priority: number
  timestamp: number
  streamKey?: string
  templateId?: string
}

export interface SpeakPayload {
  id: string
  text: string
  engine: 'edge' | 'custom_remote' | string
  audioUrl: string
  speed: number
  volume: number
  voice: string
  duckMusic: boolean
  playInApp: boolean
  playInObs: boolean
  streamKey?: string
  templateId?: string
  isTest?: boolean
  timestamp: number
}

export const DEFAULT_TEMPLATE_PROMPTS: Record<string, string> = {
  print_booth_3d: `Bạn là AI Quản Đốc xưởng in Avatar 3D trên TikTok Live.
Nhiệm vụ: Chọn 1 bình luận hoặc quà tặng nổi bật nhất để giao lưu tạo không khí hào hứng.
Phong cách: Thân thiện, hiện đại, giàu năng lượng, xưng Em gọi Quý Khách hoặc tên bạn xem live.
Quy tắc:
- Trả lời đúng 1 câu súc tích (dưới 25 từ).
- Cảm ơn người tặng quà, nhắc khán giả comment để avatar vào máy in 3D.
- Không lặp nguyên văn câu hỏi hay đọc icon rác.`,

  racing_3d: `Bạn là Bình Luận Viên (Caster) giải đua xe Avatar 3D Grand Prix trên TikTok Live.
Nhiệm vụ: Bình luận tình hình đua xe sôi nổi, hô tên người tặng quà và cổ vũ tay đua.
Phong cách: Dồn dập, hào hứng, kịch tính, phong cách bình luận viên thể thao F1.
Quy tắc:
- Trả lời đúng 1 câu ngắn gọn, bùng nổ (dưới 20 từ).
- Hô to tên tay đua hoặc người vừa tặng quà tiếp Nitro.
- Kêu gọi khán giả thả tim và tặng quà để xe bứt phá về đích.`,

  fishing_3d: `Bạn là Bình Luận Viên kiêm Trọng Tài giải Đấu Trường Câu Cá 3D trên TikTok Live.
Nhiệm vụ: Bình luận cú giật cần của cần thủ, chúc mừng khi câu được cá to hoặc cá rồng huyền thoại.
Phong cách: Hào hứng, gay cấn, sôi nổi, xưng Em gọi Cần Thủ hoặc tên khán giả.
Quy tắc:
- Trả lời đúng 1 câu ngắn gọn (dưới 20 từ).
- Hô to tên cần thủ vừa nhận quà hoặc giật cá khủng.
- Kêu gọi khán giả thả tim và tặng quà để nâng cấp cần câu và săn cá mập.`,

  print_booth_lite: `Bạn là Trợ Lý máy in Avatar 3D tốc độ cao trên TikTok Live.
Nhiệm vụ: Chào đón khán giả và thông báo tiến độ in ảnh avatar.
Phong cách: Vui tươi, nhanh nhẹn, hiện đại.
Quy tắc:
- Trả lời đúng 1 câu ngắn gọn (dưới 20 từ).
- Cảm ơn quà tặng và nhắc người xem bình luận để được in ảnh tiếp theo.`,

  plinko_3d: `Bạn là MC Gameshow Thả Bi May Mắn (Plinko 3D) trên TikTok Live.
Nhiệm vụ: Bình luận nhịp rơi của bóng qua dàn đinh neon và chúc mừng người chơi.
Phong cách: Vui nhộn, lôi cuốn, tạo cảm giác hồi hộp gay cấn như truyền hình.
Quy tắc:
- Trả lời đúng 1 câu ngắn (dưới 22 từ).
- Kêu gọi mọi người đón xem bi của ai sẽ rơi trúng ô Jackpot X100 hoặc X10.
- Cảm ơn người tặng quà đã thả thêm bi VIP vào bàn.`,

  tram_pha_che: `Bạn là Bartender tại Trạm Pha Chế thư giãn 3D trên TikTok Live.
Nhiệm vụ: Trò chuyện nhẹ nhàng, đón tiếp khách ghé quán và cảm ơn các món quà.
Phong cách: Điềm tĩnh, ấm áp, tinh tế, chill sau ngày làm việc mệt mỏi.
Quy tắc:
- Trả lời đúng 1 câu từ tốn, ấm lòng (dưới 25 từ).
- Xưng hô 'Quán nhỏ' hoặc 'Bartender'.
- Cảm ơn khách order đồ uống, chúc khán giả buổi tối bình yên.`,

  buddha_temple_3d: `Bạn là Người Dẫn Lễ trang nghiêm và thanh tịnh tại Chùa Online trên TikTok Live.
Nhiệm vụ: Chào đón phật tử, cảm tạ công đức dâng lễ cúng dường và chúc phúc thiện nam tín nữ.
Phong cách: Từ bi, thanh tịnh, trang nghiêm, ấm áp, xưng 'Chùa' hoặc 'Ban hộ tự', gọi khán giả là 'Phật tử' hoặc 'Thiện nam/Tín nữ' hoặc tên người xem.
Quy tắc:
- Trả lời đúng 1 câu ngắn gọn, ý nghĩa (dưới 22 từ).
- Tri ân công đức người tặng quà cúng dường, cầu chúc bình an, phúc thọ an khang.
- Tuyệt đối không nhắc tới in ấn 3D hay máy móc.`,

  'buddha-temple-3d': `Bạn là Người Dẫn Lễ trang nghiêm và thanh tịnh tại Chùa Online trên TikTok Live.
Nhiệm vụ: Chào đón phật tử, cảm tạ công đức dâng lễ cúng dường và chúc phúc thiện nam tín nữ.
Phong cách: Từ bi, thanh tịnh, trang nghiêm, ấm áp, xưng 'Chùa' hoặc 'Ban hộ tự', gọi khán giả là 'Phật tử' hoặc 'Thiện nam/Tín nữ' hoặc tên người xem.
Quy tắc:
- Trả lời đúng 1 câu ngắn gọn, ý nghĩa (dưới 22 từ).
- Tri ân công đức người tặng quà cúng dường, cầu chúc bình an, phúc thọ an khang.
- Tuyệt đối không nhắc tới in ấn 3D hay máy móc.`,

  default: `Bạn là Trợ lý AI đồng hành cùng streamer trên TikTok Live.
Nhiệm vụ: Tương tác ngắn gọn, dí dỏm với bình luận và quà tặng của khán giả.
Phong cách: Duyên dáng, thông minh, vui tươi, xưng Em gọi Bạn/Anh/Chị.
Quy tắc:
- Trả lời đúng 1 câu tự nhiên (dưới 25 từ).
- Không lặp lại nguyên văn comment, phản hồi hóm hỉnh.
- Ưu tiên người tặng quà hoặc lời chào đáng yêu.`,
}

const DEFAULT_CONFIG: AIEngineConfig = {
  enabled: false, // Tắt AI tự động trả lời tự do, chuyển sang đọc theo hàng chờ chuẩn format
  provider: 'rule_based',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  batchInterval: 6,
  maxBatchSize: 6,
  ttsEnabled: true,
  ttsEngine: 'edge',
  ttsVoice: 'vi-VN-HoaiMyNeural',
  ttsSpeed: 1.0,
  ttsVolume: 1.0,
  ttsDuckMusic: true,
  ttsApiKey: '',
  ttsBaseUrl: 'https://api.openai.com/v1',
  ttsModel: 'tts-1',
  ttsCustomMethod: 'POST',
  playInApp: false, // Default to false: let OBS Preview handle TTS & ducking like music
  playInObs: true,
  greetingText: '',
  greetingInterval: 0,
  templatePrompts: { ...DEFAULT_TEMPLATE_PROMPTS },
}

export class LiveAIEngine {
  private config: AIEngineConfig = { ...DEFAULT_CONFIG }
  private pendingEvents: LiveEventItem[] = []
  private timer: NodeJS.Timeout | null = null
  private greetingTimer: NodeJS.Timeout | null = null
  private isProcessing = false
  private activeTemplateId = 'fishing_3d'
  private onSpeakCallback?: (payload: SpeakPayload) => void

  constructor(onSpeak?: (payload: SpeakPayload) => void) {
    this.onSpeakCallback = onSpeak
    this.loadConfig()
    this.restartLoop()
    this.restartGreetingLoop()
  }

  public setActiveTemplate(id: string) {
    if (id) this.activeTemplateId = id
  }

  public getConfig(): AIEngineConfig {
    return { ...this.config }
  }

  public isAiEnabled(): boolean {
    return !!this.config.enabled && (Boolean(this.config.apiKey) || this.config.provider === 'ollama')
  }

  private botCommentsCache: Map<string, string[]> = new Map()
  private botCommentsFetching: Set<string> = new Set()

  public async getAiBotComment(templateId: string, streamName?: string): Promise<string | null> {
    if (!this.isAiEnabled()) return null

    const cacheKey = `${templateId}_${streamName || ''}`
    let list = this.botCommentsCache.get(cacheKey) || []

    if (list.length > 0) {
      const picked = list.shift()!
      if (list.length <= 2 && !this.botCommentsFetching.has(cacheKey)) {
        this.fetchAiBotComments(templateId, streamName).catch(() => {})
      }
      return picked
    }

    await this.fetchAiBotComments(templateId, streamName)
    list = this.botCommentsCache.get(cacheKey) || []
    return list.length > 0 ? list.shift()! : null
  }

  private async fetchAiBotComments(templateId: string, streamName?: string): Promise<void> {
    const cacheKey = `${templateId}_${streamName || ''}`
    if (this.botCommentsFetching.has(cacheKey)) return
    this.botCommentsFetching.add(cacheKey)

    try {
      const templateDescriptions: Record<string, string> = {
        racing_3d: 'giải đua xe 3D Grand Prix (khán giả comment cổ vũ xe, xin slot đua, khen xe chạy mượt, hóng về đích)',
        fishing_3d: 'đấu trường câu cá 3D (khán giả xin cần câu, hóng cá to khổng lồ, khen mặt nước chill, giật cá)',
        print_booth_3d: 'máy in ảnh avatar 3D (khán giả xin 1 slot in avatar, khen ảnh sắc nét, hóng tới lượt mình)',
        print_booth_lite: 'máy in ảnh chân dung 3D (khán giả xin slot in, khen nét, thả tim)',
      }

      const desc = templateDescriptions[templateId] || 'trò chơi tương tác 3D TikTok Live'
      const prompt = `Bạn là khán giả đang xem livestream TikTok "${streamName || 'Live Tương Tác 3D'}".
Trò chơi trên livestream là: ${desc}.
Nhiệm vụ: Hãy tạo đúng 8 bình luận ngắn gọn, tự nhiên, đa dạng của khán giả Việt Nam gửi vào phòng live.
Yêu cầu:
- Mỗi bình luận viết trên 1 dòng riêng biệt.
- Cực kỳ ngắn gọn (dưới 12 từ/câu), ngôn ngữ mạng đời thường (ví dụ: "shop cho em xin slot", "xe xịn quá", "kéo cá to lên nào", "in giúp em với ạ", "haha đỉnh thật").
- Không đánh số, không gạch đầu dòng, không thêm lời dẫn.`

      let endpoint = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
      if (!endpoint.endsWith('/chat/completions')) {
        endpoint += '/chat/completions'
      }

      let model = this.config.model || 'gpt-4o-mini'
      if (this.config.provider === 'gemini') {
        if (!this.config.baseUrl || this.config.baseUrl.includes('openai.com')) {
          endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        }
        if (!this.config.model || this.config.model === 'gpt-4o-mini') {
          model = 'gemini-1.5-flash'
        }
      } else if (this.config.provider === 'ollama') {
        if (!this.config.baseUrl || this.config.baseUrl.includes('openai.com')) {
          endpoint = 'http://localhost:11434/v1/chat/completions'
        }
        if (!this.config.model || this.config.model === 'gpt-4o-mini') {
          model = 'qwen2.5:3b'
        }
      } else if (this.config.provider === 'deepseek') {
        if (!this.config.baseUrl || this.config.baseUrl.includes('openai.com')) {
          endpoint = 'https://api.deepseek.com/v1/chat/completions'
        }
        if (!this.config.model || this.config.model === 'gpt-4o-mini') {
          model = 'deepseek-chat'
        }
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey.trim()}`
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.85,
        }),
      })

      if (resp.ok) {
        const json: any = await resp.json()
        const text = json.choices?.[0]?.message?.content || ''
        const lines = text
          .split('\n')
          .map((l: string) => l.replace(/^[-*•\d.)\s]+/, '').trim())
          .filter((l: string) => l.length > 2 && l.length < 100)

        if (lines.length > 0) {
          const current = this.botCommentsCache.get(cacheKey) || []
          this.botCommentsCache.set(cacheKey, [...current, ...lines])
        }
      }
    } catch (e) {
      console.error('[AI Engine] Failed to fetch bot comments:', e)
    } finally {
      this.botCommentsFetching.delete(cacheKey)
    }
  }

  public updateConfig(partial: Partial<AIEngineConfig>) {
    this.config = {
      ...this.config,
      ...partial,
      templatePrompts: {
        ...this.config.templatePrompts,
        ...(partial.templatePrompts || {}),
      },
    }
    this.saveConfig()
    this.restartLoop()
    this.restartGreetingLoop()
  }

  private loadConfig() {
    try {
      const saved = db.getConfig('ai_engine_config')
      if (saved) {
        const parsed = JSON.parse(saved)
        this.config = {
          ...DEFAULT_CONFIG,
          ...parsed,
          templatePrompts: {
            ...DEFAULT_TEMPLATE_PROMPTS,
            ...(parsed.templatePrompts || {}),
          },
        }
      }
    } catch (err) {
      console.error('[AI Engine] Failed to parse saved config:', err)
    }
  }

  private saveConfig() {
    try {
      db.setConfig('ai_engine_config', JSON.stringify(this.config))
    } catch (err) {
      console.error('[AI Engine] Failed to save config:', err)
    }
  }

  private restartLoop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    if (!this.config.enabled || !this.config.ttsEnabled) {
      return
    }

    const intervalMs = Math.max(3, this.config.batchInterval || 6) * 1000
    this.timer = setInterval(() => {
      this.processBatch(this.activeTemplateId)
    }, intervalMs)
  }

  private restartGreetingLoop() {
    if (this.greetingTimer) {
      clearInterval(this.greetingTimer)
      this.greetingTimer = null
    }
    // Legacy global greeting disabled: Greetings are now managed per-session in LiveSessionInstance
  }

  public speakGreeting() {
    const text = (this.config.greetingText || '').trim()
    if (!text || !this.config.ttsEnabled || !this.onSpeakCallback) return
    const spokenText = this.cleanSpeechText(text)
    if (!spokenText) return

    const payload: SpeakPayload = {
      id: `greeting-${Date.now()}`,
      text: spokenText,
      engine: this.config.ttsEngine,
      audioUrl: `/api/tts?text=${encodeURIComponent(spokenText)}&_t=${Date.now()}`,
      speed: this.config.ttsSpeed || 1.0,
      volume: this.config.ttsVolume || 1.0,
      voice: this.config.ttsVoice || 'vi-VN-HoaiMyNeural',
      duckMusic: this.config.ttsDuckMusic !== false,
      playInApp: true,
      playInObs: this.config.playInObs !== false,
      templateId: this.activeTemplateId,
      timestamp: Date.now(),
    }
    this.onSpeakCallback(payload)
  }

  // Push incoming event from TikTok stream or faker
  public handleLog(templateId: string, log: DbLogItem, streamKey?: string) {
    if (templateId) this.activeTemplateId = templateId
    if (!this.config.enabled || !this.config.ttsEnabled) return
    if (!log || log.type === 'system') return

    const message = (log.message || '').trim()
    const user = (log.user || 'Khán giả').trim()

    // Skip spam 1-2 chars
    if (log.type === 'chat' && message.length < 2) return

    let priority = 20
    if (log.type === 'gift') priority = 100
    else if (log.type === 'member') priority = 10

    this.pendingEvents.push({
      id: log.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: log.type,
      user,
      message,
      priority,
      timestamp: Date.now(),
      streamKey: streamKey || 'default',
      templateId: templateId || this.activeTemplateId,
    })

    // Cap pending buffer to 50 items to prevent memory bloat
    if (this.pendingEvents.length > 50) {
      this.pendingEvents.sort((a, b) => b.priority - a.priority)
      this.pendingEvents = this.pendingEvents.slice(0, 50)
    }
  }

  private async processBatch(activeTemplateId = 'print_booth_3d') {
    if (this.isProcessing) return
    if (this.pendingEvents.length === 0) return
    if (!this.config.enabled || !this.config.ttsEnabled) return

    this.isProcessing = true
    try {
      // Group and process events per streamKey so each stream's webview tab gets its own TTS
      const streamKeys = Array.from(new Set(this.pendingEvents.map((e) => e.streamKey || 'default')))

      for (const key of streamKeys) {
        const streamEvents = this.pendingEvents.filter((e) => (e.streamKey || 'default') === key)
        if (streamEvents.length === 0) continue

        // Sort by priority descending (gifts first, then meaningful chats)
        streamEvents.sort((a, b) => b.priority - a.priority)
        const batchSize = Math.max(1, this.config.maxBatchSize || 6)
        const selectedEvents = streamEvents.slice(0, batchSize)

        // Remove selected from pendingEvents
        const selectedIds = new Set(selectedEvents.map((e) => e.id))
        this.pendingEvents = this.pendingEvents.filter((e) => !selectedIds.has(e.id))

        const targetTemplate = selectedEvents[0]?.templateId || activeTemplateId || this.activeTemplateId
        let spokenText = ''
        const prompt =
          this.config.templatePrompts[targetTemplate] ||
          this.config.templatePrompts['default'] ||
          DEFAULT_TEMPLATE_PROMPTS[targetTemplate] ||
          DEFAULT_TEMPLATE_PROMPTS['default']

        const useLLM =
          this.config.provider !== 'rule_based' &&
          (Boolean(this.config.apiKey) || this.config.provider === 'ollama')

        if (useLLM) {
          spokenText = await this.callLLM(prompt, selectedEvents)
        }

        // If LLM returned empty, failed, or rule-based selected: use smart rule-based generator
        if (!spokenText) {
          spokenText = this.generateRuleBased(targetTemplate, selectedEvents)
        }

        spokenText = this.cleanSpeechText(spokenText)

        if (spokenText && this.config.ttsEnabled && this.onSpeakCallback) {
          const payload: SpeakPayload = {
            id: `speak-${Date.now()}`,
            text: spokenText,
            engine: this.config.ttsEngine,
            audioUrl: `/api/tts?text=${encodeURIComponent(spokenText)}&_t=${Date.now()}`,
            speed: this.config.ttsSpeed || 1.0,
            volume: this.config.ttsVolume || 1.0,
            voice: this.config.ttsVoice || 'vi-VN-HoaiMyNeural',
            duckMusic: this.config.ttsDuckMusic !== false,
            playInApp: false, // Stream-generated speech plays in the stream's webview tab, not on host app!
            playInObs: this.config.playInObs !== false,
            streamKey: key,
            templateId: targetTemplate,
            isTest: false,
            timestamp: Date.now(),
          }
          this.onSpeakCallback(payload)
        }
      }
    } catch (err) {
      console.error('[AI Engine] processBatch error:', err)
    } finally {
      this.isProcessing = false
    }
  }

  private async callLLM(systemPrompt: string, events: LiveEventItem[]): Promise<string> {
    const summary = events
      .map((e) => {
        if (e.type === 'gift') return `- [QUÀ TẶNG] ${e.user}: ${e.message}`
        if (e.type === 'member') return `- [THAM GIA] ${e.user} vừa vào phòng live`
        return `- [BÌNH LUẬN] ${e.user}: ${e.message}`
      })
      .join('\n')

    let endpoint = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint += '/chat/completions'
    }

    let model = this.config.model || 'gpt-4o-mini'
    if (this.config.provider === 'gemini') {
      if (!this.config.baseUrl || this.config.baseUrl.includes('openai.com')) {
        endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      }
      if (!this.config.model || this.config.model === 'gpt-4o-mini') {
        model = 'gemini-1.5-flash'
      }
    } else if (this.config.provider === 'ollama') {
      if (!this.config.baseUrl || this.config.baseUrl.includes('openai.com')) {
        endpoint = 'http://localhost:11434/v1/chat/completions'
      }
      if (!this.config.model || this.config.model === 'gpt-4o-mini') {
        model = 'qwen2.5:3b'
      }
    } else if (this.config.provider === 'deepseek') {
      if (!this.config.baseUrl || this.config.baseUrl.includes('openai.com')) {
        endpoint = 'https://api.deepseek.com/v1/chat/completions'
      }
      if (!this.config.model || this.config.model === 'gpt-4o-mini') {
        model = 'deepseek-chat'
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey.trim()}`
    }

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Danh sách sự kiện khán giả vừa diễn ra:\n${summary}\n\nHãy tạo 1 câu nói ngắn gọn (dưới 25 từ) để nói với khán giả lúc này:`,
        },
      ],
      max_tokens: 80,
      temperature: 0.7,
    }

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(6000),
      })
      if (!resp.ok) {
        console.warn(`[AI Engine] LLM HTTP error ${resp.status}`)
        return ''
      }
      const data: any = await resp.json()
      const answer = data.choices?.[0]?.message?.content || ''
      return answer.trim()
    } catch (err: any) {
      console.warn('[AI Engine] LLM fetch failed:', err.message)
      return ''
    }
  }

  // ponytail: Rule-based Vietnamese generator when offline or no API key.
  private generateRuleBased(templateId: string, events: LiveEventItem[]): string {
    const gift = events.find((e) => e.type === 'gift')
    const chat = events.find((e) => e.type === 'chat')
    const anyEvent = gift || chat || events[0]
    if (!anyEvent) return ''

    const name = anyEvent.user || 'bạn'

    switch (templateId) {
      case 'racing_3d':
        if (gift) {
          const gifts = [
            `Phụt lửa Nitro rực sáng! Cảm ơn bạn ${name} đã tiếp sức mãnh liệt cho tay đua nhé!`,
            `Một pha nạp Nitro cực gắt từ ${name}, xe đang xé gió lao lên dẫn đầu rồi!`,
            `Cảm ơn ${name} đã gửi quà bốc lửa, tay đua đang bứt tốc ngoạn mục!`,
          ]
          return gifts[Math.floor(Math.random() * gifts.length)]
        }
        if (chat) {
          const chats = [
            `Đường đua Grand Prix đang cực kỳ nghẹt thở, anh em dự đoán xe nào sẽ vô địch đây!`,
            `Bạn ${name} vừa cổ vũ rất nhiệt tình, tiếp tục giữ vững nhịp đua nhé các tay lái!`,
            `Khúc cua tử thần phía trước rồi, ai sẽ bứt phá giành lấy ngôi vị Top 1 đây!`,
          ]
          return chats[Math.floor(Math.random() * chats.length)]
        }
        return ''

      case 'plinko_3d':
        if (gift) {
          return `Một quả bi may mắn siêu cấp vừa được bạn ${name} kích hoạt, cùng chờ đón Jackpot nào!`
        }
        if (chat) {
          return `Bi đang nảy liên hoàn qua dàn đinh neon, liệu điểm rơi sẽ vào ô X10 hay X50 đây bạn ${name} ơi!`
        }
        return ''

      case 'fishing_3d':
        if (gift) {
          const fishGifts = [
            `Cần thủ ${name} vừa ném thính VIP giật lên cá rồng siêu khổng lồ rồi anh em ơi! Cảm ơn bạn nhé!`,
            `Một cú giật cần đỉnh cao từ bạn ${name}, cá mập đại dương đã cắn câu!`,
            `Cảm ơn ${name} đã tiếp sức mồi câu VIP, bảng vàng cần thủ đang gọi tên bạn!`,
          ]
          return fishGifts[Math.floor(Math.random() * fishGifts.length)]
        }
        if (chat) {
          const fishChats = [
            `Phao câu đang rung lắc dữ dội, anh em đoán xem cần thủ ${name} sẽ kéo lên cá gì đây!`,
            `Bạn ${name} đang quan sát mặt nước rất chăm chú, hãy thả tim để cá to cắn câu nào!`,
            `Đại dương 3D đang dậy sóng, ai sẽ là Vua Câu Cá của buổi live hôm nay đây!`,
          ]
          return fishChats[Math.floor(Math.random() * fishChats.length)]
        }
        return ''

      case 'tram_pha_che':
        if (gift) {
          return `Cảm ơn món quà ngọt ngào của bạn ${name}, ly nước đặc biệt đã sẵn sàng mời bạn thưởng thức!`
        }
        if (chat) {
          return `Chào mừng bạn ${name} đã ghé trạm pha chế, cùng ngồi lại lắng nghe bản nhạc chill nhé!`
        }
        return ''

      case 'buddha_temple_3d':
      case 'buddha-temple-3d':
        if (gift) {
          const templeGifts = [
            `Tri ân công đức phật tử ${name} đã phát tâm cúng dường, nguyện cầu chư Phật gia hộ gia đạo luôn bình an!`,
            `Cảm tạ tấm lòng của ${name} đã dâng lễ cúng dường, chúc bạn và gia đình thân tâm thường an lạc!`,
            `Công đức vô lượng từ ${name}, cầu chúc bạn vạn sự cát tường, sở cầu như ý!`,
            `Cảm ơn phật tử ${name} đã gieo duyên lành nơi cửa Phật, chúc bạn phúc thọ dồi dào!`,
          ]
          return templeGifts[Math.floor(Math.random() * templeGifts.length)]
        }
        if (chat) {
          const templeChats = [
            `A Di Đà Phật, chào mừng phật tử ${name} đã ghé thăm chánh điện đạo tràng hôm nay!`,
            `Kính chúc phật tử ${name} và gia đình một ngày an lành, thân tâm thanh tịnh!`,
            `Cảm ơn ${name} đã cùng đại chúng tịnh tâm hướng Phật, nguyện vạn điều tốt lành đến với bạn!`,
          ]
          return templeChats[Math.floor(Math.random() * templeChats.length)]
        }
        return ''

      case 'print_booth_3d':
      case 'print_booth_lite':
        if (gift) {
          const boothGifts = [
            `Cảm ơn bạn ${name} đã gửi quà VIP, avatar của bạn sẽ được ưu tiên in lát cắt ngay lập tức!`,
            `Quản đốc xưởng in xin cảm ơn ${name}, thẻ in công nghệ cao đã sẵn sàng!`,
            `Một món quà tuyệt vời từ bạn ${name}, máy in đang tăng tốc tối đa rồi nhé!`,
          ]
          return boothGifts[Math.floor(Math.random() * boothGifts.length)]
        }
        if (chat) {
          const boothChats = [
            `Xin chào bạn ${name}, avatar của bạn đang xếp hàng vào buồng in 3D rồi nha!`,
            `Chào mừng ${name} đến với xưởng in 3D, hãy thả tim để thẻ in lên màu đẹp nhất nhé!`,
            `Cảm ơn bạn ${name} đã tương tác, chúc bạn sớm nhận được tác phẩm avatar độc quyền!`,
          ]
          return boothChats[Math.floor(Math.random() * boothChats.length)]
        }
        return ''

      default:
        if (gift) {
          const defaultGifts = [
            `Cảm ơn bạn ${name} rất nhiều đã gửi món quà ủng hộ buổi live hôm nay nhé!`,
            `Cảm ơn món quà tuyệt vời từ bạn ${name}, chúc bạn một ngày tràn đầy niềm vui!`,
            `Cảm ơn ${name} đã tiếp thêm năng lượng cho phiên live, chúc bạn luôn may mắn nhé!`,
          ]
          return defaultGifts[Math.floor(Math.random() * defaultGifts.length)]
        }
        if (chat) {
          const defaultChats = [
            `Chào mừng bạn ${name} đã đến với buổi livestream, chúc bạn xem live vui vẻ nhé!`,
            `Cảm ơn bạn ${name} đã tương tác và trò chuyện cùng buổi live nha!`,
            `Chào bạn ${name}, rất vui được gặp bạn trong phiên live hôm nay!`,
          ]
          return defaultChats[Math.floor(Math.random() * defaultChats.length)]
        }
        return ''
    }
  }

  private cleanSpeechText(text: string): string {
    return text
      .replace(/[*#_~`>]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/["“”«»]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180)
  }

  // Manual test speak button in UI
  public testSpeak(sampleText?: string, templateId?: string) {
    const targetTemplate = templateId || this.activeTemplateId || 'fishing_3d'
    const greeting = (this.config.greetingText || '').trim()
    const text = sampleText?.trim() || (greeting ? greeting : this.generateRuleBased(targetTemplate, [
      { id: 'test', type: 'chat', user: 'Khán giả Demo', message: 'Chào livestream nhé!', priority: 20, timestamp: Date.now() },
    ])) || 'Xin chào toàn thể anh em đang xem livestream nhé!'

    const payload: SpeakPayload = {
      id: `speak-test-${Date.now()}`,
      text,
      engine: this.config.ttsEngine,
      audioUrl: `/api/tts?text=${encodeURIComponent(text)}&_t=${Date.now()}`,
      speed: this.config.ttsSpeed || 1.0,
      volume: this.config.ttsVolume || 1.0,
      voice: this.config.ttsVoice || 'vi-VN',
      duckMusic: this.config.ttsDuckMusic !== false,
      playInApp: true,
      playInObs: true,
      templateId: targetTemplate,
      isTest: true,
      timestamp: Date.now(),
    }

    if (this.onSpeakCallback) {
      this.onSpeakCallback(payload)
    }
    return payload
  }
}
