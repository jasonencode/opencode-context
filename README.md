# opencode-context

为 OpenCode 2.x 的右侧边栏提供一个 **SessionWatch 面板**，从上到下依次显示：

1. **上下文窗口占用**：复用内置插件 ID，替换宿主自带的 Context 行；
2. **会话耗时**：本轮执行耗时 + 会话总耗时，运行中实时刷新；
3. **Token 用量**：按模型统计 Token、缓存命中率、花费与响应性能，并支持 `/usage` 生成网页报表。

```text
╭────────────────────────────────────╮
│ ▾ SessionWatch         1.2M (89.2% hit) │
│ ────────────────────────────────── │
│ 上下文:██████░░░░ 52% 104K/200K    │
│ ↻ 1m 05s · ⏱ 12m 34s               │
│ ────────────────────────────────── │
│  TOTAL    REQ     INPUT    OUTPUT  │
│  1.2M     128     980K     240K    │
│ ...                                │
╰────────────────────────────────────╯
```

> 本包由 `opencode-context` 与 `opencode-tokenwatch` 合并而来，插件 ID 固定为
> `opencode.sidebar.context`，继续覆盖 OpenCode 内置的 Context 行。

## 特性

### 上下文窗口（面板顶部）

- 复用 OpenCode 内置的上下文统计口径，数值与宿主一致
- 嵌入 SessionWatch 面板，与耗时、总量、模型区块共用同一个外框
- 自适应侧边栏宽度，自动为 `百分比` 与 `已用/上限` 预留空间
- 正确处理中日韩宽字符（每个字符按 2 列计算）
- 会话压缩（compaction）与 revert 后自动重新计数
- 无法获取模型上下文上限时只显示已用 token 数，不显示进度条

进度条按占用比例变色（固定 RGB，不随主题变化）：

| 占用比例 | 颜色 |
| --- | --- |
| < 70% | 绿色 RGB 76, 175, 80 |
| ≥ 70% | 琥珀色 RGB 255, 193, 7 |
| ≥ 90% | 红色 RGB 244, 67, 54 |

token 数按 **1024 进制**换算（1K = 1024，1M = 1024K）。

### 会话耗时

| 字段 | 含义 |
| --- | --- |
| `↻` 后的时间 | 本轮执行耗时：本轮第一条 user 消息到最后一条消息完成（运行中算到当前） |
| `⏱` 后的时间 | 会话总耗时：首条消息到最后一条消息完成（运行中算到当前） |

- 一轮以 agent 结束输出（会话进入 idle）为边界；运行中继续追加 user 消息
  仍属于同一轮，不会把 `↻` 清零
- 运行中每秒刷新，`↻` 变成旋转指示器（`◐ ◓ ◑ ◒`）；空闲后恢复静态图标
- 存在 `revert.messageID` 时只统计该消息之前的消息
- 本轮耗时 ≥ 1m 后按 1m / 3m / 5m / 10m 分级变色

### Token 用量与性能

- 按模型聚合输入、输出、推理、缓存读写 Token 与花费
- 缓存命中率进度条 + 近几次请求的命中率趋势
- 平均 TTFT（首字延迟）与 TPS（生成速率）
- Token 构成估算：system / user / toolCall / toolResult / output
- 模型按最近调用时间排序，当前使用的模型始终在顶部
- 折叠状态、显示项与语言会自动持久化

### `/usage` 用量报告

在终端输入 `/usage` 唤出菜单：

- **HTML 报告**：选择日期范围，在浏览器中打开交互式 ECharts 仪表盘
- **导出数据**：导出 JSON / Markdown，默认写入 `~/.opencode/reports/`
- **设置**：开关各显示区块、切换中英文

## 环境要求

