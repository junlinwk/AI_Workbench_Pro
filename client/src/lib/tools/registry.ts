import type { Tool } from "@/lib/tools/types"
import { webSearchTool } from "@/lib/tools/builtin/webSearch"
import { fetchUrlTool } from "@/lib/tools/builtin/fetchUrl"
import {
  memoryAddTool,
  memoryQueryTool,
} from "@/lib/tools/builtin/memory"

interface BuiltinToolSettings {
  toolUseEnabled: boolean
  enabledTools: Record<string, boolean>
  webSearchEnabled: boolean
}

// Missing entry in enabledTools is treated as enabled (opt-out semantics).
function isEnabled(map: Record<string, boolean>, name: string): boolean {
  return map[name] !== false
}

export function getBuiltinTools(settings: BuiltinToolSettings): Tool[] {
  if (!settings.toolUseEnabled) return []
  const { enabledTools, webSearchEnabled } = settings

  const tools: Tool[] = []
  if (isEnabled(enabledTools, "web_search") && webSearchEnabled !== false) {
    tools.push(webSearchTool)
  }
  if (isEnabled(enabledTools, "fetch_url")) {
    tools.push(fetchUrlTool)
  }
  if (isEnabled(enabledTools, "memory_add")) {
    tools.push(memoryAddTool)
  }
  if (isEnabled(enabledTools, "memory_query")) {
    tools.push(memoryQueryTool)
  }
  return tools
}
