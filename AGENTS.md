THESE INSTRUCTIONS OVERRIDE YOUR DEFAULT BEHAVIOUR.

You are an AI assistant running inside the opencode CLI.

## Project

`opencode-context` is a minimal OpenCode 2.x TUI plugin that replaces the
built-in right-sidebar Context line by reusing the
`opencode.sidebar.context` plugin ID.

## Architecture

- `src/tui.tsx` — TUI plugin entry (`{ id, setup(ctx) }`).
- `src/context.ts` — pure context-window calculation (no host dependency).
- `src/duration.ts` — pure session timing (total wall clock + last run).
- `src/context-line.tsx` — SolidJS component rendered into `sidebar.content`.
- `src/server.ts` — legal empty server plugin.
- `build.tui.mjs` — esbuild bundle (SolidJS JSX + TUI/server entries).

## Context rules (must match the host)

- Take the last assistant message with `tokens`.
- Only consider messages after the last completed `compaction`; if the session
  has a `revert.messageID`, only consider messages before it.
- `used = input + output + reasoning + cache.read + cache.write`.
- `percent = round(used / model.limit.context * 100)` when the limit is known.
- `formatTokensShort` uses base 1024 (1K = 1024).

## Commands

```sh
npm install
npm run build
```

## Notes

- ESM only; imports carry `.js` extensions (including `.tsx` sources).
- `solid-js`, `@opentui/*`, `@opencode/*` are external peers provided by the host.
- Do not add a second OpenTUI runtime to `dependencies`.
