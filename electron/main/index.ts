import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { update } from './update'
import { startLocalServer, type ServerInstance } from './server'
import { db } from './db'
import { TikTokManager, LiveSessionInstance } from './tiktok'
import { loadAllTemplates, getTemplateById } from './templates'
import { LiveAIEngine, DEFAULT_TEMPLATE_PROMPTS } from './ai-engine'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.platform === 'win32' && os.release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const musicStates = new Map<string, any>()
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

let localServer: ServerInstance | null = null
let tiktokManager: TikTokManager | null = null
let aiEngine: LiveAIEngine | null = null

async function createWindow() {
  win = new BrowserWindow({
    title: 'TikTok Live Stream 3D Print Booth Multi-Manager',
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 1. Initialize SQLite Database
  const dbPath = path.join(process.env.APP_ROOT, 'live-stream.sqlite')
  db.init(dbPath)

  // 2. Start local HTTP & WebSocket server
  try {
    localServer = await startLocalServer(process.env.VITE_PUBLIC, 3210)
    console.log(`[Local Server] Running on port ${localServer.port}`)
    localServer.onClientsChange = (counts) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('preview:clients-change', counts)
      }
    }
  } catch (err) {
    console.error('[Local Server] Error:', err)
  }

  // 3. Initialize TikTok Multi-Session Manager
  tiktokManager = new TikTokManager((event, data) => {
    // Send event to React renderer UI
    if (win && !win.isDestroyed()) {
      win.webContents.send('session:event', { event, data })
    }

    // Pass log to AI Engine for batch processing & TTS
    if (event === 'log' && data?.log && aiEngine) {
      const targetSession = data.sessionKey ? tiktokManager?.getSessionByStreamKey(data.sessionKey) : undefined
      aiEngine.handleLog(targetSession?.templateId || 'print_booth_3d', data.log, data.sessionKey)
    }

    // Broadcast to matching OBS overlay via WebSocket
    if (localServer && data?.sessionKey) {
      const sessionKey = data.sessionKey
      if (event === 'user_added') {
        localServer.broadcastToKey(sessionKey, {
          type: 'ADD_USER',
          user: {
            id: data.user.id,
            name: data.user.name,
            photoUrl: data.user.photoUrl ? `/api/proxy-img?url=${encodeURIComponent(data.user.photoUrl)}` : '',
            isVip: !!data.user.isVip,
            priority: data.user.priority || 0,
            source: data.user.source || 'chat',
            comment: data.user.comment || '',
            giftName: data.user.giftName || '',
          },
        })
      } else if (event === 'user_removed') {
        localServer.broadcastToKey(sessionKey, {
          type: 'REMOVE_USER',
          id: data.id,
        })
      } else if (event === 'queue_cleared') {
        localServer.broadcastToKey(sessionKey, {
          type: 'CLEAR_QUEUE',
        })
      } else if (event === 'queue') {
        localServer.broadcastToKey(sessionKey, {
          type: 'SET_QUEUE',
          queue: (data.queue || []).map((q: any) => ({
            id: q.id,
            name: q.name,
            photoUrl: q.photo_url ? `/api/proxy-img?url=${encodeURIComponent(q.photo_url)}` : '',
            isVip: q.is_vip === 1,
          })),
        })
      } else if (event === 'settings') {
        localServer.broadcastToKey(sessionKey, {
          type: 'SET_SETTINGS',
          settings: data.settings,
        })
      } else if (event === 'log' && data?.log) {
        localServer.broadcastToKey(sessionKey, {
          type: 'ADD_LOG',
          log: {
            id: data.log.id,
            type: data.log.type,
            userName: data.log.user || data.log.user_name || 'Khán giả',
            message: data.log.message,
            avatarUrl: data.log.avatar ? `/api/proxy-img?url=${encodeURIComponent(data.log.avatar)}` : '',
            createdAt: data.log.created_at,
          },
        })
      } else if (event === 'user_score' && data?.user) {
        localServer.broadcastToKey(sessionKey, {
          type: 'USER_SCORE_UPDATE',
          user: data.user,
        })
      } else if (event === 'stream_greeting' && data?.text) {
        const port = localServer ? localServer.port : 3210
        const audioUrl = `http://localhost:${port}/api/tts?text=${encodeURIComponent(data.text)}&_t=${Date.now()}`
        localServer.broadcastToKey(sessionKey, {
          type: 'TTS_SPEAK',
          id: `greet-${Date.now()}`,
          text: data.text,
          audioUrl,
          streamKey: sessionKey,
          templateId: data.templateId,
          duckMusic: true,
          playInObs: true,
          playInApp: false,
          timestamp: Date.now(),
        })
      }
    }
  })

  if (localServer) {
    localServer.onClientMessage = (streamKey, msg) => {
      const session = tiktokManager?.getSessionByStreamKey(streamKey)
      if (!session) return

      if (msg.type === 'CLEAR_QUEUE') {
        session.clearQueue()
      } else if (msg.type === 'USER_PRINTED' && msg.userId) {
        const queue = session.getQueue()
        const found = queue.find(
          (q) => q.unique_id === String(msg.userId) || String(q.id) === String(msg.userId),
        )
        if (found) {
          session.removeFromQueue(found.id)
        }
      }
    }
  }

  // 4. Initialize AI Engine & TTS Broadcaster
  aiEngine = new LiveAIEngine((payload) => {
    const port = localServer?.port || 3210
    const resolvedAudioUrl =
      payload.audioUrl && payload.audioUrl.startsWith('/')
        ? `http://localhost:${port}${payload.audioUrl}`
        : payload.audioUrl

    // Chỉ phát trên cửa sổ Electron nếu là thao tác bấm "Nói Thử" / Test thủ công.
    // Lời nói tự động từ luồng live CHỈ phát trong đúng webview/OBS tab của stream đó.
    if (payload.isTest && win && !win.isDestroyed()) {
      win.webContents.send('ai:speak', {
        ...payload,
        audioUrl: resolvedAudioUrl,
      })
    }

    // Phát đúng vào webview / OBS Browser Source có streamKey tương ứng (cô lập 100% âm thanh giữa các stream)
    if (localServer) {
      if (payload.streamKey && payload.streamKey !== 'default') {
        localServer.broadcastToKey(payload.streamKey, {
          type: 'TTS_SPEAK',
          ...payload,
          audioUrl: resolvedAudioUrl,
        })
      } else {
        localServer.broadcastAll({
          type: 'TTS_SPEAK',
          ...payload,
          audioUrl: resolvedAudioUrl,
        })
      }
    }
  })

  tiktokManager?.setAiEngine(aiEngine)

  // Handle WebSocket new connections: send initial state of requested stream key
  if (localServer) {
    const sendSessionInit = (ws: any, session: LiveSessionInstance) => {
      if (ws.readyState === 1) {
        const tmpl = getTemplateById(session.templateId, process.env.VITE_PUBLIC)
        const recentLogs = db.getLogs(session.id, 100).reverse().map((l) => ({
          id: l.id,
          type: l.type,
          userName: l.user,
          message: l.message,
          avatarUrl: l.avatar ? `/api/proxy-img?url=${encodeURIComponent(l.avatar)}` : '',
          createdAt: l.created_at,
        }))
        ws.send(
          JSON.stringify({
            type: 'INIT_STATE',
            streamKey: session.streamKey,
            templateId: session.templateId,
            entryUrl: `/${tmpl?.entryFile || 'templates/print-booth-3d/index.html'}`,
            settings: session.settings,
            logs: recentLogs,
            userScores: session.getAllScores(),
            queue: session.getQueue().map((q) => ({
              id: q.id,
              name: q.name,
              photoUrl: q.photo_url ? `/api/proxy-img?url=${encodeURIComponent(q.photo_url)}` : '',
              isVip: q.is_vip === 1,
            })),
          }),
        )
      }
    }

    localServer.wss.on('connection', (ws: any, req: any) => {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const streamKey = parsedUrl.searchParams.get('key') || 'live_default'

      let session: LiveSessionInstance | undefined = tiktokManager?.getSessionByStreamKey(streamKey)
      if (!session) {
        const all = tiktokManager?.getAllSessions() || []
        session = all[0]
      }

      if (session) {
        sendSessionInit(ws, session)
        const music = musicStates.get(session.streamKey)
        if (music) {
          ws.send(JSON.stringify({ type: 'SET_MUSIC', music }))
        }
      }

      ws.on('message', (msg: any) => {
        try {
          const parsed = JSON.parse(msg.toString())
          if (parsed.type === 'SUBSCRIBE' && parsed.key) {
            const target = tiktokManager?.getSessionByStreamKey(parsed.key)
            if (target) {
              sendSessionInit(ws, target)
              const music = musicStates.get(target.streamKey)
              if (music) {
                ws.send(JSON.stringify({ type: 'SET_MUSIC', music }))
              }
            }
          } else if (parsed.type === 'MUSIC_NEXT' && parsed.key) {
            const current = musicStates.get(parsed.key)
            if (current && Array.isArray(current.playlist) && current.playlist.length > 0) {
              const nextIdx = (current.currentTrackIndex + 1) % current.playlist.length
              current.currentTrackIndex = nextIdx
              current.url = current.playlist[nextIdx]?.url
              current.title = current.playlist[nextIdx]?.name
              musicStates.set(parsed.key, current)
              localServer?.broadcastToKey(parsed.key, { type: 'SET_MUSIC', music: current })
              win?.webContents.send('music:state-change', { streamKey: parsed.key, music: current })
            }
          } else if (parsed.type === 'SYNC_STATUS' && win && !win.isDestroyed()) {
            win.webContents.send('overlay:sync', {
              streamKey: parsed.streamKey || streamKey,
              ...parsed,
            })
          } else if (parsed.type === 'USER_PRINTING' && parsed.user && win && !win.isDestroyed()) {
            win.webContents.send('session:event', {
              event: 'user_printing',
              data: {
                sessionKey: parsed.streamKey || streamKey,
                user: parsed.user,
              },
            })
          } else if (parsed.type === 'CLEAR_QUEUE') {
            const currentKey = parsed.streamKey || streamKey
            const target = tiktokManager?.getSessionByStreamKey(currentKey)
            if (target) {
              target.clearQueue()
            }
          } else if (parsed.type === 'USER_PRINTED' && parsed.userId) {
            const currentKey = parsed.streamKey || streamKey
            const target = tiktokManager?.getSessionByStreamKey(currentKey)
            if (target) {
              target.removeFromQueue(parsed.userId)
            }
            if (win && !win.isDestroyed()) {
              win.webContents.send('session:event', {
                event: 'user_printed',
                data: {
                  sessionKey: currentKey,
                  userId: parsed.userId,
                },
              })
            }
          }
        } catch {
          // Ignore
        }
      })
    })
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(indexHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  update(win)
}

// ---------------- IPC HANDLERS ----------------

ipcMain.handle('preview:get-clients', () => {
  return localServer ? localServer.getAllClientCounts() : {}
})

ipcMain.handle('preview:open', (_, streamKey?: string) => {
  const port = localServer ? localServer.port : 3210
  const key = streamKey || 'live_default'
  const url = `http://localhost:${port}/preview?key=${encodeURIComponent(key)}`
  shell.openExternal(url)
  return { success: true }
})

ipcMain.handle('server:get-info', () => {
  const port = localServer ? localServer.port : 3210
  const tmps = loadAllTemplates(process.env.VITE_PUBLIC)
  return {
    port,
    baseObsUrl: `http://localhost:${port}`,
    templates: tmps,
  }
})

ipcMain.handle('templates:get-all', () => {
  return loadAllTemplates(process.env.VITE_PUBLIC)
})

ipcMain.handle('sessions:update-template', (_, { id, templateId }) => {
  const session = tiktokManager?.getSession(id)
  if (!session) return { success: false }
  session.updateTemplate(templateId)

  // Broadcast realtime template change to OBS overlay
  if (localServer) {
    const tmpl = getTemplateById(templateId, process.env.VITE_PUBLIC)
    localServer.broadcastToKey(session.streamKey, {
      type: 'CHANGE_TEMPLATE',
      templateId,
      entryUrl: `/${tmpl?.entryFile || 'templates/print-booth-3d/index.html'}`,
    })
  }

  return { success: true }
})

// Get all sessions
ipcMain.handle('sessions:get-all', () => {
  return tiktokManager?.getAllSessions().map((s) => s.getStatus()) || []
})

// Create session
ipcMain.handle('sessions:create', (_, data) => {
  const session = tiktokManager?.createSession(data)
  return session ? session.getStatus() : null
})

// Delete session
ipcMain.handle('sessions:delete', (_, id: string) => {
  tiktokManager?.deleteSession(id)
  return { success: true }
})

ipcMain.handle('sessions:delete-all', () => {
  tiktokManager?.deleteAllSessions()
  return { success: true }
})

// Start a live session
ipcMain.handle('sessions:start', async (_, { id }) => {
  const session = tiktokManager?.getSession(id)
  if (!session) return { success: false, error: 'Không tìm thấy phiên live' }
  return await session.start()
})

// Stop a live session
ipcMain.handle('sessions:stop', (_, { id }) => {
  const session = tiktokManager?.getSession(id)
  if (!session) return { success: false, error: 'Không tìm thấy phiên live' }
  session.stop()
  return { success: true }
})

// Update settings of a session
ipcMain.handle('sessions:update-settings', (_, { id, settings }) => {
  const session = tiktokManager?.getSession(id)
  if (!session) return { success: false }
  session.updateSettings(settings)
  return { success: true }
})

// Update TikTok config of a session
ipcMain.handle('sessions:update-config', (_, { id, config }) => {
  const session = tiktokManager?.getSession(id)
  if (!session) return { success: false }
  session.updateConfig(config)
  return { success: true }
})

// Queue operations
ipcMain.handle('queue:add-manual', (_, { sessionId, name, photoUrl, isVip }) => {
  const session = tiktokManager?.getSession(sessionId)
  if (!session) return { success: false }
  session.addToQueue({
    uniqueId: `manual_${Date.now()}`,
    name: name || 'Khách thủ công',
    photoUrl: photoUrl || '',
    priority: isVip ? 100 : 50,
    isVip: !!isVip,
    source: 'manual',
    comment: 'Thêm thủ công',
  })
  return { success: true }
})

ipcMain.handle('queue:add-batch', (_, { sessionId, items }) => {
  const session = tiktokManager?.getSession(sessionId)
  if (!session || !Array.isArray(items)) return { success: false }
  session.addBatchToQueue(items)
  return { success: true }
})

ipcMain.handle('queue:remove', (_, { sessionId, id }) => {
  const session = tiktokManager?.getSession(sessionId)
  if (!session) return { success: false }
  session.removeFromQueue(id)
  return { success: true }
})

ipcMain.handle('queue:prioritize-vip', (_, { sessionId, id }) => {
  const session = tiktokManager?.getSession(sessionId)
  if (!session) return { success: false }
  session.prioritizeVip(id)
  return { success: true }
})

ipcMain.handle('queue:force-print', (_, { sessionId, id }) => {
  const session = tiktokManager?.getSession(sessionId)
  if (!session) return { success: false }
  session.forcePrint(id)
  if (localServer) {
    localServer.broadcastToKey(session.streamKey, {
      type: 'PRIORITIZE_NOW',
      id,
    })
  }
  return { success: true }
})

// Music IPC Handlers for OBS Preview Background Music
ipcMain.handle('music:update', (_, { streamKey, music }) => {
  if (!streamKey) return { success: false }
  musicStates.set(streamKey, music)
  if (localServer) {
    localServer.broadcastToKey(streamKey, {
      type: 'SET_MUSIC',
      music,
    })
  }
  return { success: true }
})

ipcMain.handle('music:get-state', (_, streamKey) => {
  return musicStates.get(streamKey) || null
})

ipcMain.handle('music:pick-folder', async () => {
  if (!win) return []
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Chọn thư mục chứa nhạc nền',
  })

  if (result.canceled || result.filePaths.length === 0) return []
  const dirPath = result.filePaths[0]

  try {
    const files = fs.readdirSync(dirPath)
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
    const tracks: any[] = []

    for (const f of files) {
      const ext = path.extname(f).toLowerCase()
      if (audioExts.includes(ext)) {
        const fullPath = path.join(dirPath, f)
        tracks.push({
          id: `${f}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: path.basename(f, ext),
          path: fullPath,
          url: `/api/audio-file?path=${encodeURIComponent(fullPath)}`,
        })
      }
    }
    return tracks
  } catch (err) {
    console.error('Error scanning music folder:', err)
    return []
  }
})

ipcMain.handle('music:pick-files', async () => {
  if (!win) return []
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    title: 'Chọn các file nhạc nền',
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) return []
  const tracks: any[] = []

  for (const fullPath of result.filePaths) {
    const ext = path.extname(fullPath).toLowerCase()
    const fileName = path.basename(fullPath, ext)
    tracks.push({
      id: `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: fileName,
      path: fullPath,
      url: `/api/audio-file?path=${encodeURIComponent(fullPath)}`,
    })
  }
  return tracks
})

ipcMain.handle('queue:clear', (_, { sessionId }) => {
  const session = tiktokManager?.getSession(sessionId)
  if (!session) return { success: false }
  session.clearQueue()
  return { success: true }
})

// Realtime controls sent to specific OBS overlay
ipcMain.handle('control:send-action', (_, { streamKey, action, value }) => {
  if (localServer) {
    localServer.broadcastToKey(streamKey, {
      type: 'ACTION',
      action,
      value,
    })
  }
  return { success: true }
})

// ==================== CLOUDFLARE QUICK TUNNEL & APP CONFIG ====================
let tunnelProcess: ChildProcess | null = null
let currentTunnelUrl = ''
let isStartingTunnel = false

function stopTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill()
    } catch (_) {}
    tunnelProcess = null
  }
  currentTunnelUrl = ''
  isStartingTunnel = false
}