- [OpenCode](https://opencode.ai) 2.x（以 2.1.3 为基线）
- OpenTUI ≥ 0.6.6（由宿主提供，无需单独安装）
- Node.js ≥ 18（仅构建时需要）

## 安装

```sh
opencode plugin add @jasonencode/opencode-context
```

或在 `opencode.jsonc` 的 `plugins` 数组中手动配置：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@jasonencode/opencode-context"]
}
```

CLI 插件在连接远程服务器时同样生效；也可以配置在 `cli.json` 的 `plugins` 中。

### 从 opencode-tokenwatch 迁移

1. 从 `plugins` 数组和/或已安装插件中移除 `@jasonencode/opencode-tokenwatch`；
2. 安装/保留 `@jasonencode/opencode-context`；
3. 重启 OpenCode。

注意事项：

- **不要同时安装两个包**：合并后的插件 ID 为 `opencode.sidebar.context`，与旧
  tokenwatch 的 `opencode-tokenwatch` 属于不同插件，但会重复渲染侧边栏内容。
- 插件 ID 变化后，宿主 KV 命名空间会重新建立：会话消息缓存、折叠状态与配置
  会回到默认值（一次性的）。
- 历史统计文件不受影响：`~/.opencode/tokenwatch.jsonl` 与
  `~/.opencode/tokenwatch-stats.json` 继续沿用，`/usage` 历史数据不会丢失。
- `/usage` 命令名与菜单行为保持不变。

### 从本地源码加载

```sh
git clone <repo-url> opencode-context
cd opencode-context
npm install
npm run build
```

```jsonc
{
  "plugins": ["D:/path/to/opencode-context"]
}
```

本地目录插件通过 `index.ts`（服务端入口）与 `tui.ts`（TUI 入口）解析，
二者都转发到 `dist/`，修改源码后必须重新构建。

## 配置

上下文区与耗时行无需配置。SessionWatch 面板的显示项通过 `/usage` → 设置调整：

| 设置项 | 作用 |
| --- | --- |
| `showPerformance` | 显示 TTFT / TPS |
| `showPricing` | 显示花费 |
| `showTokenDistribution` | 显示 Token 构成 |
| `showTrend` | 显示缓存命中率趋势 |
| `language` | `zh` / `en` / `auto` |

面板标题（`SessionWatch`）、上下文标签（`Context:` / `上下文:`）以及各区块
标签都会跟随 `language` 切换。配置写入宿主 KV，并按插件 ID 隔离；旧
`opencode-tokenwatch` 的声明式配置键仍会被读取（作为回退）。

## 统计规则

### 上下文占用

计算逻辑位于 `src/kernel/context.ts`，与 OpenCode 内置实现一致：

1. 取最后一条带 `tokens` 的 assistant 消息；
2. 忽略最后一次 **completed** compaction 之前的消息；
3. 若会话存在 `revert.messageID`，只统计该消息之前的消息；
4. `used = input + output + reasoning + cache.read + cache.write`；
5. `percent = round(used / model.limit.context * 100)`，上限未知时省略。

### 耗时

逻辑位于 `src/kernel/session-timing.ts`：墙钟耗时取首条消息到最后一条消息完成，
最近一次执行从最后一条 user 消息算起；运行中取当前时间。

## 数据文件

| 文件 | 路径 | 说明 |
| --- | --- | --- |
| 性能日志 | `~/.opencode/tokenwatch.jsonl` | 每行一个 JSON，超过 5MB 轮转到 `.1` |
| 聚合统计 | `~/.opencode/tokenwatch-stats.json` | 永久累积，不随日志轮转丢失 |
| 导出报告 | `~/.opencode/reports/` | `/usage` 导出的 JSON / Markdown / HTML |

## 开发

```sh
npm install
npm test          # 纯函数单元测试（esbuild 即时打包源码）
npm run build     # tsc 生成 .d.ts + esbuild 打包 dist/tui.js、dist/server.js
```

### 目录结构

```text
src/
├── tui.tsx                 # TUI 插件入口（id = opencode.sidebar.context）
├── server.ts               # 服务端空插件（不加载任何 TUI 代码）
├── host/
│   ├── types.ts            # HostAdapter 契约
│   ├── runtime.tsx         # 启动器：注册 SessionWatch 面板 + 事件
│   ├── command-actions.ts  # /usage 动作
│   └── v2/                 # OpenCode 2.x 适配层（adapter / commands / data-source）
├── kernel/                 # 零宿主依赖的纯逻辑
│   ├── context.ts          # 上下文占用计算
│   ├── session-timing.ts   # 会话耗时计算
│   ├── perf.ts             # TTFT / TPS 追踪
│   ├── store.ts            # 持久化聚合统计
│   ├── config.ts           # 侧边栏配置
│   ├── format.ts           # 格式化与报表类型
│   ├── i18n.ts             # 中英文
│   └── report*.ts          # 用量报表
└── ui/
    ├── context-section.tsx # 面板顶部：上下文进度条 + 会话耗时
    └── sidebar.tsx         # SessionWatch 面板（append，内含 ContextSection）
```

构建时 `solid-js`、`@opentui/*`、`@opencode/*` 均保持 external，由宿主提供，
请勿加入 `dependencies`，否则会出现第二份 OpenTUI 运行时。

### 插件加载流程

```text
OpenCode 启动
  ├─ 服务端：index.ts → dist/server.js（空插件）
  └─ TUI：tui.ts → dist/tui.js
        └─ setup(ctx)
              └─ ctx.ui.slot({ append: "sidebar.content" }) → SessionWatch 面板
                    ├─ ContextSection（上下文 + 耗时）
                    └─ 总量 / 模型块 / Token 分布
```

## 常见问题

**侧边栏没有上下文进度条？**

- 确认 OpenCode 为 2.x，且插件已加入 `plugins`
- 新会话在第一条 assistant 回复完成前没有 token 数据，属正常现象
- 本地加载时确认已执行 `npm run build`

**同时装了 tokenwatch 和本插件？**

请移除 `@jasonencode/opencode-tokenwatch`，否则侧边栏会出现两套内容。

**构建后仍然使用旧代码？**

本地目录插件直接读取 `dist/`，请重新执行 `npm run build` 并重启 OpenCode。

## 许可证

[MIT](./LICENSE) © 2026 jasonencode
