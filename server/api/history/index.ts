import type { SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { type DailyHotRow, getHistoryTable } from "#/database/history"
import { historyDay } from "#/utils/day"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function shapeItem(row: DailyHotRow) {
  return {
    id: row.itemId,
    title: row.title,
    url: row.item?.url ?? row.url,
    mobileUrl: row.item?.mobileUrl,
    extra: row.item?.extra,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    seenCount: row.seenCount,
  }
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const rawDate = query.date as string | undefined
    const date = rawDate && DATE_RE.test(rawDate) ? rawDate : historyDay()
    const sourceId = query.source as SourceID | undefined

    const historyTable = await getHistoryTable()
    if (!historyTable) return { date, total: 0, sources: [] }

    const rows = await historyTable.getDaily(date, sourceId)

    // 同一源聚成一块，块内沿用 SQL 的 last_seen_at 倒序
    const grouped = new Map<SourceID, { latestSeenAt: number, items: ReturnType<typeof shapeItem>[] }>()
    for (const row of rows) {
      const group = grouped.get(row.sourceId) ?? { latestSeenAt: 0, items: [] }
      group.latestSeenAt = Math.max(group.latestSeenAt, row.lastSeenAt)
      group.items.push(shapeItem(row))
      grouped.set(row.sourceId, group)
    }

    return {
      date,
      total: rows.length,
      sources: [...grouped.entries()]
        .map(([id, group]) => ({
          id,
          name: sources[id]?.name ?? id,
          color: sources[id]?.color ?? "orange",
          home: sources[id]?.home,
          latestSeenAt: group.latestSeenAt,
          items: group.items,
        }))
        .sort((a, b) => b.latestSeenAt - a.latestSeenAt),
    }
  } catch (e) {
    logger.error(e)
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error",
    })
  }
})
