/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { RGBA } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"
import { computeContextUsage, formatTokensShort } from "./context.js"
import { computeSessionTiming, formatDuration } from "./duration.js"

interface ContextLineProps {
  ctx: Context
  sessionID: string
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

export function ContextLine(props: ContextLineProps) {
  const [width, setWidth] = createSignal(36)
  let boxRef: any = null

  const measure = (el: any) => {
    const measured = Number(el?.width)
    if (Number.isFinite(measured) && measured > 0) setWidth(measured)
  }

  const theme = () => props.ctx.theme as any
  const muted = () => theme()?.text?.muted ?? theme()?.text?.subdued
  const base = () => theme()?.text?.base ?? theme()?.text?.default
  const borderColor = () => RGBA.fromInts(55, 65, 80, 255)
  const success = () => RGBA.fromInts(76, 175, 80, 255)
  const warning = () => RGBA.fromInts(255, 193, 7, 255)
  const error = () => RGBA.fromInts(244, 67, 54, 255)

  const usage = createMemo(() => {
    const session = props.ctx.data.session.get(props.sessionID)
    const messages = props.ctx.data.session.message.list(props.sessionID)
    const models = props.ctx.data.location.model.list(session?.location)
    return computeContextUsage(messages, models, session?.revert?.messageID)
  })

  const [now, setNow] = createSignal(Date.now())

  const running = createMemo(() => {
    try {
      return props.ctx.data.session.status(props.sessionID) === "running"
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
    const session = props.ctx.data.session.get(props.sessionID)
    const messages = props.ctx.data.session.message.list(props.sessionID)
    return computeSessionTiming(messages, {
      now: now(),
      running: running(),
      revertMessageID: session?.revert?.messageID,
    })
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

  const layout = (used: number, limit: number | undefined, percent: number | undefined) => {
    const ratio = ratioText(used, limit)
    const percentText = percent === undefined ? "" : `${percent}%`
    const reserved = visualWidth(ratio) + visualWidth(percentText) + 4
    const bar = barWidth(width() - 4, reserved)
    const filled = percent === undefined ? 0 : clamp(Math.round((percent / 100) * bar), 0, bar)
    return { bar, filled, ratio, percentText }
  }

  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      <Show when={usage()}>
        {(value) => {
          const parts = () => layout(value().used, value().limit, value().percent)
          return (
            <box
              ref={(el: any) => {
                boxRef = el
              }}
              onSizeChange={() => measure(boxRef)}
              border
              borderStyle="rounded"
              borderColor={borderColor()}
              paddingX={1}
              flexDirection="column"
              paddingTop={0}
              paddingBottom={0}
            >
              <text wrapMode="none" truncate>
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
                {formatDuration(value().lastRun)}
              </span>
              <span style={{ fg: muted() } as any}>{" · ⏱  "}</span>
              <span style={{ fg: base() } as any}>{formatDuration(value().elapsed)}</span>
            </text>
          </box>
        )}
      </Show>
    </box>
  )
}

