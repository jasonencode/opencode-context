import assert from "node:assert/strict"
import test from "node:test"
import { build } from "esbuild"

/**
 * 用 esbuild 把纯函数源码即时打成内存模块，避免测试依赖构建产物，
 * 也避免为 TypeScript 测试再引入一套运行时。
 */
const bundle = await build({
  entryPoints: ["src/context.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  write: false,
  logLevel: "silent",
})

const code = bundle.outputFiles[0].text
const { computeContextUsage, formatTokensShort } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
)

const models = [{ providerID: "p", id: "m", limit: { context: 200 } }]
const user = (id) => ({ id, type: "user" })
const compaction = (id, status) => ({ id, type: "compaction", status })
const assistant = (id, tokens) => ({
  id,
  type: "assistant",
  model: { providerID: "p", id: "m" },
  tokens,
})

test("统计最后一条 assistant 的全部 token 分量", () => {
  const messages = [
    user("u1"),
    assistant("a1", { input: 100, output: 50, reasoning: 10, cache: { read: 5, write: 5 } }),
  ]
  assert.deepEqual(computeContextUsage(messages, models), { used: 170, limit: 200, percent: 85 })
})

test("只统计最后一次 completed compaction 之后的消息", () => {
  const messages = [
    user("u1"),
    assistant("a1", { input: 1000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
    compaction("c1", "completed"),
    assistant("a2", { input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
  ]
  assert.equal(computeContextUsage(messages, models).used, 10)
})

test("running 状态的 compaction 不参与截断", () => {
  const messages = [
    assistant("a1", { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
    compaction("c1", "running"),
    assistant("a2", { input: 20, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
  ]
  assert.equal(computeContextUsage(messages, models).used, 20)
})

test("compaction 之后没有 assistant 时不显示", () => {
  const messages = [
    assistant("a1", { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
    compaction("c1", "completed"),
  ]
  assert.equal(computeContextUsage(messages, models), undefined)
})

test("revert 后只统计被回退消息之前的内容", () => {
  const messages = [
    assistant("a1", { input: 50, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
    user("u2"),
    assistant("a2", { input: 90, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
  ]
  assert.equal(computeContextUsage(messages, models, "u2").used, 50)
})

test("revert 指向不存在的消息时与宿主一致：不显示", () => {
  const messages = [assistant("a1", { input: 50, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })]
  assert.equal(computeContextUsage(messages, models, "missing"), undefined)
})

test("token 全为 0 时不显示", () => {
  const messages = [assistant("a1", { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })]
  assert.equal(computeContextUsage(messages, models), undefined)
})

test("模型上限未知时只返回已用 token", () => {
  const messages = [assistant("a1", { input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })]
  const usage = computeContextUsage(messages, [])
  assert.equal(usage.used, 10)
  assert.equal(usage.limit, undefined)
  assert.equal(usage.percent, undefined)
})

test("空消息列表直接返回 undefined", () => {
  assert.equal(computeContextUsage([], models), undefined)
  assert.equal(computeContextUsage(undefined, models), undefined)
})

test("token 数按 1024 进制换算并在四舍五入时提升单位", () => {
  assert.equal(formatTokensShort(0), "0")
  assert.equal(formatTokensShort(1023), "1023")
  assert.equal(formatTokensShort(1024), "1K")
  assert.equal(formatTokensShort(1536), "1.5K")
  assert.equal(formatTokensShort(1048570), "1M")
  assert.equal(formatTokensShort(1048576), "1M")
  assert.equal(formatTokensShort(2097152), "2M")
  assert.equal(formatTokensShort(1024 ** 3), "1G")
  assert.equal(formatTokensShort(1024 ** 4), "1T")
})
