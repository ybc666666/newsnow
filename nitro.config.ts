import process from "node:process"
import { join } from "node:path"
import viteNitro from "vite-plugin-with-nitro"
import { RollopGlob } from "./tools/rollup-glob"
import { projectDir } from "./shared/dir"

const nitroOption: Parameters<typeof viteNitro>[0] = {
  experimental: {
    database: true,
    tasks: true,
  },
  rollupConfig: {
    plugins: [RollopGlob()],
  },
  sourceMap: false,
  scheduledTasks: {
    // 每天 00:00 / 06:00 / 12:00 / 18:00 强制实时抓取全部源。
    // cron 使用服务器本地时区，容器必须设置 TZ=Asia/Shanghai，否则采集时间与归属日会错位。
    "0 0,6,12,18 * * *": ["collect"],
    // 每天 00:05 清理超出保留期的 hot_snapshot 明细
    "5 0 * * *": ["history-cleanup"],
  },
  database: {
    default: {
      // 连接参数由 pg 在运行时从环境变量读取：PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE。
      // 不要在这里读 process.env.DATABASE_URL：nitro 配置在构建期被固化进产物，取不到值会被序列化成 {}，运行时再设也没用。
      connector: "postgresql",
    },
  },
  devDatabase: {
    default: {
      connector: "postgresql",
    },
  },
  imports: {
    dirs: ["server/utils", "shared"],
  },
  preset: "node-server",
  alias: {
    "@shared": join(projectDir, "shared"),
    "#": join(projectDir, "server"),
  },
}

if (process.env.VERCEL) {
  nitroOption.preset = "vercel-edge"
  // You can use other online database, do it yourself. For more info: https://db0.unjs.io/connectors
  nitroOption.database = undefined
  // nitroOption.vercel = {
  //   config: {
  //     cache: []
  //   },
  // }
} else if (process.env.CF_PAGES) {
  nitroOption.preset = "cloudflare-pages"
  nitroOption.unenv = {
    alias: {
      "safer-buffer": "node:buffer",
    },
  }
  nitroOption.database = {
    default: {
      connector: "cloudflare-d1",
      options: {
        bindingName: "NEWSNOW_DB",
      },
    },
  }
} else if (process.env.BUN) {
  nitroOption.preset = "bun"
  nitroOption.database = {
    default: {
      connector: "bun-sqlite",
    },
  }
}

export default function () {
  return viteNitro(nitroOption)
}
