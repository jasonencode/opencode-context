import assert from "node:assert/strict"
import test from "node:test"
import { build } from "esbuild"

/** 与 context.test.mjs 一致：用 esbuild 即时打包纯函数源码。 */
const bundle = await build({
  entryPoints: ["src/folder.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  write: false,
  logLevel: "silent",
  external: ["node:child_process", "node:fs"],
})

const code = bundle.outputFiles[0].text
const { resolveFolder, folderOpenCommand } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
)

test("无 subpath 时返回会话目录本身", () => {
  assert.equal(resolveFolder("D:/repo"), "D:/repo")
  assert.equal(resolveFolder("/home/me/repo/"), "/home/me/repo")
})

test("拼上 subpath 并去掉多余分隔符", () => {
  assert.equal(resolveFolder("/home/me/repo", "packages/app"), "/home/me/repo/packages/app")
  assert.equal(resolveFolder("/home/me/repo/", "/packages/app/"), "/home/me/repo/packages/app")
})

test("Windows 路径保留反斜杠", () => {
  assert.equal(resolveFolder("D:\\repo", "packages\\app"), "D:\\repo\\packages\\app")
  assert.equal(resolveFolder("D:\\repo\\", "/packages/app"), "D:\\repo\\packages\\app")
})

test("根目录拼接", () => {
  assert.equal(resolveFolder("/", "repo"), "/repo")
})

test("按平台选择打开命令", () => {
  assert.deepEqual(folderOpenCommand("win32", "D:/repo"), {
    command: "explorer.exe",
    args: ["D:/repo"],
  })
  assert.deepEqual(folderOpenCommand("darwin", "/repo"), { command: "open", args: ["/repo"] })
  assert.deepEqual(folderOpenCommand("linux", "/repo"), { command: "xdg-open", args: ["/repo"] })
})
