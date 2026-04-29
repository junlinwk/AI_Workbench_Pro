/**
 * resolveModel — Helper for non-main chat surfaces that don't run the full
 * auto-routing or priority-fallback pipeline (e.g. TaskDAG, WidgetsShowcase,
 * ContextPinning).
 *
 * Given the user's selected model id (which may be the "auto" or "priority"
 * pseudo-model) and the current settings + hasApiKey predicate, returns the
 * best real, configured model id to dispatch with — or null if nothing is
 * usable so the caller can show an error instead of hitting a 404.
 */
import { ALL_MODELS } from "@/components/ModelSwitcher"
import type { Settings } from "@/contexts/SettingsContext"

export interface ResolvedModel {
  modelId: string
  /** Whether this surface should warn that pseudo-routing was downgraded. */
  fallback: boolean
}

export function resolveLegacyModel(
  selectedId: string,
  settings: Pick<Settings, "customModels" | "priorityModels" | "routingPrefs">,
  hasApiKey: (provider: string) => boolean,
): ResolvedModel | null {
  const isCustom = (id: string) => settings.customModels.some((cm) => cm.id === id)

  const providerOf = (id: string): string | undefined => {
    const builtin = ALL_MODELS.find((m) => m.id === id)
    if (builtin) return builtin.providerId
    return settings.customModels.find((cm) => cm.id === id)?.providerId
  }

  const hasKey = (id: string): boolean => {
    if (isCustom(id)) return true
    const p = providerOf(id)
    return p ? hasApiKey(p) : false
  }

  const firstAvailable = (): string | null => {
    const balanced = settings.routingPrefs.defaults.balanced
    if (hasKey(balanced)) return balanced
    const builtin = ALL_MODELS.find((m) => hasKey(m.id))
    if (builtin) return builtin.id
    const custom = settings.customModels[0]
    return custom ? custom.id : null
  }

  if (selectedId === "priority") {
    const list = (settings.priorityModels ?? []).filter(hasKey)
    if (list[0]) return { modelId: list[0], fallback: false }
    const fb = firstAvailable()
    return fb ? { modelId: fb, fallback: true } : null
  }

  if (selectedId === "auto") {
    const fb = firstAvailable()
    return fb ? { modelId: fb, fallback: true } : null
  }

  if (hasKey(selectedId)) return { modelId: selectedId, fallback: false }

  // Specific model selected but no key — let caller decide whether to fall back.
  const fb = firstAvailable()
  return fb ? { modelId: fb, fallback: true } : null
}
