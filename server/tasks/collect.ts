import { sources } from "@shared/sources"
import type { SourceID } from "@shared/types"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { getHistoryTable } from "#/database/history"
import { historyDay } from "#/utils/day"

/** 并发上限，避免同一时刻对上游站点发起过多请求 */
const CONCURRENCY = 6
/** 每个源每次最多记录的条目数，与 /api/s 的返回上限一致 */
const MAX_ITEMS = 30

export default defineTask({
  meta: {
    name: "collect",
    description: "强制实时抓取全部源，更新 cache 表并记录当日历史热点",
  },
  async run() {
    const snapshotAt = Date.now()
    const day = historyDay(snapshotAt)
    const cacheTable = await getCacheTable()
    const historyTable = await getHistoryTable()
    if (!cacheTable && !historyTable) {
      logger.warn("collect skipped: no database available")
      return { result: { day, ok: 0, failed: 0, items: 0 } }
    }

    // 带 redirect 的父源与首个 sub 是同一个 getter，跳过以免重复采集
    const ids = (Object.keys(getters) as SourceID[]).filter(id => sources[id] && !sources[id].redirect)

    let cursor = 0
    let items = 0
    const failed: SourceID[] = []

    const worker = async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++]
        try {
          const list = (await getters[id]())?.slice(0, MAX_ITEMS)
          if (!list?.length) continue
          if (cacheTable) await cacheTable.set(id, list)
          if (historyTable) await historyTable.save(snapshotAt, day, id, list)
          items += list.length
        } catch (e) {
          failed.push(id)
          logger.error(`collect ${id} failed`, e)
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))

    const summary = { day, ok: ids.length - failed.length, failed: failed.length, items }
    if (failed.length) logger.warn(`collect failed sources: ${failed.join(", ")}`)
    logger.success(`collect done: ${JSON.stringify(summary)}`)
    return { result: summary }
  },
})
