/**
 * ContextPinning Component — Void Glass Design System
 * Three-scope context pinning: Global / Project / Conversation
 * Each scope is collapsible with colored accents and per-item editor panel.
 * Pins are persisted per-user via loadUserData/saveUserData.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { loadUserData, saveUserData } from "@/lib/storage";
import {
  Pin,
  PinOff,
  X,
  GripVertical,
  Code2,
  FileJson,
  User,
  ChevronDown,
  ChevronRight,
  Plus,
  Edit3,
  Check,
  Sparkles,
  Hash,
  Type,
  Globe,
  Folder,
  FolderOpen,
  MessageCircle,
  Trash2,
  Save,
  Loader2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { ALL_MODELS, getAllModels } from "./ModelSwitcher";

// ─── Types ───────────────────────────────────────────────────────────────────

type PinType = "text" | "json" | "code" | "persona" | "variable";
type PinScope = "global" | "project" | "conversation" | string; // string allows folder-specific scopes like "folder:folder-123"

interface PinnedItem {
  id: string;
  scope: PinScope;
  type: PinType;
  title: string;
  content: string;
  condensed?: string;
  isCondensing?: boolean;
  enabled: boolean;
  alwaysInclude: boolean;
  useAsPrompt: boolean; // true = inject into AI context, false = save only (bookmark)
  priority: number;
}

// ─── Metadata ────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  PinType,
  {
    icon: typeof Type;
    emoji: string;
    color: string;
    border: string;
    label: { en: string; zh: string };
  }
> = {
  text: {
    icon: Type,
    emoji: "\u{1F4DD}",
    color: "text-blue-400",
    border: "border-l-blue-500",
    label: { en: "Text", zh: "\u6587\u5B57" },
  },
  json: {
    icon: FileJson,
    emoji: "\u{1F4CB}",
    color: "text-amber-400",
    border: "border-l-amber-500",
    label: { en: "JSON", zh: "JSON" },
  },
  code: {
    icon: Code2,
    emoji: "\u{1F4BB}",
    color: "text-emerald-400",
    border: "border-l-emerald-500",
    label: { en: "Code", zh: "\u7A0B\u5F0F\u78BC" },
  },
  persona: {
    icon: User,
    emoji: "\u{1F464}",
    color: "text-violet-400",
    border: "border-l-violet-500",
    label: { en: "Persona", zh: "\u89D2\u8272" },
  },
  variable: {
    icon: Hash,
    emoji: "\u{1F522}",
    color: "text-rose-400",
    border: "border-l-rose-500",
    label: { en: "Variable", zh: "\u8B8A\u6578" },
  },
};

const SCOPE_META: Record<
  PinScope,
  {
    icon: typeof Globe;
    emoji: string;
    accent: string;
    bg: string;
    border: string;
    badge: string;
    label: { en: string; zh: string };
  }
> = {
  global: {
    icon: Globe,
    emoji: "\u{1F310}",
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-300",
    label: { en: "Global", zh: "\u5168\u5C40" },
  },
  project: {
    icon: FolderOpen,
    emoji: "\u{1F4C1}",
    accent: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    badge: "bg-violet-500/20 text-violet-300",
    label: { en: "Project", zh: "\u5C08\u6848" },
  },
  conversation: {
    icon: MessageCircle,
    emoji: "\u{1F4AC}",
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-300",
    label: { en: "Conversation", zh: "\u5C0D\u8A71" },
  },
};

const BASE_SCOPES: PinScope[] = ["global", "project", "conversation"];

// Folder scope metadata generator
function folderScopeMeta(name: string) {
  return {
    icon: FolderOpen,
    emoji: "📂",
    accent: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    badge: "bg-cyan-500/20 text-cyan-300",
    label: { en: name, zh: name },
  };
}

// Get scope metadata — handles both base scopes and folder scopes
function getScopeMeta(scope: string, folderScopes: { id: string; name: string; depth: number }[] = []) {
  if (scope.startsWith("folder:")) {
    const fId = scope.slice(7);
    const info = folderScopes.find(f => f.id === fId);
    return folderScopeMeta(info?.name || "Folder");
  }
  return SCOPE_META[scope as keyof typeof SCOPE_META] || SCOPE_META.global;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function tokenBarColor(count: number) {
  if (count < 500) return "bg-emerald-500";
  if (count <= 1000) return "bg-amber-500";
  return "bg-red-500";
}

function tokenTextColor(count: number) {
  if (count < 500) return "text-emerald-400";
  if (count <= 1000) return "text-amber-400";
  return "text-red-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContextPinning() {
  const { settings, getApiKey } = useSettings();
  const lang = settings.language;
  const { user } = useAuth();

  const effectiveUserId = user?.id || "anon";
  const [pins, setPins] = useState<PinnedItem[]>(() =>
    loadUserData(effectiveUserId, "context-pins", [])
  );

  // Load ALL sidebar folders (full tree) to mirror hierarchy
  interface SidebarFolder { id: string; name: string; icon?: string; color?: string; children: SidebarFolder[]; parentId?: string; prompt?: string }
  const [allSidebarFolders, setAllSidebarFolders] = useState<SidebarFolder[]>(() => {
    try {
      return loadUserData<any[]>(effectiveUserId, "sidebar-folders", []);
    } catch { return []; }
  });

  // Derived: folders excluding pinned/recent (for scope rendering)
  const sidebarFolders = allSidebarFolders.filter((f: any) => !["pinned", "recent"].includes(f.id));

  // Guard: track last serialized folders to prevent infinite event loops
  const lastFolderJsonRef = useRef("");

  // Listen for folder changes from Sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        if (detail?.folders) {
          const json = JSON.stringify(detail.folders);
          if (json === lastFolderJsonRef.current) return; // already in sync
          lastFolderJsonRef.current = json;
          setAllSidebarFolders(detail.folders);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("folders-changed", handler);
    return () => window.removeEventListener("folders-changed", handler);
  }, []);

  // Build dynamic scope list: base scopes + folder scopes
  const flattenSidebarFolders = (folders: SidebarFolder[], depth = 0): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const f of folders) {
      result.push({ id: f.id, name: f.name, depth });
      if (f.children) result.push(...flattenSidebarFolders(f.children, depth + 1));
    }
    return result;
  };
  const folderScopes = flattenSidebarFolders(sidebarFolders);

  // Separate "projects" folder children from other top-level folders
  const projectsFolder = sidebarFolders.find(f => f.id === "projects");
  const projectChildFolders = projectsFolder ? flattenSidebarFolders(projectsFolder.children || []) : [];
  const topLevelCustomFolders = sidebarFolders.filter(f => f.id !== "projects");
  const topLevelFolderScopes = flattenSidebarFolders(topLevelCustomFolders);

  // allScopes still includes all for pin filtering purposes
  const allScopes: PinScope[] = [...BASE_SCOPES, ...folderScopes.map(f => `folder:${f.id}`)];

  // Render order: global, project (with nested children), conversation, then top-level custom folders
  const renderScopes: { scope: PinScope; children?: { scope: PinScope; name: string; depth: number }[] }[] = [
    { scope: "global" },
    { scope: "project", children: projectChildFolders.map(f => ({ scope: `folder:${f.id}`, name: f.name, depth: f.depth })) },
    { scope: "conversation" },
    ...topLevelFolderScopes.map(f => ({ scope: `folder:${f.id}` })),
  ];
  // Set of scopes rendered as children of "project" — skip them in main loop
  const projectChildScopeSet = new Set(projectChildFolders.map(f => `folder:${f.id}`));

  // ── Folder drag-and-drop (for moving folders between project and top-level) ──
  const [dragFolderScope, setDragFolderScope] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const handleFolderScopeDragStart = useCallback((e: React.DragEvent, scope: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-folder-scope", scope);
    setDragFolderScope(scope);
  }, []);

  const handleFolderScopeDragOver = useCallback((e: React.DragEvent, targetScope: string) => {
    if (!dragFolderScope) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(targetScope);
  }, [dragFolderScope]);

  const handleFolderScopeDrop = useCallback((e: React.DragEvent, targetScope: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    if (!dragFolderScope || dragFolderScope === targetScope) { setDragFolderScope(null); return; }

    // Only folder scopes can be dragged
    if (!dragFolderScope.startsWith("folder:")) { setDragFolderScope(null); return; }
    const draggedFolderId = dragFolderScope.slice(7);
    // Don't move default folders
    if (["pinned", "recent", "projects"].includes(draggedFolderId)) { setDragFolderScope(null); return; }

    // Determine action: drop on "project" scope → move under "projects" folder
    // Drop on root area or another scope → move to top level
    const moveToProjects = targetScope === "project" || (targetScope.startsWith("folder:") && projectChildScopeSet.has(targetScope));
    const isCurrentlyUnderProjects = projectChildScopeSet.has(dragFolderScope);

    if (moveToProjects && isCurrentlyUnderProjects) { setDragFolderScope(null); return; } // already there
    if (!moveToProjects && !isCurrentlyUnderProjects) { setDragFolderScope(null); return; } // already top-level

    setAllSidebarFolders(prev => {
      // Find the folder to move
      const findFolder = (folders: SidebarFolder[], id: string): SidebarFolder | null => {
        for (const f of folders) {
          if (f.id === id) return f;
          const found = findFolder(f.children || [], id);
          if (found) return found;
        }
        return null;
      };
      const removeFolder = (folders: SidebarFolder[], id: string): SidebarFolder[] =>
        folders.filter(f => f.id !== id).map(f => ({ ...f, children: removeFolder(f.children || [], id) }));

      const folderToMove = findFolder(prev, draggedFolderId);
      if (!folderToMove) return prev;

      const cleaned = removeFolder(prev, draggedFolderId);

      if (moveToProjects) {
        // Add as child of "projects"
        return cleaned.map(f => {
          if (f.id === "projects") {
            return { ...f, children: [...(f.children || []), { ...folderToMove, parentId: "projects" }] };
          }
          return f;
        });
      } else {
        // Move to top level
        return [...cleaned, { ...folderToMove, parentId: undefined }];
      }
    });

    setDragFolderScope(null);

    toast.success(
      moveToProjects
        ? (lang === "en" ? "Folder moved to project" : "資料夾已移至專案區")
        : (lang === "en" ? "Folder moved out of project" : "資料夾已移出專案區")
    );
  }, [dragFolderScope, projectChildScopeSet, lang, user?.id]);

  const handleFolderScopeDragEnd = useCallback(() => {
    setDragFolderScope(null);
    setDragOverTarget(null);
  }, []);

  // Auto-select the most recently added pin on mount
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const loaded = loadUserData<PinnedItem[]>(effectiveUserId, "context-pins", []);
    return loaded.length > 0 ? loaded[loaded.length - 1].id : null;
  });

  // Persist pins on every change
  useEffect(() => {
    saveUserData(effectiveUserId, "context-pins", pins);
  }, [pins, effectiveUserId]);

  // Persist folder changes and sync back to Sidebar
  useEffect(() => {
    const json = JSON.stringify(allSidebarFolders);
    if (json === lastFolderJsonRef.current) return; // skip if no real change
    lastFolderJsonRef.current = json;
    saveUserData(effectiveUserId, "sidebar-folders", allSidebarFolders);
    window.dispatchEvent(new CustomEvent("context-folder-moved", { detail: { folders: allSidebarFolders } }));
  }, [allSidebarFolders, effectiveUserId]);

  // Listen for pin-added CustomEvents from ChatInterface
  useEffect(() => {
    const handler = (e: any) => {
      const newPin = e.detail as PinnedItem;
      // Deduplicate: if the pin is already in state (written to localStorage by ChatInterface), skip adding
      setPins((prev) => {
        if (prev.some((p) => p.id === newPin.id)) return prev;
        return [...prev, newPin];
      });
      setSelectedId(newPin.id);
      // Auto-expand the scope section the pin belongs to
      setCollapsedScopes((prev) => ({ ...prev, [newPin.scope]: false }));
      toast.success(
        lang === "en"
          ? `Pinned: "${newPin.title}"`
          : `\u5DF2\u91D8\u9078\uFF1A\u300C${newPin.title}\u300D`
      );
    };
    window.addEventListener("pin-added", handler);
    return () => window.removeEventListener("pin-added", handler);
  }, [lang]);

  const [collapsedScopes, setCollapsedScopes] = useState<Record<PinScope, boolean>>({
    global: false,
    project: false,
    conversation: false,
  });
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const selectedPin = pins.find((p) => p.id === selectedId) ?? null;
  const tokenCount = selectedPin ? countTokens(selectedPin.content) : 0;

  // ─── Handlers ────────────────────────────────────────────────────────────

  const toggleScope = useCallback((scope: PinScope) => {
    setCollapsedScopes((prev) => ({ ...prev, [scope]: !prev[scope] }));
  }, []);

  // Drag-and-drop reordering within the same scope
  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDragId(id);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || dragId;
    if (!sourceId || sourceId === targetId) { setDragId(null); setDragOverId(null); return; }
    setPins(prev => {
      const dragPin = prev.find(p => p.id === sourceId);
      const targetPin = prev.find(p => p.id === targetId);
      if (!dragPin || !targetPin || dragPin.scope !== targetPin.scope) return prev;
      const filtered = prev.filter(p => p.id !== sourceId);
      const targetIdx = filtered.findIndex(p => p.id === targetId);
      filtered.splice(targetIdx, 0, dragPin);
      return filtered;
    });
    setDragId(null);
    setDragOverId(null);
    toast.success(lang === "en" ? "Reordered" : "\u5DF2\u91CD\u65B0\u6392\u5E8F");
  }, [dragId, lang]);

  const togglePin = useCallback(
    (id: string) => {
      setPins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
      );
      const pin = pins.find((p) => p.id === id);
      if (pin) {
        toast(
          pin.enabled
            ? lang === "en"
              ? `"${pin.title}" disabled`
              : `\u300C${pin.title}\u300D\u5DF2\u505C\u7528`
            : lang === "en"
              ? `"${pin.title}" enabled`
              : `\u300C${pin.title}\u300D\u5DF2\u555F\u7528`
        );
      }
    },
    [pins, lang]
  );

  const removePin = useCallback(
    (id: string) => {
      const pin = pins.find((p) => p.id === id);
      setPins((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) setSelectedId(null);
      setDeleteConfirmId(null);
      if (pin) {
        toast(
          lang === "en"
            ? `"${pin.title}" removed`
            : `\u300C${pin.title}\u300D\u5DF2\u79FB\u9664`
        );
      }
    },
    [pins, selectedId, lang]
  );

  const addPin = useCallback(
    (scope: PinScope) => {
      const newPin: PinnedItem = {
        id: `pin-${Date.now()}`,
        scope,
        type: "text",
        title: lang === "en" ? "New Context" : "\u65B0\u589E\u4E0A\u4E0B\u6587",
        content: "",
        enabled: true,
        alwaysInclude: false,
        useAsPrompt: true,
        priority: 3,
      };
      setPins((prev) => [...prev, newPin]);
      setSelectedId(newPin.id);
      // Ensure the scope is expanded
      setCollapsedScopes((prev) => ({ ...prev, [scope]: false }));
      toast(lang === "en" ? "New pin added" : "\u5DF2\u65B0\u589E\u91D8\u9078\u9805\u76EE");
    },
    [lang]
  );

  const updateSelected = useCallback(
    (patch: Partial<PinnedItem>) => {
      if (!selectedId) return;
      setPins((prev) =>
        prev.map((p) => (p.id === selectedId ? { ...p, ...patch } : p))
      );
    },
    [selectedId]
  );

  const startEditTitle = useCallback(
    (id: string, currentTitle: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTitleDraft(currentTitle);
      setEditingTitleId(id);
    },
    []
  );

  const confirmTitle = useCallback(
    (id: string) => {
      setPins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, title: titleDraft } : p))
      );
      setEditingTitleId(null);
    },
    [titleDraft]
  );

  const [editingCondensed, setEditingCondensed] = useState(false);

  const condenseWithAI = useCallback(
    async (pinId: string) => {
      const pin = pins.find((p) => p.id === pinId);
      if (!pin || !pin.content.trim()) {
        toast.error(lang === "en" ? "No content to condense" : "沒有內容可以濃縮");
        return;
      }

      const allModels = getAllModels(settings.customModels);
      const model = allModels.find((m) => m.id === settings.selectedModelId);
      if (!model) {
        toast.error(lang === "en" ? "No model selected" : "未選擇模型");
        return;
      }

      const apiKey = getApiKey(model.providerId);
      if (!apiKey) {
        toast.error(
          lang === "en"
            ? "Please set an API key in Settings first"
            : "請先在設定中設定 API Key"
        );
        return;
      }

      setPins((prev) =>
        prev.map((p) => (p.id === pinId ? { ...p, isCondensing: true } : p))
      );

      const condensationPrompt =
        "Condense the following text into a concise summary preserving all key information. Respond with ONLY the condensed text, no explanation:\n\n" +
        pin.content;

      try {
        // Build request using the same logic as ChatInterface's callAI
        let endpoint: string;
        let headers: Record<string, string>;
        let body: unknown;

        switch (model.providerId) {
          case "anthropic": {
            endpoint = "https://api.anthropic.com/v1/messages";
            headers = {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
            };
            body = {
              model: model.id,
              system: "You are a concise summarizer.",
              messages: [{ role: "user", content: condensationPrompt }],
              max_tokens: 1024,
              temperature: 0.3,
            };
            break;
          }
          case "google": {
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`;
            headers = { "Content-Type": "application/json" };
            body = {
              contents: [{ role: "user", parts: [{ text: condensationPrompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
            };
            break;
          }
          case "openrouter": {
            endpoint = "https://openrouter.ai/api/v1/chat/completions";
            headers = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": window.location.origin,
              "X-OpenRouter-Title": "AI Workbench",
            };
            body = {
              model: model.id,
              messages: [
                { role: "system", content: "You are a concise summarizer." },
                { role: "user", content: condensationPrompt },
              ],
              temperature: 0.3,
              max_tokens: 1024,
            };
            break;
          }
          default: {
            // OpenAI-compatible (openai, deepseek, xai, meta/groq, mistral)
            const baseUrl =
              model.providerId === "deepseek"
                ? "https://api.deepseek.com"
                : model.providerId === "xai"
                  ? "https://api.x.ai"
                  : model.providerId === "meta"
                    ? "https://api.groq.com/openai"
                    : model.providerId === "mistral"
                      ? "https://api.mistral.ai"
                      : "https://api.openai.com";
            endpoint = `${baseUrl}/v1/chat/completions`;
            headers = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            };
            body = {
              model: model.id,
              messages: [
                { role: "system", content: "You are a concise summarizer." },
                { role: "user", content: condensationPrompt },
              ],
              temperature: 0.3,
              max_tokens: 1024,
            };
            break;
          }
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          if (res.status === 429) {
            throw new Error(lang === "en" ? "Rate limited. Please wait and try again." : "請求過於頻繁，請稍後再試。");
          }
          const errText = await res.text().catch(() => "");
          throw new Error(`API error (${res.status}): ${errText.slice(0, 150)}`);
        }

        const data = await res.json();
        let condensedText: string;

        if (model.providerId === "anthropic") {
          condensedText = data.content?.[0]?.text || "(No response)";
        } else if (model.providerId === "google") {
          condensedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "(No response)";
        } else {
          condensedText = data.choices?.[0]?.message?.content || "(No response)";
        }

        setPins((prev) =>
          prev.map((p) =>
            p.id === pinId
              ? { ...p, condensed: condensedText.trim(), isCondensing: false }
              : p
          )
        );
        setEditingCondensed(false);
        toast.success(lang === "en" ? "Content condensed successfully" : "內容已成功濃縮");
      } catch (err: any) {
        console.warn("[ContextPinning] Condense failed:", err);
        setPins((prev) =>
          prev.map((p) =>
            p.id === pinId ? { ...p, isCondensing: false } : p
          )
        );
        const msg = err?.message || String(err);
        toast.error(
          lang === "en"
            ? `Condense failed: ${msg.slice(0, 120)}`
            : `濃縮失敗：${msg.slice(0, 120)}`
        );
      }
    },
    [pins, settings, lang, getApiKey]
  );

  const handleDeleteClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (deleteConfirmId === id) {
        removePin(id);
      } else {
        setDeleteConfirmId(id);
        // Auto-reset after 3 seconds
        setTimeout(() => setDeleteConfirmId((prev) => (prev === id ? null : prev)), 3000);
      }
    },
    [deleteConfirmId, removePin]
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full bg-slate-950/60 backdrop-blur-xl rounded-2xl border border-white/[0.06] overflow-hidden">
      {/* ====== Left Sidebar: Scoped Pin List ====== */}
      <div className="w-[300px] shrink-0 border-r border-white/[0.06] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <Pin className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white/90">
            {lang === "en" ? "Pinned Context" : "\u91D8\u9078\u4E0A\u4E0B\u6587"}
          </span>
          <span className="ml-auto text-[11px] text-white/40 tabular-nums">
            {pins.filter((p) => p.enabled).length}/{pins.length}
          </span>
        </div>

        {/* Scope sections — hierarchical, matching Sidebar folder structure */}
        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {renderScopes.map((entry) => {
            const { scope, children: childFolderScopes } = entry;
            // Skip folder scopes that are rendered as children of "project"
            if (projectChildScopeSet.has(scope)) return null;

            const isFolderScope = scope.startsWith("folder:");
            const folderId = isFolderScope ? scope.slice(7) : null;
            const folderInfo = folderId ? folderScopes.find(f => f.id === folderId) : null;
            const meta = isFolderScope
              ? folderScopeMeta(folderInfo?.name || "Folder")
              : SCOPE_META[scope as keyof typeof SCOPE_META];
            const ScopeIcon = meta.icon;
            const scopePins = pins.filter((p) => p.scope === scope);
            const isCollapsed = collapsedScopes[scope];
            // Can drag folder scopes (not base scopes)
            const canDragFolder = isFolderScope && !["pinned", "recent", "projects"].includes(folderId || "");

            return (
              <div
                key={scope}
                className={cn(
                  "mb-1",
                  dragOverTarget === scope && dragFolderScope && "ring-1 ring-inset ring-cyan-500/40 rounded-lg bg-cyan-500/5"
                )}
                draggable={canDragFolder}
                onDragStart={canDragFolder ? (e) => handleFolderScopeDragStart(e, scope) : undefined}
                onDragEnd={canDragFolder ? handleFolderScopeDragEnd : undefined}
                onDragOver={(e) => {
                  handleFolderScopeDragOver(e, scope);
                  // Also allow pin drag-over on the scope area
                }}
                onDrop={(e) => {
                  if (dragFolderScope) {
                    handleFolderScopeDrop(e, scope);
                  }
                }}
              >
                {/* Section header */}
                <div
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 mx-1.5 rounded-lg transition-all duration-200 cursor-pointer",
                    "hover:bg-white/[0.04]",
                    meta.bg,
                    "border",
                    meta.border,
                    dragFolderScope === scope && "opacity-40"
                  )}
                  style={{ width: "calc(100% - 12px)" }}
                  onClick={() => toggleScope(scope)}
                >
                  {canDragFolder && (
                    <GripVertical className="w-3 h-3 text-white/15 shrink-0 cursor-grab" />
                  )}
                  {isCollapsed ? (
                    <ChevronRight className={cn("w-3.5 h-3.5", meta.accent)} />
                  ) : (
                    <ChevronDown className={cn("w-3.5 h-3.5", meta.accent)} />
                  )}
                  <ScopeIcon className={cn("w-4 h-4", meta.accent)} />
                  <span className={cn("text-xs font-semibold", meta.accent)}>
                    {lang === "en" ? meta.label.en : meta.label.zh}
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      meta.badge
                    )}
                  >
                    {scopePins.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addPin(scope);
                    }}
                    className={cn(
                      "p-0.5 rounded hover:bg-white/10 transition-colors",
                      meta.accent
                    )}
                    title={lang === "en" ? "Add pin" : "\u65B0\u589E\u91D8\u9078"}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Items */}
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300",
                    isCollapsed ? "max-h-0 opacity-0" : "max-h-[9999px] opacity-100"
                  )}
                >
                  {scopePins.length === 0 && !childFolderScopes?.length ? (
                    <div className="flex flex-col items-center justify-center py-6 px-4">
                      <p className="text-[11px] text-white/25 text-center">
                        {lang === "en"
                          ? "No pins in this scope. Click + to add one."
                          : "\u6B64\u7BC4\u570D\u5C1A\u7121\u91D8\u9078\u3002\u9EDE\u64CA + \u65B0\u589E\u4E00\u500B\u3002"}
                      </p>
                    </div>
                  ) : (
                    <>
                      {scopePins.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {scopePins.map((pin) => {
                            const typeMeta = TYPE_META[pin.type];
                            const isSelected = pin.id === selectedId;
                            const isEditingThisTitle = editingTitleId === pin.id;
                            const isDeleteConfirm = deleteConfirmId === pin.id;
                            const preview = pin.content
                              .split("\n")
                              .slice(0, 2)
                              .join(" ")
                              .slice(0, 55);

                            return (
                              <div
                                key={pin.id}
                                onClick={() => setSelectedId(pin.id)}
                                draggable
                                onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, pin.id); }}
                                onDragOver={(e) => { e.stopPropagation(); handleDragOver(e, pin.id); }}
                                onDrop={(e) => { e.stopPropagation(); handleDrop(e, pin.id); }}
                                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                                className={cn(
                                  "group relative mx-2.5 rounded-lg border-l-[3px] cursor-pointer transition-all duration-200",
                                  typeMeta.border,
                                  isSelected
                                    ? "bg-white/[0.08] shadow-[0_0_12px_rgba(255,255,255,0.05)] border-l-4"
                                    : "bg-white/[0.02] hover:bg-white/[0.05]",
                                  !pin.enabled && "opacity-40",
                                  dragOverId === pin.id && "border-t-2 border-t-blue-400/50",
                                  dragId === pin.id && "opacity-30"
                                )}
                              >
                                <div className="flex items-start gap-2 px-2.5 py-2">
                                  {/* Drag handle */}
                                  <GripVertical className="w-3.5 h-3.5 mt-0.5 text-white/15 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />

                                  {/* Type icon */}
                                  <span className="text-sm shrink-0 mt-px">
                                    {typeMeta.emoji}
                                  </span>

                                  {/* Title + preview */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      {isEditingThisTitle ? (
                                        <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                          <input
                                            autoFocus
                                            value={titleDraft}
                                            onChange={(e) => setTitleDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") confirmTitle(pin.id);
                                              if (e.key === "Escape") setEditingTitleId(null);
                                            }}
                                            className="flex-1 bg-white/[0.08] border border-white/15 rounded px-1.5 py-0.5 text-[12px] text-white/90 outline-none focus:border-blue-500/50 w-full min-w-0"
                                          />
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              confirmTitle(pin.id);
                                            }}
                                            className="p-0.5 text-emerald-400 hover:bg-emerald-500/15 rounded"
                                          >
                                            <Check className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="text-[12px] font-medium text-white/85 truncate">
                                            {pin.title}
                                          </span>
                                          {pin.alwaysInclude && (
                                            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                                          )}
                                        </>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-white/30 truncate mt-0.5 leading-relaxed">
                                      {preview ||
                                        (lang === "en" ? "(empty)" : "(\u7A7A\u767D)")}
                                    </p>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {/* Toggle */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePin(pin.id);
                                      }}
                                      className={cn(
                                        "p-1 rounded transition-colors",
                                        pin.enabled
                                          ? "text-blue-400 hover:bg-blue-500/20"
                                          : "text-white/25 hover:bg-white/10"
                                      )}
                                      title={
                                        pin.enabled
                                          ? lang === "en"
                                            ? "Disable"
                                            : "\u505C\u7528"
                                          : lang === "en"
                                            ? "Enable"
                                            : "\u555F\u7528"
                                      }
                                    >
                                      {pin.enabled ? (
                                        <Pin className="w-3 h-3" />
                                      ) : (
                                        <PinOff className="w-3 h-3" />
                                      )}
                                    </button>
                                    {/* Edit (opens editor) */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedId(pin.id);
                                      }}
                                      className="p-1 rounded text-white/25 hover:text-white/60 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                                      title={lang === "en" ? "Edit" : "\u7DE8\u8F2F"}
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    {/* Delete with confirm */}
                                    <button
                                      onClick={(e) => handleDeleteClick(pin.id, e)}
                                      className={cn(
                                        "p-1 rounded transition-all",
                                        isDeleteConfirm
                                          ? "text-red-400 bg-red-500/20 opacity-100"
                                          : "text-white/20 hover:text-red-400 hover:bg-red-500/15 opacity-0 group-hover:opacity-100"
                                      )}
                                      title={
                                        isDeleteConfirm
                                          ? lang === "en"
                                            ? "Click again to confirm"
                                            : "\u518D\u6B21\u9EDE\u64CA\u4EE5\u78BA\u8A8D"
                                          : lang === "en"
                                            ? "Delete"
                                            : "\u522A\u9664"
                                      }
                                    >
                                      {isDeleteConfirm ? (
                                        <Trash2 className="w-3 h-3" />
                                      ) : (
                                        <X className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ── Nested child folder scopes (under "project" section) ── */}
                      {childFolderScopes && childFolderScopes.length > 0 && (
                        <div className="mt-1 ml-3 space-y-1 border-l border-violet-500/15 pl-1">
                          {childFolderScopes.map((child) => {
                            const childMeta = folderScopeMeta(child.name);
                            const childPins = pins.filter((p) => p.scope === child.scope);
                            const childCollapsed = collapsedScopes[child.scope];
                            const canDragChild = !["pinned", "recent", "projects"].includes(child.scope.slice(7));

                            return (
                              <div
                                key={child.scope}
                                className={cn(
                                  dragOverTarget === child.scope && dragFolderScope && "ring-1 ring-inset ring-cyan-500/40 rounded-lg bg-cyan-500/5",
                                  dragFolderScope === child.scope && "opacity-40"
                                )}
                                draggable={canDragChild}
                                onDragStart={canDragChild ? (e) => handleFolderScopeDragStart(e, child.scope) : undefined}
                                onDragEnd={canDragChild ? handleFolderScopeDragEnd : undefined}
                                onDragOver={(e) => handleFolderScopeDragOver(e, child.scope)}
                                onDrop={(e) => { if (dragFolderScope) handleFolderScopeDrop(e, child.scope); }}
                              >
                                <div
                                  className={cn(
                                    "flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-md transition-all duration-200 cursor-pointer",
                                    "hover:bg-white/[0.04]",
                                    childMeta.bg,
                                    "border",
                                    childMeta.border
                                  )}
                                  style={{ width: "calc(100% - 8px)", paddingLeft: `${(child.depth + 1) * 8}px` }}
                                  onClick={() => toggleScope(child.scope)}
                                >
                                  {canDragChild && (
                                    <GripVertical className="w-3 h-3 text-white/15 shrink-0 cursor-grab" />
                                  )}
                                  {childCollapsed ? (
                                    <ChevronRight className={cn("w-3 h-3", childMeta.accent)} />
                                  ) : (
                                    <ChevronDown className={cn("w-3 h-3", childMeta.accent)} />
                                  )}
                                  <Folder className={cn("w-3.5 h-3.5", childMeta.accent)} />
                                  <span className={cn("text-[11px] font-medium", childMeta.accent)}>
                                    {child.name}
                                  </span>
                                  <span className={cn("ml-auto text-[9px] font-medium px-1 py-0.5 rounded-full", childMeta.badge)}>
                                    {childPins.length}
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); addPin(child.scope); }}
                                    className={cn("p-0.5 rounded hover:bg-white/10 transition-colors", childMeta.accent)}
                                    title={lang === "en" ? "Add pin" : "\u65B0\u589E\u91D8\u9078"}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                                {!childCollapsed && childPins.length > 0 && (
                                  <div className="mt-0.5 space-y-0.5 ml-2">
                                    {childPins.map((pin) => {
                                      const typeMeta = TYPE_META[pin.type];
                                      const isSelected = pin.id === selectedId;
                                      const preview = pin.content.split("\n").slice(0, 2).join(" ").slice(0, 40);
                                      return (
                                        <div
                                          key={pin.id}
                                          onClick={() => setSelectedId(pin.id)}
                                          className={cn(
                                            "group relative mx-1.5 rounded-md border-l-2 cursor-pointer transition-all duration-200 px-2 py-1.5",
                                            typeMeta.border,
                                            isSelected ? "bg-white/[0.08]" : "bg-white/[0.02] hover:bg-white/[0.05]",
                                            !pin.enabled && "opacity-40"
                                          )}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] shrink-0">{typeMeta.emoji}</span>
                                            <span className="text-[11px] font-medium text-white/80 truncate flex-1">{pin.title}</span>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); togglePin(pin.id); }}
                                              className={cn("p-0.5 rounded", pin.enabled ? "text-blue-400" : "text-white/25")}
                                            >
                                              {pin.enabled ? <Pin className="w-2.5 h-2.5" /> : <PinOff className="w-2.5 h-2.5" />}
                                            </button>
                                          </div>
                                          {preview && (
                                            <p className="text-[9px] text-white/25 truncate mt-0.5">{preview}</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Drop zone: drag a folder here to move it to top level (out of projects) */}
          {dragFolderScope && (
            <div
              className={cn(
                "mx-1.5 mt-2 py-3 rounded-lg border-2 border-dashed transition-all duration-200 flex items-center justify-center gap-2",
                dragOverTarget === "__root__"
                  ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-300"
                  : "border-white/10 bg-white/[0.02] text-white/30"
              )}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverTarget("__root__"); }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverTarget(null);
                if (!dragFolderScope) return;
                const draggedFolderId = dragFolderScope.slice(7);
                if (["pinned", "recent", "projects"].includes(draggedFolderId)) { setDragFolderScope(null); return; }
                // Move to top level
                setAllSidebarFolders(prev => {
                  const findFolder = (folders: SidebarFolder[], id: string): SidebarFolder | null => {
                    for (const f of folders) {
                      if (f.id === id) return f;
                      const found = findFolder(f.children || [], id);
                      if (found) return found;
                    }
                    return null;
                  };
                  const removeFolder = (folders: SidebarFolder[], id: string): SidebarFolder[] =>
                    folders.filter(f => f.id !== id).map(f => ({ ...f, children: removeFolder(f.children || [], id) }));
                  const folderToMove = findFolder(prev, draggedFolderId);
                  if (!folderToMove) return prev;
                  const cleaned = removeFolder(prev, draggedFolderId);
                  return [...cleaned, { ...folderToMove, parentId: undefined }];
                });
                setDragFolderScope(null);
                toast.success(lang === "en" ? "Folder moved to top level" : "資料夾已移至最上層");
              }}
            >
              <FolderOpen className="w-4 h-4" />
              <span className="text-[11px] font-medium">
                {lang === "en" ? "Drop here to move to top level" : "拖放到此處移至最上層"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ====== Right Editor Panel ====== */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedPin ? (
          <>
            {/* Editor Header */}
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-wrap">
              {/* Scope badge / dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setScopeDropdownOpen(!scopeDropdownOpen);
                    setTypeDropdownOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                    getScopeMeta(selectedPin.scope, folderScopes).border,
                    getScopeMeta(selectedPin.scope, folderScopes).bg,
                    getScopeMeta(selectedPin.scope, folderScopes).accent,
                    "hover:brightness-110"
                  )}
                >
                  <span>{getScopeMeta(selectedPin.scope, folderScopes).emoji}</span>
                  <span>
                    {lang === "en"
                      ? getScopeMeta(selectedPin.scope, folderScopes).label.en
                      : getScopeMeta(selectedPin.scope, folderScopes).label.zh}
                  </span>
                  <ChevronDown className="w-3 h-3 text-white/40" />
                </button>
                {scopeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 w-44 bg-slate-900 border border-white/10 rounded-xl shadow-2xl py-1 backdrop-blur-xl">
                    {allScopes.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          updateSelected({ scope: s });
                          setScopeDropdownOpen(false);
                          setCollapsedScopes((prev) => ({
                            ...prev,
                            [s]: false,
                          }));
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/[0.06] transition-colors",
                          selectedPin.scope === s
                            ? "text-white/90"
                            : "text-white/50"
                        )}
                      >
                        <span>{getScopeMeta(s, folderScopes).emoji}</span>
                        <span>
                          {lang === "en"
                            ? getScopeMeta(s, folderScopes).label.en
                            : getScopeMeta(s, folderScopes).label.zh}
                        </span>
                        {selectedPin.scope === s && (
                          <Check className="w-3 h-3 ml-auto text-blue-400" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Type selector dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setTypeDropdownOpen(!typeDropdownOpen);
                    setScopeDropdownOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs transition-colors",
                    TYPE_META[selectedPin.type].color,
                    "hover:bg-white/[0.05]"
                  )}
                >
                  <span>{TYPE_META[selectedPin.type].emoji}</span>
                  <span>
                    {lang === "en"
                      ? TYPE_META[selectedPin.type].label.en
                      : TYPE_META[selectedPin.type].label.zh}
                  </span>
                  <ChevronDown className="w-3 h-3 text-white/40" />
                </button>
                {typeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 w-40 bg-slate-900 border border-white/10 rounded-xl shadow-2xl py-1 backdrop-blur-xl">
                    {(Object.keys(TYPE_META) as PinType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          updateSelected({ type: t });
                          setTypeDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/[0.06] transition-colors",
                          selectedPin.type === t
                            ? "text-white/90"
                            : "text-white/50"
                        )}
                      >
                        <span>{TYPE_META[t].emoji}</span>
                        <span>
                          {lang === "en"
                            ? TYPE_META[t].label.en
                            : TYPE_META[t].label.zh}
                        </span>
                        {selectedPin.type === t && (
                          <Check className="w-3 h-3 ml-auto text-blue-400" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Title input */}
              <div className="flex-1 min-w-[120px]">
                <input
                  value={selectedPin.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-blue-500/40 transition-colors placeholder:text-white/20"
                  placeholder={lang === "en" ? "Title..." : "\u6A19\u984C..."}
                />
              </div>

              {/* Token count */}
              <div
                className={cn(
                  "flex items-center gap-1.5 text-[11px] tabular-nums shrink-0",
                  tokenTextColor(tokenCount)
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>~{tokenCount} tokens</span>
              </div>
            </div>

            {/* Content editor */}
            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              <textarea
                value={selectedPin.content}
                onChange={(e) => updateSelected({ content: e.target.value })}
                placeholder={
                  lang === "en"
                    ? "Enter context content..."
                    : "\u8F38\u5165\u4E0A\u4E0B\u6587\u5167\u5BB9..."
                }
                className={cn(
                  "w-full min-h-[200px] bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/85 leading-relaxed resize-none outline-none focus:border-blue-500/30 focus:bg-white/[0.04] transition-all placeholder:text-white/20",
                  selectedPin.type === "code" || selectedPin.type === "json"
                    ? "font-mono"
                    : "font-sans"
                )}
              />

              {/* Condense with AI */}
              <div className="space-y-2">
                <button
                  onClick={() => condenseWithAI(selectedPin.id)}
                  disabled={selectedPin.isCondensing || !selectedPin.content.trim()}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                    selectedPin.isCondensing
                      ? "bg-violet-600/10 text-violet-300/60 border-violet-500/20 cursor-wait"
                      : "bg-violet-600/10 text-violet-300 border-violet-500/20 hover:bg-violet-600/20 disabled:opacity-30 disabled:cursor-not-allowed"
                  )}
                >
                  {selectedPin.isCondensing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  {lang === "en" ? "Condense with AI" : "\u7528 AI \u6FC3\u7E2E"}
                </button>

                {selectedPin.condensed && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-violet-400 font-medium">
                        {lang === "en" ? "Condensed version" : "\u6FC3\u7E2E\u7248\u672C"}
                        <span className="text-white/30 ml-2">
                          ~{countTokens(selectedPin.condensed)} tokens
                        </span>
                      </span>
                      <button
                        onClick={() => setEditingCondensed((prev) => !prev)}
                        className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
                      >
                        {editingCondensed
                          ? lang === "en" ? "Done" : "\u5B8C\u6210"
                          : lang === "en" ? "Edit" : "\u7DE8\u8F2F"}
                      </button>
                    </div>
                    {editingCondensed ? (
                      <textarea
                        value={selectedPin.condensed}
                        onChange={(e) => updateSelected({ condensed: e.target.value })}
                        className="w-full min-h-[80px] bg-violet-500/[0.05] border border-violet-500/20 rounded-lg px-3 py-2 text-xs text-white/80 leading-relaxed resize-none outline-none focus:border-violet-500/40 transition-all"
                      />
                    ) : (
                      <div className="bg-violet-500/[0.05] border border-violet-500/15 rounded-lg px-3 py-2 text-xs text-white/60 leading-relaxed whitespace-pre-wrap">
                        {selectedPin.condensed}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom bar: token bar + settings + actions */}
            <div className="px-5 py-3 border-t border-white/[0.06] space-y-3">
              {/* Token usage bar */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/40 w-14 shrink-0">
                  {lang === "en" ? "Tokens" : "Token \u6578"}
                </span>
                <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      tokenBarColor(tokenCount)
                    )}
                    style={{
                      width: `${Math.min((tokenCount / 1500) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px] tabular-nums w-16 text-right",
                    tokenTextColor(tokenCount)
                  )}
                >
                  {tokenCount} / 1500
                </span>
              </div>

              {/* Settings row */}
              <div className="flex items-center gap-6 flex-wrap">
                {/* Always include checkbox */}
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() =>
                      updateSelected({
                        alwaysInclude: !selectedPin.alwaysInclude,
                      })
                    }
                    className={cn(
                      "w-8 h-[18px] rounded-full relative transition-colors duration-200 cursor-pointer",
                      selectedPin.alwaysInclude ? "bg-blue-500" : "bg-white/10"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200",
                        selectedPin.alwaysInclude
                          ? "translate-x-[16px]"
                          : "translate-x-[2px]"
                      )}
                    />
                  </div>
                  <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
                    {lang === "en" ? "Always include" : "\u7E3D\u662F\u5305\u542B"}
                  </span>
                </label>

                {/* Use as prompt toggle */}
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() =>
                      updateSelected({
                        useAsPrompt: !selectedPin.useAsPrompt,
                      })
                    }
                    className={cn(
                      "w-8 h-[18px] rounded-full relative transition-colors duration-200 cursor-pointer",
                      selectedPin.useAsPrompt ? "bg-violet-500" : "bg-white/10"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200",
                        selectedPin.useAsPrompt
                          ? "translate-x-[16px]"
                          : "translate-x-[2px]"
                      )}
                    />
                  </div>
                  <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
                    {lang === "en" ? "Inject into AI prompt" : "注入 AI 提示詞"}
                  </span>
                  {!selectedPin.useAsPrompt && (
                    <span className="text-[10px] text-amber-400/60">
                      ({lang === "en" ? "Save only" : "僅保存"})
                    </span>
                  )}
                </label>

                {/* Priority slider */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">
                    {lang === "en" ? "Priority" : "\u512A\u5148\u9806\u5E8F"}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={selectedPin.priority}
                    onChange={(e) =>
                      updateSelected({ priority: Number(e.target.value) })
                    }
                    className="w-24 h-1 accent-blue-500 cursor-pointer"
                  />
                  <span className="text-xs text-white/60 tabular-nums w-4 text-center">
                    {selectedPin.priority}
                  </span>
                </div>

                {/* Save / Cancel (visual feedback) */}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setSelectedId(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.06] transition-all"
                  >
                    <X className="w-3 h-3" />
                    {lang === "en" ? "Close" : "\u95DC\u9589"}
                  </button>
                  <button
                    onClick={() => {
                      toast(
                        lang === "en"
                          ? "Changes saved"
                          : "\u8B8A\u66F4\u5DF2\u5132\u5B58"
                      );
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all"
                  >
                    <Save className="w-3 h-3" />
                    {lang === "en" ? "Save" : "\u5132\u5B58"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-white/25 gap-3">
            <Pin className="w-10 h-10" />
            <p className="text-sm">
              {lang === "en"
                ? "Select a pinned context to edit"
                : "\u9078\u64C7\u4E00\u500B\u91D8\u9078\u9805\u76EE\u4EE5\u7DE8\u8F2F"}
            </p>
            <ChevronRight className="w-4 h-4 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
