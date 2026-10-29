import type { NewsItem, SourceID } from "@shared/types"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useTitle } from "react-use"

export const Route = createFileRoute("/history")({
  component: HistoryComponent,
})

/** 与 server/utils/day.ts 的 HISTORY_TZ 保持一致 */
const TZ = "Asia/Shanghai"

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TZ })
const clockFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })

const todayInTZ = () => dayFormatter.format(new Date())
const clockInTZ = () => clockFormatter.format(new Date())
const timeInTZ = (timestamp: number) => timeFormatter.format(new Date(timestamp))

interface HistoryItem {
  id: string
  title: string
  url: string
  mobileUrl?: string
  extra?: { info?: string, hover?: string, icon?: NewsItem["extra"]["icon"] }
  firstSeenAt: number
  lastSeenAt: number
  seenCount: number
}

interface HistorySource {
  id: SourceID
  name: string
  color: string
  home?: string
  latestSeenAt: number
  items: HistoryItem[]
}

interface HistoryResponse {
  date: string
  total: number
  sources: HistorySource[]
}

function HistoryComponent() {
  const today = useMemo(() => todayInTZ(), [])
  const [date, setDate] = useState(today)
  const [followingToday, setFollowingToday] = useState(true)

  useTitle("NewsNow | 历史热点")

  const { data, isFetching, isError } = useQuery({
    queryKey: ["history", date],
    queryFn: () => myFetch<HistoryResponse>(`/history?date=${date}`),
    staleTime: 60 * 1000,
  })

  // 每日 00:05（Asia/Shanghai）自动切到新的一天
  useEffect(() => {
    if (!followingToday) return
    const timer = setInterval(() => {
      const now = todayInTZ()
      if (now !== date && clockInTZ() >= "00:05") setDate(now)
    }, 30 * 1000)
    return () => clearInterval(timer)
  }, [followingToday, date])

  const sources = data?.sources ?? []

  return (
    <div className={$("flex flex-col gap-4")}>
      <div className={$("flex flex-wrap gap-3 items-center justify-between mx-2")}>
        <div className={$("flex items-baseline gap-2")}>
          <span className="text-2xl font-bold">历史热点</span>
          <span className="text-xs op-70">
            {data ? `${sources.length} 个来源 · ${data.total} 条` : ""}
          </span>
        </div>
        <div className={$("flex items-center gap-2 text-sm")}>
          <input
            type="date"
            value={date}
            max={today}
            className={$("bg-neutral-400/10 rounded-md px-2 py-1 font-mono outline-none")}
            onChange={(e) => {
              const value = e.target.value
              if (!value) return
              setFollowingToday(value === todayInTZ())
              setDate(value)
            }}
          />
          <button
            type="button"
            className={$("btn", followingToday && "op-50")}
            onClick={() => {
              setFollowingToday(true)
              setDate(todayInTZ())
            }}
          >
            今天
          </button>
        </div>
      </div>

      {isError
        ? <div className={$("text-center op-70 py-20")}>加载失败</div>
        : !sources.length
            ? <div className={$("text-center op-70 py-20")}>{isFetching ? "加载中..." : `${date} 暂无记录`}</div>
            : (
                <div className={$("flex flex-col gap-4")}>
                  {sources.map(source => (
                    <div
                      key={source.id}
                      className={$(
                        "rounded-2xl p-4",
                        `bg-${source.color}-500 dark:bg-${source.color} bg-op-40!`,
                      )}
                    >
                      <div className={$("flex justify-between items-center mx-2 mb-2")}>
                        <div className={$("flex gap-2 items-center")}>
                          <a
                            className={$("w-8 h-8 rounded-full bg-cover")}
                            target="_blank"
                            href={source.home}
                            style={{ backgroundImage: `url(/icons/${source.id.split("-")[0]}.png)` }}
                          />
                          <span className="flex flex-col">
                            <span className="text-xl font-bold">{source.name}</span>
                            <span className="text-xs op-70">
                              {`最后记录 ${timeInTZ(source.latestSeenAt)} · 当日 ${source.items.length} 条`}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className={$("p-2 rounded-2xl bg-base bg-op-70!", `sprinkle-${source.color}`)}>
                        <ol className={$("flex flex-col gap-1")}>
                          {source.items.map(item => (
                            <a
                              key={item.id}
                              href={item.mobileUrl || item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={item.extra?.hover}
                              className={$(
                                "flex gap-2 items-baseline rounded-md px-2 py-1",
                                "hover:bg-neutral-400/10 visited:(text-neutral-400) transition-all",
                              )}
                            >
                              <span className={$("text-xs op-70 font-mono shrink-0")}>{timeInTZ(item.lastSeenAt)}</span>
                              <span className="text-base">{item.title}</span>
                              {item.seenCount > 1 && <span className={$("text-xs op-60 shrink-0")}>{`×${item.seenCount}`}</span>}
                            </a>
                          ))}
                        </ol>
                      </div>
                    </div>
                  ))}
                </div>
              )}
    </div>
  )
}
