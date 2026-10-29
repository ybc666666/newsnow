import fs from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * SPA 回退。
 *
 * vite-plugin-with-nitro@0.0.3 自带的 renderer 里写死了 `import template from "#nitro/index"`，
 * 该 specifier 无法从插件包内解析，且构建产物把它改写成构建机的绝对 file:// 路径，
 * 因此 node-server 生产环境下任何直达链接（/c/xxx、刷新页面）都会 500。
 *
 * 这里在路由匹配前直接返回前端入口文件，替代那个失效的 renderer。
 * 仅处理 GET/HEAD 且非 /api、非静态资源的路径，其它请求原样放行。
 */
let cachedShell: string | null | undefined

function readShell(): string | null {
  if (cachedShell !== undefined) return cachedShell
  cachedShell = null
  // 本文件会被打包进 dist/output/server 下的某个 chunk，向上逐级找同级的 public/index.html
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 5; i++) {
    try {
      cachedShell = fs.readFileSync(join(dir, "public", "index.html"), "utf8")
      break
    } catch {
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return cachedShell
}

export default defineEventHandler((event) => {
  if (event.method !== "GET" && event.method !== "HEAD") return
  const { pathname } = getRequestURL(event)
  if (pathname.startsWith("/api")) return
  if (pathname.includes(".")) return

  const shell = readShell()
  if (!shell) return

  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8")
  setResponseHeader(event, "Cache-Control", "no-cache")
  return shell
})
