import assert from "node:assert/strict"
import test from "node:test"
import { build } from "esbuild"

/** 与 context.test.mjs 相同：用 esbuild 即时打包纯函数源码。 */
const bundle = await build({
  entryPoints: ["src/duration.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  write: false,
  logLevel: "silent",
})

const code = bundle.outputFiles[0].text
const { computeSessionTiming, formatDuration } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
)

const user = (id, created) => ({ id, type: "user", time: { created } })
const assistant = (id, created, completed) => ({
  id,
  type: "assistant",
  time: completed === undefined ? { created } : { created, completed },
})

test("墙钟耗时取首条消息到最后一条消息完成", () => {
  const messages = [user("u1", 1000), assistant("a1", 2000, 5000), user("u2", 8000)]
  assert.deepEqual(computeSessionTiming(messages), {
    elapsed: 7000,
    lastRun: 0,
    running: false,
  })
})

test("最近一次执行从最后一条 user 消息算起", () => {
  const messages = [
    user("u1", 1000),
    assistant("a1", 2000, 5000),
    user("u2", 8000),
    assistant("a2", 9000, 12000),
  ]
  assert.deepEqual(computeSessionTiming(messages), {
    elapsed: 11000,
    lastRun: 4000,
    running: false,
  })
})

test("运行中墙钟时间与本次执行时间都取 now", () => {
  const messages = [user("u1", 1000), assistant("a1", 2000, 5000), user("u2", 8000), assistant("a2", 9000)]
  const timing = computeSessionTiming(messages, { now: 15000, running: true })
  assert.equal(timing.elapsed, 14000)
  assert.equal(timing.lastRun, 7000)
  assert.equal(timing.running, true)
})

test("没有 user 消息时本次执行等于会话总耗时", () => {
  const messages = [assistant("a1", 1000, 4000)]
  assert.deepEqual(computeSessionTiming(messages), {
    elapsed: 3000,
    lastRun: 3000,
    running: false,
  })
})

test("revert 后只统计该消息之前的消息", () => {
  const messages = [
    user("u1", 1000),
    assistant("a1", 2000, 5000),
    user("u2", 6000),
    assistant("a2", 7000, 9000),
  ]
  const timing = computeSessionTiming(messages, { revertMessageID: "u2" })
  assert.deepEqual(timing, { elapsed: 4000, lastRun: 4000, running: false })
})

test("没有带时间的消息时返回 undefined", () => {
  assert.equal(computeSessionTiming([]), undefined)
  assert.equal(computeSessionTiming([{ id: "u1", type: "user" }]), undefined)
})

test("formatDuration 分档格式化", () => {
  assert.equal(formatDuration(0), "0s")
  assert.equal(formatDuration(350), "350ms")
  assert.equal(formatDuration(4200), "4.2s")
  assert.equal(formatDuration(42000), "42s")
  assert.equal(formatDuration(60000), "1m")
  assert.equal(formatDuration(754000), "12m 34s")
  assert.equal(formatDuration(3 * 3600_000 + 12 * 60_000), "3h 12m")
  assert.equal(formatDuration(2 * 86400_000 + 5 * 3600_000), "2d 05h")
})
