/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    VSCODE_DEBUG?: 'true'
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬ dist-electron
     * │ ├─┬ main
     * │ │ └── index.js    > Electron-Main
     * │ └─┬ preload
     * │   └── index.mjs   > Preload-Scripts
     * ├─┬ dist
     * │ └── index.html    > Electron-Renderer
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

declare module 'ws' {
  import { Server as HttpServer } from 'node:http'
  import { EventEmitter } from 'node:events'

  export class WebSocket extends EventEmitter {
    static OPEN: number
    static CLOSED: number
    static CLOSING: number
    static CONNECTING: number
    readyState: number
    send(data: any): void
    close(): void
    on(event: string, listener: (...args: any[]) => void): this
  }

  export class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>
    constructor(options: { server?: HttpServer; port?: number; path?: string })
    close(cb?: (err?: Error) => void): void
    on(event: 'connection', cb: (socket: WebSocket, request: any) => void): this
    on(event: string, cb: (...args: any[]) => void): this
  }
}
