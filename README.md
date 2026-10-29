# opencode-context

为 OpenCode 2.x 的右侧边栏提供一个紧凑的 **上下文窗口占用进度条**，并在框下方显示当前会话的耗时统计。

它复用内置插件的 ID，直接覆盖侧边栏中的内置 Context 行：

```text
╭────────────────────────────────╮
│ ████████░░░░░░░░ 52% 104K/200K │
╰────────────────────────────────╯
↻ 1m 05s · ⏱ 12m 34s
```

进度条会随终端宽度自动伸缩，并根据占用比例改变颜色：

| 占用比例 | 颜色（固定 RGB，不随主题变化） |
| --- | --- |
| < 70% | 绿色 RGB 76, 175, 80 |
| ≥ 70% | 琥珀色 RGB 255, 193, 7 |
| ≥ 90% | 红色 RGB 244, 67, 54 |

无法获取模型上下文上限时，只显示已用 token 数（例如 `12.4K`），不显示进度条。token 数按 **1024 进制**换算（1K = 1024，1M = 1024K）。

## 特性

- 复用 OpenCode 内置的上下文统计口径，数值与宿主一致
- 自适应侧边栏宽度，自动为文字预留空间
- 圆角外框，边框颜色与 TokenWatch 一致（RGB 55, 65, 80）
- 正确处理中日韩宽字符（每个字符按 2 列计算）
- 会话压缩（compaction）与 revert 后自动重新计数
- 在进度条下方显示会话总耗时与最近一次执行耗时，运行中每秒实时跳动且图标旋转
- 仅依赖宿主提供的 SolidJS / OpenTUI 运行时，不重复打包
- 无 token 数据时隐藏进度条，但仍显示耗时
- 复用内置插件 ID `opencode.sidebar.context`，安装后直接覆盖内置 Context 行

## 环境要求

