/**
 * Sidebar Component — Void Glass Design System
 * Dark glassmorphism sidebar with chat history, folders, and user profile
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Search, Plus, ChevronDown, ChevronRight, MessageSquare,
  Folder, FolderOpen, Star, Clock, Brain, Zap, Settings,
  User, LogOut, MoreHorizontal, PanelLeftClose, PanelLeft,
  Cpu
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ChatItem {
  id: string;
  title: string;
  time: string;
  active?: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  chats: ChatItem[];
}

const FOLDERS: FolderItem[] = [
  {
    id: "pinned",
    name: "已釘選",
    icon: <Star size={14} />,
    color: "text-yellow-400",
    chats: [
      { id: "c1", title: "建立保險 App 架構設計", time: "今天", active: true },
      { id: "c2", title: "React 效能優化策略", time: "昨天" },
    ],
  },
  {
    id: "recent",
    name: "最近",
    icon: <Clock size={14} />,
    color: "text-blue-400",
    chats: [
      { id: "c3", title: "TypeScript 泛型深度解析", time: "2天前" },
      { id: "c4", title: "日本旅遊行程規劃", time: "3天前" },
      { id: "c5", title: "機器學習模型調優", time: "上週" },
    ],
  },
  {
    id: "projects",
    name: "專案",
    icon: <Folder size={14} />,
    color: "text-violet-400",
    chats: [
      { id: "c6", title: "C++ 遊戲引擎開發筆記", time: "上週" },
      { id: "c7", title: "資料庫索引優化", time: "2週前" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["pinned", "recent"]));

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredFolders = FOLDERS.map(folder => ({
    ...folder,
    chats: folder.chats.filter(c =>
      searchQuery === "" || c.title.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(f => f.chats.length > 0 || searchQuery === "");

  return (
    <aside
      className={cn(
        "flex flex-col h-full transition-all duration-300 ease-in-out",
        "border-r border-white/[0.06]",
        "bg-[oklch(0.11_0.014_265)]",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center h-14 px-3 border-b border-white/[0.06] shrink-0",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Cpu size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-white/90 tracking-tight">AI Workbench</span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Cpu size={14} className="text-white" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-white/40 hover:text-white/80 hover:bg-white/5 shrink-0"
          onClick={onToggle}
        >
          {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
        </Button>
      </div>

      {/* New Chat Button */}
      <div className={cn("px-3 py-3 shrink-0", collapsed && "px-2")}>
        <Button
          className={cn(
            "w-full text-sm font-medium transition-all duration-200",
            "bg-gradient-to-r from-blue-600/80 to-violet-600/80 hover:from-blue-500 hover:to-violet-500",
            "text-white border-0 shadow-lg shadow-blue-900/30",
            collapsed ? "h-9 w-9 p-0 mx-auto flex" : "h-9 justify-start gap-2"
          )}
          onClick={() => toast.info("開啟新對話")}
        >
          <Plus size={15} />
          {!collapsed && <span>新對話</span>}
        </Button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <Input
              placeholder="搜尋對話..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-white/5 border-white/8 text-white/70 placeholder:text-white/25 focus:border-blue-500/50 focus:bg-white/8"
            />
          </div>
        </div>
      )}

      {/* Navigation Links */}
      {!collapsed && (
        <div className="px-2 pb-2 shrink-0">
          <Link href="/memory">
            <button className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150",
              location === "/memory"
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/20"
                : "text-white/50 hover:text-white/80 hover:bg-white/5"
            )}>
              <Brain size={14} />
              <span>記憶圖譜</span>
            </button>
          </Link>
        </div>
      )}

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 min-h-0">
        {!collapsed && filteredFolders.map(folder => (
          <div key={folder.id}>
            <button
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-white/40 hover:text-white/60 hover:bg-white/4 transition-colors"
              onClick={() => toggleFolder(folder.id)}
            >
              {expandedFolders.has(folder.id)
                ? <ChevronDown size={12} />
                : <ChevronRight size={12} />
              }
              <span className={folder.color}>{folder.icon}</span>
              <span className="font-medium tracking-wide uppercase text-[10px]">{folder.name}</span>
            </button>
            {expandedFolders.has(folder.id) && (
              <div className="ml-2 space-y-0.5">
                {folder.chats.map(chat => (
                  <button
                    key={chat.id}
                    className={cn(
                      "w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 group",
                      chat.active
                        ? "bg-blue-600/15 text-white/90 border border-blue-500/20"
                        : "text-white/50 hover:text-white/80 hover:bg-white/5"
                    )}
                    onClick={() => toast.info(`切換至：${chat.title}`)}
                  >
                    <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate leading-tight">{chat.title}</p>
                      <p className="text-[10px] text-white/25 mt-0.5">{chat.time}</p>
                    </div>
                    <MoreHorizontal size={12} className="shrink-0 opacity-0 group-hover:opacity-40 mt-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {collapsed && (
          <div className="flex flex-col items-center gap-1 pt-1">
            {[...Array(5)].map((_, i) => (
              <button
                key={i}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
                onClick={() => toast.info("展開側邊欄以查看對話")}
              >
                <MessageSquare size={14} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User Profile */}
      <div className={cn(
        "shrink-0 border-t border-white/[0.06] p-3",
        collapsed && "p-2"
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
              <User size={13} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/80 truncate">使用者</p>
              <p className="text-[10px] text-white/35 truncate">Pro 方案</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white/30 hover:text-white/60 hover:bg-white/5"
              onClick={() => toast.info("設定功能即將推出")}>
              <Settings size={12} />
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <User size={13} className="text-white" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
