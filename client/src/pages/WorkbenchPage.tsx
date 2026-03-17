/**
 * WorkbenchPage — Main application layout
 * Production-ready: no demo data, per-user state, real API integration
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain, Settings, Bell, Globe, Menu,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { t } from "@/i18n";
import { loadUserData, saveUserData } from "@/lib/storage";
import Sidebar from "@/components/Sidebar";
import ModelSwitcher from "@/components/ModelSwitcher";
import ChatInterface from "@/components/ChatInterface";
import ArtifactsPanel from "@/components/ArtifactsPanel";
import FeatureNav, { FeatureTab } from "@/components/FeatureNav";
import WidgetsShowcase from "@/components/WidgetsShowcase";
import SettingsDialog from "@/components/SettingsDialog";
import NotificationPanel from "@/components/NotificationPanel";
import TaskDAG from "@/components/TaskDAG";
import ConversationBranch from "@/components/ConversationBranch";
import ContextPinning from "@/components/ContextPinning";
import SemanticSearch from "@/components/SemanticSearch";
import Notepad from "@/components/Notepad";

export default function WorkbenchPage() {
  const { settings, updateSetting } = useSettings();
  const { user } = useAuth();
  const lang = settings.language;
  const userId = user?.id || "anon";

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState<FeatureTab>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Resizable artifacts panel
  const [artifactsWidth, setArtifactsWidth] = useState(420);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(420);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = artifactsWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startXRef.current - ev.clientX; // dragging left = wider
      const newWidth = Math.min(Math.max(startWidthRef.current + delta, 280), 900);
      setArtifactsWidth(newWidth);
    };
    const onUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [artifactsWidth]);

  // Active folder context for prompt injection
  const [activeFolderPrompt, setActiveFolderPrompt] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Conversation management — persisted per user
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    return loadUserData(userId, "active-conversation", `chat-${Date.now()}`);
  });

  useEffect(() => {
    saveUserData(userId, "active-conversation", activeConversationId);
  }, [activeConversationId, userId]);

  // Auto-open Artifacts panel when code blocks are detected in AI responses
  useEffect(() => {
    const handler = () => setArtifactsOpen(true);
    window.addEventListener("artifacts-open", handler);
    return () => window.removeEventListener("artifacts-open", handler);
  }, []);

  // Listen for feature-switch events (e.g. from Pin/Branch buttons)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.feature) {
        setActiveFeature(detail.feature as FeatureTab);
      }
    };
    window.addEventListener("feature-switch", handler);
    return () => window.removeEventListener("feature-switch", handler);
  }, []);

  const handleFeatureChange = (tab: FeatureTab) => {
    setActiveFeature(tab);
    if (tab === "artifacts") setArtifactsOpen(true);
  };

  const handleNewChat = () => {
    const id = `chat-${Date.now()}`;
    setActiveConversationId(id);
    setActiveFeature("chat");
  };

  const handleSelectChat = (chatId: string) => {
    setActiveConversationId(chatId);
    setActiveFeature("chat");
  };

  const showArtifacts = artifactsOpen && (activeFeature === "chat" || activeFeature === "artifacts" || activeFeature === "widgets");

  const renderFeatureContent = () => {
    switch (activeFeature) {
      case "widgets": return <WidgetsShowcase />;
      case "dag": return <TaskDAG />;
      case "branch": return <ConversationBranch conversationId={activeConversationId} />;
      case "pinning": return <ContextPinning />;
      case "search": return <SemanticSearch />;
      default:
        return (
          <ChatInterface
            key={activeConversationId}
            conversationId={activeConversationId}
            onArtifactOpen={() => { setArtifactsOpen(true); setActiveFeature("artifacts"); }}
            folderPrompt={activeFolderPrompt}
          />
        );
    }
  };

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--color-background, oklch(0.09 0.012 265))" }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `
          radial-gradient(ellipse 80% 50% at 20% 0%, oklch(0.62 0.22 255 / 6%) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at 80% 100%, oklch(0.55 0.25 290 / 5%) 0%, transparent 60%)
        `,
      }} />

      {/* Sidebar - overlay on mobile, inline on desktop */}
      {isMobile ? (
        <>
          {!sidebarCollapsed && (
            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarCollapsed(true)} />
          )}
          <div className={cn(
            "fixed left-0 top-0 bottom-0 z-50 w-72 transition-transform duration-300",
            sidebarCollapsed ? "-translate-x-full" : "translate-x-0"
          )}>
            <Sidebar
              collapsed={false}
              onToggle={() => setSidebarCollapsed(true)}
              onNewChat={handleNewChat}
              onSelectChat={(chatId) => { handleSelectChat(chatId); setSidebarCollapsed(true); }}
              activeConversationId={activeConversationId}
              onOpenSettings={() => { setSettingsOpen(true); setSidebarCollapsed(true); }}
              onFolderContext={(folderId, folderPrompt) => {
                setActiveFolderId(folderId);
                setActiveFolderPrompt(folderPrompt);
              }}
            />
          </div>
        </>
      ) : (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(prev => !prev)}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          activeConversationId={activeConversationId}
          onOpenSettings={() => setSettingsOpen(true)}
          onFolderContext={(folderId, folderPrompt) => {
            setActiveFolderId(folderId);
            setActiveFolderPrompt(folderPrompt);
          }}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 relative z-10">
        <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-12 sm:h-14 border-b border-white/[0.06] bg-white/2 backdrop-blur-sm shrink-0">
          {isMobile && (
            <button
              onClick={() => setSidebarCollapsed(prev => !prev)}
              className="p-2 rounded-xl text-white/50 hover:text-white/80 hover:bg-white/5"
            >
              <Menu size={18} />
            </button>
          )}

          <ModelSwitcher onOpenSettings={() => setSettingsOpen(true)} />

          {!isMobile && (
            <button
              onClick={() => {
                const next = !settings.webSearchEnabled;
                updateSetting("webSearchEnabled", next);
                if (next) {
                  toast.info(
                    lang === "en"
                      ? "🌐 Web Search ON — AI will search the web for relevant info. This may use extra tokens."
                      : "🌐 連網搜尋已開啟 — AI 將上網搜尋相關資料，這可能會消耗較多 Token。",
                    { duration: 4000 }
                  );
                } else {
                  toast(
                    lang === "en"
                      ? "Web Search OFF"
                      : "連網搜尋已關閉",
                    { duration: 2000 }
                  );
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border",
                settings.webSearchEnabled
                  ? "bg-blue-600/15 text-blue-300 border-blue-500/25 hover:bg-blue-600/20"
                  : "bg-white/5 text-white/40 border-white/10 hover:bg-white/8 hover:text-white/60"
              )}
            >
              <Globe size={12} />
              <span>{t("header.webSearch", lang)}</span>
              <div className={cn("w-1.5 h-1.5 rounded-full transition-colors", settings.webSearchEnabled ? "bg-blue-400 pulse-indicator" : "bg-white/20")} />
            </button>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            {!isMobile && (
              <Link href="/memory">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-violet-300 hover:bg-violet-600/10 border border-transparent hover:border-violet-500/20 transition-all duration-150">
                  <Brain size={13} />
                  <span>{t("header.memoryMap", lang)}</span>
                </button>
              </Link>
            )}

            {!isMobile && <div className="w-px h-4 bg-white/10 mx-1" />}

            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(prev => !prev)}
                className={cn("p-2 rounded-xl transition-colors", notificationsOpen ? "text-blue-300 bg-blue-600/15" : "text-white/30 hover:text-white/60 hover:bg-white/5")}
              >
                <Bell size={15} />
              </button>
              {notificationsOpen && <NotificationPanel onClose={() => setNotificationsOpen(false)} />}
            </div>

            <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
              <Settings size={15} />
            </button>
          </div>
        </header>

        <FeatureNav active={activeFeature} onChange={handleFeatureChange} />

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex flex-col flex-1 min-w-0">
            {renderFeatureContent()}
          </div>
          {showArtifacts && !isMobile && (
            <div className="shrink-0 flex min-h-0 relative" style={{ width: artifactsWidth }}>
              {/* Resize handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group hover:bg-blue-500/30 active:bg-blue-500/40 transition-colors"
                onMouseDown={handleResizeStart}
              >
                <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-white/10 group-hover:bg-blue-400/60 transition-colors" />
              </div>
              <div className="flex flex-col flex-1 min-w-0 pl-1.5">
                <ArtifactsPanel onClose={() => setArtifactsOpen(false)} source={activeFeature === "widgets" ? "widget" : "chat"} />
              </div>
            </div>
          )}
        </div>

        {/* Artifacts full-screen overlay on mobile */}
        {showArtifacts && isMobile && (
          <div className="fixed inset-0 z-40 bg-[oklch(0.10_0.015_265)]">
            <ArtifactsPanel onClose={() => setArtifactsOpen(false)} source={activeFeature === "widgets" ? "widget" : "chat"} />
          </div>
        )}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Notepad />
    </div>
  );
}
