import assert from "node:assert/strict"
import test from "node:test"
import { build } from "esbuild"

/**
 * v2 适配层回归测试：用 mock Context 模拟 OpenCode 2.3 的事件/消息形状，
 * 验证 step / token / 计时元信息被正确归一化。
 */
const bundle = await build({
  entryPoints: ["src/host/v2/adapter.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  write: false,
  logLevel: "silent",
})

const code = bundle.outputFiles[0].text
const { createV2Adapter } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
)

const RGBA = { r: 255, g: 255, b: 255, a: 255 }

function makeCtx() {
  const handlers = new Map()
  const messages = new Map()
  const sessions = new Map()
  const slots = []
  const toasts = []
  let models = []
  let agents = []

  const ctx = {
    theme: {
      text: {
        base: RGBA,
        muted: RGBA,
        action: { primary: { base: RGBA } },
      },
    },
    storage: {
      store(_key, { initial }) {
        const state = initial
        return [state, async (mutation) => mutation(state)]
      },
    },
    data: {
      on(type, handler) {
        const list = handlers.get(type) ?? []
        list.push(handler)
        handlers.set(type, list)
        return () => {
          const current = handlers.get(type) ?? []
          handlers.set(type, current.filter((fn) => fn !== handler))
        }
      },
      session: {
        status: (sessionID) => sessions.get(sessionID)?.status ?? "idle",
        get: (sessionID) => sessions.get(sessionID),
        list: () => [...sessions.values()],
        message: {
          get: (sessionID, messageID) => messages.get(messageID),
          list: () => [...messages.values()],
        },
      },
      location: {
        model: { list: () => models },
        agent: { list: () => agents },
      },
    },
    keymap: {
      layer(factory) {
        const layer = factory()
        assert.equal(layer.mode, "global")
      },
    },
    ui: {
      slot(claim) {
        slots.push(claim)
        return () => {}
      },
      toast: {
        show(options) {
          toasts.push(options)
        },
      },
      dialog: {
        select: async () => undefined,
      },
    },
    client: {},
  }

  return {
    ctx,
    sessions,
    messages,
    slots,
    toasts,
    setModels: (value) => {
      models = value
    },
    setAgents: (value) => {
      agents = value
    },
    emit(type, event) {
      for (const handler of handlers.get(type) ?? []) handler(event)
    },
    handlerCount(type) {
      return (handlers.get(type) ?? []).length
    },
  }
}

function assistantMessage(overrides = {}) {
  return {
    id: "a1",
    type: "assistant",
    model: { providerID: "openai", id: "gpt-4" },
    time: { created: 2000, firstToken: 2500, streamed: 4000, completed: 4500 },
    tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 20, write: 5 } },
    cost: 0.01,
    ...overrides,
  }
}

function stepEndedEvent(overrides = {}) {
  return {
    created: 4500,
    data: {
      sessionID: "s1",
      assistantMessageID: "a1",
      tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 20, write: 5 } },
      cost: 0.01,
      ...overrides,
    },
  }
}

test("step.started / first-token / execution 事件驱动 UI 与 TTFT 锚点", () => {
  const mock = makeCtx()
  const host = createV2Adapter(mock.ctx, new Set())
  const events = []
  host.subscribe({
    onMessageUpdated: (event) => events.push({ type: "message", event }),
    onPartUpdated: (event) => events.push({ type: "part", event }),
    onInvalidate: () => events.push({ type: "invalidate" }),
  })

  mock.emit("session.step.started", {
    created: 2000,
    data: {
      sessionID: "s1",
      assistantMessageID: "a1",
      model: { providerID: "openai", id: "gpt-4" },
      started: 1900,
    },
  })
  mock.emit("session.step.first-token", {
    created: 2600,
    data: { sessionID: "s1", assistantMessageID: "a1" },
  })
  mock.emit("session.execution.started", { created: 1900, data: { sessionID: "s1" } })

  const parts = events.filter((entry) => entry.type === "part").map((entry) => entry.event)
  assert.deepEqual(parts[0], { messageID: "a1", type: "step", timeStart: 1900 })
  assert.deepEqual(parts[1], { messageID: "a1", type: "first-token", timeStart: 2600 })
  assert.equal(events.filter((entry) => entry.type === "invalidate").length, 2)
})