- [OpenCode](https://opencode.ai) 2.x（插件 API `@opencode/plugin` >= 2.0.0）
- Node.js >= 18（仅构建时需要）

## 安装

### 从 npm 安装

```sh
opencode plugin add @jasonencode/opencode-context
```

或在 `cli.json` 中手动配置（CLI 插件在连接远程服务器时同样生效）：

```json
{
  "plugins": ["@jasonencode/opencode-context"]
}
```

也可以写进 `opencode.jsonc` 的 `plugins` 数组：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@jasonencode/opencode-context"]
}
```

重新启动 OpenCode 后，右侧边栏即会出现上下文进度条。

本插件复用内置插件 ID `opencode.sidebar.context`。OpenCode 的 TUI 插件注册表以 ID 为键，后加载的外部插件会覆盖同 ID 的内置插件，因此安装后内置 Context 行会被本插件替换，不需要额外的禁用配置。

只要 OpenCode 后续版本仍使用这个 ID，升级后也不会恢复成内置行；如果官方修改了该 ID，需要同步修改 `src/tui.tsx` 中的 `id`。

### 从本地源码加载

先构建产物，再在配置中引用项目目录：

```sh
git clone <repo-url> opencode-context
cd opencode-context
npm install
npm run build
```

配置中填写项目绝对路径即可（Windows 使用正斜杠或双反斜杠）：

```json
{
  "plugins": ["D:/path/to/opencode-context"]
}
```

本地目录插件通过 `index.ts`（服务端入口）与 `tui.ts`（TUI 入口）解析，二者都会转发到 `dist/` 下的构建产物，因此**修改源码后必须重新构建**。

## 配置项

当前版本无需任何配置。文字颜色取自 OpenCode 当前主题，边框与进度条使用固定 RGB 色（与 TokenWatch 一致），不随主题切换而变化：

- 文字：`text.base` / `text.muted`
- 边框：RGB 55, 65, 80
- 进度条：< 70% 绿色、≥ 70% 琥珀色、≥ 90% 红色
- 耗时行：`↻` 与 `⏱` 前缀为 `text.muted`，两个时间值为 `text.base`；本轮耗时 ≥ 1m 后按 1m / 3m / 5m / 10m 分级变色

## 耗时统计

进度条下方显示当前会话的执行耗时，例如 `↻ 1m 05s · ⏱ 12m 34s`：

| 字段 | 含义 |
| --- | --- |
| `↻` 后的时间 | 最近一次执行耗时（一轮对话）：最后一条 user 消息到最后一条消息完成（运行中算到当前） |
| `⏱` 后的时间 | 会话总耗时：首条消息到最后一条消息完成（运行中算到当前） |

- 会话处于 `running` 状态时每秒刷新耗时，`↻` 会变成旋转的圆形指示器（`◐ ◓ ◑ ◒`，约 8fps）；空闲后恢复静态 `↻` 并停止刷新
- 会话存在 `revert.messageID` 时，只统计该消息之前的消息
- 没有 user 消息时，`↻` 回退为会话总耗时；没有任何带时间戳的消息时隐藏整行
- 耗时格式化规则：`< 10s` 显示 `4.2s`（整数省略 `.0`，如 `5s`）、`< 1h` 显示 `12m 34s`、`< 1d` 显示 `3h 12m`，更长为 `2d 05h`

本轮耗时（`↻`）会随执行时间变长而变色，提醒你这一轮是否耗时过久：

| 本轮耗时 | 颜色 |
| --- | --- |
| < 1m | 跟随主题 `text.base` |
| ≥ 1m | 琥珀色 RGB 255, 193, 7 |
| ≥ 3m | 橙色 RGB 255, 152, 0 |
| ≥ 5m | 深橙色 RGB 255, 87, 34 |
| ≥ 10m | 红色 RGB 244, 67, 54 |

总耗时（`⏱`）始终使用 `text.base`，不参与变色。

## 统计规则

计算逻辑位于 `src/context.ts`，与 OpenCode 内置实现保持一致：

1. 取最后一条带 `tokens` 的 assistant 消息；
2. 忽略最后一次 **completed** compaction 之前的消息（压缩后重新计数）；
3. 若会话存在 `revert.messageID`，只统计该消息之前的消息；
4. 已用 token 数：

   ```text
   used = input + output + reasoning + cache.read + cache.write
   ```

5. 占用比例：

   ```text
   percent = round(used / model.limit.context * 100)
   ```

当模型上下文上限未知，或已用 token 为 0 时，不渲染进度条。

## 开发

```sh
npm install     # 安装依赖
npm test        # 纯函数单元测试（node --test）
npm run build   # tsc 生成类型声明 + esbuild 打包 dist
```

构建流程：

1. `tsc` 输出 `dist/*.d.ts`（`emitDeclarationOnly`）；
2. `build.tui.mjs` 使用 esbuild + `esbuild-plugin-solid` 打包：
   - `src/tui.tsx` → `dist/tui.js`
   - `src/server.ts` → `dist/server.js`
3. 构建脚本会校验 `dist/server.js` 未泄漏 `@opentui/*` 导入。

`solid-js`、`@opentui/*`、`@opencode/*` 均作为 external，由 OpenCode 宿主在运行时提供，请勿将它们加入 `dependencies`。

### 目录结构

```text
.
├── src/
│   ├── tui.tsx           # TUI 插件入口（id + setup）
│   ├── context-line.tsx  # 侧边栏 SolidJS 组件
│   ├── context.ts        # 纯函数：上下文占用计算与 token 格式化
│   ├── duration.ts       # 纯函数：会话耗时计算与格式化
│   └── server.ts         # 服务端空插件（不加载任何 TUI 代码）
├── test/                 # node --test 单元测试
├── index.ts              # 目录插件服务端入口 → dist/server.js
├── tui.ts                # 目录插件 TUI 入口 → dist/tui.js
├── build.tui.mjs         # esbuild 构建脚本
├── tsconfig.json
└── package.json
```

### 插件加载流程

```text
OpenCode 启动
  ├─ 服务端：index.ts → dist/server.js（空插件，无钩子）
  └─ TUI：tui.ts → dist/tui.js
        └─ setup(ctx)
              └─ ctx.ui.slot({ prepend: "sidebar.content", render: ContextLine })
                    ├─ 读取 session messages + models
                    │     └─ computeContextUsage() → 渲染进度条
                    └─ 读取 messages + session.status()
                          └─ computeSessionTiming() → 渲染耗时行（运行中每秒刷新）
```

## 常见问题

**侧边栏没有出现进度条？**

- 确认 OpenCode 版本为 2.x，且支持 TUI 插件
- 确认插件已加入 `cli.json` 或 `opencode.jsonc` 的 `plugins`
- 新会话在第一条 assistant 回复完成前没有 token 数据，属正常现象
- 本地加载时确认已执行 `npm run build`

**构建后仍然使用旧代码？**

本地目录插件直接读取 `dist/`，请重新执行 `npm run build` 并重启 OpenCode。

## 许可证

[MIT](./LICENSE) © 2026 jasonencode
