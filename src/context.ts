/**
 * 上下文窗口占用计算 —— 与 OpenCode 2.x 内置实现（2.1.x 中为 `yr` / `LV`）口径保持一致。
 *
 * 规则：
 * - 取最后一条带 tokens 的 assistant 消息；
 * - 忽略最后一次 completed compaction 之前的消息（压缩后重新计数）；
 * - 有 `revert.messageID` 时，只看该消息之前的消息；
 * - `used = input + output + reasoning + cache.read + cache.write`；
 * - `percent = round(used / model.limit.context * 100)`，上限未知时省略。
 */

export interface ContextUsage {
  readonly used: number
  readonly limit: number | undefined
  readonly percent: number | undefined
}

type AnyMessage = Record<string, any>

/** 找到参与上下文统计的最后一条 assistant 消息 */
function findLastAssistant(
  messages: readonly AnyMessage[],
  revertMessageID: string | undefined,
): AnyMessage | undefined {
  let cutoff = messages.length
  if (revertMessageID) {
    const revertIndex = messages.findIndex((m) => m?.id === revertMessageID)
    if (revertIndex === -1) return undefined
    cutoff = revertIndex
  }

  let lastCompaction = -1
  for (let i = 0; i < cutoff; i++) {
    const message = messages[i]
    if (message?.type === "compaction" && message?.status === "completed") {
      lastCompaction = i
    }
  }

  for (let i = cutoff - 1; i > lastCompaction; i--) {
    const message = messages[i]
    if (message?.type === "assistant" && message?.tokens !== undefined) {
      return message
    }
  }

  return undefined
}

function tokenTotal(message: AnyMessage): number {
  const tokens = message.tokens ?? {}
  const cache = tokens.cache ?? {}
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (cache.read ?? 0) +
    (cache.write ?? 0)
  )
}

function contextLimit(
  models: readonly AnyMessage[] | undefined,
  message: AnyMessage,
): number | undefined {
  const providerID = message?.model?.providerID
  const modelID = message?.model?.id
  if (!providerID || !modelID) return undefined

  for (const model of models ?? []) {
    if (model?.providerID !== providerID) continue
    if (model?.id !== modelID) continue
    const limit = model?.limit?.context
    return typeof limit === "number" && limit > 0 ? limit : undefined
  }
  return undefined
}

export function computeContextUsage(
  messages: readonly AnyMessage[] | undefined,
  models: readonly AnyMessage[] | undefined,
  revertMessageID?: string,
): ContextUsage | undefined {
  if (!messages || messages.length === 0) return undefined

  const message = findLastAssistant(messages, revertMessageID)
  if (!message) return undefined

  const used = tokenTotal(message)
  if (used <= 0) return undefined

  const limit = contextLimit(models, message)
  return {
    used,
    limit,
    percent: limit ? Math.round((used / limit) * 100) : undefined,
  }
}

/**
 * 以 1024 为进制格式化 token 数（1K = 1024）。
 *
 * 保留一位小数并去掉末尾的 `.0`；四舍五入进位到 1024 时自动提升单位，
 * 例如 1048570 显示为 `1M` 而不是 `1024K`。
 */
export function formatTokensShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"

  const units = ["", "K", "M", "G", "T"] as const
  let value = n
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }

  let rounded = Number(value.toFixed(1))
  if (rounded >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
    rounded = Number(value.toFixed(1))
  }

  return `${rounded}${units[unit]}`
}
