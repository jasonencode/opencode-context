/**
 * 会话耗时统计 —— 纯函数，不依赖宿主。
 *
 * 两个口径：
 * - `elapsed`：会话墙钟耗时（首条消息 → 最后一条消息完成；运行中取 `now`）；
 * - `lastRun`：最近一次执行耗时（最后一条 user 消息 → 最后一条消息完成/`now`）。
 *
 * 与上下文统计保持一致：存在 `revert.messageID` 时只统计该消息之前的消息。
 */

export interface SessionTiming {
  readonly elapsed: number
  readonly lastRun: number
  readonly running: boolean
}

export interface SessionTimingOptions {
  /** 当前时间戳（毫秒），运行中用于实时累计 */
  readonly now?: number
  /** 会话是否正在运行 */
  readonly running?: boolean
  /** 会话 reverted 到某条消息时，只统计该消息之前的消息 */
  readonly revertMessageID?: string
}

type AnyMessage = Record<string, any>

function timestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function computeSessionTiming(
  messages: readonly AnyMessage[] | undefined,
  options: SessionTimingOptions = {},
): SessionTiming | undefined {
  if (!messages || messages.length === 0) return undefined

  const { now, running = false, revertMessageID } = options

  let cutoff = messages.length
  if (revertMessageID) {
    const revertIndex = messages.findIndex((m) => m?.id === revertMessageID)
    if (revertIndex === -1) return undefined
    cutoff = revertIndex
  }

  let start: number | undefined
  let end: number | undefined
  let lastPrompt: number | undefined

  for (let i = 0; i < cutoff; i++) {
    const message = messages[i]
    const created = timestamp(message?.time?.created)
    if (created === undefined) continue

    start = start === undefined ? created : Math.min(start, created)
    if (message?.type === "user") lastPrompt = created

    const completed = timestamp(message?.time?.completed)
    const messageEnd = completed !== undefined && completed > created ? completed : created
    end = end === undefined ? messageEnd : Math.max(end, messageEnd)
  }

  if (start === undefined) return undefined

  // 运行中：墙钟时间持续增长，即使最后一条消息已经完成。
  if (running && now !== undefined) {
    end = end === undefined ? now : Math.max(end, now)
  }

  const finish = end ?? start
  const lastRunStart = lastPrompt ?? start

  return {
    elapsed: Math.max(0, finish - start),
    lastRun: Math.max(0, finish - lastRunStart),
    running,
  }
}

/**
 * 格式化耗时（毫秒）为秒。
 *
 * - < 10s：`4.2s`（保留一位小数，整数省略 `.0`）
 * - < 60s：`42s`
 * - < 1h：`12m 34s`
 * - < 1d：`3h 12m`
 * - 其余：`2d 05h`
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s"

  const seconds = ms / 1000
  if (seconds < 10) return `${Math.floor(seconds * 10) / 10}s`
  if (seconds < 60) return `${Math.floor(seconds)}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const rest = Math.floor(seconds % 60)
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
  }

  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest === 0 ? `${days}d` : `${days}d ${String(rest).padStart(2, "0")}h`
}
