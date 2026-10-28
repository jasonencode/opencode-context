/**
 * 当前会话所在的文件夹 —— 纯路径计算 + 调用系统文件管理器。
 *
 * 宿主没有提供“在文件管理器中打开”的 API，因此这里直接使用
 * `node:child_process` 调用各平台的默认文件管理器。TUI 插件与宿主
 * 运行在同一个本地进程中（node / bun 均可），不新增任何运行时依赖。
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"

export interface FolderCommand {
  readonly command: string
  readonly args: readonly string[]
}

/**
 * 把会话的 `location.directory` 与 `subpath` 拼成实际工作目录。
 *
 * 保留原始路径的分隔符风格：Windows 路径用 `\`，POSIX 路径用 `/`。
 */
export function resolveFolder(directory: string, subpath?: string): string {
  const base = directory.replace(/[\\/]+$/, "")
  const sub = (subpath ?? "").replace(/^[\\/]+/, "").replace(/[\\/]+$/, "")
  if (!sub) return base || directory

  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/"
  return `${base}${separator}${sub.replace(/[\\/]+/g, separator)}`
}

/** 按平台选择打开文件夹的命令。 */
export function folderOpenCommand(platform: string, directory: string): FolderCommand {
  switch (platform) {
    case "win32":
      return { command: "explorer.exe", args: [directory] }
    case "darwin":
      return { command: "open", args: [directory] }
    default:
      return { command: "xdg-open", args: [directory] }
  }
}

/**
 * 用系统文件管理器打开文件夹。
 *
 * 目录不存在或无法启动进程时 reject，由调用方决定如何提示。
 */
export function openFolder(directory: string, platform: string = process.platform): Promise<void> {
  if (!directory) return Promise.reject(new Error("empty directory"))
  if (!existsSync(directory)) return Promise.reject(new Error(`folder not found: ${directory}`))

  const { command, args } = folderOpenCommand(platform, directory)
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(command, [...args], { detached: true, stdio: "ignore" })
    child.once("error", (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    child.once("spawn", () => {
      if (settled) return
      settled = true
      child.unref()
      resolve()
    })
  })
}
