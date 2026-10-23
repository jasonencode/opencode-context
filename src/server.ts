/**
 * Server 入口 —— 合法的空插件。
 *
 * 本插件只在 CLI 侧运行；服务端不注册任何钩子。TUI 实现通过
 * package.json 的 exports["./tui"] 单独暴露，服务端不会解析 @opentui。
 */
import type { Plugin } from "@opencode/plugin"

const plugin: Plugin.Plugin = {
  id: "opencode-context",
  setup() {
    return () => {}
  },
}

export default plugin
