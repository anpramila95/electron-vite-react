import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { db } from './db'

export interface ServerInstance {
  server: http.Server
  wss: WebSocketServer
  port: number
  broadcastToKey: (streamKey: string, data: any) => void
  broadcastAll: (data: any) => void
  getClientCount: (streamKey?: string) => number
  getAllClientCounts: () => Record<string, number>
  onClientsChange?: (counts: Record<string, number>) => void
  onClientMessage?: (streamKey: string, msg: any) => void
  close: () => Promise<void>
}

const imageMemoryCache = new Map<string, { buffer: Buffer; contentType: string }>()
const MAX_IMAGE_CACHE = 400

const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="#334155"/>
  <circle cx="64" cy="50" r="24" fill="#94a3b8"/>
  <path d="M20,110 C20,86 40,78 64,78 C88,78 108,86 108,110 Z" fill="#94a3b8"/>
</svg>`

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
}

// Microsoft Edge TTS protocol client
async function fetchEdgeTTS(text: string, voice = 'vi-VN-HoaiMyNeural', speed = 1.0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ws = new (WebSocket as any)(
      'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4',
      {
        headers: {
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        },
      }
    )

    const audioChunks: Buffer[] = []
    const timeout = setTimeout(() => {
      try {
        ws.close()
      } catch {}
      reject(new Error('Edge TTS timeout'))
    }, 12000)

    ws.on('open', () => {
      const configMsg =
        'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })
      ws.send(configMsg)

      const ratePct = speed !== 1.0 ? `${Math.round((speed - 1.0) * 100)}%` : '+0%'
      const ssmlMsg =
        `X-RequestId:${Math.random().toString(36).slice(2)}\r\n` +
        'Content-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n' +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>` +
        `<voice name='${voice || 'vi-VN-HoaiMyNeural'}'><prosody rate='${ratePct}'>${text}</prosody></voice></speak>`
      ws.send(ssmlMsg)
    })

    ws.on('message', (data: any, isBinary: boolean) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0)
          if (buf.length > 2 + headerLen) {
            audioChunks.push(buf.subarray(2 + headerLen))
          }
        }
      } else {
        const str = data.toString()
        if (str.includes('Path:turn.end')) {
          clearTimeout(timeout)
          try {
            ws.close()
          } catch {}
          resolve(Buffer.concat(audioChunks))
        }
      }
    })

    ws.on('error', (err: any) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

export function startLocalServer(publicDir: string, defaultPort = 3210): Promise<ServerInstance> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', '*')

      // Prevent browser / OBS caching for HTML, JS and CSS to ensure real-time code updates
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const pathname = decodeURIComponent(reqUrl.pathname)

      // Handle CORS Preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        })
        res.end()
        return
      }

      // Proxy image endpoint to avoid CORS in Three.js canvas for TikTok avatars
      if (pathname === '/api/proxy-img') {
        const targetUrl = reqUrl.searchParams.get('url')
        if (!targetUrl) {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({ error: 'Missing url parameter' }))
          return
        }

        // Return from memory cache if available
        const cached = imageMemoryCache.get(targetUrl)
        if (cached) {
          res.writeHead(200, {
            'Content-Type': cached.contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
          })
          res.end(cached.buffer)
          return
        }

        try {
          // Attempt 1: Fetch with standard headers
          let upstream: Response | null = null
          try {
            upstream = await fetch(targetUrl, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              },
            })
          } catch {}

          // Attempt 2: Fetch without custom headers if first attempt failed
          if (!upstream || !upstream.ok) {
            try {
              upstream = await fetch(targetUrl)
            } catch {}
          }

          if (upstream && upstream.ok) {
            const contentType = upstream.headers.get('content-type') || 'image/jpeg'
            const arrayBuffer = await upstream.arrayBuffer()
            const buf = Buffer.from(arrayBuffer)

            // Cache in memory
            if (imageMemoryCache.size >= MAX_IMAGE_CACHE) {
              const firstKey = imageMemoryCache.keys().next().value
              if (firstKey) imageMemoryCache.delete(firstKey)
            }
            imageMemoryCache.set(targetUrl, { buffer: buf, contentType })

            res.writeHead(200, {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
            })
            res.end(buf)
            return
          }

          // Fallback: Send default avatar SVG with CORS header so canvas never throws CORS error
          res.writeHead(200, {
            'Content-Type': 'image/svg+xml',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(DEFAULT_AVATAR_SVG)
        } catch {
          res.writeHead(200, {
            'Content-Type': 'image/svg+xml',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(DEFAULT_AVATAR_SVG)
        }
        return
      }

      // Route /preview or /live -> serve dynamic template dispatcher
      if (pathname === '/preview' || pathname === '/live') {
        const previewPath = path.join(publicDir, 'preview.html')
        fs.readFile(previewPath, (err, data) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Failed to load preview host')
            return
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(data)
        })
        return
      }

      // Stream local audio files for OBS preview background music
      if (pathname === '/api/audio-file') {
        const audioPath = reqUrl.searchParams.get('path')
        if (!audioPath || !fs.existsSync(audioPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end('Audio file not found')
          return
        }

        try {
          const ext = path.extname(audioPath).toLowerCase()
          const mime = MIME_TYPES[ext] || 'audio/mpeg'
          const stat = fs.statSync(audioPath)
          const fileSize = stat.size
          const range = req.headers.range

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-')
            const start = parseInt(parts[0], 10)
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
            const chunksize = end - start + 1
            const file = fs.createReadStream(audioPath, { start, end })
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': mime,
              'Access-Control-Allow-Origin': '*',
            })
            file.pipe(res)
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': mime,
              'Access-Control-Allow-Origin': '*',
            })
            fs.createReadStream(audioPath).pipe(res)
          }
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end(err.message || 'Error streaming audio')
        }
        return
      }

      // Proxy online audio stream to bypass CORS and hotlink restrictions
      if (pathname === '/api/audio-proxy') {
        const targetUrl = reqUrl.searchParams.get('url')
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end('Missing url parameter')
          return
        }

        try {
          const upstream = await fetch(targetUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Range': req.headers.range || 'bytes=0-',
              'Accept': '*/*',
            },
          })

          const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
          const contentLength = upstream.headers.get('content-length')
          const contentRange = upstream.headers.get('content-range')

          const headers: Record<string, any> = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Accept-Ranges': 'bytes',
          }
          if (contentLength) headers['Content-Length'] = contentLength
          if (contentRange) headers['Content-Range'] = contentRange

          res.writeHead(upstream.status === 206 ? 206 : 200, headers)
          const arrayBuffer = await upstream.arrayBuffer()
          res.end(Buffer.from(arrayBuffer))
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end(err.message || 'Error streaming remote audio')
        }
        return
      }

      // Endpoint /api/tts: Proxy TTS audio (Google, OpenAI, ElevenLabs, Custom Remote)
      if (pathname === '/api/tts') {
        const text = (reqUrl.searchParams.get('text') || '').trim()
        const lang = reqUrl.searchParams.get('lang') || 'vi'
        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ error: 'Missing text parameter' }))
          return
        }

        let aiCfg: any = {}
        try {
          const rawCfg = db.getConfig('ai_engine_config')
          if (rawCfg) aiCfg = JSON.parse(rawCfg)
        } catch (_) {}

        const engine = aiCfg.ttsEngine || 'edge'

        // 1. Google Translate TTS (Free MP3)
        if (engine === 'google') {
          try {
            const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(text.slice(0, 200))}`
            const upstream = await fetch(googleUrl, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': 'https://translate.google.com/',
              },
              signal: AbortSignal.timeout(8000),
            })
            if (upstream.ok) {
              const arrayBuffer = await upstream.arrayBuffer()
              res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Content-Length': arrayBuffer.byteLength,
                'Cache-Control': 'public, max-age=7200',
                'Access-Control-Allow-Origin': '*',
              })
              res.end(Buffer.from(arrayBuffer))
              return
            }
          } catch (err: any) {
            console.warn('[TTS Server] Google TTS failed, falling back to Edge TTS:', err.message)
          }
        }

        // 2. Edge TTS (Microsoft Edge Natural Voice)
        if (engine === 'edge' || engine === 'webspeech' || !engine) {
          try {
            const voice = aiCfg.ttsVoice || 'vi-VN-HoaiMyNeural'
            const speed = typeof aiCfg.ttsSpeed === 'number' ? aiCfg.ttsSpeed : 1.0
            const audioBuf = await fetchEdgeTTS(text, voice, speed)
            res.writeHead(200, {
              'Content-Type': 'audio/mpeg',
              'Content-Length': audioBuf.length,
              'Cache-Control': 'public, max-age=7200',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(audioBuf)
            return
          } catch (err: any) {
            console.warn('[TTS Server] Edge TTS failed, falling back to Google TTS:', err.message)
          }
        }

        // 3. Custom Remote Audio Endpoint (User specified HTTP/S URL)
        if (engine === 'custom_remote' && aiCfg.ttsBaseUrl) {
          try {
            const method = (aiCfg.ttsCustomMethod || 'POST').toUpperCase()
            const headers: Record<string, string> = {}
            if (aiCfg.ttsApiKey) {
              headers['Authorization'] = `Bearer ${aiCfg.ttsApiKey.trim()}`
            }

            let remoteResp: Response
            if (method === 'GET') {
              const url = new URL(aiCfg.ttsBaseUrl)
              url.searchParams.set('text', text)
              if (aiCfg.ttsVoice) url.searchParams.set('voice', aiCfg.ttsVoice)
              if (aiCfg.ttsSpeed) url.searchParams.set('speed', String(aiCfg.ttsSpeed))
              remoteResp = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10000) })
            } else {
              headers['Content-Type'] = 'application/json'
              remoteResp = await fetch(aiCfg.ttsBaseUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  text,
                  voice: aiCfg.ttsVoice || 'vi-VN',
                  speed: aiCfg.ttsSpeed || 1.0,
                  model: aiCfg.ttsModel,
                }),
                signal: AbortSignal.timeout(10000),
              })
            }

            if (remoteResp.ok) {
              const arrayBuf = await remoteResp.arrayBuffer()
              res.writeHead(200, {
                'Content-Type': remoteResp.headers.get('content-type') || 'audio/mpeg',
                'Content-Length': arrayBuf.byteLength,
                'Cache-Control': 'public, max-age=7200',
                'Access-Control-Allow-Origin': '*',
              })
              res.end(Buffer.from(arrayBuf))
              return
            }
          } catch (err: any) {
            console.warn('[TTS Server] Custom remote TTS failed, falling back to Google:', err.message)
          }
        }

        // 4. Default / Fallback: Google Translate TTS mp3
        try {
          const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(text.slice(0, 200))}`
          const upstream = await fetch(googleUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Referer': 'https://translate.google.com/',
            },
            signal: AbortSignal.timeout(8000),
          })

          if (!upstream.ok) {
            throw new Error(`Google TTS upstream status ${upstream.status}`)
          }

          const arrayBuffer = await upstream.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length,
            'Cache-Control': 'public, max-age=7200',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(buffer)
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ error: err.message || 'Failed to fetch TTS audio' }))
        }
        return
      }

      // Serve static files from public directory
      let filePath = path.join(publicDir, pathname === '/' ? 'live-stream.html' : pathname)

      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('File not found')
          return
        }

        const ext = path.extname(filePath).toLowerCase()
        const contentType = MIME_TYPES[ext] || 'application/octet-stream'

        res.writeHead(200, { 'Content-Type': contentType })
        const stream = fs.createReadStream(filePath)
        stream.pipe(res)
      })
    })

    const wss = new WebSocketServer({ server, path: '/ws' })
    const socketStreamKeys = new Map<WebSocket, string>()

    const getAllClientCounts = (): Record<string, number> => {
      const counts: Record<string, number> = {}
      wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          const key = socketStreamKeys.get(client) || 'default'
          counts[key] = (counts[key] || 0) + 1
        }
      })
      return counts
    }

    const getClientCount = (streamKey?: string): number => {
      let count = 0
      wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          const clientKey = socketStreamKeys.get(client)
          if (!streamKey || clientKey === streamKey) {
            count++
          }
        }
      })
      return count
    }

    let onClientsChangeHandler: ((counts: Record<string, number>) => void) | undefined
    let onClientMessageHandler: ((streamKey: string, msg: any) => void) | undefined

    const notifyClients = () => {
      if (onClientsChangeHandler) {
        try {
          onClientsChangeHandler(getAllClientCounts())
        } catch {
          // Ignore
        }
      }
    }

    const broadcastToKey = (streamKey: string, data: any) => {
      const message = typeof data === 'string' ? data : JSON.stringify(data)
      wss.clients.forEach((client: WebSocket) => {
        const clientKey = socketStreamKeys.get(client)
        if (client.readyState === WebSocket.OPEN && (!clientKey || clientKey === streamKey)) {
          client.send(message)
        }
      })
    }

    const broadcastAll = (data: any) => {
      const message = typeof data === 'string' ? data : JSON.stringify(data)
      wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message)
        }
      })
    }

    wss.on('connection', (ws: WebSocket, req: any) => {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const keyFromUrl = parsedUrl.searchParams.get('key') || 'default'
      socketStreamKeys.set(ws, keyFromUrl)
      notifyClients()

      ws.on('message', (message: any) => {
        try {
          const parsed = JSON.parse(message.toString())
          const key = parsed.key || parsed.streamKey || socketStreamKeys.get(ws) || 'default'
          if (parsed.type === 'SUBSCRIBE' && parsed.key) {
            socketStreamKeys.set(ws, parsed.key)
            notifyClients()
          }
          if (onClientMessageHandler) {
            onClientMessageHandler(key, parsed)
          }
        } catch {
          // Ignore
        }
      })

      const handleDisconnect = () => {
        socketStreamKeys.delete(ws)
        notifyClients()
      }

      ws.on('close', handleDisconnect)
      ws.on('error', handleDisconnect)
    })

    const tryListen = (port: number) => {
      server.listen(port, '0.0.0.0', () => {
        resolve({
          server,
          wss,
          port,
          broadcastToKey,
          broadcastAll,
          getClientCount,
          getAllClientCounts,
          set onClientsChange(fn: ((counts: Record<string, number>) => void) | undefined) {
            onClientsChangeHandler = fn
          },
          get onClientsChange() {
            return onClientsChangeHandler
          },
          set onClientMessage(fn: ((streamKey: string, msg: any) => void) | undefined) {
            onClientMessageHandler = fn
          },
          get onClientMessage() {
            return onClientMessageHandler
          },
          close: () =>
            new Promise<void>((resClose) => {
              wss.close(() => {
                server.close(() => resClose())
              })
            }),
        })
      })

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          tryListen(port + 1)
        } else {
          reject(err)
        }
      })
    }

    tryListen(defaultPort)
  })
}
