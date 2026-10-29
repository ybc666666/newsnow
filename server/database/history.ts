import process from "node:process"
import type { Database } from "db0"
import type { NewsItem, SourceID } from "@shared/types"

export interface DailyHotRow {
  sourceId: SourceID
  itemId: string
  title: string
  url: string
  mobileUrl?: string
  item?: NewsItem
  firstSeenAt: number
  lastSeenAt: number
  seenCount: number
}

export interface DailyHotDay {
  day: string
  total: number
}

function parseItem(data: unknown): NewsItem | undefined {
  if (typeof data !== "string" || !data) return undefined
  try {
    return JSON.parse(data) as NewsItem
  } catch {
    return undefined
  }
}

export class HistoryTable {
  private db
  constructor(db: Database) {
    this.db = db
  }

  async init() {
    // 明细表：每批采集的全量条目，按天滚动保留（默认 10 天，由 history-cleanup 任务清理）
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS hot_snapshot (
        snapshot_at BIGINT NOT NULL,
        day TEXT NOT NULL,
        source_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        title TEXT,
        url TEXT,
        data TEXT,
        created_at BIGINT,
        PRIMARY KEY (snapshot_at, source_id, item_id)
      );
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_hot_snapshot_day ON hot_snapshot(day);
    `).run()

    // 按天聚合表：同一天同一条目只留一行，永久保留
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS hot_daily (
        day TEXT NOT NULL,
        source_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        title TEXT,
        url TEXT,
        data TEXT,
        first_seen_at BIGINT,
        last_seen_at BIGINT,
        seen_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, source_id, item_id)
      );
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_hot_daily_day ON hot_daily(day);
    `).run()
    logger.success(`init history tables`)
  }

  /**
   * 记录一批采集结果。
   * 明细写入 hot_snapshot；同一天重复出现的同一条目在 hot_daily 里去重，
   * 保留时间戳最大的一条（last_seen_at 取较大值、data 取最新）并累加出现次数。
   */
  async save(snapshotAt: number, day: string, sourceId: SourceID, items: NewsItem[]) {
    const now = Date.now()
    const seen = new Set<string>()
    for (const item of items) {
      // 同一批内先去重，否则 seen_count 会被重复累加
      const itemId = String(item.id)
      if (!itemId || seen.has(itemId)) continue
      seen.add(itemId)

      const title = item.title ?? ""
      const url = item.url ?? ""
      const data = JSON.stringify(item)

      await this.db.prepare(`
        INSERT INTO hot_snapshot (snapshot_at, day, source_id, item_id, title, url, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (snapshot_at, source_id, item_id) DO NOTHING
      `).run(snapshotAt, day, sourceId, itemId, title, url, data, now)

      await this.db.prepare(`
        INSERT INTO hot_daily (day, source_id, item_id, title, url, data, first_seen_at, last_seen_at, seen_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT (day, source_id, item_id) DO UPDATE SET
          title = EXCLUDED.title,
          url = EXCLUDED.url,
          data = EXCLUDED.data,
          last_seen_at = GREATEST(hot_daily.last_seen_at, EXCLUDED.last_seen_at),
          seen_count = hot_daily.seen_count + 1
      `).run(day, sourceId, itemId, title, url, data, snapshotAt, snapshotAt)
    }
  }

  async getDaily(day: string, sourceId?: SourceID): Promise<DailyHotRow[]> {
    const where = sourceId ? `day = ? AND source_id = ?` : `day = ?`
    const params = sourceId ? [day, sourceId] : [day]
    const res: any = await this.db.prepare(`
      SELECT source_id, item_id, title, url, data, first_seen_at, last_seen_at, seen_count
      FROM hot_daily WHERE ${where} ORDER BY last_seen_at DESC
    `).all(...params)
    const rows = (res?.results ?? res) as any[] | undefined
    if (!rows?.length) return []
    return rows.map(row => ({
      sourceId: row.source_id as SourceID,
      itemId: String(row.item_id),
      title: row.title ?? "",
      url: row.url ?? "",
      item: parseItem(row.data),
      firstSeenAt: Number(row.first_seen_at),
      lastSeenAt: Number(row.last_seen_at),
      seenCount: Number(row.seen_count),
    }))
  }

  async getDays(limit = 365): Promise<DailyHotDay[]> {
    const res: any = await this.db.prepare(`
      SELECT day, COUNT(*) AS total FROM hot_daily GROUP BY day ORDER BY day DESC LIMIT ?
    `).all(limit)
    const rows = (res?.results ?? res) as any[] | undefined
    if (!rows?.length) return []
    return rows.map(row => ({ day: String(row.day), total: Number(row.total) }))
  }

  async cleanupSnapshot(beforeDay: string) {
    return await this.db.prepare(`DELETE FROM hot_snapshot WHERE day < ?`).run(beforeDay)
  }
}

export async function getHistoryTable() {
  try {
    const db = useDatabase()
    const historyTable = new HistoryTable(db)
    if (process.env.INIT_TABLE !== "false") await historyTable.init()
    return historyTable
  } catch (e) {
    logger.error("failed to init history table ", e)
  }
}
