/**
 * MemoryMapPage — Void Glass Design System
 * Interactive knowledge graph visualizing cross-conversation memory
 * Uses SVG-based force-directed graph with glassmorphism nodes
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Brain, Search, ZoomIn, ZoomOut, RotateCcw,
  X, MessageSquare, Calendar, Tag, ChevronRight, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryNode {
  id: string;
  label: string;
  category: "career" | "technical" | "personal" | "project" | "user";
  x: number;
  y: number;
  size: number;
  conversations: ConversationSnippet[];
}

interface ConversationSnippet {
  id: string;
  date: string;
  excerpt: string;
  topic: string;
}

interface Edge {
  from: string;
  to: string;
  strength: number;
}

const NODES: MemoryNode[] = [
  {
    id: "user",
    label: "使用者",
    category: "user",
    x: 50,
    y: 50,
    size: 32,
    conversations: [],
  },
  {
    id: "cpp",
    label: "Tech: C++",
    category: "technical",
    x: 22,
    y: 25,
    size: 22,
    conversations: [
      { id: "cv1", date: "2026-03-10", excerpt: "討論了 C++ 遊戲引擎的記憶體管理策略，包括自定義分配器的實作...", topic: "C++ 記憶體管理" },
      { id: "cv2", date: "2026-03-05", excerpt: "分析了 ECS (Entity-Component-System) 架構在遊戲開發中的應用...", topic: "遊戲架構設計" },
    ],
  },
  {
    id: "japan",
    label: "Travel: 日本",
    category: "personal",
    x: 75,
    y: 20,
    size: 20,
    conversations: [
      { id: "cv3", date: "2026-02-28", excerpt: "規劃了東京、京都、大阪的 10 天行程，包含各地交通和住宿建議...", topic: "日本旅遊規劃" },
    ],
  },
  {
    id: "insurance",
    label: "Project: 保險 App",
    category: "project",
    x: 30,
    y: 72,
    size: 26,
    conversations: [
      { id: "cv4", date: "2026-03-14", excerpt: "設計了保險應用程式的 React 架構，包含多語言支援和深色模式...", topic: "React 架構設計" },
      { id: "cv5", date: "2026-03-12", excerpt: "討論了保單管理模組的資料庫 Schema 設計和 API 規格...", topic: "資料庫設計" },
    ],
  },
  {
    id: "react",
    label: "Tech: React",
    category: "technical",
    x: 68,
    y: 68,
    size: 24,
    conversations: [
      { id: "cv6", date: "2026-03-13", excerpt: "深入探討了 React 19 的 Concurrent Features 和 Server Components...", topic: "React 19 新特性" },
      { id: "cv7", date: "2026-03-08", excerpt: "分析了常見的效能優化技巧，包括 useMemo、useCallback 的正確使用...", topic: "React 效能優化" },
    ],
  },
  {
    id: "ml",
    label: "Tech: 機器學習",
    category: "technical",
    x: 82,
    y: 42,
    size: 20,
    conversations: [
      { id: "cv8", date: "2026-03-06", excerpt: "討論了 Transformer 架構的注意力機制和 Fine-tuning 策略...", topic: "LLM 微調技術" },
    ],
  },
  {
    id: "career",
    label: "Career: 全端工程師",
    category: "career",
    x: 18,
    y: 50,
    size: 22,
    conversations: [
      { id: "cv9", date: "2026-03-01", excerpt: "討論了全端工程師的技術路線圖和 2026 年最值得學習的技術棧...", topic: "技術成長規劃" },
    ],
  },
  {
    id: "typescript",
    label: "Tech: TypeScript",
    category: "technical",
    x: 55,
    y: 82,
    size: 19,
    conversations: [
      { id: "cv10", date: "2026-03-09", excerpt: "深入研究了 TypeScript 5.4 的新特性，包括 NoInfer 和改進的型別推斷...", topic: "TypeScript 進階" },
    ],
  },
];

const EDGES: Edge[] = [
  { from: "user", to: "cpp", strength: 0.8 },
  { from: "user", to: "japan", strength: 0.5 },
  { from: "user", to: "insurance", strength: 0.9 },
  { from: "user", to: "react", strength: 0.85 },
  { from: "user", to: "ml", strength: 0.6 },
  { from: "user", to: "career", strength: 0.7 },
  { from: "user", to: "typescript", strength: 0.75 },
  { from: "react", to: "insurance", strength: 0.7 },
  { from: "react", to: "typescript", strength: 0.8 },
  { from: "cpp", to: "career", strength: 0.5 },
  { from: "ml", to: "react", strength: 0.4 },
];

const CATEGORY_STYLES = {
  user: {
    gradient: "from-blue-500 to-violet-600",
    glow: "rgba(99,102,241,0.6)",
    label: "核心",
    textColor: "text-blue-300",
    bgColor: "bg-blue-600/20 border-blue-500/30",
  },
  technical: {
    gradient: "from-blue-500 to-cyan-500",
    glow: "rgba(59,130,246,0.5)",
    label: "技術",
    textColor: "text-blue-300",
    bgColor: "bg-blue-600/15 border-blue-500/25",
  },
  personal: {
    gradient: "from-pink-500 to-rose-500",
    glow: "rgba(236,72,153,0.5)",
    label: "個人",
    textColor: "text-pink-300",
    bgColor: "bg-pink-600/15 border-pink-500/25",
  },
  project: {
    gradient: "from-violet-500 to-purple-600",
    glow: "rgba(139,92,246,0.5)",
    label: "專案",
    textColor: "text-violet-300",
    bgColor: "bg-violet-600/15 border-violet-500/25",
  },
  career: {
    gradient: "from-amber-500 to-orange-500",
    glow: "rgba(245,158,11,0.5)",
    label: "職涯",
    textColor: "text-amber-300",
    bgColor: "bg-amber-600/15 border-amber-500/25",
  },
};

export default function MemoryMapPage() {
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const filteredNodes = NODES.filter(n =>
    searchQuery === "" ||
    n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.conversations.some(c => c.topic.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        background: "oklch(0.09 0.012 265)",
        backgroundImage: `url(https://d2xsxph8kpxj0f.cloudfront.net/310519663440792445/4FumG7DCFLicuJfMtLEBQm/knowledge-graph-bg-htbCkpasUuU6HS3mt6oj7h.webp)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-[oklch(0.09_0.012_265)]/85" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 h-14 border-b border-white/[0.06] bg-white/3 backdrop-blur-sm shrink-0">
          <Link href="/">
            <button className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors">
              <ArrowLeft size={16} />
              <span className="text-sm">返回工作台</span>
            </button>
          </Link>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-violet-400" />
            <span className="text-sm font-semibold text-white/90">記憶圖譜</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-600/20 text-violet-400 border border-violet-500/20">
              {NODES.length - 1} 個節點
            </span>
          </div>
          <div className="flex-1" />
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="搜尋記憶..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40 w-52"
            />
          </div>
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl border border-white/10 p-1">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/8 transition-colors"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-xs text-white/40 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/8 transition-colors"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/8 transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Graph Area */}
          <div className="flex-1 relative overflow-hidden">
            <svg
              ref={svgRef}
              className="w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            >
              <defs>
                {Object.entries(CATEGORY_STYLES).map(([cat, style]) => (
                  <radialGradient key={cat} id={`grad-${cat}`} cx="30%" cy="30%">
                    <stop offset="0%" stopColor={`oklch(0.75 0.2 ${cat === "user" ? 270 : cat === "technical" ? 250 : cat === "personal" ? 340 : cat === "project" ? 290 : 60})`} />
                    <stop offset="100%" stopColor={`oklch(0.45 0.25 ${cat === "user" ? 280 : cat === "technical" ? 260 : cat === "personal" ? 350 : cat === "project" ? 300 : 70})`} />
                  </radialGradient>
                ))}
                <filter id="glow">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-strong">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Edges */}
              {EDGES.map((edge, i) => {
                const from = NODES.find(n => n.id === edge.from);
                const to = NODES.find(n => n.id === edge.to);
                if (!from || !to) return null;
                const isHighlighted = hoveredNode === edge.from || hoveredNode === edge.to ||
                  selectedNode?.id === edge.from || selectedNode?.id === edge.to;
                const isFiltered = filteredNodeIds.has(edge.from) && filteredNodeIds.has(edge.to);
                return (
                  <line
                    key={i}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={isHighlighted ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.08)"}
                    strokeWidth={isHighlighted ? 0.4 : 0.2}
                    strokeDasharray={isHighlighted ? "none" : "1 1"}
                    opacity={isFiltered ? 1 : 0.2}
                    style={{ transition: "all 0.3s ease" }}
                  />
                );
              })}

              {/* Nodes */}
              {NODES.map(node => {
                const style = CATEGORY_STYLES[node.category];
                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode === node.id;
                const isFiltered = filteredNodeIds.has(node.id);
                const isActive = isSelected || isHovered;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: "pointer", transition: "opacity 0.3s ease" }}
                    opacity={isFiltered ? 1 : 0.2}
                    onClick={() => setSelectedNode(isSelected ? null : node)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {/* Outer glow ring */}
                    {isActive && (
                      <circle
                        r={node.size / 2 + 3}
                        fill="none"
                        stroke={style.glow}
                        strokeWidth="0.5"
                        opacity="0.6"
                        filter="url(#glow)"
                      />
                    )}
                    {/* Pulse ring */}
                    {node.category === "user" && (
                      <circle
                        r={node.size / 2 + 5}
                        fill="none"
                        stroke="rgba(99,102,241,0.2)"
                        strokeWidth="0.3"
                        className="node-pulse"
                      />
                    )}
                    {/* Main circle */}
                    <circle
                      r={node.size / 2}
                      fill={`url(#grad-${node.category})`}
                      filter={isActive ? "url(#glow-strong)" : "url(#glow)"}
                      style={{ transition: "r 0.2s ease" }}
                    />
                    {/* Inner highlight */}
                    <circle
                      r={node.size / 2 - 2}
                      fill="none"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="0.5"
                    />
                    {/* Label */}
                    <text
                      textAnchor="middle"
                      dy={node.size / 2 + 3.5}
                      fontSize="2.8"
                      fill="rgba(255,255,255,0.75)"
                      fontFamily="Inter, sans-serif"
                      fontWeight="500"
                    >
                      {node.label}
                    </text>
                    {/* Conversation count badge */}
                    {node.conversations.length > 0 && (
                      <g transform={`translate(${node.size / 2 - 1}, ${-node.size / 2 + 1})`}>
                        <circle r="2.5" fill="oklch(0.62 0.22 255)" />
                        <text
                          textAnchor="middle"
                          dy="0.9"
                          fontSize="2.2"
                          fill="white"
                          fontFamily="Inter, sans-serif"
                          fontWeight="600"
                        >
                          {node.conversations.length}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
              {Object.entries(CATEGORY_STYLES).filter(([k]) => k !== "user").map(([cat, style]) => (
                <div key={cat} className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs",
                  style.bgColor
                )}>
                  <div className={cn("w-2 h-2 rounded-full bg-gradient-to-br", style.gradient)} />
                  <span className={style.textColor}>{style.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          {selectedNode && (
            <div className="w-80 border-l border-white/[0.06] bg-white/3 backdrop-blur-sm flex flex-col shrink-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center",
                    `bg-gradient-to-br ${CATEGORY_STYLES[selectedNode.category].gradient}`
                  )}>
                    <Tag size={11} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/90">{selectedNode.label}</p>
                    <p className="text-[10px] text-white/40">{CATEGORY_STYLES[selectedNode.category].label} · {selectedNode.conversations.length} 則對話</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {selectedNode.conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <Sparkles size={24} className="mx-auto text-white/20 mb-2" />
                    <p className="text-sm text-white/30">這是您的核心節點</p>
                    <p className="text-xs text-white/20 mt-1">所有記憶都從這裡延伸</p>
                  </div>
                ) : (
                  selectedNode.conversations.map(conv => (
                    <div
                      key={conv.id}
                      className="rounded-xl border border-white/8 bg-white/4 p-3 hover:bg-white/6 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-md border",
                          CATEGORY_STYLES[selectedNode.category].bgColor,
                          CATEGORY_STYLES[selectedNode.category].textColor
                        )}>
                          {conv.topic}
                        </span>
                        <div className="flex items-center gap-1 text-white/25 shrink-0">
                          <Calendar size={10} />
                          <span className="text-[10px]">{conv.date}</span>
                        </div>
                      </div>
                      <p className="text-xs text-white/55 leading-relaxed line-clamp-3">{conv.excerpt}</p>
                      <div className="flex items-center gap-1 mt-2 text-white/25 hover:text-white/50 transition-colors">
                        <MessageSquare size={10} />
                        <span className="text-[10px]">查看完整對話</span>
                        <ChevronRight size={10} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Related Nodes */}
              <div className="shrink-0 border-t border-white/[0.06] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">相關節點</p>
                <div className="flex flex-wrap gap-1.5">
                  {EDGES
                    .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
                    .map(e => {
                      const relId = e.from === selectedNode.id ? e.to : e.from;
                      const rel = NODES.find(n => n.id === relId);
                      if (!rel) return null;
                      const relStyle = CATEGORY_STYLES[rel.category];
                      return (
                        <button
                          key={relId}
                          onClick={() => setSelectedNode(rel)}
                          className={cn(
                            "text-[10px] px-2 py-1 rounded-lg border transition-colors",
                            relStyle.bgColor, relStyle.textColor
                          )}
                        >
                          {rel.label}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
