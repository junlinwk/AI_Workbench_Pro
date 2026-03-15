/**
 * WorkbenchPage — Void Glass Design System
 * Main 3-column layout: Sidebar + Chat + Artifacts
 * Integrates ModelSwitcher, ChatInterface, ArtifactsPanel, FeatureNav
 */
import { useState } from "react";
import {
  Brain, Settings, Bell, PanelRight, PanelRightClose, Globe, Sparkles
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import ModelSwitcher from "@/components/ModelSwitcher";
import ChatInterface from "@/components/ChatInterface";
import ArtifactsPanel from "@/components/ArtifactsPanel";
import FeatureNav, { FeatureTab } from "@/components/FeatureNav";
import WidgetsShowcase from "@/components/WidgetsShowcase";

export default function WorkbenchPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(true);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [activeFeature, setActiveFeature] = useState<FeatureTab>("chat");

  const handleFeatureChange = (tab: FeatureTab) => {
    setActiveFeature(tab);
    if (tab === "artifacts") {
      setArtifactsOpen(true);
    } else if (tab === "memory") {
      // Navigate to memory page
      window.location.href = "/memory";
    }
  };

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ background: "oklch(0.09 0.012 265)" }}
    >
      {/* Background subtle gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 20% 0%, oklch(0.62 0.22 255 / 6%) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 100%, oklch(0.55 0.25 290 / 5%) 0%, transparent 60%)
          `,
        }}
      />

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
      />

      {/* Main Area */}
      <div className="flex flex-col flex-1 min-w-0 relative z-10">
        {/* Top Header Bar */}
        <header className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] bg-white/2 backdrop-blur-sm shrink-0">
          {/* Model Switcher */}
          <ModelSwitcher />

          {/* Web Search Toggle */}
          <button
            onClick={() => setWebSearchEnabled(prev => !prev)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border",
              webSearchEnabled
                ? "bg-blue-600/15 text-blue-300 border-blue-500/25 hover:bg-blue-600/20"
                : "bg-white/5 text-white/40 border-white/10 hover:bg-white/8 hover:text-white/60"
            )}
          >
            <Globe size={12} />
            <span>聯網搜尋</span>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors",
              webSearchEnabled ? "bg-blue-400 pulse-indicator" : "bg-white/20"
            )} />
          </button>

          <div className="flex-1" />

          {/* Right Controls */}
          <div className="flex items-center gap-1">
            {/* Memory Map Link */}
            <Link href="/memory">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-violet-300 hover:bg-violet-600/10 border border-transparent hover:border-violet-500/20 transition-all duration-150">
                <Brain size={13} />
                <span>記憶圖譜</span>
              </button>
            </Link>

            {/* Artifacts Toggle */}
            <button
              onClick={() => setArtifactsOpen(prev => !prev)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 border",
                artifactsOpen
                  ? "bg-violet-600/15 text-violet-300 border-violet-500/25"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5 border-transparent"
              )}
            >
              {artifactsOpen ? <PanelRightClose size={13} /> : <PanelRight size={13} />}
              <span>Artifacts</span>
            </button>

            <div className="w-px h-4 bg-white/10 mx-1" />

            <button
              onClick={() => toast.info("通知功能即將推出")}
              className="p-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <Bell size={15} />
            </button>
            <button
              onClick={() => toast.info("設定功能即將推出")}
              className="p-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <Settings size={15} />
            </button>
          </div>
        </header>

        {/* Feature Navigation */}
        <FeatureNav active={activeFeature} onChange={handleFeatureChange} />

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Main Panel */}
          <div className="flex flex-col flex-1 min-w-0">
            {activeFeature === "widgets" ? (
              <WidgetsShowcase />
            ) : (
              <ChatInterface onArtifactOpen={() => { setArtifactsOpen(true); setActiveFeature("artifacts"); }} />
            )}
          </div>

          {/* Artifacts Panel */}
          {artifactsOpen && (activeFeature === "chat" || activeFeature === "artifacts") && (
            <div className="w-[420px] shrink-0 flex flex-col min-h-0 transition-all duration-300">
              <ArtifactsPanel onClose={() => setArtifactsOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