function startTunnel(port = 3210): Promise<{ success: boolean; url?: string; error?: string }> {
  return new Promise((resolve) => {
    if (currentTunnelUrl && tunnelProcess) {
      resolve({ success: true, url: currentTunnelUrl })
      return
    }

    stopTunnel()
    isStartingTunnel = true

    try {
      tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        windowsHide: true,
      })

      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          isStartingTunnel = false
          if (currentTunnelUrl) {
            resolve({ success: true, url: currentTunnelUrl })
          } else {
            resolve({ success: false, error: 'Hết thời gian chờ tạo Cloudflare Tunnel (15s)' })
          }
        }
      }, 15000)

      const onData = (data: Buffer) => {
        const text = data.toString()
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
        if (match && !resolved) {
          resolved = true
          clearTimeout(timeout)
          currentTunnelUrl = match[0]
          isStartingTunnel = false
          resolve({ success: true, url: currentTunnelUrl })
        }
      }

      tunnelProcess.stdout?.on('data', onData)
      tunnelProcess.stderr?.on('data', onData)

      tunnelProcess.on('error', (err) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          isStartingTunnel = false
          resolve({
            success: false,
            error: `Không thể chạy cloudflared: ${err.message}.`,
          })
        }
      })

      tunnelProcess.on('exit', () => {
        tunnelProcess = null
        currentTunnelUrl = ''
        isStartingTunnel = false
      })
    } catch (err: any) {
      isStartingTunnel = false
      resolve({ success: false, error: err.message })
    }
  })
}

