# opencode-context — Agent Context

> 本文档供 AI 编程助手快速了解合并后的项目。最后更新：2026-10-29。

## 项目

`opencode-context` 是 OpenCode 2.x 的 TUI 插件，由原 `opencode-context` 与
`opencode-tokenwatch` 合并而来。一个包、一个插件 ID，提供：

- 一个 `SessionWatch` 面板（`append` 到 `sidebar.content`）：
  - 顶部：上下文窗口占用进度条 + 会话耗时行；
  - 下方：Token 总量、按模型 Token / 缓存 / 花费 / TTFT / TPS、Token 分布；
- `/usage` 命令：HTML / JSON / Markdown 用量报告与设置菜单。

- **npm 包名**：`@jasonencode/opencode-context`
- **插件 ID**：`opencode.sidebar.context`（必须保持不变，见下文）
- **版本**：`0.4.0`（合并版本）
- **运行环境**：OpenCode 2.x（以 2.1.3 为基线），OpenTUI ≥ 0.6.6
- **构建**：`tsc`（仅生成 `.d.ts`）+ `esbuild`（SolidJS JSX 预编译）

## 架构

```text
OpenCode 2.x host
  ├─ package "."    → dist/server.js   空插件（不加载 TUI 代码）
  └─ package "./tui" → dist/tui.js     { id, setup(ctx) }
        └─ createV2Adapter(ctx) → HostAdapter
              └─ startTokenWatch(host)
                    ├─ registerSidebar → append "sidebar.content"
                    │     └─ src/ui/sidebar.tsx            Session 面板
                    │           └─ src/ui/context-section.tsx
                    │                 ├─ kernel/context.ts        上下文占用
                    │                 └─ kernel/session-timing.ts  会话耗时
                    ├─ subscribe       → perf / KV / 聚合
                    └─ registerCommands → /usage
```

目录：

- `src/tui.tsx` — 插件入口（`id` + `setup`），异常用 toast 暴露首行原因。
- `src/server.ts` — 合法空插件；服务端不解析 `@opentui/*`。
- `src/host/` — 宿主适配层：`types.ts` 契约、`runtime.tsx` 装配、
  `v2/adapter.ts`、`v2/commands.ts`、`v2/data-source.ts`。
- `src/kernel/` — 零宿主依赖：`context.ts`、`session-timing.ts`、`perf.ts`、
  `store.ts`、`config.ts`、`format.ts`、`i18n.ts`、`report*.ts`。
- `src/ui/` — `context-section.tsx`（面板顶部：上下文 + 耗时）、`sidebar.tsx`（Session 面板）。
- `build.tui.mjs` — esbuild 打包 + `dist/server.js` 泄漏断言。
- `test/` — `node --test`，用 esbuild 即时打包纯函数源码。

## 上下文规则（必须与宿主一致）

- 取最后一条带 `tokens` 的 assistant 消息。
- 只考虑最后一次 **completed** `compaction` 之后的消息；存在
  `revert.messageID` 时只考虑该消息之前的消息。
- `used = input + output + reasoning + cache.read + cache.write`。
- `percent = round(used / model.limit.context * 100)`，上限未知时省略进度条。
- `formatTokensShort` 使用 1024 进制（1K = 1024）。

## 计时规则

- `elapsed`：首条消息 → 最后一条消息完成；运行中取 `now`。
- `lastRun`：本轮起点 → 最后一条消息完成；运行中取 `now`。
- **一轮以 agent 结束输出（会话进入 idle）为边界**。运行中用户继续追加的
  user 消息仍属于同一轮，不能重置 `lastRun`。
- 本轮起点：
  - `running`：`SessionInfo.time.idle`（上次 idle）之后的第一条 user 消息；
  - `idle`：沿用运行中算出的起点（`context-section.tsx` 内的会话级缓存）；
  - 两者都不可用：回退到最后一组连续 user 消息的第一条。
- 纯函数实现位于 `kernel/session-timing.ts`，新增逻辑需补 `test/session-timing.test.mjs`。

## 插件 ID 与存储（重要）

- ID **必须是** `opencode.sidebar.context`。宿主 TUI 插件注册表以 ID 为键，
  外部插件覆盖同名内置插件；改成其他 ID 会恢复宿主内置 Context 行，导致
  侧边栏多出一行上下文。
- 宿主 KV 存储按插件 ID 隔离。ID 从 `opencode-tokenwatch` 迁到
  `opencode.sidebar.context` 后，KV 缓存（会话消息、折叠状态、配置）会重建一次。
- 磁盘文件不受影响：`~/.opencode/tokenwatch.jsonl`、
  `~/.opencode/tokenwatch-stats.json`、`~/.opencode/reports/` 继续沿用。
- `kernel/config.ts` 同时读取 `opencode.sidebar.context` 与旧
  `opencode-tokenwatch` 配置键。
- 不要同时安装 `@jasonencode/opencode-tokenwatch` 与本包，否则侧边栏重复渲染。

## 样式约定（待统一）

- 合并阶段优先保证功能与布局正确：上下文区与 Token 数据共用 `sidebar.tsx`
  的外框。标题为 `SessionWatch`（i18n `panelTitle`），上下文标签为
  `Context:` / `上下文:`（i18n `context`），后续再做整体视觉统一。
- 上下文区主题色来自 `HostAdapter.theme()`：`textBase` / `textMuted`；
  进度条使用固定 RGB。
- 面板宽度通过 `onSizeChange` 测量，内部字符宽度需按 CJK 占 2 列计算。

## 命令

```sh
npm install
npm run build     # tsc + esbuild → dist/tui.js + dist/server.js
npm test          # context + session-timing 纯函数测试
```

## 注意事项

- ESM only；导入带 `.js` 扩展名（`.tsx` 源文件同样）。
- `solid-js`、`@opentui/*`、`@opencode/*` 作为 external peer，由宿主提供；
  不要加入 `dependencies`（第二份 OpenTUI 运行时会导致插件失效）。
- `@opencode/plugin` 只读类型，入口用 type-only import。
- 实时事件使用 `session.step.*`、`session.text/reasoning.delta`、
  `session.tool.progress`；2.1.3 的实时事件流不含
  `session.message.content.updated`。
- `keymap.layer` 在无 Solid owner 的早期 2.x beta 会抛错，适配层会回退到
  `prompt.footer` 插槽内注册。
