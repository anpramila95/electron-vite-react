import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'

export interface SessionRecord {
  id: string
  stream_key: string
  template_id: string
  name: string
  username: string
  settings_json: string
  tiktok_config_json: string
  status: 'idle' | 'running' | 'stopped'
  created_at: number
  updated_at: number
}

export interface DbQueueItem {
  id: number
  session_id: string
  unique_id: string
  name: string
  photo_url: string
  is_vip: number
  priority: number
  source: string
  comment: string | null
  gift_name: string | null
  created_at: number
}

export interface DbLogItem {
  id: string
  session_id: string
  type: string
  user: string
  message: string
  avatar: string | null
  time: string
  created_at: number
}

class AppDatabase {
  private db: DatabaseSync | null = null

  public init(dbPath?: string) {
    const file = dbPath || path.join(process.cwd(), 'live-stream.sqlite')
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new DatabaseSync(file)
    this.createTables()
  }

  private createTables() {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        stream_key TEXT UNIQUE NOT NULL,
        template_id TEXT NOT NULL DEFAULT 'print_booth_3d',
        name TEXT NOT NULL,
        username TEXT NOT NULL,
        settings_json TEXT NOT NULL,
        tiktok_config_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        unique_id TEXT NOT NULL,
        name TEXT NOT NULL,
        photo_url TEXT NOT NULL,
        is_vip INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'chat',
        comment TEXT,
        gift_name TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        user TEXT NOT NULL,
        message TEXT NOT NULL,
        avatar TEXT,
        time TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_queue_session ON queue_items(session_id);
      CREATE INDEX IF NOT EXISTS idx_logs_session ON activity_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_key ON sessions(stream_key);
    `)

    // Safe migration for priority column
    try {
      this.db.exec('ALTER TABLE queue_items ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;')
    } catch {
      // Column already exists
    }

    // Safe migration for template_id column
    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN template_id TEXT NOT NULL DEFAULT 'print_booth_3d';")
    } catch {
      // Column already exists
    }
  }

  // Sessions CRUD
  public getAllSessions(): SessionRecord[] {
    if (!this.db) return []
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC')
    return stmt.all() as unknown as SessionRecord[]
  }

  public getSession(id: string): SessionRecord | null {
    if (!this.db) return null
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?')
    return (stmt.get(id) as unknown as SessionRecord) || null
  }

  public getSessionByStreamKey(streamKey: string): SessionRecord | null {
    if (!this.db) return null
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE stream_key = ?')
    return (stmt.get(streamKey) as unknown as SessionRecord) || null
  }

  public saveSession(session: SessionRecord) {
    if (!this.db) return
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, stream_key, template_id, name, username, settings_json, tiktok_config_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        stream_key = excluded.stream_key,
        template_id = excluded.template_id,
        name = excluded.name,
        username = excluded.username,
        settings_json = excluded.settings_json,
        tiktok_config_json = excluded.tiktok_config_json,
        status = excluded.status,
        updated_at = excluded.updated_at
    `)
    stmt.run(
      session.id,
      session.stream_key,
      session.template_id || 'print_booth_3d',
      session.name,
      session.username,
      session.settings_json,
      session.tiktok_config_json,
      session.status,
      session.created_at,
      session.updated_at,
    )
  }

  public deleteSession(id: string) {
    if (!this.db) return
    const delQueue = this.db.prepare('DELETE FROM queue_items WHERE session_id = ?')
    delQueue.run(id)
    const delLogs = this.db.prepare('DELETE FROM activity_logs WHERE session_id = ?')
    delLogs.run(id)
    const delSession = this.db.prepare('DELETE FROM sessions WHERE id = ?')
    delSession.run(id)
  }

  // Queue CRUD
  public getQueue(sessionId: string): DbQueueItem[] {
    if (!this.db) return []
    const stmt = this.db.prepare(
      'SELECT * FROM queue_items WHERE session_id = ? ORDER BY priority DESC, is_vip DESC, id ASC',
    )
    return stmt.all(sessionId) as unknown as DbQueueItem[]
  }

  public addQueueItem(item: Omit<DbQueueItem, 'id'>): number {
    if (!this.db) return 0
    const stmt = this.db.prepare(`
      INSERT INTO queue_items (session_id, unique_id, name, photo_url, is_vip, priority, source, comment, gift_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      item.session_id,
      item.unique_id,
      item.name,
      item.photo_url,
      item.is_vip ? 1 : 0,
      item.priority || 0,
      item.source,
      item.comment || null,
      item.gift_name || null,
      item.created_at,
    )
    return Number(result.lastInsertRowid)
  }

  public removeQueueItem(id: number) {
    if (!this.db) return
    const stmt = this.db.prepare('DELETE FROM queue_items WHERE id = ?')
    stmt.run(id)
  }

  public prioritizeVip(id: number) {
    if (!this.db) return
    const stmt = this.db.prepare('UPDATE queue_items SET is_vip = 1 WHERE id = ?')
    stmt.run(id)
  }

  public updateQueueComment(id: number, comment: string) {
    if (!this.db) return
    const stmt = this.db.prepare('UPDATE queue_items SET comment = ? WHERE id = ?')
    stmt.run(comment, id)
  }

  public clearQueue(sessionId: string) {
    if (!this.db) return
    const stmt = this.db.prepare('DELETE FROM queue_items WHERE session_id = ?')
    stmt.run(sessionId)
  }

  // Logs
  public getLogs(sessionId: string, limit = 50): DbLogItem[] {
    if (!this.db) return []
    const stmt = this.db.prepare('SELECT * FROM activity_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
    return stmt.all(sessionId, limit) as unknown as DbLogItem[]
  }

  public addLog(log: DbLogItem) {
    if (!this.db) return
    const stmt = this.db.prepare(`
      INSERT INTO activity_logs (id, session_id, type, user, message, avatar, time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      log.id,
      log.session_id,
      log.type,
      log.user,
      log.message,
      log.avatar || null,
      log.time,
      log.created_at,
    )

    // Keep only latest 100 logs per session to prevent memory & disk ballooning during 24h live
    const pruneStmt = this.db.prepare(`
      DELETE FROM activity_logs
      WHERE session_id = ? AND id NOT IN (
        SELECT id FROM activity_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT 100
      )
    `)
    pruneStmt.run(log.session_id, log.session_id)
  }
}

export const db = new AppDatabase()
