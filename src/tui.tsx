/** @jsxImportSource @opentui/solid */
/**
 * TUI 入口 —— OpenCode 2.x CLI 插件。
 *
 * 复用内置插件 id `opencode.sidebar.context`。OpenCode 2.1.3 的 TUI 插件
 * 注册表以 id 为键：内置插件先写入，外部插件随后覆盖同 id 项。因此本插件
 * 会替换内置的 Context 行，而不是与其并存。
 */
import type { Plugin } from "@opencode/plugin/tui"
import { ContextLine } from "./context-line.js"

const plugin: Plugin.Definition = {
  id: "opencode.sidebar.context",
  setup(ctx) {
    try {
      const off = ctx.ui.slot({
        prepend: "sidebar.content",
        render: (input) => <ContextLine ctx={ctx} sessionID={input.sessionID} />,
      })
      return () => {
        try {
          off()
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      const message = err instanceof Error ? (err.stack ?? err.message).split("\n")[0] : String(err)
      try {
        ctx.ui.toast.show({ message: `Context setup failed: ${message}`, variant: "error" })
      } catch {
        /* host may not expose toast */
      }
      return () => {}
    }
  },
}

export default plugin
