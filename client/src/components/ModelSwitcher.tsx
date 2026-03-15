/**
 * ModelSwitcher Component — Void Glass Design System
 * Premium model selector with glassmorphism dropdown, Apple-inspired UI
 */
import { useState } from "react";
import { ChevronDown, Star, Zap, FlaskConical, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Model {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  speed: number;
  intelligence: number;
}

const MODELS: Model[] = [
  {
    id: "pro",
    name: "Nexus Pro",
    shortName: "Pro",
    description: "最強大的複雜任務處理能力",
    icon: <Star size={14} className="text-yellow-400" />,
    badge: "推薦",
    badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    speed: 2,
    intelligence: 5,
  },
  {
    id: "flash",
    name: "Nexus Flash",
    shortName: "Flash",
    description: "最快速的日常編碼與問答",
    icon: <Zap size={14} className="text-blue-400" />,
    badge: "最快",
    badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    speed: 5,
    intelligence: 3,
  },
  {
    id: "research",
    name: "Nexus Research",
    shortName: "Research",
    description: "深度研究與多步驟推理",
    icon: <FlaskConical size={14} className="text-violet-400" />,
    badge: "New",
    badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    speed: 1,
    intelligence: 5,
  },
];

interface ModelSwitcherProps {
  className?: string;
}

export default function ModelSwitcher({ className }: ModelSwitcherProps) {
  const [selectedModel, setSelectedModel] = useState<Model>(MODELS[1]);
  const [open, setOpen] = useState(false);

  const handleSelect = (model: Model) => {
    setSelectedModel(model);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-200",
          "bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/15",
          "backdrop-blur-sm text-white/80 hover:text-white",
          open && "bg-white/8 border-white/15"
        )}
      >
        <div className="flex items-center gap-1.5">
          {selectedModel.icon}
          <span className="text-sm font-medium">{selectedModel.name}</span>
        </div>
        {selectedModel.badge && (
          <span className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-md border",
            selectedModel.badgeColor
          )}>
            {selectedModel.badge}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn("text-white/40 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Menu */}
          <div className={cn(
            "absolute top-full left-0 mt-2 w-72 z-50",
            "rounded-2xl border border-white/10 overflow-hidden",
            "bg-[oklch(0.12_0.015_265)] backdrop-blur-2xl",
            "shadow-2xl shadow-black/60",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
          )}>
            <div className="p-2 space-y-1">
              {MODELS.map(model => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-xl transition-all duration-150 text-left",
                    selectedModel.id === model.id
                      ? "bg-blue-600/15 border border-blue-500/20"
                      : "hover:bg-white/5 border border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    selectedModel.id === model.id ? "bg-white/10" : "bg-white/5"
                  )}>
                    {model.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        "text-sm font-semibold",
                        selectedModel.id === model.id ? "text-white" : "text-white/80"
                      )}>
                        {model.name}
                      </span>
                      {model.badge && (
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-md border",
                          model.badgeColor
                        )}>
                          {model.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">{model.description}</p>
                    {/* Speed/Intelligence bars */}
                    <div className="flex gap-3 mt-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/30">速度</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={cn(
                                "w-2 h-1 rounded-full",
                                i < model.speed ? "bg-blue-400" : "bg-white/10"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/30">智能</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={cn(
                                "w-2 h-1 rounded-full",
                                i < model.intelligence ? "bg-violet-400" : "bg-white/10"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  {selectedModel.id === model.id && (
                    <Check size={14} className="text-blue-400 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
            <div className="px-3 pb-3">
              <div className="border-t border-white/6 pt-2 flex items-center justify-between">
                <span className="text-[11px] text-white/25">Nexus AI v3.2</span>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-indicator" />
                  <span className="text-[11px] text-white/30">所有系統正常</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
