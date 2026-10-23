/**
 * 目录标记 + 服务端插件入口。
 *
 * OpenCode 2.x 本地目录插件：服务端（role=server）以 `index.*` 为入口，
 * TUI 侧以 `tui.*` 为入口。服务端入口导出合法空插件，不加载 TUI 代码。
 */
export { default } from "./dist/server.js"