test("step.ended 读取 2.3 assistant 消息并归一化 token / 时间", () => {
  const mock = makeCtx()
  mock.sessions.set("s1", { id: "s1", time: { created: 1000, busy: 1500, idle: 500 } })
  mock.messages.set("a1", assistantMessage())
  const host = createV2Adapter(mock.ctx, new Set())
  const messages = []
  let invalidates = 0
  host.subscribe({
    onMessageUpdated: (event) => messages.push(event),
    onPartUpdated: () => {},
    onInvalidate: () => {
      invalidates++
    },
  })

  mock.emit("session.step.ended", stepEndedEvent())
  assert.equal(messages.length, 1)
  const event = messages[0]
  assert.equal(event.messageID, "a1")
  assert.equal(event.sessionID, "s1")
  assert.equal(event.role, "assistant")
  assert.equal(event.providerID, "openai")
  assert.equal(event.modelID, "gpt-4")
  assert.equal(event.input, 100)
  assert.equal(event.output, 50)
  assert.equal(event.reasoning, 10)
  assert.equal(event.cacheRead, 20)
  assert.equal(event.cacheWrite, 5)
  assert.equal(event.total, 185)
  assert.equal(event.cost, 0.01)
  assert.equal(event.timeCreated, 2000)
  // TPS 终点优先取 provider 响应体接收完毕的 time.streamed
  assert.equal(event.timeCompleted, 4000)
  assert.equal(invalidates, 1)
})

test("assistant 消息回查失败时用 step 元信息兜底", () => {
  const mock = makeCtx()
  mock.sessions.set("s1", { id: "s1", time: { created: 1000 } })
  const host = createV2Adapter(mock.ctx, new Set())
  const messages = []
  host.subscribe({
    onMessageUpdated: (event) => messages.push(event),
    onPartUpdated: () => {},
    onInvalidate: () => {},
  })

  mock.emit("session.step.started", {
    created: 2000,
    data: {
      sessionID: "s1",
      assistantMessageID: "a1",
      model: { providerID: "anthropic", id: "claude" },
      started: 1900,
    },
  })
  mock.emit("session.step.streamed", {
    created: 4200,
    data: { sessionID: "s1", assistantMessageID: "a1" },
  })
  mock.emit("session.step.ended", stepEndedEvent())

  assert.equal(messages[0].providerID, "anthropic")
  assert.equal(messages[0].modelID, "claude")
  assert.equal(messages[0].timeCreated, 1900)
  assert.equal(messages[0].timeCompleted, 4200)
})

test("会话状态读取 2.3 的 idle / revert 字段", () => {
  const mock = makeCtx()
  mock.sessions.set("s1", {
    id: "s1",
    status: "running",
    time: { created: 1000, busy: 1500, idle: 500 },
    revert: { messageID: "u1" },
  })
  const host = createV2Adapter(mock.ctx, new Set())

  assert.equal(host.sessionStatus("s1"), "running")
  assert.equal(host.sessionIdleAt("s1"), 500)
  assert.equal(host.sessionRevertID("s1"), "u1")
})

test("模型列表兼容 2.3 ModelInfo（modelID + limit.context）", () => {
  const mock = makeCtx()
  mock.setModels([
    { providerID: "openai", modelID: "gpt-4", limit: { context: 200000 } },
    { providerID: "anthropic", id: "claude", limit: { context: 100000 } },
  ])
  mock.setAgents([{ id: "build", name: "Build", mode: "primary" }])
  const host = createV2Adapter(mock.ctx, new Set())

  assert.deepEqual(host.models(), [
    { providerID: "openai", id: "gpt-4", limit: { context: 200000 } },
    { providerID: "anthropic", id: "claude", limit: { context: 100000 } },
  ])
  assert.deepEqual(host.appConfig(), {
    agent: { Build: { id: "build", name: "Build", mode: "primary" } },
  })
})

test("插槽与命令注册使用 2.3 的 sidebar.content / prompt.footer / keymap.layer", () => {
  const mock = makeCtx()
  const host = createV2Adapter(mock.ctx, new Set())
  const render = () => null

  host.registerSidebar(render)
  assert.equal(mock.slots[0].append, "sidebar.content")
  assert.equal(mock.slots[1].append, "prompt.footer")

  let layer
  mock.ctx.keymap.layer = (factory) => {
    layer = factory()
  }
  const off = host.registerCommands([
    {
      id: "tokenwatch.usage",
      title: "TokenWatch",
      description: "Usage",
      category: "Stats",
      slash: "usage",
      run: () => {},
    },
  ])
  assert.equal(layer.mode, "global")
  assert.equal(layer.commands[0].id, "tokenwatch.usage")
  assert.deepEqual(layer.commands[0].slash, { name: "usage" })
  off()
})