ipcMain.handle('tunnel:get-status', () => {
  return { active: !!currentTunnelUrl, url: currentTunnelUrl, starting: isStartingTunnel }
})

ipcMain.handle('tunnel:toggle', async () => {
  if (currentTunnelUrl) {
    stopTunnel()
    return { active: false, url: '' }
  } else {
    const port = localServer ? localServer.port : 3210
    const res = await startTunnel(port)
    return { active: res.success, url: res.url || '', error: res.error }
  }
})

ipcMain.handle('config:get-all', () => {
  return db.getAllConfig()
})

ipcMain.handle('config:set', (_, { key, value }) => {
  db.setConfig(key, value)
  return { success: true }
})

ipcMain.handle('euler:check-usage', async (_, { apiKey, apiUrl }: { apiKey?: string; apiUrl?: string } = {}) => {
  try {
    const base = apiUrl?.trim() || db.getConfig('signApiUrl') || 'https://api.eulerstream.com'
    const key = apiKey !== undefined ? apiKey.trim() : (db.getConfig('signApiKey') || '').trim()
    const url = new URL('/accounts/me/rate_limits', base)
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (key) {
      headers['x-api-key'] = key
    }
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    const data: any = await res.json()
    if (!res.ok || data.code !== 200) {
      return {
        success: false,
        error: data.message || `Lỗi HTTP ${res.status}`,
      }
    }
    return {
      success: true,
      data: {
        day: data.day,
        hour: data.hour,
        minute: data.minute,
        isCustomKey: Boolean(key),
      },
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Không thể kết nối đến EulerStream API',
    }
  }
})

// ==================== AI & TTS IPC HANDLERS ====================
ipcMain.handle('ai:get-config', () => {
  return {
    config: aiEngine ? aiEngine.getConfig() : null,
    defaultPrompts: DEFAULT_TEMPLATE_PROMPTS,
  }
})

ipcMain.handle('ai:update-config', (_, partial) => {
  if (!aiEngine) return { success: false }
  aiEngine.updateConfig(partial)
  return { success: true, config: aiEngine.getConfig() }
})

ipcMain.handle('ai:test-speak', (_, { text, templateId }: { text?: string; templateId?: string } = {}) => {
  if (!aiEngine) return null
  return aiEngine.testSpeak(text, templateId)
})

ipcMain.handle('sessions:trigger-greeting', (_, sessionId: string) => {
  const s = tiktokManager?.getSession(sessionId)
  if (s) {
    s.triggerGreeting()
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('ai:set-active-template', (_, templateId: string) => {
  if (aiEngine && templateId) {
    aiEngine.setActiveTemplate(templateId)
  }
  return true
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  stopTunnel()
  tiktokManager?.stopAll()
  localServer?.close()
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})
