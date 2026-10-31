import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function resolveTemplatesDir(publicDir?: string): string {
  const candidates = [
    publicDir,
    process.env.VITE_PUBLIC,
    path.join(process.cwd(), 'public'),
    path.join(__dirname, '../../public'),
  ].filter(Boolean) as string[]

  for (const base of candidates) {
    const dir = base.endsWith('templates') ? base : path.join(base, 'templates')
    if (fs.existsSync(dir)) return dir
  }
  return path.join(process.cwd(), 'public', 'templates')
}

// Auto load all templates from public/templates/*/
export function loadAllTemplates(publicDir?: string): StreamTemplate[] {
  const dir = resolveTemplatesDir(publicDir)
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const folder = d.name
      const settingsPath = path.join(dir, folder, 'settings.json')
      let meta: Partial<StreamTemplate> = {}

      if (fs.existsSync(settingsPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
        } catch (e) {
          console.error(`[templates] Failed to parse ${folder}/settings.json:`, e)
        }
      }

      return {
        id: meta.id || folder,
        name: meta.name || folder.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: meta.description || '',
        icon: meta.icon || '🎮',
        entryFile: `templates/${folder}/index.html`,
        badge: meta.badge || 'Template',
        features: Array.isArray(meta.features) ? meta.features : [],
        settingsSchema: Array.isArray(meta.settingsSchema) ? meta.settingsSchema : [],
        actions: Array.isArray(meta.actions) ? meta.actions : [],
      }
    })
}

export const STREAM_TEMPLATES: StreamTemplate[] = loadAllTemplates()

export function getTemplateById(id: string, publicDir?: string): StreamTemplate | undefined {
  const all = loadAllTemplates(publicDir)
  return all.find((t) => t.id === id || t.entryFile.includes(`/${id}/`)) || all[0]
}
