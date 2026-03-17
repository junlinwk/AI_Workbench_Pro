/**
 * SettingsDialog — Full-featured settings modal
 * Includes: General, Appearance, Chat, Models & API Keys, Privacy, About
 */
import { useState } from "react";
import {
  X, Settings, Palette, MessageSquare, Key, Shield, Info,
  Sun, Moon, Monitor, Check, ChevronRight, Eye, EyeOff,
  RotateCcw, Download, Upload, Volume2, VolumeX, Trash2,
  Globe, Type, Sparkles, Plus, ChevronDown, UserCircle,
  Crown, Zap, Star, Copy, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings, ThemeMode, Language, SendKey, FontSize, MessageDensity, MembershipTier } from "@/contexts/SettingsContext";
import type { CustomModel } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { clearAllUserData } from "@/lib/storage";
import { t } from "@/i18n";
import { toast } from "sonner";
import { MODEL_PROVIDERS, ProviderIcon, type ModelProvider } from "./ModelSwitcher";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = "general" | "appearance" | "chat" | "profile" | "membership" | "models" | "privacy" | "about";

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-10 h-5.5 rounded-full transition-colors duration-200",
        checked ? "bg-blue-600" : "bg-white/15"
      )}
    >
      <div className={cn(
        "absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-200",
        checked ? "translate-x-5" : "translate-x-0.5"
      )} />
    </button>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/6 last:border-0">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm text-white/80">{label}</p>
        {description && <p className="text-xs text-white/35 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SelectButton<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            value === opt.value
              ? "bg-blue-600/80 text-white shadow"
              : "text-white/40 hover:text-white/60"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function GeneralTab() {
  const { settings, updateSetting } = useSettings();
  const lang = settings.language;
  return (
    <div className="space-y-1">
      <SettingRow label={t("general.language", lang)} description={t("general.languageDesc", lang)}>
        <SelectButton<Language>
          value={settings.language}
          onChange={v => updateSetting("language", v)}
          options={[
            { value: "zh-TW", label: "繁體中文" },
            { value: "en", label: "English" },
          ]}
        />
      </SettingRow>
      <SettingRow label={t("general.notifications", lang)} description={t("general.notificationsDesc", lang)}>
        <ToggleSwitch checked={settings.enableNotifications} onChange={v => updateSetting("enableNotifications", v)} />
      </SettingRow>
      <SettingRow label={t("general.sound", lang)} description={t("general.soundDesc", lang)}>
        <ToggleSwitch checked={settings.soundEnabled} onChange={v => updateSetting("soundEnabled", v)} />
      </SettingRow>
      <SettingRow label={t("general.webSearch", lang)} description={t("general.webSearchDesc", lang)}>
        <ToggleSwitch checked={settings.webSearchEnabled} onChange={v => updateSetting("webSearchEnabled", v)} />
      </SettingRow>
    </div>
  );
}

/* ---- Font Size Editor (fixed-size modal) ---- */
function FontSizeRow({ lang }: { lang: string }) {
  const { settings, updateSetting } = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <>
      <SettingRow
        label={lang === "en" ? "Font Size" : "字體大小"}
        description={lang === "en" ? "Adjust the global text size" : "調整全域文字大小"}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-white/60">{settings.fontSizePx}px</span>
          <button
            onClick={() => setOpen(true)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-600/15 text-blue-300 border border-blue-500/20 hover:bg-blue-600/25 transition-colors"
          >
            {lang === "en" ? "Edit" : "編輯"}
          </button>
        </div>
      </SettingRow>

      {/* Fixed-size centered modal */}
      {open && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-none">
            <div
              className="pointer-events-auto rounded-2xl border border-white/10 bg-[oklch(0.12_0.015_265)] shadow-2xl shadow-black/60"
              style={{ width: 360, fontSize: 14 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-white/80">
                  {lang === "en" ? "Font Size" : "字體大小"}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Content — fixed height */}
              <div className="px-5 py-5 space-y-5" style={{ height: 300 }}>
                {/* Slider row */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/35 shrink-0">A</span>
                  <input
                    type="range"
                    min={10}
                    max={35}
                    step={1}
                    value={settings.fontSizePx}
                    onChange={(e) => updateSetting("fontSizePx", parseInt(e.target.value, 10))}
                    className="flex-1 h-1.5 accent-blue-500 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400"
                  />
                  <span className="text-lg font-bold text-white/35 shrink-0">A</span>
                </div>

                {/* px display */}
                <div className="text-center">
                  <span className="text-xs font-mono text-white/50">{settings.fontSizePx}px</span>
                </div>

                {/* Preview — only this changes size */}
                <div className="text-center overflow-hidden" style={{ height: 65 }}>
                  <span
                    className="text-white/70 transition-all duration-100"
                    style={{ fontSize: `${settings.fontSizePx}px`, lineHeight: 1.3 }}
                  >
                    Aa / {lang === "zh-TW" ? "測試" : "Test"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AppearanceTab() {
  const { settings, updateSetting } = useSettings();
  const lang = settings.language;
  const themes: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t("appearance.light", lang), icon: <Sun size={18} /> },
    { value: "dark", label: t("appearance.dark", lang), icon: <Moon size={18} /> },
    { value: "system", label: t("appearance.system", lang), icon: <Monitor size={18} /> },
  ];

  return (
    <div className="space-y-1">
      {/* Theme selector */}
      <div className="py-3 border-b border-white/6">
        <p className="text-sm text-white/80 mb-3">{t("appearance.theme", lang)}</p>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(th => (
            <button
              key={th.value}
              onClick={() => updateSetting("theme", th.value)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                settings.theme === th.value
                  ? "bg-blue-600/15 border-blue-500/30 text-blue-300"
                  : "bg-white/4 border-white/8 text-white/40 hover:bg-white/6 hover:text-white/60"
              )}
            >
              {th.icon}
              <span className="text-xs font-medium">{th.label}</span>
              {settings.theme === th.value && <Check size={14} className="text-blue-400" />}
            </button>
          ))}
        </div>
      </div>

      <FontSizeRow lang={lang} />
      <SettingRow label={t("appearance.density", lang)} description={t("appearance.densityDesc", lang)}>
        <SelectButton<MessageDensity>
          value={settings.messageDensity}
          onChange={v => updateSetting("messageDensity", v)}
          options={[
            { value: "compact", label: t("appearance.compact", lang) },
            { value: "comfortable", label: t("appearance.comfortable", lang) },
            { value: "spacious", label: t("appearance.spacious", lang) },
          ]}
        />
      </SettingRow>
      <SettingRow label={t("appearance.showAvatars", lang)} description={t("appearance.showAvatarsDesc", lang)}>
        <ToggleSwitch checked={settings.showAvatars} onChange={v => updateSetting("showAvatars", v)} />
      </SettingRow>
      <SettingRow label={t("appearance.animations", lang)} description={t("appearance.animationsDesc", lang)}>
        <ToggleSwitch checked={settings.enableAnimations} onChange={v => updateSetting("enableAnimations", v)} />
      </SettingRow>
    </div>
  );
}

function ChatTab() {
  const { settings, updateSetting } = useSettings();
  const lang = settings.language;
  return (
    <div className="space-y-1">
      <SettingRow label={t("chatSettings.sendKey", lang)} description={t("chatSettings.sendKeyDesc", lang)}>
        <SelectButton<SendKey>
          value={settings.sendKey}
          onChange={v => updateSetting("sendKey", v)}
          options={[
            { value: "enter", label: "Enter" },
            { value: "ctrl-enter", label: "Ctrl+Enter" },
          ]}
        />
      </SettingRow>
      <SettingRow label={t("chatSettings.streaming", lang)} description={t("chatSettings.streamingDesc", lang)}>
        <ToggleSwitch checked={settings.enableStreaming} onChange={v => updateSetting("enableStreaming", v)} />
      </SettingRow>
      <SettingRow label={t("chatSettings.timestamps", lang)} description={t("chatSettings.timestampsDesc", lang)}>
        <ToggleSwitch checked={settings.showTimestamps} onChange={v => updateSetting("showTimestamps", v)} />
      </SettingRow>
      <SettingRow label={t("chatSettings.markdown", lang)} description={t("chatSettings.markdownDesc", lang)}>
        <ToggleSwitch checked={settings.enableMarkdownRendering} onChange={v => updateSetting("enableMarkdownRendering", v)} />
      </SettingRow>

      {/* Temperature */}
      <div className="py-3 border-b border-white/6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm text-white/80">{t("chatSettings.temperature", lang)}</p>
            <p className="text-xs text-white/35 mt-0.5">{t("chatSettings.temperatureDesc", lang)}</p>
          </div>
          <span className="text-sm font-mono text-blue-300">{settings.temperature.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={settings.temperature}
          onChange={e => updateSetting("temperature", parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-blue-500 cursor-pointer"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-white/25">{t("chatSettings.precise", lang)}</span>
          <span className="text-[10px] text-white/25">{t("chatSettings.balanced", lang)}</span>
          <span className="text-[10px] text-white/25">{t("chatSettings.creative", lang)}</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div className="py-3 border-b border-white/6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm text-white/80">{t("chatSettings.maxTokens", lang)}</p>
            <p className="text-xs text-white/35 mt-0.5">{t("chatSettings.maxTokensDesc", lang)}</p>
          </div>
          <span className="text-sm font-mono text-blue-300">{settings.maxTokens}</span>
        </div>
        <input
          type="range"
          min="256"
          max="32768"
          step="256"
          value={settings.maxTokens}
          onChange={e => updateSetting("maxTokens", parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-blue-500 cursor-pointer"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-white/25">256</span>
          <span className="text-[10px] text-white/25">16384</span>
          <span className="text-[10px] text-white/25">32768</span>
        </div>
      </div>

      {/* System Prompt */}
      <div className="py-3">
        <p className="text-sm text-white/80 mb-1">{t("chatSettings.systemPrompt", lang)}</p>
        <p className="text-xs text-white/35 mb-2">{t("chatSettings.systemPromptDesc", lang)}</p>
        <textarea
          value={settings.systemPrompt}
          onChange={e => updateSetting("systemPrompt", e.target.value)}
          placeholder={t("chatSettings.systemPromptPlaceholder", lang)}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 resize-none"
        />
      </div>
    </div>
  );
}

function ModelsTab() {
  const { settings, setApiKey, removeApiKey, hasApiKey, getApiKey, addCustomModel, removeCustomModel } = useSettings();
  const lang = settings.language;
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModel, setNewModel] = useState<CustomModel>({
    id: "",
    name: "",
    providerId: "",
    endpoint: "",
    contextWindow: "",
  });

  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);

  const handleSaveKey = (providerId: string) => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    if (trimmed.length < 10) {
      toast.error(lang === "en" ? "API Key is too short" : "API Key 太短");
      return;
    }
    setApiKey(providerId, trimmed);
    setKeyInput("");
    setEditingProvider(null);
    toast.success(t("models.keySaved", lang));
  };

  const handleRemoveKey = (providerId: string) => {
    if (removeConfirmId !== providerId) {
      setRemoveConfirmId(providerId);
      setTimeout(() => setRemoveConfirmId(null), 3000);
      return;
    }
    removeApiKey(providerId);
    setRemoveConfirmId(null);
    toast.info(t("models.keyRemoved", lang));
  };

  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "ok" | "fail" | "testing">>({});

  const handleTestKey = async (providerId: string) => {
    const key = getApiKey(providerId);
    if (!key) return;
    setTestingProvider(providerId);
    const provider = MODEL_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;

    // Test each model with a minimal request
    const results: Record<string, "ok" | "fail" | "testing"> = {};
    for (const model of provider.models) {
      results[model.id] = "testing";
      setTestResults(prev => ({ ...prev, [model.id]: "testing" }));
      try {
        let endpoint: string;
        let headers: Record<string, string>;
        let body: any;

        switch (providerId) {
          case "anthropic":
            endpoint = "https://api.anthropic.com/v1/messages";
            headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
            body = { model: model.id, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 };
            break;
          case "google":
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${key}`;
            headers = { "Content-Type": "application/json" };
            body = { contents: [{ role: "user", parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 5 } };
            break;
          default: {
            const baseUrl = providerId === "deepseek" ? "https://api.deepseek.com" : providerId === "xai" ? "https://api.x.ai" : providerId === "meta" ? "https://api.groq.com/openai" : providerId === "mistral" ? "https://api.mistral.ai" : providerId === "openrouter" ? "https://openrouter.ai/api" : "https://api.openai.com";
            endpoint = `${baseUrl}/v1/chat/completions`;
            headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, ...(providerId === "openrouter" && { "HTTP-Referer": window.location.origin, "X-OpenRouter-Title": "AI Workbench" }) };
            body = { model: model.id, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 };
          }
        }

        const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
        results[model.id] = res.ok ? "ok" : "fail";
      } catch {
        results[model.id] = "fail";
      }
      setTestResults(prev => ({ ...prev, [model.id]: results[model.id] }));
    }
    setTestingProvider(null);
    const okCount = Object.values(results).filter(r => r === "ok").length;
    toast.success(lang === "en" ? `Test complete: ${okCount}/${provider.models.length} models available` : `測試完成：${okCount}/${provider.models.length} 個模型可用`);
  };

  const handleAddModel = () => {
    if (newModel.id.trim() && newModel.name.trim()) {
      addCustomModel({ ...newModel, id: newModel.id.trim(), name: newModel.name.trim() });
      setNewModel({ id: "", name: "", providerId: "", endpoint: "", contextWindow: "" });
      setShowAddModel(false);
      toast.success(t("models.modelAdded", lang));
    }
  };

  const handleRemoveModel = (modelId: string) => {
    removeCustomModel(modelId);
    toast.info(t("models.modelRemoved", lang));
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-3">
        <p className="text-xs text-blue-300">
          <Sparkles size={12} className="inline mr-1" />
          {t("models.info", lang)}
        </p>
      </div>

      {MODEL_PROVIDERS.map(provider => {
        const has = hasApiKey(provider.id);
        const isEditing = editingProvider === provider.id;
        const currentKey = getApiKey(provider.id);

        return (
          <div key={provider.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
            {/* Provider Header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <ProviderIcon icon={provider.icon} size={24} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/85">{provider.name}</span>
                  {has && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {t("models.configured", lang)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/35 mt-0.5">{t("models.modelsAvailable", lang, { count: provider.models.length })}</p>
              </div>
              {has ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingProvider(isEditing ? null : provider.id); setKeyInput(""); }}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                  >
                    {isEditing ? t("models.cancel", lang) : t("models.changeKey", lang)}
                  </button>
                  <button
                    onClick={() => handleRemoveKey(provider.id)}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      removeConfirmId === provider.id
                        ? "text-red-300 bg-red-500/20 animate-pulse"
                        : "text-white/30 hover:text-red-400 hover:bg-red-500/10"
                    )}
                    title={removeConfirmId === provider.id ? (lang === "en" ? "Click again to confirm" : "再點一次確認") : ""}
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    onClick={() => handleTestKey(provider.id)}
                    disabled={testingProvider === provider.id}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {testingProvider === provider.id ? (lang === "en" ? "Testing..." : "測試中...") : (lang === "en" ? "Test" : "測試")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingProvider(isEditing ? null : provider.id); setKeyInput(""); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/80 hover:bg-blue-500 text-white transition-colors"
                >
                  {t("models.setKey", lang)}
                </button>
              )}
            </div>

            {/* API Key Input */}
            {isEditing && (
              <div className="px-4 pb-3 space-y-2 border-t border-white/6 pt-3">
                <div className="relative">
                  <input
                    type={showKey[provider.id] ? "text" : "password"}
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    placeholder={provider.keyPlaceholder}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-20 text-xs font-mono text-white/70 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
                    onKeyDown={e => { if (e.key === "Enter") handleSaveKey(provider.id); }}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={() => setShowKey(p => ({ ...p, [provider.id]: !p[provider.id] }))}
                      className="p-1 rounded text-white/30 hover:text-white/60"
                    >
                      {showKey[provider.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      onClick={() => handleSaveKey(provider.id)}
                      disabled={!keyInput.trim()}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium transition-colors",
                        keyInput.trim() ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-white/5 text-white/20"
                      )}
                    >
                      {t("models.save", lang)}
                    </button>
                  </div>
                </div>
                {has && currentKey && (
                  <div className="flex items-center gap-2 text-xs text-white/30">
                    <Check size={11} className="text-emerald-400" />
                    <span>{t("models.currentKey", lang)}{currentKey.slice(0, 8)}...{currentKey.slice(-4)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Models list with test results */}
            {has && (
              <div className="px-4 pb-3 border-t border-white/6 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  {provider.models.map(m => {
                    const result = testResults[m.id];
                    return (
                      <span key={m.id} className={cn(
                        "text-[10px] px-2 py-1 rounded-md border flex items-center gap-1",
                        result === "ok" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          result === "fail" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                            result === "testing" ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" :
                              "bg-white/5 text-white/40 border-white/6"
                      )}>
                        {result === "ok" && <Check size={9} />}
                        {result === "fail" && <X size={9} />}
                        {m.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Custom Models Section */}
      <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/6">
          <p className="text-sm font-semibold text-white/85">{t("models.customModels", lang)}</p>
          <p className="text-xs text-white/35 mt-0.5">{t("models.customModelsDesc", lang)}</p>
        </div>

        {/* Existing custom models */}
        {settings.customModels.length > 0 && (
          <div className="px-4 py-2 space-y-2">
            {settings.customModels.map(model => (
              <div key={model.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/4 border border-white/6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/80 font-medium">{model.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/40 font-mono">{model.id}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30">
                    {model.providerId && <span>{model.providerId}</span>}
                    {model.endpoint && <span>{model.endpoint}</span>}
                    {model.contextWindow && <span>{model.contextWindow}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveModel(model.id)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 ml-2"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Model collapsible */}
        <div className="px-4 py-3">
          <button
            onClick={() => setShowAddModel(!showAddModel)}
            className="flex items-center gap-2 text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors"
          >
            <Plus size={14} />
            {t("models.addModel", lang)}
            <ChevronDown size={12} className={cn("transition-transform", showAddModel && "rotate-180")} />
          </button>

          {showAddModel && (
            <div className="mt-3 space-y-2.5">
              <div>
                <label className="text-[11px] text-white/40 mb-1 block">{t("models.modelId", lang)}</label>
                <input
                  type="text"
                  value={newModel.id}
                  onChange={e => setNewModel(prev => ({ ...prev, id: e.target.value }))}
                  placeholder="e.g. gpt-4-custom"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white/70 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/40 mb-1 block">{t("models.modelName", lang)}</label>
                <input
                  type="text"
                  value={newModel.name}
                  onChange={e => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. GPT-4 Custom"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/40 mb-1 block">{t("models.provider", lang)}</label>
                <input
                  type="text"
                  value={newModel.providerId}
                  onChange={e => setNewModel(prev => ({ ...prev, providerId: e.target.value }))}
                  placeholder="e.g. openai"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white/70 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/40 mb-1 block">{t("models.endpoint", lang)}</label>
                <input
                  type="text"
                  value={newModel.endpoint}
                  onChange={e => setNewModel(prev => ({ ...prev, endpoint: e.target.value }))}
                  placeholder="e.g. https://api.openai.com/v1/chat/completions"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white/70 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/40 mb-1 block">{t("models.contextWindow", lang)}</label>
                <input
                  type="text"
                  value={newModel.contextWindow}
                  onChange={e => setNewModel(prev => ({ ...prev, contextWindow: e.target.value }))}
                  placeholder="e.g. 128K"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <button
                onClick={handleAddModel}
                disabled={!newModel.id.trim() || !newModel.name.trim()}
                className={cn(
                  "w-full py-2 rounded-lg text-xs font-medium transition-colors mt-1",
                  newModel.id.trim() && newModel.name.trim()
                    ? "bg-blue-600/80 text-white hover:bg-blue-500"
                    : "bg-white/5 text-white/20 cursor-not-allowed"
                )}
              >
                {t("models.addModel", lang)}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrivacyTab() {
  const { settings, updateSetting, resetSettings, exportSettings, importSettings } = useSettings();
  const lang = settings.language;

  const handleExport = () => {
    const data = exportSettings();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-workbench-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("privacy.exported", lang));
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          const ok = importSettings(reader.result as string);
          toast[ok ? "success" : "error"](ok ? t("privacy.imported", lang) : t("privacy.importFailed", lang));
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const { user } = useAuth();
  const handleClearHistory = () => {
    if (user?.id) {
      clearAllUserData(user.id).catch(() => { });
    }
    toast.success(t("privacy.historyCleared", lang));
  };

  const handleReset = () => {
    resetSettings();
    toast.success(t("privacy.settingsReset", lang));
  };

  return (
    <div className="space-y-1">
      <SettingRow label={t("privacy.saveHistory", lang)} description={t("privacy.saveHistoryDesc", lang)}>
        <ToggleSwitch checked={settings.saveHistory} onChange={v => updateSetting("saveHistory", v)} />
      </SettingRow>
      <SettingRow label={t("privacy.analytics", lang)} description={t("privacy.analyticsDesc", lang)}>
        <ToggleSwitch checked={settings.shareAnalytics} onChange={v => updateSetting("shareAnalytics", v)} />
      </SettingRow>

      <div className="pt-4 space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider mb-2">{t("privacy.dataManagement", lang)}</p>
        <button
          onClick={handleExport}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 transition-colors text-left"
        >
          <Download size={16} className="text-blue-400" />
          <div>
            <p className="text-sm text-white/80">{t("privacy.export", lang)}</p>
            <p className="text-xs text-white/35">{t("privacy.exportDesc", lang)}</p>
          </div>
        </button>
        <button
          onClick={handleImport}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 transition-colors text-left"
        >
          <Upload size={16} className="text-violet-400" />
          <div>
            <p className="text-sm text-white/80">{t("privacy.import", lang)}</p>
            <p className="text-xs text-white/35">{t("privacy.importDesc", lang)}</p>
          </div>
        </button>
        <button
          onClick={handleClearHistory}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 transition-colors text-left"
        >
          <Trash2 size={16} className="text-red-400" />
          <div>
            <p className="text-sm text-red-300">{t("privacy.clearHistory", lang)}</p>
            <p className="text-xs text-red-300/40">{t("privacy.clearHistoryDesc", lang)}</p>
          </div>
        </button>
        <button
          onClick={handleReset}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/15 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left"
        >
          <RotateCcw size={16} className="text-amber-400" />
          <div>
            <p className="text-sm text-amber-300">{t("privacy.resetAll", lang)}</p>
            <p className="text-xs text-amber-300/40">{t("privacy.resetAllDesc", lang)}</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/40">
          <Sparkles size={28} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-white/90">AI Workbench</h2>
        <p className="text-sm text-white/40 mt-1">v1.0.0</p>
        <p className="text-xs text-white/30 mt-2">Powered by Void Glass Design System</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/3">
          <span className="text-xs text-white/50">React</span>
          <span className="text-xs font-mono text-white/70">19.2.1</span>
        </div>
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/3">
          <span className="text-xs text-white/50">TypeScript</span>
          <span className="text-xs font-mono text-white/70">5.6.3</span>
        </div>
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/3">
          <span className="text-xs text-white/50">Tailwind CSS</span>
          <span className="text-xs font-mono text-white/70">4.1.14</span>
        </div>
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/3">
          <span className="text-xs text-white/50">Build</span>
          <span className="text-xs font-mono text-white/70">Vite 6.3.5</span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs text-white/25">
          2026 AI Workbench. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function UserProfileTab() {
  const { settings, updateSetting } = useSettings();
  const lang = settings.language;
  const profile = settings.userProfile;

  const updateProfile = (field: keyof typeof profile, value: string) => {
    updateSetting("userProfile", { ...profile, [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-3">
        <p className="text-xs text-blue-300">
          <UserCircle size={12} className="inline mr-1" />
          {t("profile.note", lang)}
        </p>
      </div>

      {/* Display Name */}
      <div className="py-3 border-b border-white/6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-white/80">{t("profile.displayName", lang)}</p>
          <span className="text-[10px] text-white/25">{t("profile.charRemaining", lang, { count: 100 - profile.displayName.length })}</span>
        </div>
        <p className="text-xs text-white/35 mb-2">{t("profile.displayNameDesc", lang)}</p>
        <input
          type="text"
          value={profile.displayName}
          onChange={e => updateProfile("displayName", e.target.value.slice(0, 100))}
          placeholder={t("profile.displayNamePlaceholder", lang)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
        />
      </div>

      {/* Role */}
      <div className="py-3 border-b border-white/6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-white/80">{t("profile.role", lang)}</p>
          <span className="text-[10px] text-white/25">{t("profile.charRemaining", lang, { count: 100 - profile.role.length })}</span>
        </div>
        <p className="text-xs text-white/35 mb-2">{t("profile.roleDesc", lang)}</p>
        <input
          type="text"
          value={profile.role}
          onChange={e => updateProfile("role", e.target.value.slice(0, 100))}
          placeholder={t("profile.rolePlaceholder", lang)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40"
        />
      </div>

      {/* Bio */}
      <div className="py-3 border-b border-white/6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-white/80">{t("profile.bio", lang)}</p>
          <span className="text-[10px] text-white/25">{t("profile.charRemaining", lang, { count: 500 - profile.bio.length })}</span>
        </div>
        <p className="text-xs text-white/35 mb-2">{t("profile.bioDesc", lang)}</p>
        <textarea
          value={profile.bio}
          onChange={e => updateProfile("bio", e.target.value.slice(0, 500))}
          placeholder={t("profile.bioPlaceholder", lang)}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 resize-none"
        />
      </div>

      {/* Custom Instructions */}
      <div className="py-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-white/80">{t("profile.customInstructions", lang)}</p>
          <span className="text-[10px] text-white/25">{t("profile.charRemaining", lang, { count: 2000 - profile.customInstructions.length })}</span>
        </div>
        <p className="text-xs text-white/35 mb-2">{t("profile.customInstructionsDesc", lang)}</p>
        <textarea
          value={profile.customInstructions}
          onChange={e => updateProfile("customInstructions", e.target.value.slice(0, 2000))}
          placeholder={t("profile.customInstructionsPlaceholder", lang)}
          rows={5}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 resize-none"
        />
      </div>
    </div>
  );
}

function MembershipTab() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings();
  const lang = settings.language;
  const tier = settings.membershipTier;

  const tiers: { id: MembershipTier; label: string; desc: string; icon: React.ReactNode; color: string; bgColor: string; borderColor: string }[] = [
    {
      id: "classic",
      label: t("membership.classic", lang),
      desc: t("membership.classicDesc", lang),
      icon: <Star size={18} />,
      color: "text-white/60",
      bgColor: "bg-white/8",
      borderColor: "border-white/12",
    },
    {
      id: "pro",
      label: t("membership.pro", lang),
      desc: t("membership.proDesc", lang),
      icon: <Zap size={18} />,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/25",
    },
    {
      id: "ultra",
      label: t("membership.ultra", lang),
      desc: t("membership.ultraDesc", lang),
      icon: <Crown size={18} />,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/25",
    },
  ];

  const currentTierConfig = tiers.find(t => t.id === tier) ?? tiers[0];

  return (
    <div className="space-y-5">
      {/* Permanent ID */}
      <div className="py-3 border-b border-white/6">
        <p className="text-sm text-white/80 mb-1">{t("membership.permanentId", lang)}</p>
        <div className="flex items-center gap-2 bg-white/4 rounded-xl px-4 py-3 border border-white/6">
          <span className="flex-1 text-xs font-mono text-white/50 truncate select-all">
            {user?.id ?? "—"}
          </span>
          <button
            onClick={() => {
              if (user?.id) {
                navigator.clipboard.writeText(user.id);
                toast.success(t("membership.copied", lang));
              }
            }}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors shrink-0"
          >
            <Copy size={14} />
          </button>
        </div>
      </div>

      {/* Current tier */}
      <div className="py-3 border-b border-white/6">
        <p className="text-sm text-white/80 mb-3">{t("membership.currentTier", lang)}</p>
        <div className="grid grid-cols-3 gap-3">
          {tiers.map(t => {
            const isCurrent = t.id === tier;
            return (
              <div
                key={t.id}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                  isCurrent
                    ? cn(t.bgColor, t.borderColor, t.color)
                    : "bg-white/3 border-white/6 text-white/25"
                )}
              >
                {t.icon}
                <span className="text-xs font-semibold">{t.label}</span>
                {isCurrent && <Check size={14} />}
                <p className={cn("text-[10px] text-center", isCurrent ? "opacity-70" : "opacity-40")}>
                  {t.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin panel link */}
      {isAdmin && (
        <div className="py-3">
          <a
            href="/admin"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-500/15 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left"
          >
            <Shield size={16} className="text-blue-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-blue-300 font-medium">{t("membership.adminPanel", lang)}</p>
              <p className="text-xs text-blue-300/40">{t("membership.adminPanelDesc", lang)}</p>
            </div>
            <ExternalLink size={14} className="text-blue-400/50" />
          </a>
        </div>
      )}
    </div>
  );
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { settings } = useSettings();
  const lang = settings.language;

  if (!open) return null;

  const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: t("settings.general", lang), icon: <Settings size={16} /> },
    { id: "appearance", label: t("settings.appearance", lang), icon: <Palette size={16} /> },
    { id: "chat", label: t("settings.chat", lang), icon: <MessageSquare size={16} /> },
    { id: "profile", label: t("settings.profile", lang), icon: <UserCircle size={16} /> },
    { id: "membership", label: t("settings.membership", lang), icon: <Crown size={16} /> },
    { id: "models", label: t("settings.models", lang), icon: <Key size={16} /> },
    { id: "privacy", label: t("settings.privacy", lang), icon: <Shield size={16} /> },
    { id: "about", label: t("settings.about", lang), icon: <Info size={16} /> },
  ];

  const tabContent: Record<SettingsTab, React.ReactNode> = {
    general: <GeneralTab />,
    appearance: <AppearanceTab />,
    chat: <ChatTab />,
    profile: <UserProfileTab />,
    membership: <MembershipTab />,
    models: <ModelsTab />,
    privacy: <PrivacyTab />,
    about: <AboutTab />,
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl max-h-[85vh] sm:max-h-[80vh] rounded-2xl border border-white/10 bg-[oklch(0.11_0.014_265)] shadow-2xl shadow-black/60 flex flex-col sm:flex-row overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200"
          style={{ fontSize: "14px" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Sidebar — vertical on desktop, horizontal scroll on mobile */}
          <div className="sm:w-48 border-b sm:border-b-0 sm:border-r border-white/6 bg-white/2 p-2 sm:p-3 flex sm:flex-col shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-2 py-2 mb-3">
              <Settings size={16} className="text-white/50" />
              <span className="text-sm font-semibold text-white/80">{t("settings.title", lang)}</span>
            </div>
            <nav className="flex sm:flex-col gap-0.5 sm:space-y-0.5 sm:flex-1 overflow-x-auto sm:overflow-x-visible scrollbar-none">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap shrink-0 sm:w-full",
                    activeTab === tab.id
                      ? "bg-blue-600/15 text-blue-300 border border-blue-500/20"
                      : "text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent"
                  )}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/6 shrink-0">
              <h2 className="text-sm sm:text-base font-semibold text-white/90">
                {TABS.find(tb => tb.id === activeTab)?.label}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
              {tabContent[activeTab]}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
