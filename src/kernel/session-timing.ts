/**
 * 会话耗时统计 —— 纯函数，不依赖宿主。
 *
 * 两个口径：
 * - `elapsed`：会话墙钟耗时（首条消息 → 最后一条消息完成；运行中取 `now`）；
 * - `lastRun`：本轮执行耗时（本轮第一条 user 消息 → 最后一条消息完成/`now`）。
 *
 * 本轮起点不能在每次追加 user 消息时重置：运行中用户仍可继续补充内容，
 * 这些消息属于同一轮。优先用宿主提供的上次 idle 时间定位本轮第一条 user
 * 消息；会话变为 idle 后沿用调用方缓存的本轮起点。
 *
 * 与上下文统计保持一致：存在 `revert.messageID` 时只统计该消息之前的消息。
 */

export interface SessionTiming {
  readonly elapsed: number
  readonly lastRun: number
  /** 本轮起点（epoch ms），供调用方在 running → idle 后继续沿用 */
  readonly lastRunStart: number
  readonly running: boolean
}

export interface SessionTimingOptions {
  /** 当前时间戳（毫秒），运行中用于实时累计 */
  readonly now?: number
  /** 会话是否正在运行 */
  readonly running?: boolean
  /** 会话 reverted 到某条消息时，只统计该消息之前的消息 */
  readonly revertMessageID?: string
  /**
   * 会话上一次进入 idle 的时间。
   *
   * running 时，本轮起点 = 该时间之后的第一条 user 消息；这样运行中追加的
   * user 消息不会把本轮计时清零。
   */
  readonly idleAt?: number
  /** 已缓存的本轮起点；会话变为 idle 后由调用方传回，保持显示稳定 */
  readonly roundStart?: number
}

type AnyMessage = Record<string, any>

function timestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isUser(message: AnyMessage | undefined): boolean {
  return (message?.type ?? message?.role) === "user"
}

function isAssistant(message: AnyMessage | undefined): boolean {
  return (message?.type ?? message?.role) === "assistant"
}

/** idleAt 之后的第一条 user 消息（即本轮发起消息） */
function firstUserAfter(
  messages: readonly AnyMessage[],
  cutoff: number,
  idleAt: number,
): number | undefined {
  for (let i = 0; i < cutoff; i++) {
    const message = messages[i]
    if (!isUser(message)) continue
    const created = timestamp(message?.time?.created)
    if (created !== undefined && created > idleAt) return created
  }
  return undefined
}

/**
 * 没有 idle / 缓存信息时的回退：从最后一条 user 消息向前收拢同一轮。
 *
 * - 连续的 user 消息属于同一轮；
 * - 如果上一条 assistant 在该轮首条 user 之后才完成（或仍未完成），说明
 *   用户是在该 assistant 运行期间追加的内容，继续向前收拢。
 */
function fallbackRunStart(
  messages: readonly AnyMessage[],
  cutoff: number,
): number | undefined {
  let lastUser = -1
  for (let i = cutoff - 1; i >= 0; i--) {
    if (isUser(messages[i])) {
      lastUser = i
      break
    }
  }
  if (lastUser === -1) return undefined

  let start = lastUser
  for (let i = lastUser - 1; i >= 0; i--) {
    const message = messages[i]
    if (isUser(message)) {
      start = i
      continue
    }
    if (isAssistant(message)) {
      const completed = timestamp(message?.time?.completed)
      const roundCreated = timestamp(messages[start]?.time?.created)
      // assistant 在本轮首条 user 之后才结束（或仍在运行）→ 同一轮
      if (completed === undefined || (roundCreated !== undefined && completed > roundCreated)) {
        continue
      }
      break
    }
  }
  return timestamp(messages[start]?.time?.created)
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

  for (let i = 0; i < cutoff; i++) {
    const message = messages[i]
    const created = timestamp(message?.time?.created)
    if (created === undefined) continue

    start = start === undefined ? created : Math.min(start, created)

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

  let lastRunStart: number | undefined
  const cached = options.roundStart
  if (cached !== undefined && Number.isFinite(cached) && cached >= start && cached <= finish) {
    lastRunStart = cached
  }

  if (lastRunStart === undefined) {
    const idleAt = options.idleAt
    if (idleAt !== undefined && Number.isFinite(idleAt)) {
      lastRunStart = firstUserAfter(messages, cutoff, idleAt)
    }
  }

  if (lastRunStart === undefined) {
    lastRunStart = fallbackRunStart(messages, cutoff)
  }

  if (lastRunStart === undefined || lastRunStart < start || lastRunStart > finish) {
    lastRunStart = start
  }

  return {
    elapsed: Math.max(0, finish - start),
    lastRun: Math.max(0, finish - lastRunStart),
    lastRunStart,
    running,
  }
}

/**
 * 格式化耗时（毫秒）为秒（上下文行专用，区别于 kernel/format.ts 的
 * `formatDuration`：后者用于 TTFT/TPS，窗口更短、带毫秒精度）。
 *
 * - < 10s：`4.2s`（保留一位小数，整数省略 `.0`）
 * - < 60s：`42s`
 * - < 1h：`12m 34s`
 * - < 1d：`3h 12m`
 * - 其余：`2d 05h`
 */
export function formatElapsed(ms: number): string {
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
