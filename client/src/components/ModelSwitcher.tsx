/**
 * ModelSwitcher Component — Void Glass Design System
 * Real AI model selector with provider grouping and API key status
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, ChevronRight, Check, Key, AlertCircle, Sparkles, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings, type CustomModel } from "@/contexts/SettingsContext";
import { t } from "@/i18n";

export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  description: string;
  speed: number;
  intelligence: number;
  badge?: string;
  badgeColor?: string;
  contextWindow: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  icon: string;
  darkIcon?: string;
  keyPlaceholder: string;
  models: AIModel[];
}

/** Render provider logo from /logos/{icon}.svg — supports dark/light variant */
export function ProviderIcon({ icon, darkIcon, size = 20, className }: { icon: string; darkIcon?: string; size?: number; className?: string }) {
  if (darkIcon) {
    return (
      <>
        <img src={`/logos/${darkIcon}.svg`} alt="" width={size} height={size} className={cn("dark:block hidden", className)} style={{ width: size, height: size, objectFit: "contain" }} />
        <img src={`/logos/${icon}.svg`} alt="" width={size} height={size} className={cn("dark:hidden block", className)} style={{ width: size, height: size, objectFit: "contain" }} />
      </>
    );
  }
  return <img src={`/logos/${icon}.svg`} alt="" width={size} height={size} className={className} style={{ width: size, height: size, objectFit: "contain" }} />;
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "openai",
    keyPlaceholder: "sk-...",
    models: [
      { id: "gpt-4o", name: "GPT-4o", providerId: "openai", description: "最新多模態旗艦模型", speed: 4, intelligence: 5, badge: "推薦", badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", contextWindow: "128K" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "openai", description: "輕量高效、性價比最高", speed: 5, intelligence: 3, badge: "高效", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30", contextWindow: "128K" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", providerId: "openai", description: "強大的長文本推理能力", speed: 3, intelligence: 5, contextWindow: "128K" },
      { id: "o1", name: "o1", providerId: "openai", description: "深度推理，適合數學與程式", speed: 1, intelligence: 5, badge: "推理", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "200K" },
      { id: "o3-mini", name: "o3 Mini", providerId: "openai", description: "輕量推理模型", speed: 3, intelligence: 4, contextWindow: "200K" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "anthropic",
    keyPlaceholder: "sk-ant-...",
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", providerId: "anthropic", description: "最強大的深度分析與創作", speed: 2, intelligence: 5, badge: "旗艦", badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30", contextWindow: "200K" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", providerId: "anthropic", description: "智能與速度的最佳平衡", speed: 4, intelligence: 5, badge: "推薦", badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", contextWindow: "200K" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", providerId: "anthropic", description: "即時回應，超低延遲", speed: 5, intelligence: 3, badge: "最快", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30", contextWindow: "200K" },
    ],
  },
  {
    id: "google",
    name: "Google",
    icon: "google",
    keyPlaceholder: "AIza...",
    models: [
      { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", providerId: "google", description: "輕量高速、低延遲推理", speed: 5, intelligence: 3, badge: "New", badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", contextWindow: "1M" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", providerId: "google", description: "最新一代高速模型，處理指令快速能力強", speed: 4, intelligence: 4, badge: "New", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "1M" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", providerId: "google", description: "Google 旗艦思考模型", speed: 3, intelligence: 5, badge: "New", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "1M" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", providerId: "google", description: "極速思考、高效推理", speed: 5, intelligence: 4, badge: "高效", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30", contextWindow: "1M" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "google", description: "快速多模態處理", speed: 5, intelligence: 3, contextWindow: "1M" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "deepseek",
    keyPlaceholder: "sk-...",
    models: [
      { id: "deepseek-r1", name: "DeepSeek R1", providerId: "deepseek", description: "開源推理模型，媲美 o1", speed: 2, intelligence: 5, badge: "推理", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "64K" },
      { id: "deepseek-v3", name: "DeepSeek V3", providerId: "deepseek", description: "高性價比通用對話", speed: 4, intelligence: 4, contextWindow: "64K" },
    ],
  },
  {
    id: "meta",
    name: "Meta (via Groq/Together)",
    icon: "meta",
    keyPlaceholder: "gsk_... / ...",
    models: [
      { id: "llama-4-maverick", name: "Llama 4 Maverick", providerId: "meta", description: "Meta 最新 400B MoE 模型", speed: 3, intelligence: 5, badge: "New", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "1M" },
      { id: "llama-4-scout", name: "Llama 4 Scout", providerId: "meta", description: "109B 高效多語言模型", speed: 4, intelligence: 4, contextWindow: "10M" },
      { id: "llama-3.3-70b", name: "Llama 3.3 70B", providerId: "meta", description: "成熟穩定的開源模型", speed: 4, intelligence: 4, contextWindow: "128K" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    icon: "groq-light",
    darkIcon: "groq-dark",
    keyPlaceholder: "gsk_...",
    models: [
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", providerId: "groq", description: "開源 GPT 120B 大模型", speed: 4, intelligence: 5, badge: "New", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "128K" },
      { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", providerId: "groq", description: "輕量開源 GPT 模型", speed: 5, intelligence: 3, badge: "高效", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30", contextWindow: "128K" },
      { id: "qwen/qwen3-32b", name: "Qwen 3 32B", providerId: "groq", description: "阿里通義千問最新模型", speed: 5, intelligence: 4, contextWindow: "128K" },
      { id: "moonshotai/kimi-k2-instruct-0905", name: "Kimi K2", providerId: "groq", description: "月之暗面指令模型", speed: 4, intelligence: 4, badge: "New", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "128K" },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout", providerId: "groq", description: "Meta 視覺多模態模型", speed: 4, intelligence: 4, badge: "Vision", badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", contextWindow: "128K" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", providerId: "groq", description: "成熟穩定的開源模型", speed: 4, intelligence: 4, contextWindow: "128K" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    icon: "mistral",
    keyPlaceholder: "...",
    models: [
      { id: "mistral-large", name: "Mistral Large", providerId: "mistral", description: "歐洲旗艦級推理模型", speed: 3, intelligence: 5, badge: "旗艦", badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30", contextWindow: "128K" },
      { id: "mistral-small", name: "Mistral Small", providerId: "mistral", description: "高效輕量，適合日常使用", speed: 5, intelligence: 3, contextWindow: "32K" },
      { id: "codestral", name: "Codestral", providerId: "mistral", description: "專精程式碼生成與分析", speed: 4, intelligence: 4, badge: "程式碼", badgeColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", contextWindow: "256K" },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    icon: "xai",
    keyPlaceholder: "xai-...",
    models: [
      { id: "grok-3", name: "Grok 3", providerId: "xai", description: "xAI 旗艦對話模型", speed: 3, intelligence: 5, badge: "New", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "128K" },
      { id: "grok-3-mini", name: "Grok 3 Mini", providerId: "xai", description: "高效輕量思考模型", speed: 4, intelligence: 4, contextWindow: "128K" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "openrouter",
    keyPlaceholder: "sk-or-...",
    models: [
      { id: "openrouter/auto", name: "Auto (最佳路由)", providerId: "openrouter", description: "自動選擇最適合的模型與供應商", speed: 4, intelligence: 5, badge: "推薦", badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", contextWindow: "128K" },
      { id: "openai/gpt-5.2", name: "GPT-5.2", providerId: "openrouter", description: "OpenAI 最新旗艦模型", speed: 3, intelligence: 5, badge: "New", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "128K" },
      { id: "openai/gpt-4o", name: "GPT-4o", providerId: "openrouter", description: "OpenAI 多模態旗艦", speed: 4, intelligence: 5, contextWindow: "128K" },
      { id: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6", providerId: "openrouter", description: "Anthropic 深度分析旗艦", speed: 2, intelligence: 5, badge: "旗艦", badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30", contextWindow: "200K" },
      { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", providerId: "openrouter", description: "智能與速度最佳平衡", speed: 4, intelligence: 5, contextWindow: "200K" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", providerId: "openrouter", description: "Google 旗艦思考模型", speed: 3, intelligence: 5, contextWindow: "1M" },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1", providerId: "openrouter", description: "開源推理模型，媲美 o1", speed: 2, intelligence: 5, badge: "推理", badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30", contextWindow: "64K" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", providerId: "openrouter", description: "Meta 400B MoE 開源模型", speed: 3, intelligence: 5, contextWindow: "1M" },
      { id: "mistralai/mistral-large", name: "Mistral Large", providerId: "openrouter", description: "歐洲旗艦推理模型", speed: 3, intelligence: 5, contextWindow: "128K" },
    ],
  },
];

const BUILT_IN_MODELS: AIModel[] = MODEL_PROVIDERS.flatMap(p => p.models);

export function getAllModels(customModels: CustomModel[]): AIModel[] {
  const customAIModels: AIModel[] = customModels.map(cm => ({
    id: cm.id,
    name: cm.name,
    providerId: cm.providerId,
    description: cm.endpoint,
    speed: 3,
    intelligence: 3,
    contextWindow: cm.contextWindow,
  }));
  return [...BUILT_IN_MODELS, ...customAIModels];
}

// Keep ALL_MODELS as a backwards-compatible alias for built-in models
export const ALL_MODELS: AIModel[] = BUILT_IN_MODELS;

function getProviderById(id: string): ModelProvider | undefined {
  return MODEL_PROVIDERS.find(p => p.id === id);
}

interface ModelSwitcherProps {
  className?: string;
  onOpenSettings?: () => void;
}

export default function ModelSwitcher({ className, onOpenSettings }: ModelSwitcherProps) {
  const { settings, updateSetting, hasApiKey } = useSettings();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // Auto-expand provider of the currently selected model
  useEffect(() => {
    const allModels = getAllModels(settings.customModels);
    const model = allModels.find(m => m.id === settings.selectedModelId);
    if (model) {
      setExpandedProviders(prev => {
        if (prev.has(model.providerId)) return prev;
        const next = new Set(prev);
        next.add(model.providerId);
        return next;
      });
    }
  }, [settings.selectedModelId, settings.customModels]);

  const toggleProvider = (providerId: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const lang = settings.language;
  const allModels = getAllModels(settings.customModels);
  const selectedModel = allModels.find(m => m.id === settings.selectedModelId) || allModels[0];
  const selectedProvider = getProviderById(selectedModel.providerId);
  const hasKey = hasApiKey(selectedModel.providerId);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, left: rect.left });
    }
  }, []);

  // Reposition on resize/scroll while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  // Toggle with synchronous position computation to prevent fly-in
  const handleToggle = useCallback(() => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, left: rect.left });
    }
    setOpen(prev => !prev);
  }, [open]);

  const handleSelect = (model: AIModel) => {
    // Custom models don't require provider API key check
    const isCustom = settings.customModels.some(cm => cm.id === model.id);
    if (!isCustom) {
      const providerHasKey = hasApiKey(model.providerId);
      if (!providerHasKey) {
        onOpenSettings?.();
        setOpen(false);
        return;
      }
    }
    updateSetting("selectedModelId", model.id);
    setOpen(false);
  };

  // Custom models converted to AIModel for rendering
  const customAIModels: AIModel[] = settings.customModels.map(cm => ({
    id: cm.id,
    name: cm.name,
    providerId: cm.providerId,
    description: cm.endpoint,
    speed: 3,
    intelligence: 3,
    contextWindow: cm.contextWindow,
  }));

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-200",
          "bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/15",
          "backdrop-blur-sm text-white/80 hover:text-white",
          open && "bg-white/8 border-white/15"
        )}
      >
        <div className="flex items-center gap-1.5">
          {selectedProvider ? <ProviderIcon icon={selectedProvider.icon} darkIcon={selectedProvider.darkIcon} size={18} /> : <span className="text-sm">🔧</span>}
          <span className="text-sm font-medium">{selectedModel.name}</span>
        </div>
        {!hasKey && !settings.customModels.some(cm => cm.id === selectedModel.id) && (
          <AlertCircle size={12} className="text-amber-400" />
        )}
        {selectedModel.badge && hasKey && (
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md border", selectedModel.badgeColor)}>
            {selectedModel.badge}
          </span>
        )}
        <ChevronDown size={14} className={cn("text-white/40 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "fixed w-80 z-[100] max-h-[70vh] flex flex-col",
              "rounded-2xl border border-white/10 overflow-hidden",
              "bg-[oklch(0.10_0.015_265)]/98 backdrop-blur-2xl",
              "shadow-2xl shadow-black/80",
              "animate-in fade-in-0 slide-in-from-top-1 duration-150"
            )}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <div className="overflow-y-auto flex-1 p-2 space-y-2">
              {MODEL_PROVIDERS.map(provider => {
                const providerHasKey = hasApiKey(provider.id);
                const isExpanded = expandedProviders.has(provider.id);
                return (
                  <div key={provider.id}>
                    {/* Provider group header — clickable to expand/collapse */}
                    <button
                      onClick={() => toggleProvider(provider.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      {isExpanded ? <ChevronDown size={12} className="text-white/30" /> : <ChevronRight size={12} className="text-white/30" />}
                      <ProviderIcon icon={provider.icon} darkIcon={provider.darkIcon} size={16} />
                      <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{provider.name}</span>
                      {!isExpanded && (
                        <span className="text-[10px] text-white/20 ml-1">({provider.models.length})</span>
                      )}
                      {!providerHasKey && (
                        <span
                          onClick={(e) => { e.stopPropagation(); onOpenSettings?.(); setOpen(false); }}
                          className="ml-auto flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          <Key size={9} />
                          <span>{t("model.needApiKey", lang)}</span>
                        </span>
                      )}
                      {providerHasKey && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
                    </button>
                    {/* Models — shown when expanded */}
                    {isExpanded && <div className="space-y-0.5">
                      {provider.models.map(model => {
                        const isSelected = settings.selectedModelId === model.id;
                        return (
                          <button
                            key={model.id}
                            onClick={() => handleSelect(model)}
                            className={cn(
                              "w-full flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left",
                              isSelected
                                ? "bg-blue-600/15 border border-blue-500/20"
                                : providerHasKey
                                  ? "hover:bg-white/5 border border-transparent"
                                  : "opacity-50 border border-transparent"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={cn("text-sm font-semibold", isSelected ? "text-white" : "text-white/80")}>
                                  {model.name}
                                </span>
                                {model.badge && (
                                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md border", model.badgeColor)}>
                                    {model.badge}
                                  </span>
                                )}
                                <span className="text-[10px] text-white/20 font-mono">{model.contextWindow}</span>
                              </div>
                              <p className="text-xs text-white/40 leading-relaxed">{model.description}</p>
                              <div className="flex gap-3 mt-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-white/30">{t("model.speed", lang)}</span>
                                  <div className="flex gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                      <div key={i} className={cn("w-2 h-1 rounded-full", i < model.speed ? "bg-blue-400" : "bg-white/10")} />
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-white/30">{t("model.intelligence", lang)}</span>
                                  <div className="flex gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                      <div key={i} className={cn("w-2 h-1 rounded-full", i < model.intelligence ? "bg-violet-400" : "bg-white/10")} />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            {isSelected && <Check size={14} className="text-blue-400 shrink-0 mt-1" />}
                            {!providerHasKey && <Key size={12} className="text-amber-400/60 shrink-0 mt-1" />}
                          </button>
                        );
                      })}
                    </div>}
                  </div>
                );
              })}

              {/* Custom Models Section */}
              {customAIModels.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className="text-sm">🔧</span>
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Custom</span>
                  </div>
                  <div className="space-y-0.5">
                    {customAIModels.map(model => {
                      const isSelected = settings.selectedModelId === model.id;
                      return (
                        <button
                          key={model.id}
                          onClick={() => handleSelect(model)}
                          className={cn(
                            "w-full flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left",
                            isSelected
                              ? "bg-blue-600/15 border border-blue-500/20"
                              : "hover:bg-white/5 border border-transparent"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm">🔧</span>
                              <span className={cn("text-sm font-semibold", isSelected ? "text-white" : "text-white/80")}>
                                {model.name}
                              </span>
                              <span className="text-[10px] text-white/20 font-mono">{model.contextWindow}</span>
                            </div>
                            <p className="text-xs text-white/40 leading-relaxed truncate">{model.description}</p>
                            <div className="flex gap-3 mt-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-white/30">{t("model.speed", lang)}</span>
                                <div className="flex gap-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <div key={i} className={cn("w-2 h-1 rounded-full", i < model.speed ? "bg-blue-400" : "bg-white/10")} />
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-white/30">{t("model.intelligence", lang)}</span>
                                <div className="flex gap-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <div key={i} className={cn("w-2 h-1 rounded-full", i < model.intelligence ? "bg-violet-400" : "bg-white/10")} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check size={14} className="text-blue-400 shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-3 pb-3 pt-1 border-t border-white/6 space-y-1.5">
              <button
                onClick={() => { onOpenSettings?.(); setOpen(false); }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-blue-300 hover:bg-white/5 transition-colors"
              >
                <Plus size={11} />
                <span>{t("model.addCustom", lang)}</span>
              </button>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/25">AI Workbench v1.0</span>
                <button
                  onClick={() => { onOpenSettings?.(); setOpen(false); }}
                  className="flex items-center gap-1 text-[11px] text-white/30 hover:text-blue-300 transition-colors"
                >
                  <Key size={10} />
                  <span>{t("model.manageKeys", lang)}</span>
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
