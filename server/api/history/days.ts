import { getHistoryTable } from "#/database/history"
import { historyDay } from "#/utils/day"

export default defineEventHandler(async () => {
  try {
    const today = historyDay()
    const historyTable = await getHistoryTable()
    if (!historyTable) return { today, days: [] }
    const days = await historyTable.getDays()
    return { today, days }
  } catch (e) {
    logger.error(e)
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error",
    })
  }
})
