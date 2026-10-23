import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import { readFileSync } from "node:fs"

/**
 * esbuild build script for opencode-context.
 *
 * Bundles src/tui.tsx -> dist/tui.js with SolidJS JSX pre-compiled, and
 * src/server.ts -> dist/server.js. Runtime peers (solid-js, @opentui/*,
 * @opencode/*) stay external; the OpenCode 2.x host provides them.
 */

const external = [
  "solid-js",
  "solid-js/*",
  "@opentui/solid",
  "@opentui/solid/*",
  "@opentui/core",
  "@opentui/core/*",
  "@opentui/keymap",
  "@opentui/keymap/*",
  "@opencode/plugin",
  "@opencode/plugin/*",
  "@opencode/client",
  "@opencode/client/*",
  "@opencode/theme",
  "@opencode/theme/*",
]

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  external,
  logLevel: "info",
}

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/tui.tsx"],
    outfile: "dist/tui.js",
    plugins: [solidPlugin({
      solid: { moduleName: "@opentui/solid", generate: "universal" },
    })],
  }),
  build({
    ...common,
    entryPoints: ["src/server.ts"],
    outfile: "dist/server.js",
  }),
])

const serverJs = readFileSync("dist/server.js", "utf-8")
if (/import\s[^;]*["']@opentui\//.test(serverJs)) {
  console.error("dist/server.js leaked TUI imports (@opentui)")
  process.exit(1)
}

console.log("esbuild: dist/tui.js + dist/server.js")
