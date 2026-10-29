# opencode-context

[![npm](https://img.shields.io/npm/v/@jasonencode/opencode-context)](https://www.npmjs.com/package/@jasonencode/opencode-context)
[![license](https://img.shields.io/npm/l/@jasonencode/opencode-context)](./LICENSE)

为 OpenCode 2.x 的右侧边栏提供一个 **SessionWatch 面板**，把上下文窗口、会话耗时和 Token 用量统计集中在一个框里：

```text
╭────────────────────────────────────────╮
│ ▾ SessionWatch          1.2M (89.2% hit) │
│ ────────────────────────────────────── │
│ 上下文:████████░░░░ 52% 104K/200K       │
│ ↻ 1m 05s · ⏱ 12m 34s                   │
│ ────────────────────────────────────── │
│  TOTAL    REQ     INPUT    OUTPUT      │
│  1.2M     128     980K     240K        │
│  ...                                   │
╰────────────────────────────────────────╯
```

> 本包由 `opencode-context` 与 `opencode-tokenwatch` 合并而来（v1.0.0），
> 插件 ID 固定为 `opencode.sidebar.context`，用于覆盖宿主内置的 Context 行。

## 功能总览

- **SessionWatch 面板**：上下文进度条、本轮/会话耗时、Token 总量、按模型统计、缓存命中率、TTFT/TPS、Token 构成，共用一个外框。
- **上下文窗口**：与 OpenCode 内置口径一致，支持 compaction、revert 和未知上下文上限。
- **本轮计时**：以 agent 结束输出（会话进入 idle）为边界，运行中继续追加消息不会把计时清零。
- **`/usage` 报告**：交互式 HTML 图表、JSON / Markdown 导出、显示项与语言设置。
- **本地优先**：统计数据写入本机 `~/.opencode/`，报告按需生成。
- **中英双语**：面板标签跟随 `/usage` → 设置中的语言。

## 界面说明

### 上下文窗口

```text
上下文:████████░░░░ 52% 104K/200K
```

- `上下文:` 后紧跟进度条，宽度自适应侧边栏，自动为百分比和 `已用/上限` 留出空间
- token 数按 **1024 进制**换算（1K = 1024，1M = 1024K）
- 无法获取模型上下文上限时只显示已用 token 数，不显示进度条
- 会话压缩（compaction）与 revert 后自动重新计数
- 正确处理中日韩宽字符（每个字符按 2 列计算）

进度条颜色（固定 RGB，不随主题变化）：

| 占用比例 | 颜色 |
| --- | --- |
| < 70% | 绿色 RGB 76, 175, 80 |
| ≥ 70% | 琥珀色 RGB 255, 193, 7 |
| ≥ 90% | 红色 RGB 244, 67, 54 |

### 会话耗时

| 字段 | 含义 |
| --- | --- |
| `↻` 后的时间 | 本轮执行耗时：本轮第一条 user 消息到最后一条消息完成（运行中算到当前） |
| `⏱` 后的时间 | 会话总耗时：首条消息到最后一条消息完成（运行中算到当前） |

- **一轮以 agent 结束输出（会话进入 idle）为边界**；运行中继续追加 user 消息仍属于同一轮，`↻` 不会清零
- 运行中每秒刷新，`↻` 变成旋转指示器（`◐ ◓ ◑ ◒`）；空闲后恢复静态图标
- 存在 `revert.messageID` 时只统计该消息之前的消息
- 本轮耗时 ≥ 1m 后按 1m / 3m / 5m / 10m 分级变色

| 本轮耗时 | 颜色 |
| --- | --- |
| < 1m | 跟随主题 `text.base` |
| ≥ 1m | 琥珀色 RGB 255, 193, 7 |
| ≥ 3m | 橙色 RGB 255, 152, 0 |
| ≥ 5m | 深橙色 RGB 255, 87, 34 |
| ≥ 10m | 红色 RGB 244, 67, 54 |

### Token 用量与性能

- 顶部总量行：总 Token、请求数、输入、输出
- 按模型聚合：输入、输出、推理、缓存读写 Token 与花费
- 缓存命中率进度条，以及最近 3 次 vs 前 3 次的命中率趋势（至少 6 条消息）
- 平均 TTFT（首字延迟）与 TPS（生成速率）
- Token 构成估算：system / user / toolCall / toolResult / output / other
- 模型按最近调用时间排序，当前使用的模型始终在顶部
- 点击面板标题可折叠/展开，点击模型标题可单独折叠

### `/usage` 用量报告

在终端输入 `/usage` 唤出菜单：

| 菜单项 | 作用 |
| --- | --- |
| HTML 报告 | 选择日期范围，在浏览器中打开交互式 ECharts 仪表盘 |
| JSON 导出 | 导出原始用量数据，默认写入 `~/.opencode/reports/` |
| 文本报告 | 生成 Markdown / 纯文本报告 |
| 设置 | 开关显示项、切换语言 |

HTML 报告包含：用量趋势、模型对比、缓存效率、TTFT/TPS、延迟分位数、失败请求统计。首次统计需要遍历历史会话，可能耗时数秒。

## 环境要求

| 依赖 | 要求 |
| --- | --- |
| OpenCode | 2.x（以 2.1.3 为基线） |
| OpenTUI | ≥ 0.6.6（由宿主提供，无需单独安装） |
| Node.js | ≥ 18（仅构建/本地开发时需要） |

## 安装

### 从 npm 安装

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
2. 安装 `@jasonencode/opencode-context`；
3. 重启 OpenCode。

注意事项：

- **不要同时安装两个包**：旧 tokenwatch 的插件 ID 是 `opencode-tokenwatch`，本包是 `opencode.sidebar.context`，同时启用会在侧边栏重复渲染内容。
- 插件 ID 变化后，宿主 KV 命名空间会重新建立：会话消息缓存、折叠状态与显示配置会回到默认值（一次性）。
- 历史统计文件不受影响：`~/.opencode/tokenwatch.jsonl` 与 `~/.opencode/tokenwatch-stats.json` 继续沿用，`/usage` 历史数据不会丢失。
- `/usage` 命令名与菜单行为保持不变。

### 从旧版 opencode-context 升级

0.3.x → 1.0.0 仍然使用同一个插件 ID `opencode.sidebar.context`，直接升级即可。升级后：

- 侧边栏会从「单独的上下文行」变成「一个 SessionWatch 面板」；
- 新增 Token 统计、缓存分析、TTFT/TPS、`/usage` 报告与设置菜单。

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

本地目录插件通过 `index.ts`（服务端入口）与 `tui.ts`（TUI 入口）解析，二者都转发到 `dist/`；**修改源码后必须重新构建**。

## 配置

上下文区与耗时行无需配置。SessionWatch 面板的显示项通过 `/usage` → 设置调整：

| 设置项 | 作用 |
| --- | --- |
| `showPerformance` | 显示 TTFT / TPS |
| `showPricing` | 显示模型花费（花费为 0 时自动隐藏） |
| `showTokenDistribution` | 显示 Token 构成 |
| `showTrend` | 显示缓存命中率趋势 |
| `language` | `zh` / `en` / `auto` |

- 面板标题固定为 `SessionWatch`；上下文标签随语言切换为 `上下文:` / `Context:`
- 配置写入宿主 KV，并按插件 ID 隔离
- 折叠状态、显示项与语言会自动持久化，重启 TUI 后保留

## 统计口径

### 上下文占用

计算逻辑位于 `src/kernel/context.ts`，与 OpenCode 内置实现一致：

1. 取最后一条带 `tokens` 的 assistant 消息；
2. 忽略最后一次 **completed** compaction 之前的消息；
3. 若会话存在 `revert.messageID`，只统计该消息之前的消息；
4. `used = input + output + reasoning + cache.read + cache.write`；
5. `percent = round(used / model.limit.context * 100)`，上限未知时省略。

### 耗时

逻辑位于 `src/kernel/session-timing.ts`：

- `elapsed`：首条消息 → 最后一条消息完成；运行中取当前时间。
- `lastRun`：本轮起点 → 最后一条消息完成；运行中取当前时间。
- 本轮起点 = 上次会话进入 idle 之后的第一条 user 消息；运行中追加的 user 消息不会重置。
- 会话变为 idle 后沿用运行中算出的起点；缺少 idle 信息时回退到最后一组连续 user 消息的第一条。

### 缓存命中率与性能

| 指标 | 口径 |
| --- | --- |
| 缓存命中率 | `cacheRead / (cacheRead + input)` |
| TTFT | 首个 text/reasoning **delta** − step 起点 |
| TPS | `outputTokens / (time.streamed − 流式窗口起点)` |
| 延迟 | 请求开始 → 流式结束 |
| 平均值 | Welford 在线均值，仅统计有效样本 |

TTFT / TPS 依赖宿主的 step 与 delta 事件；宿主未提供可靠时间时显示 `—`。

### Token 构成

按字符数估算（JSON / 代码 / CJK 分别修正），assistant 输出优先使用真实 tokens；估算值用于定位上下文占用大头，不等同于计费口径。

## 数据文件

| 文件 | 路径 | 说明 |
| --- | --- | --- |
| 性能日志 | `~/.opencode/tokenwatch.jsonl` | 每行一个 JSON，超过 5MB 轮转到 `.1` |
| 聚合统计 | `~/.opencode/tokenwatch-stats.json` | 永久累积，不随日志轮转丢失 |
| 导出报告 | `~/.opencode/reports/` | `/usage` 导出的 JSON / Markdown / HTML |

统计文件只写本机，不会上传到外部服务。

## 开发

```sh
npm install
npm test          # 纯函数单元测试（esbuild 即时打包源码）
npm run build     # clean → tsc 生成 .d.ts → esbuild 打包 dist
npm run clean     # 仅清理 dist
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
│   ├── perf-aggregate.ts   # Welford / 分位数
│   ├── store.ts            # 持久化聚合统计
│   ├── config.ts           # 侧边栏配置
│   ├── format.ts           # 格式化与报表类型
│   ├── i18n.ts             # 中英文
│   └── report*.ts          # 用量报表
└── ui/
    ├── context-section.tsx # 面板顶部：上下文进度条 + 会话耗时
    └── sidebar.tsx         # SessionWatch 面板（append，内含 ContextSection）
```

### 构建与加载流程

```text
OpenCode 启动
  ├─ 服务端：index.ts → dist/server.js（空插件）
  └─ TUI：tui.ts → dist/tui.js
        └─ setup(ctx)
              └─ ctx.ui.slot({ append: "sidebar.content" }) → SessionWatch 面板
                    ├─ ContextSection（上下文 + 耗时）
                    └─ 总量 / 模型块 / Token 分布
```

- `tsc` 只生成 `.d.ts`；`build.tui.mjs` 用 esbuild + `esbuild-plugin-solid` 预编译 JSX。
- `solid-js`、`@opentui/*`、`@opencode/*` 保持 external，由宿主提供；请勿加入 `dependencies`，否则会出现第二份 OpenTUI 运行时。
- `npm run build` 会先清理 `dist/`，避免删除的源文件留下过期声明。

### 发布

```sh
npm version <version> --no-git-tag-version
npm run build
git add -A && git commit -m "chore: release v<version>"
git tag -a v<version> -m "v<version>"
git push origin main --tags
npm publish --access public
```

发布需要 npm 账号的 2FA 验证。

## 常见问题

**侧边栏没有上下文进度条？**

- 确认 OpenCode 为 2.x，且插件已加入 `plugins`
- 新会话在第一条 assistant 回复完成前没有 token 数据，属正常现象
- 本地加载时确认已执行 `npm run build`

**运行中追加消息后 `↻` 会清零吗？**

不会。一轮以 agent 结束输出（会话进入 idle）为边界；追加消息仍属于同一轮。

**同时装了 tokenwatch 和本插件？**

请移除 `@jasonencode/opencode-tokenwatch`，否则侧边栏会出现两套内容。

**TTFT / TPS 显示 `—`？**

说明当前模型或宿主没有提供可靠的时间锚点（例如缺少 delta 事件或 `time.streamed`），属于降级显示。

**花费显示为 0 或为空？**

免费模型、未提供定价的模型不会显示花费；这是正常行为。

**构建后仍然使用旧代码？**

本地目录插件直接读取 `dist/`，请重新执行 `npm run build` 并重启 OpenCode。

## 更新日志

### v1.0.0

- 合并 `opencode-context` 与 `opencode-tokenwatch`，统一为一个包、一个插件 ID
- 侧边栏改为单个 **SessionWatch 面板**：上下文窗口 + 会话耗时 + Token 统计
- 上下文标签本地化：`上下文:` / `Context:`
- 修正本轮计时：以 agent 结束输出（idle）为边界，运行中追加消息不再清零
- 新增 `/usage` HTML / JSON / Markdown 报告与显示设置
- 新增上下文与计时纯函数测试，共 20 项

## 致谢

- [TTWK/opencode-tokenwatch](https://github.com/TTWK/opencode-tokenwatch)：TokenWatch 面板与统计内核的来源
- OpenCode / OpenTUI 社区

## 许可证

[MIT](./LICENSE) © 2026 jasonencode
