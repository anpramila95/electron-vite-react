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
}

export interface LiveEventItem {
  id: string
  type: string
  user: string
  message: string
  priority: number
  timestamp: number
}

export interface SpeakPayload {
  id: string
  text: string
  engine: 'webspeech' | 'google' | 'openai' | 'elevenlabs' | 'custom_remote'
  audioUrl: string
  speed: number
  volume: number
  voice: string
  duckMusic: boolean
  playInApp: boolean
  playInObs: boolean
  templateId: string
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

  default: `Bạn là Trợ lý AI đồng hành cùng streamer trên TikTok Live.
Nhiệm vụ: Tương tác ngắn gọn, dí dỏm với bình luận và quà tặng của khán giả.
Phong cách: Duyên dáng, thông minh, vui tươi, xưng Em gọi Bạn/Anh/Chị.
Quy tắc:
- Trả lời đúng 1 câu tự nhiên (dưới 25 từ).
- Không lặp lại nguyên văn comment, phản hồi hóm hỉnh.
- Ưu tiên người tặng quà hoặc lời chào đáng yêu.`,
}

const DEFAULT_CONFIG: AIEngineConfig = {
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
  playInApp: false, // Default to false: let OBS Preview handle TTS & ducking like music
  playInObs: true,
  templatePrompts: { ...DEFAULT_TEMPLATE_PROMPTS },
}

export class LiveAIEngine {
  private config: AIEngineConfig = { ...DEFAULT_CONFIG }
  private pendingEvents: LiveEventItem[] = []
  private timer: NodeJS.Timeout | null = null
  private isProcessing = false
  private onSpeakCallback?: (payload: SpeakPayload) => void

  constructor(onSpeak?: (payload: SpeakPayload) => void) {
    this.onSpeakCallback = onSpeak
    this.loadConfig()
    this.restartLoop()
  }

  public getConfig(): AIEngineConfig {
    return { ...this.config }
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

    if (!this.config.enabled && !this.config.ttsEnabled) {
      return
    }

    const intervalMs = Math.max(3, this.config.batchInterval || 6) * 1000
    this.timer = setInterval(() => {
      this.processBatch()
    }, intervalMs)
  }

  // Push incoming event from TikTok stream or faker
  public handleLog(templateId: string, log: DbLogItem) {
    if (!this.config.enabled && !this.config.ttsEnabled) return
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
    })

    // Cap pending buffer to 25 items to prevent memory bloat
    if (this.pendingEvents.length > 25) {
      this.pendingEvents.sort((a, b) => b.priority - a.priority)
      this.pendingEvents = this.pendingEvents.slice(0, 25)
    }
  }

  private async processBatch(activeTemplateId = 'print_booth_3d') {
    if (this.isProcessing) return
    if (this.pendingEvents.length === 0) return
    if (!this.config.enabled && !this.config.ttsEnabled) return

    this.isProcessing = true
    try {
      // Sort by priority descending (gifts first, then meaningful chats)
      this.pendingEvents.sort((a, b) => b.priority - a.priority)
      const batchSize = Math.max(1, this.config.maxBatchSize || 6)
      const selectedEvents = this.pendingEvents.splice(0, batchSize)

      if (selectedEvents.length === 0) return

      let spokenText = ''
      const prompt =
        this.config.templatePrompts[activeTemplateId] ||
        this.config.templatePrompts['default'] ||
        DEFAULT_TEMPLATE_PROMPTS[activeTemplateId] ||
        DEFAULT_TEMPLATE_PROMPTS['default']

      const useLLM =
        this.config.provider !== 'rule_based' &&
        (Boolean(this.config.apiKey) || this.config.provider === 'ollama')

      if (useLLM) {
        spokenText = await this.callLLM(prompt, selectedEvents)
      }

      // If LLM returned empty, failed, or rule-based selected: use smart rule-based generator
      if (!spokenText) {
        spokenText = this.generateRuleBased(activeTemplateId, selectedEvents)
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
          voice: this.config.ttsVoice || 'vi-VN',
          duckMusic: this.config.ttsDuckMusic !== false,
          playInApp: this.config.playInApp === true,
          playInObs: this.config.playInObs !== false,
          templateId: activeTemplateId,
          timestamp: Date.now(),
        }
        this.onSpeakCallback(payload)
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
        return `Đường đua rực lửa 3D đang chào đón các tay đua, chuẩn bị bứt tốc nào!`

      case 'plinko_3d':
        if (gift) {
          return `Một quả bi may mắn siêu cấp vừa được bạn ${name} kích hoạt, cùng chờ đón Jackpot nào!`
        }
        if (chat) {
          return `Bi đang nảy liên hoàn qua dàn đinh neon, liệu điểm rơi sẽ vào ô X10 hay X50 đây bạn ${name} ơi!`
        }
        return `Cùng đếm nhịp hồi hộp với từng đường bóng rơi may mắn nào anh em!`

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
        return `Mặt nước phẳng lặng bỗng chao đảo, các cần thủ chuẩn bị giật cần nào!`

      case 'tram_pha_che':
        if (gift) {
          return `Cảm ơn món quà ngọt ngào của bạn ${name}, ly nước đặc biệt đã sẵn sàng mời bạn thưởng thức!`
        }
        if (chat) {
          return `Chào mừng bạn ${name} đã ghé trạm pha chế, cùng ngồi lại lắng nghe bản nhạc chill nhé!`
        }
        return `Trạm pha chế kính chào quý khách, chúc mọi người có một buổi tối thật an nhiên!`

      case 'print_booth_3d':
      default:
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
        return `Xưởng in 3D công nghệ cao đang hoạt động, chào mừng toàn thể khán giả!`
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
  public testSpeak(sampleText?: string, templateId = 'print_booth_3d') {
    const text = sampleText?.trim() || this.generateRuleBased(templateId, [
      { id: 'test', type: 'chat', user: 'Khán giả Demo', message: 'Chào AI nhé!', priority: 20, timestamp: Date.now() },
    ])

    const payload: SpeakPayload = {
      id: `speak-test-${Date.now()}`,
      text,
      engine: this.config.ttsEngine,
      audioUrl: `/api/tts?text=${encodeURIComponent(text)}&_t=${Date.now()}`,
      speed: this.config.ttsSpeed || 1.0,
      volume: this.config.ttsVolume || 1.0,
      voice: this.config.ttsVoice || 'vi-VN',
      duckMusic: this.config.ttsDuckMusic !== false,
      playInApp: this.config.playInApp === true,
      playInObs: true,
      templateId,
      timestamp: Date.now(),
    }

    if (this.onSpeakCallback) {
      this.onSpeakCallback(payload)
    }
    return payload
  }
}
