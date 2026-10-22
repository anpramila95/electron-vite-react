import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'

export interface ServerInstance {
  server: http.Server
  wss: WebSocketServer
  port: number
  broadcastToKey: (streamKey: string, data: any) => void
  broadcastAll: (data: any) => void
  getClientCount: (streamKey?: string) => number
  getAllClientCounts: () => Record<string, number>
  onClientsChange?: (counts: Record<string, number>) => void
  close: () => Promise<void>
}

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

        try {
          const upstream = await fetch(targetUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Referer': 'https://www.tiktok.com/',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
          })

          if (!upstream.ok) {
            res.writeHead(upstream.status, {
              'Access-Control-Allow-Origin': '*',
            })
            res.end()
            return
          }

          const contentType = upstream.headers.get('content-type') || 'image/jpeg'
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
          })
          const arrayBuffer = await upstream.arrayBuffer()
          res.end(Buffer.from(arrayBuffer))
        } catch (err: any) {
          res.writeHead(500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({ error: err.message }))
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
          if (parsed.type === 'SUBSCRIBE' && parsed.key) {
            socketStreamKeys.set(ws, parsed.key)
            notifyClients()
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
