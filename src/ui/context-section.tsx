/** @jsxImportSource @opentui/solid */
/**
 * 面板内的上下文区 —— 上下文窗口占用 + 会话耗时。
 *
 * 合并后不再单独占用 `sidebar.content` 顶部插槽，而是作为 Session 面板的
 * 第一段渲染：上方接面板标题分隔线，下方用分隔线接总量与模型块。
 */
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { RGBA } from "@opentui/core"
import type { HostAdapter } from "../host/types.js"
import { computeContextUsage, formatTokensShort } from "../kernel/context.js"
import { computeSessionTiming, formatElapsed } from "../kernel/session-timing.js"

interface ContextSectionProps {
  host: HostAdapter
  sessionID: string
  /** 已本地化的标签（含冒号），例如 `上下文:` / `Context:` */
  label: string
  /** 面板宽度对应的分隔线（由 sidebar 传入，保证与其他区块对齐） */
  divider: () => string
}

/** 视觉宽度：CJK 字符占 2 列 */
function visualWidth(value: string): number {
  let width = 0
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff)
    width += wide ? 2 : 1
  }
  return width
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function barWidth(available: number, reserved: number): number {
  return clamp(available - reserved, 4, 24)
}

/** 运行中的旋转图标帧（空闲时显示静态 ↻）。 */
const SPINNER = ["◐", "◓", "◑", "◒"] as const

/**
 * 每个会话最近一次运行中算出的本轮起点。
 *
 * session 变为 idle 后 `time.idle` 会更新为本轮结束时间，无法再定位起点；
 * 这里把运行中算出的起点缓存下来，保证本轮结束后显示值不会跳回追加消息处。
 */
const roundStarts = new Map<string, number>()

