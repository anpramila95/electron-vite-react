import fs from 'node:fs'
import path from 'node:path'

export interface TemplateOptionField {
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

export interface TemplateAction {
  id: string
  label: string
  icon?: string
  variant?: 'primary' | 'danger' | 'warning' | 'secondary' | 'accent'
  actionKey: string
  payload?: any
  group?: string
}

export interface StreamTemplate {
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

const DEFAULT_TEMPLATES: StreamTemplate[] = [
  {
    id: 'print_booth_3d',
    name: 'Máy In Avatar 3D',
    description: 'Máy in 3D mô phỏng vẽ chân dung avatar khán giả theo phong cách cơ khí chân thực với Three.js.',
    icon: '🖨️',
    entryFile: 'templates/print-booth-3d/index.html',
    badge: 'Mặc định',
    features: ['Three.js 3D', 'Vẽ lát cắt avatar thật', 'Khung thẻ VIP', 'Đổi 5 góc camera', '5 Chủ đề màu'],
    settingsSchema: [],
    actions: [],
  },
  {
    id: 'racing_3d',
    name: 'Đua Xe Avatar 3D (Grand Prix)',
    description: 'Trường đua xe 3D tương tác. Xe mô hình gắn avatar khán giả, phụt lửa Nitro khi tặng quà, camera đuổi bám theo xe top 1.',
    icon: '🏎️',
    entryFile: 'templates/racing-3d/index.html',
    badge: 'Three.js 3D',
    features: ['Three.js 3D', 'Xe gắn avatar thật', 'Lửa Nitro phản lực', 'Bám camera Top 1', 'Bục vinh danh'],
    settingsSchema: [],
    actions: [],
  },
  {
    id: 'fishing_3d',
    name: 'Câu Cá Avatar 3D (Fisherman King)',
    description: 'Đấu trường câu cá 3D tương tác. VIP và điểm càng cao câu cá càng to khổng lồ. Bảng xếp hạng chiến tích thời gian thực.',
    icon: '🎣',
    entryFile: 'templates/fishing-3d/index.html',
    badge: 'Three.js 3D',
    features: ['Three.js 3D', 'Mặt nước phản chiếu gợn sóng', 'Cá to theo VIP & điểm', '5 Bản đồ sông hồ biển', 'Bảng xếp hạng cần thủ'],
    settingsSchema: [],
    actions: [],
  }
]

// Dynamically discover and load all templates from public/templates/*/settings.json
export function loadAllTemplates(publicDir?: string): StreamTemplate[] {
  const baseDir = publicDir || path.join(process.cwd(), 'public')
  const templatesDir = path.join(baseDir, 'templates')

  if (!fs.existsSync(templatesDir)) {
    return DEFAULT_TEMPLATES
  }

  const result: StreamTemplate[] = []

  try {
    const folders = fs.readdirSync(templatesDir, { withFileTypes: true })
    for (const folder of folders) {
      if (folder.isDirectory()) {
        const settingsPath = path.join(templatesDir, folder.name, 'settings.json')
        if (fs.existsSync(settingsPath)) {
          try {
            const raw = fs.readFileSync(settingsPath, 'utf8')
            const parsed = JSON.parse(raw)
            result.push({
              id: parsed.id || folder.name,
              name: parsed.name || folder.name,
              description: parsed.description || '',
              icon: parsed.icon || '🎮',
              entryFile: `templates/${folder.name}/index.html`,
              badge: parsed.badge || 'Template',
              features: Array.isArray(parsed.features) ? parsed.features : [],
              settingsSchema: Array.isArray(parsed.settingsSchema) ? parsed.settingsSchema : [],
              actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            })
          } catch (e) {
            console.error(`Error loading template ${folder.name}:`, e)
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to read templates dir:', err)
  }

  return result.length > 0 ? result : DEFAULT_TEMPLATES
}

export const STREAM_TEMPLATES: StreamTemplate[] = loadAllTemplates()

export function getTemplateById(id: string, publicDir?: string): StreamTemplate {
  const all = loadAllTemplates(publicDir)
  return all.find((t) => t.id === id) || all[0] || DEFAULT_TEMPLATES[0]
}
