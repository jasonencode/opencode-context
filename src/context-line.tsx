/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, Show } from "solid-js"
import { RGBA } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"
import { computeContextUsage, formatTokensShort } from "./context.js"
import { openFolder, resolveFolder } from "./folder.js"

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

/** 从左侧裁剪路径，保留最有用的尾部；放不下时以省略号开头。 */
function fitPath(value: string, max: number): string {
  if (max <= 0) return ""
  if (visualWidth(value) <= max) return value

  let tail = ""
  let used = 0
  for (const char of [...value].reverse()) {
    const charWidth = visualWidth(char)
    if (used + charWidth > max - 1) break
    tail = char + tail
    used += charWidth
  }
  return `…${tail}`
}

export function ContextLine(props: ContextLineProps) {
  const [width, setWidth] = createSignal(36)
  const [hovered, setHovered] = createSignal(false)
  let boxRef: any = null
  let folderRef: any = null

  const measure = (el: any) => {
    const measured = Number(el?.width)
    if (Number.isFinite(measured) && measured > 0) setWidth(measured)
  }

  const defaultDirectory = () => {
    try {
      return props.ctx.data.location.default()?.directory
    } catch {
      return undefined
    }
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

  /** 当前会话所在文件夹（含 subpath），优先取会话自身的位置。 */
  const folder = createMemo(() => {
    const session = props.ctx.data.session.get(props.sessionID)
    const directory =
      session?.location?.directory ?? props.ctx.location?.directory ?? defaultDirectory()
    if (!directory) return undefined
    return resolveFolder(directory, session?.subpath)
  })

  const folderLabel = (directory: string) => {
    try {
      return props.ctx.ui.format.path(directory)
    } catch {
      return directory
    }
  }

  const openCurrentFolder = () => {
    const directory = folder()
    if (!directory) return
    void openFolder(directory).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      try {
        props.ctx.ui.toast.show({ message: `Open folder failed: ${message}`, variant: "error" })
      } catch {
        /* host may not expose toast */
      }
    })
  }

  const ratioText = (used: number, limit: number | undefined) =>
    limit ? `${formatTokensShort(used)}/${formatTokensShort(limit)}` : formatTokensShort(used)

  const barColor = (percent: number | undefined) => {
    if (percent === undefined) return muted()
    if (percent >= 90) return error()
    if (percent >= 70) return warning()
    return success()
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
      <Show when={folder()}>
        {(directory) => (
          <box
            ref={(el: any) => {
              folderRef = el
            }}
            onSizeChange={() => measure(folderRef)}
            width="100%"
            paddingX={1}
            flexShrink={0}
            onMouseDown={(event: any) => {
              event?.stopPropagation?.()
              event?.preventDefault?.()
              openCurrentFolder()
            }}
            onMouseOver={() => setHovered(true)}
            onMouseOut={() => setHovered(false)}
          >
            <text wrapMode="none" truncate selectable={false}>
              <span style={{ fg: muted() } as any}>{"📁 "}</span>
              <span style={{ fg: hovered() ? base() : muted(), underline: hovered() } as any}>
                {fitPath(folderLabel(directory()), width() - 5)}
              </span>
            </text>
          </box>
        )}
      </Show>
    </box>
  )
}

