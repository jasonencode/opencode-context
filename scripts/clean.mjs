import { rmSync } from "node:fs"

// 清空 dist，避免删除/重命名的源文件在发布包里留下过期的 .d.ts。
rmSync("dist", { recursive: true, force: true })
