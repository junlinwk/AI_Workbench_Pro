/**
 * FeatureNav — Quick navigation between feature demos
 * Shows tabs for switching between different AI Workbench features
 */
import { cn } from "@/lib/utils";
import { MessageSquare, Code2, Brain, Zap } from "lucide-react";

export type FeatureTab = "chat" | "artifacts" | "memory" | "widgets";

interface FeatureNavProps {
  active: FeatureTab;
  onChange: (tab: FeatureTab) => void;
}

const TABS: { id: FeatureTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "chat", label: "對話介面", icon: <MessageSquare size={13} />, desc: "核心聊天功能" },
  { id: "artifacts", label: "Artifacts", icon: <Code2 size={13} />, desc: "程式碼與預覽" },
  { id: "memory", label: "記憶圖譜", icon: <Brain size={13} />, desc: "知識視覺化" },
  { id: "widgets", label: "互動 Widget", icon: <Zap size={13} />, desc: "嵌入式微應用" },
];

export default function FeatureNav({ active, onChange }: FeatureNavProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] bg-white/2 shrink-0">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
            active === tab.id
              ? "bg-blue-600/20 text-blue-300 border border-blue-500/20"
              : "text-white/40 hover:text-white/65 hover:bg-white/5 border border-transparent"
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
      <div className="flex-1" />
      <span className="text-[10px] text-white/20">功能展示模式</span>
    </div>
  );
}
