import process from "node:process"
import { getHistoryTable } from "#/database/history"
import { historyDay } from "#/utils/day"

/** hot_snapshot 明细的滚动保留天数；hot_daily 按天聚合表永久保留 */
const DEFAULT_RETENTION_DAYS = 10

export default defineTask({
  meta: {
    name: "history-cleanup",
    description: "清理超出保留期的 hot_snapshot 明细",
  },
  async run() {
    const retentionDays = Number(process.env.HISTORY_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS
    const beforeDay = historyDay(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    const historyTable = await getHistoryTable()
    if (!historyTable) {
      logger.warn("history-cleanup skipped: no database available")
      return { result: "no database" }
    }
    await historyTable.cleanupSnapshot(beforeDay)
    logger.success(`history-cleanup done: hot_snapshot before ${beforeDay} removed (retention ${retentionDays}d)`)
    return { result: `hot_snapshot before ${beforeDay} removed` }
  },
})