export function ContextSection(props: ContextSectionProps) {
  const [width, setWidth] = createSignal(36)
  let boxRef: any = null

  const measure = (el: any) => {
    const measured = Number(el?.width)
    if (Number.isFinite(measured) && measured > 0) setWidth(measured)
  }

  const theme = () => props.host.theme()
  const muted = () => theme().textMuted
  const base = () => theme().textBase
  const borderColor = () => RGBA.fromInts(55, 65, 80, 255)
  const success = () => RGBA.fromInts(76, 175, 80, 255)
  const warning = () => RGBA.fromInts(255, 193, 7, 255)
  const error = () => RGBA.fromInts(244, 67, 54, 255)

  const messages = () => {
    try {
      return props.host.sessionMessages(props.sessionID)
    } catch {
      return []
    }
  }

  const usage = createMemo(() => {
    let models: readonly any[] = []
    let revertMessageID: string | undefined
    try {
      models = props.host.models()
      revertMessageID = props.host.sessionRevertID(props.sessionID)
    } catch {
      /* host may not expose the data yet */
    }
    return computeContextUsage(messages(), models, revertMessageID)
  })

  const [now, setNow] = createSignal(Date.now())

  const running = createMemo(() => {
    try {
      return props.host.sessionStatus(props.sessionID) === "running"
    } catch {
      return false
    }
  })

  // 运行中每秒刷新一次，让耗时实时跳动；空闲时不更新，避免无意义重渲染。
  const timer = setInterval(() => {
    if (running()) setNow(Date.now())
  }, 1000)

  // 运行中图标旋转，约 8fps；空闲时保持静态 ↻。
  const [spin, setSpin] = createSignal(0)
  const spinner = setInterval(() => {
    if (running()) setSpin((frame) => (frame + 1) % SPINNER.length)
  }, 120)

  onCleanup(() => {
    clearInterval(timer)
    clearInterval(spinner)
  })

  const timing = createMemo(() => {
    let revertMessageID: string | undefined
    let idleAt: number | undefined
    try {
      revertMessageID = props.host.sessionRevertID(props.sessionID)
      idleAt = props.host.sessionIdleAt(props.sessionID)
    } catch {
      /* ignore */
    }

    const isRunning = running()
    const result = computeSessionTiming(messages(), {
      now: now(),
      running: isRunning,
      revertMessageID,
      // 运行中：本轮起点 = 上次 idle 之后的第一条 user 消息
      idleAt: isRunning ? idleAt : undefined,
      // 已结束：沿用运行中算出的起点，避免 idle 时间更新后跳变
      roundStart: isRunning ? undefined : roundStarts.get(props.sessionID),
    })

    if (isRunning && result) {
      roundStarts.set(props.sessionID, result.lastRunStart)
      // 简单封顶，避免长时间运行时累积过多已访问会话
      if (roundStarts.size > 200) {
        const oldest = roundStarts.keys().next().value
        if (oldest !== undefined) roundStarts.delete(oldest)
      }
    }

    return result
  })

  const ratioText = (used: number, limit: number | undefined) =>
    limit ? `${formatTokensShort(used)}/${formatTokensShort(limit)}` : formatTokensShort(used)

  const barColor = (percent: number | undefined) => {
    if (percent === undefined) return muted()
    if (percent >= 90) return error()
    if (percent >= 70) return warning()
    return success()
  }

  /** 本轮执行时间越长颜色越警示：1m 起琥珀色，3m/5m 逐步加深，10m 起红色。 */
  const lastRunColor = (ms: number) => {
    if (ms >= 10 * 60_000) return error()
    if (ms >= 5 * 60_000) return RGBA.fromInts(255, 87, 34, 255)
    if (ms >= 3 * 60_000) return RGBA.fromInts(255, 152, 0, 255)
    if (ms >= 60_000) return warning()
    return base()
  }

  /** 面板内没有外框，只有左右各 1 列 padding。 */
  const layout = (used: number, limit: number | undefined, percent: number | undefined) => {
    const ratio = ratioText(used, limit)
    const percentText = percent === undefined ? "" : `${percent}%`
    // 与「缓存:」一致：冒号后不留空格，进度条紧贴标签；
    // 只保留「空格 + 百分比」与「空格 + 已用/上限」两个分隔位。
    const reserved =
      visualWidth(props.label) + visualWidth(ratio) + visualWidth(percentText) + 2
    const bar = barWidth(width() - 2, reserved)
    const filled = percent === undefined ? 0 : clamp(Math.round((percent / 100) * bar), 0, bar)
    return { bar, filled, ratio, percentText }
  }

  return (
    <Show when={usage() || timing()}>
      <box
        ref={(el: any) => {
          boxRef = el
        }}
        onSizeChange={() => measure(boxRef)}
        flexDirection="column"
        width="100%"
        flexShrink={0}
        marginTop={1}
      >
        <Show when={usage()}>
          {(value) => {
            const parts = () => layout(value().used, value().limit, value().percent)
            return (
              <box paddingX={1} flexDirection="column" flexShrink={0}>
                <text wrapMode="none" truncate>
                  <span style={{ fg: muted() } as any}>{props.label}</span>
                  {value().percent === undefined ? (
                    <span style={{ fg: base() } as any}>{parts().ratio}</span>
                  ) : (
                    <>
                      <span style={{ fg: barColor(value().percent) } as any}>
                        {"█".repeat(parts().filled)}
                      </span>
                      <span style={{ fg: barColor(value().percent) } as any}>
                        {"░".repeat(parts().bar - parts().filled)}
                      </span>
                      <span style={{ fg: barColor(value().percent) } as any}>{` ${parts().percentText}`}</span>
                      <span style={{ fg: muted() } as any}>{` ${parts().ratio}`}</span>
                    </>
                  )}
                </text>
              </box>
            )
          }}
        </Show>
        <Show when={timing()}>
          {(value) => (
            <box width="100%" paddingX={1} flexShrink={0}>
              <text wrapMode="none" truncate selectable={false}>
                <span style={{ fg: muted() } as any}>
                  {value().running ? `${SPINNER[spin()]} ` : "↻ "}
                </span>
                <span style={{ fg: lastRunColor(value().lastRun) } as any}>
                  {formatElapsed(value().lastRun)}
                </span>
                <span style={{ fg: muted() } as any}>{" · ⏱  "}</span>
                <span style={{ fg: base() } as any}>{formatElapsed(value().elapsed)}</span>
              </text>
            </box>
          )}
        </Show>
        <text fg={borderColor()}>{props.divider()}</text>
      </box>
    </Show>
  )
}
