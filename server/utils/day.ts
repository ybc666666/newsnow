import dayjs from "dayjs/esm"
import timezonePlugin from "dayjs/esm/plugin/timezone"
import utcPlugin from "dayjs/esm/plugin/utc"

dayjs.extend(utcPlugin)
dayjs.extend(timezonePlugin)

/**
 * 历史热点按天归集的时区。
 * 定时任务的 cron 使用服务器本地时区，所以容器 TZ 必须与这里一致，否则采集时间点与归属日会错位。
 */
export const HISTORY_TZ = "Asia/Shanghai"

export function historyDay(timestamp: number = Date.now()) {
  return dayjs(timestamp).tz(HISTORY_TZ).format("YYYY-MM-DD")
}
