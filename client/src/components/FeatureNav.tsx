/**
 * FeatureNav — Tab navigation between workspace features
 * Core: Chat, Artifacts, Memory Map, Widgets
 * Advanced: Task DAG, Branch, Context Pinning, Semantic Search
 */
import { cn } from "@/lib/utils";
import {
  MessageSquare, Code2, Zap, GitBranch, Pin, Search,
  Network
} from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

export type FeatureTab =
  | "chat" | "artifacts" | "memory" | "widgets"
  | "dag" | "branch" | "pinning" | "search";

interface FeatureNavProps {
  active: FeatureTab;
  onChange: (tab: FeatureTab) => void;
}

export default function FeatureNav({ active, onChange }: FeatureNavProps) {
  const { settings } = useSettings();
  const en = settings.language === "en";

  const tabs: { id: FeatureTab; label: string; icon: React.ReactNode; group?: "core" | "advanced" }[] = [
    { id: "chat", label: en ? "Chat" : "對話介面", icon: <MessageSquare size={13} />, group: "core" },
    { id: "artifacts", label: "Artifacts", icon: <Code2 size={13} />, group: "core" },
    { id: "dag", label: en ? "Task DAG" : "任務圖", icon: <Network size={13} />, group: "advanced" },
    { id: "branch", label: en ? "Branch" : "分支", icon: <GitBranch size={13} />, group: "advanced" },
    { id: "pinning", label: en ? "Context Pin" : "上下文釘選", icon: <Pin size={13} />, group: "advanced" },
    { id: "search", label: en ? "Semantic Search" : "語義搜尋", icon: <Search size={13} />, group: "advanced" },
    { id: "widgets", label: "Widgets", icon: <Zap size={13} />, group: "core" },
  ];

  return (
    <div className="flex items-center gap-1 px-2 sm:px-4 py-1.5 sm:py-2 border-b border-white/[0.06] bg-white/2 shrink-0 overflow-x-auto scrollbar-none">
      {tabs.map((tab, i) => {
        // Add separator before advanced group
        const prevTab = i > 0 ? tabs[i - 1] : null;
        const showSep = prevTab && prevTab.group === "core" && tab.group === "advanced";
        return (
          <div key={tab.id} className="flex items-center gap-1 shrink-0">
            {showSep && <div className="w-px h-4 bg-white/10 mx-1" />}
            <button
              onClick={() => onChange(tab.id)}
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all duration-150 whitespace-nowrap",
                active === tab.id
                  ? tab.group === "advanced"
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/20"
                    : "bg-blue-600/20 text-blue-300 border border-blue-500/20"
                  : "text-white/40 hover:text-white/65 hover:bg-white/5 border border-transparent"
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          </div>
        );
      })}
      <div className="flex-1" />
    </div>
  );
}
