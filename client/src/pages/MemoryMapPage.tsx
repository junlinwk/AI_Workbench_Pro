/**
 * MemoryMapPage — Void Glass Design System
 * Enhanced interactive knowledge graph with curved edges, particles, and drag support
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Brain, Search, ZoomIn, ZoomOut, RotateCcw,
  X, MessageSquare, Calendar, Tag, ChevronRight, Sparkles,
  Maximize2, Minimize2, Filter, PlusCircle, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { loadUserData, saveUserData } from "@/lib/storage";
import { t } from "@/i18n";
import {
  computeSemanticEdges,
  pruneEmbeddingCache,
  type SemanticEdge,
} from "@/lib/semanticEmbedding";

interface MemoryNode {
  id: string;
  label: string;
  category: "career" | "technical" | "personal" | "project" | "user";
  x: number;
  y: number;
  size: number;
  conversations: ConversationSnippet[];
  keywords?: string[];
}

interface ConversationSnippet {
  id: string;
  date: string;
  excerpt: string;
  topic: string;
  conversationId?: string;
}

interface Edge {
  from: string;
  to: string;
  strength: number;
  label?: string;
}

const DEFAULT_NODES: MemoryNode[] = [
  {
    id: "user", label: "", category: "user",
    x: 150, y: 150, size: 34,
    conversations: [],
    keywords: [],
  },
];
const DEFAULT_EDGES: Edge[] = [];

const CATEGORY_STYLES = {
  user: {
    gradient: ["#6366f1", "#8b5cf6"],
    glow: "rgba(99,102,241,0.6)",
    label: "核心",
    labelKey: "memory.core" as const,
    textColor: "text-blue-300",
    bgColor: "bg-blue-600/20 border-blue-500/30",
    hue: 270,
  },
  technical: {
    gradient: ["#3b82f6", "#06b6d4"],
    glow: "rgba(59,130,246,0.5)",
    label: "技術",
    labelKey: "memory.technical" as const,
    textColor: "text-blue-300",
    bgColor: "bg-blue-600/15 border-blue-500/25",
    hue: 250,
  },
  personal: {
    gradient: ["#ec4899", "#f43f5e"],
    glow: "rgba(236,72,153,0.5)",
    label: "個人",
    labelKey: "memory.personal" as const,
    textColor: "text-pink-300",
    bgColor: "bg-pink-600/15 border-pink-500/25",
    hue: 340,
  },
  project: {
    gradient: ["#8b5cf6", "#7c3aed"],
    glow: "rgba(139,92,246,0.5)",
    label: "專案",
    labelKey: "memory.project" as const,
    textColor: "text-violet-300",
    bgColor: "bg-violet-600/15 border-violet-500/25",
    hue: 290,
  },
  career: {
    gradient: ["#f59e0b", "#f97316"],
    glow: "rgba(245,158,11,0.5)",
    label: "職涯",
    labelKey: "memory.career" as const,
    textColor: "text-amber-300",
    bgColor: "bg-amber-600/15 border-amber-500/25",
    hue: 60,
  },
};

// Generate curved path for edges
function curvedEdgePath(x1: number, y1: number, x2: number, y2: number, curvature = 0.2): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Perpendicular offset for curve
  const cx = mx - dy * curvature;
  const cy = my + dx * curvature;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

type CategoryFilter = "all" | MemoryNode["category"];

export default function MemoryMapPage() {
  const { settings, getApiKey, hasApiKey } = useSettings();
  const lang = settings.language;
  const { user } = useAuth();

  const userId = user?.id || "anon";
  const userLabel = user?.username || (lang === "en" ? "User" : "使用者");

  const [nodes, setNodes] = useState<MemoryNode[]>(() => loadUserData(userId, "memory-nodes", DEFAULT_NODES));
  const [edges, setEdges] = useState<Edge[]>(() => loadUserData(userId, "memory-edges", DEFAULT_EDGES));

  // Persist nodes and edges to user storage
  useEffect(() => {
    saveUserData(userId, "memory-nodes", nodes);
  }, [userId, nodes]);

  useEffect(() => {
    saveUserData(userId, "memory-edges", edges);
  }, [userId, edges]);

  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodeLabels, setNodeLabels] = useState<Record<string, string>>({});
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingInPanel, setEditingInPanel] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeCategory, setNewNodeCategory] = useState<MemoryNode["category"]>("technical");
  const [newNodeKeywords, setNewNodeKeywords] = useState("");
  // Semantic embedding state
  const [semanticThreshold, setSemanticThreshold] = useState(() =>
    loadUserData<number>(userId, "semantic-threshold", 0.65)
  );
  const [semanticEdges, setSemanticEdges] = useState<SemanticEdge[]>([]);
  const [isComputingSemantic, setIsComputingSemantic] = useState(false);
  const [semanticProgress, setSemanticProgress] = useState<{ done: number; total: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const panelEditInputRef = useRef<HTMLInputElement>(null);

  // Initialize positions from nodes
  useEffect(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => { positions[n.id] = { x: n.x, y: n.y }; });
    setNodePositions(positions);
  }, [nodes]);

  // Persist semantic threshold
  useEffect(() => {
    saveUserData(userId, "semantic-threshold", semanticThreshold);
  }, [userId, semanticThreshold]);

  // Compute semantic edges (Google API key required)
  const googleApiKey = getApiKey("google");
  const hasGoogleKey = hasApiKey("google");

  const runSemanticAnalysis = useCallback(async () => {
    if (!googleApiKey || nodes.length < 3 || isComputingSemantic) return;
    setIsComputingSemantic(true);
    setSemanticProgress({ done: 0, total: nodes.length - 1 });
    try {
      const result = await computeSemanticEdges(
        userId,
        nodes,
        googleApiKey,
        semanticThreshold,
        (done, total) => setSemanticProgress({ done, total }),
      );
      setSemanticEdges(result);
      pruneEmbeddingCache(userId, new Set(nodes.map((n) => n.id)));
    } catch (err) {
      console.warn("[MemoryMap] Semantic analysis failed:", err);
      toast.error(lang === "en" ? "Semantic analysis failed" : "語意分析失敗");
    } finally {
      setIsComputingSemantic(false);
      setSemanticProgress(null);
    }
  }, [googleApiKey, nodes, userId, semanticThreshold, isComputingSemantic, lang]);

  // Re-run when threshold changes (debounced) or nodes change significantly
  useEffect(() => {
    if (!hasGoogleKey || nodes.length < 3) return;
    const timer = setTimeout(() => {
      runSemanticAnalysis();
    }, 800);
    return () => clearTimeout(timer);
  }, [semanticThreshold, nodes.length, hasGoogleKey]); // eslint-disable-line

  const getNodePos = (id: string) => nodePositions[id] || { x: nodes.find(n => n.id === id)?.x ?? 0, y: nodes.find(n => n.id === id)?.y ?? 0 };

  const getNodeLabel = (node: MemoryNode) => {
    if (node.id === "user") return nodeLabels[node.id] || userLabel;
    return nodeLabels[node.id] || node.label;
  };

  const filteredNodes = useMemo(() => nodes.filter(n => {
    const label = getNodeLabel(n);
    const matchesSearch = searchQuery === "" ||
      label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.conversations.some(c => c.topic.toLowerCase().includes(searchQuery.toLowerCase())) ||
      n.keywords?.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || n.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }), [searchQuery, categoryFilter, nodeLabels, nodes, userLabel]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (nodeId === "user") return; // Don't drag center node
    e.stopPropagation();
    setDragNode(nodeId);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragNode || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm);
    setNodePositions(prev => ({
      ...prev,
      [dragNode]: { x: Math.max(-40, Math.min(370, svgPt.x)), y: Math.max(-40, Math.min(370, svgPt.y)) },
    }));
  }, [dragNode]);

  const handleMouseUp = useCallback(() => {
    setDragNode(null);
  }, []);

  // Smooth scroll-wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => {
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      return Math.max(0.3, Math.min(3, prev + delta));
    });
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(prev => !prev);
  };

  // Label editing handlers
  const handleLabelDoubleClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setEditingNodeId(nodeId);
    setEditingInPanel(false);
  };

  const handlePanelLabelDoubleClick = (nodeId: string) => {
    setEditingNodeId(nodeId);
    setEditingInPanel(true);
  };

  const handleLabelChange = (nodeId: string, newLabel: string) => {
    if (newLabel.trim()) {
      const trimmed = newLabel.trim();
      setNodeLabels(prev => ({ ...prev, [nodeId]: trimmed }));
      // Persist label change back to the actual nodes state so it survives save/load
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, label: trimmed } : n
      ));
    }
    setEditingNodeId(null);
    setEditingInPanel(false);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent, nodeId: string) => {
    if (e.key === "Enter") {
      handleLabelChange(nodeId, (e.target as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      setEditingNodeId(null);
      setEditingInPanel(false);
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingNodeId && !editingInPanel && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
    if (editingNodeId && editingInPanel && panelEditInputRef.current) {
      panelEditInputRef.current.focus();
      panelEditInputRef.current.select();
    }
  }, [editingNodeId, editingInPanel]);

  // Add a new node to the graph and connect it to the "user" center node
  const addMemoryNode = useCallback((
    label: string,
    category: MemoryNode["category"],
    keywords: string[],
    conversationSnippet?: ConversationSnippet,
  ) => {
    setNodes(prev => {
      // Update existing node if label matches (case-insensitive)
      const existing = prev.find(n => n.label.toLowerCase() === label.toLowerCase() && n.id !== "user");
      if (existing) {
        return prev.map(n => {
          if (n.id !== existing.id) return n;
          const updatedKeywords = Array.from(new Set([...(n.keywords || []), ...keywords]));
          const updatedConversations = conversationSnippet
            ? [...n.conversations, conversationSnippet]
            : n.conversations;
          return { ...n, keywords: updatedKeywords, conversations: updatedConversations };
        });
      }

      // Create new node at a random position around center
      const angle = Math.random() * Math.PI * 2;
      const distance = 60 + Math.random() * 80;
      const cx = 150 + Math.cos(angle) * distance;
      const cy = 150 + Math.sin(angle) * distance;
      const newNode: MemoryNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        category,
        x: Math.max(-30, Math.min(360, cx)),
        y: Math.max(-30, Math.min(360, cy)),
        size: 18 + Math.random() * 8,
        conversations: conversationSnippet ? [conversationSnippet] : [],
        keywords,
      };

      // Also add edge to "user" center
      setEdges(prevEdges => [
        ...prevEdges,
        { from: "user", to: newNode.id, strength: 0.5 + Math.random() * 0.5, label: category },
      ]);

      return [...prev, newNode];
    });
  }, []);

  // Listen for memory-add CustomEvent from ChatInterface.
  // ChatInterface already persisted the node to localStorage, so we just
  // reload from storage to stay in sync (avoids duplicates).
  useEffect(() => {
    function handleMemoryAdd(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.label) return;
      try {
        setNodes(loadUserData(userId, "memory-nodes", DEFAULT_NODES));
        setEdges(loadUserData(userId, "memory-edges", DEFAULT_EDGES));
      } catch {
        // Fallback: add via state if localStorage read fails
        const { label, category, keywords, conversationSnippet } = detail;
        addMemoryNode(
          label,
          category || "technical",
          keywords || [],
          conversationSnippet || undefined,
        );
      }
    }
    window.addEventListener("memory-add", handleMemoryAdd);
    return () => window.removeEventListener("memory-add", handleMemoryAdd);
  }, [userId, addMemoryNode]);

  // Handle manual "Add Node" form submission
  const handleAddNode = () => {
    const label = newNodeLabel.trim();
    if (!label) return;
    const keywords = newNodeKeywords
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);
    addMemoryNode(label, newNodeCategory, keywords);
    setNewNodeLabel("");
    setNewNodeCategory("technical");
    setNewNodeKeywords("");
    setShowAddForm(false);
    toast.success(t("memory.nodeAdded", lang));
  };

  // Delete a node and its edges
  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === "user") return;
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    setSelectedNode(null);
    toast.success(t("memory.nodeDeleted", lang));
  };

  // Compute edge-related highlights (includes semantic edges)
  const connectedNodes = useMemo(() => {
    if (!hoveredNode && !selectedNode) return new Set<string>();
    const targetId = hoveredNode || selectedNode?.id;
    const connected = new Set<string>();
    edges.forEach(e => {
      if (e.from === targetId) connected.add(e.to);
      if (e.to === targetId) connected.add(e.from);
    });
    semanticEdges.forEach(e => {
      if (e.from === targetId) connected.add(e.to);
      if (e.to === targetId) connected.add(e.from);
    });
    connected.add(targetId!);
    return connected;
  }, [hoveredNode, selectedNode, edges, semanticEdges]);

  const totalConversations = nodes.reduce((sum, n) => sum + n.conversations.length, 0);

  return (
    <div
      ref={containerRef}
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "oklch(0.09 0.012 265)" }}
    >
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `
          radial-gradient(ellipse 60% 40% at 30% 20%, oklch(0.55 0.25 290 / 8%) 0%, transparent 60%),
          radial-gradient(ellipse 50% 30% at 70% 80%, oklch(0.62 0.22 255 / 6%) 0%, transparent 60%),
          radial-gradient(ellipse 40% 40% at 50% 50%, oklch(0.62 0.22 255 / 3%) 0%, transparent 60%)
        `,
      }} />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 h-14 border-b border-white/[0.06] bg-white/3 backdrop-blur-sm shrink-0">
          <Link href="/">
            <button className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors">
              <ArrowLeft size={16} />
              <span className="text-sm">{t("memory.back", lang)}</span>
            </button>
          </Link>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-violet-400" />
            <span className="text-sm font-semibold text-white/90">{t("memory.title", lang)}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-600/20 text-violet-400 border border-violet-500/20">
              {nodes.length - 1} {t("memory.nodes", lang)} · {totalConversations} {t("memory.conversations", lang)}
            </span>
          </div>
          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder={t("memory.search", lang)}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40 w-48"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category Filter (compact pill) */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl border border-white/10 p-0.5">
            {[
              { value: "all" as CategoryFilter, labelKey: "memory.all" as const },
              { value: "technical" as CategoryFilter, labelKey: "memory.technical" as const },
              { value: "project" as CategoryFilter, labelKey: "memory.project" as const },
              { value: "personal" as CategoryFilter, labelKey: "memory.personal" as const },
              { value: "career" as CategoryFilter, labelKey: "memory.career" as const },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setCategoryFilter(f.value)}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all",
                  categoryFilter === f.value
                    ? "bg-violet-600/80 text-white shadow"
                    : "text-white/35 hover:text-white/60"
                )}
              >
                {t(f.labelKey, lang)}
              </button>
            ))}
          </div>

          {/* Semantic Threshold Slider */}
          <div className="flex items-center gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-1.5">
            <Sparkles size={12} className={cn(
              "shrink-0 transition-colors",
              isComputingSemantic ? "text-amber-400 animate-pulse" : hasGoogleKey ? "text-violet-400" : "text-white/20",
            )} />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] text-white/35 uppercase tracking-wider whitespace-nowrap">
                  {lang === "en" ? "Semantic" : "語意"}
                </span>
                <span className="text-[10px] text-violet-400/80 font-mono tabular-nums w-7 text-right">
                  {(semanticThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="95"
                value={semanticThreshold * 100}
                onChange={e => setSemanticThreshold(Number(e.target.value) / 100)}
                disabled={!hasGoogleKey}
                className="w-20 h-1 appearance-none rounded-full bg-white/10 accent-violet-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400 [&::-webkit-slider-thumb]:appearance-none"
                title={hasGoogleKey
                  ? (lang === "en" ? "Semantic similarity threshold — lower = more connections" : "語意相似度閾值 — 越低連線越多")
                  : (lang === "en" ? "Requires Google API key" : "需要 Google API Key")}
              />
            </div>
            {isComputingSemantic && semanticProgress && (
              <span className="text-[9px] text-amber-400/60 whitespace-nowrap">
                {semanticProgress.done}/{semanticProgress.total}
              </span>
            )}
            {!isComputingSemantic && semanticEdges.length > 0 && (
              <span className="text-[9px] text-violet-400/50 whitespace-nowrap">
                {semanticEdges.length} {lang === "en" ? "links" : "連結"}
              </span>
            )}
          </div>

          {/* Zoom (compact) */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <ZoomOut size={12} />
            </button>
            <span className="text-[10px] text-white/30 w-8 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
              className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <ZoomIn size={12} />
            </button>
          </div>

          {/* Add Node Button */}
          <button
            onClick={() => setShowAddForm(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-600/30 transition-colors"
          >
            <PlusCircle size={13} />
            {t("memory.addNode", lang)}
          </button>
        </header>

        {/* Add Node Inline Form */}
        {showAddForm && (
          <div className="relative z-20 mx-6 mt-2 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40 uppercase tracking-wider">{t("memory.label", lang)}</label>
              <input
                type="text"
                value={newNodeLabel}
                onChange={e => setNewNodeLabel(e.target.value)}
                placeholder={t("memory.labelPlaceholder", lang)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40 w-44"
                onKeyDown={e => { if (e.key === "Enter") handleAddNode(); if (e.key === "Escape") setShowAddForm(false); }}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40 uppercase tracking-wider">{t("memory.category", lang)}</label>
              <select
                value={newNodeCategory}
                onChange={e => setNewNodeCategory(e.target.value as MemoryNode["category"])}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 focus:outline-none focus:border-violet-500/40"
              >
                <option value="technical">{t("memory.technical", lang)}</option>
                <option value="personal">{t("memory.personal", lang)}</option>
                <option value="project">{t("memory.project", lang)}</option>
                <option value="career">{t("memory.career", lang)}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40 uppercase tracking-wider">{t("memory.keywords", lang)}</label>
              <input
                type="text"
                value={newNodeKeywords}
                onChange={e => setNewNodeKeywords(e.target.value)}
                placeholder={t("memory.keywordsPlaceholder", lang)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40 w-44"
                onKeyDown={e => { if (e.key === "Enter") handleAddNode(); }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                {t("memory.cancel", lang)}
              </button>
              <button
                onClick={handleAddNode}
                disabled={!newNodeLabel.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-violet-600/80 text-white hover:bg-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {t("memory.add", lang)}
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Graph Area */}
          <div className="flex-1 relative overflow-hidden">
            <svg
              ref={svgRef}
              className="w-full h-full"
              viewBox="-50 -50 430 430"
              preserveAspectRatio="xMidYMid meet"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center", cursor: dragNode ? "grabbing" : "default", transition: dragNode ? "none" : "transform 0.15s ease-out" }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <defs>
                {/* Gradients for each category */}
                {Object.entries(CATEGORY_STYLES).map(([cat, style]) => (
                  <radialGradient key={cat} id={`grad-${cat}`} cx="30%" cy="30%">
                    <stop offset="0%" stopColor={style.gradient[0]} stopOpacity="0.9" />
                    <stop offset="100%" stopColor={style.gradient[1]} stopOpacity="0.7" />
                  </radialGradient>
                ))}
                {/* Glow filters */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="blur" in2="blur" operator="over" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {/* Arrow marker for edges */}
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
                </marker>
                {/* Edge glow gradient */}
                {edges.map((edge, i) => {
                  const fromCat = nodes.find(n => n.id === edge.from)?.category;
                  const toCat = nodes.find(n => n.id === edge.to)?.category;
                  const fromStyle = CATEGORY_STYLES[fromCat || "technical"];
                  const toStyle = CATEGORY_STYLES[toCat || "technical"];
                  return (
                    <linearGradient key={`edge-grad-${i}`} id={`edge-grad-${i}`}>
                      <stop offset="0%" stopColor={fromStyle.gradient[0]} stopOpacity="0.5" />
                      <stop offset="100%" stopColor={toStyle.gradient[0]} stopOpacity="0.5" />
                    </linearGradient>
                  );
                })}
                {/* Clip path for user avatar circle */}
                <clipPath id="user-avatar-clip">
                  <circle r="17" />
                </clipPath>
              </defs>

              {/* Grid pattern (subtle) */}
              <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="0.4" fill="rgba(255,255,255,0.03)" />
              </pattern>
              <rect width="430" height="430" x="-50" y="-50" fill="url(#grid)" />

              {/* Edges */}
              {edges.map((edge, i) => {
                const from = getNodePos(edge.from);
                const to = getNodePos(edge.to);
                if (!from || !to) return null;

                const isHighlighted = connectedNodes.has(edge.from) && connectedNodes.has(edge.to) &&
                  (hoveredNode || selectedNode);
                const isFiltered = filteredNodeIds.has(edge.from) && filteredNodeIds.has(edge.to);

                // Curvature: vary by index to avoid overlapping
                const curvature = edge.from === "user" || edge.to === "user" ? 0 : (i % 2 === 0 ? 0.15 : -0.15);
                const pathD = curvedEdgePath(from.x, from.y, to.x, to.y, curvature);

                return (
                  <g key={i}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isHighlighted ? `url(#edge-grad-${i})` : "rgba(255,255,255,0.06)"}
                      strokeWidth={isHighlighted ? edge.strength * 0.6 : edge.strength * 0.25}
                      strokeDasharray={isHighlighted ? "none" : `${edge.strength * 2} ${1}`}
                      opacity={isFiltered ? (isHighlighted ? 1 : 0.6) : 0.1}
                      style={{ transition: "all 0.4s ease" }}
                    />
                    {/* Edge label for highlighted strong connections */}
                    {isHighlighted && edge.label && edge.strength >= 0.5 && (
                      <text
                        x={(from.x + to.x) / 2 + (to.y - from.y) * curvature}
                        y={(from.y + to.y) / 2 - (to.x - from.x) * curvature}
                        textAnchor="middle"
                        fontSize="5"
                        fill="rgba(255,255,255,0.4)"
                        fontFamily="Inter, sans-serif"
                        style={{ transition: "opacity 0.3s" }}
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Semantic Edges (dashed, with labels that follow the curve) */}
              {semanticEdges.map((edge, i) => {
                const from = getNodePos(edge.from);
                const to = getNodePos(edge.to);
                if (!from || !to) return null;

                const isHighlighted = connectedNodes.has(edge.from) && connectedNodes.has(edge.to) &&
                  (hoveredNode || selectedNode);
                const isFiltered = filteredNodeIds.has(edge.from) && filteredNodeIds.has(edge.to);

                const curvature = i % 2 === 0 ? 0.2 : -0.2;
                // Ensure text reads left-to-right: if from is right of to, swap direction
                const ltr = from.x <= to.x;
                const p1 = ltr ? from : to;
                const p2 = ltr ? to : from;
                const pathD = curvedEdgePath(p1.x, p1.y, p2.x, p2.y, ltr ? curvature : -curvature);
                const pathId = `sem-path-${i}`;

                // Color intensity based on similarity
                const alpha = 0.15 + edge.similarity * 0.45;
                const strokeColor = isHighlighted
                  ? `rgba(167,139,250,${alpha + 0.3})`
                  : `rgba(167,139,250,${alpha})`;

                // Show related topics/content, fallback to node labels
                let topicLabel: string;
                if (edge.sharedTopics.length > 0) {
                  topicLabel = edge.sharedTopics.slice(0, 2).join(" · ");
                } else {
                  const fromNode = nodes.find(n => n.id === edge.from);
                  const toNode = nodes.find(n => n.id === edge.to);
                  const fromLabel = fromNode?.label || "";
                  const toLabel = toNode?.label || "";
                  topicLabel = fromLabel && toLabel
                    ? `${fromLabel.slice(0, 8)}↔${toLabel.slice(0, 8)}`
                    : (lang === "en" ? "related" : "相關");
                }

                return (
                  <g key={`sem-${i}`}>
                    {/* Invisible wider path for the textPath reference */}
                    <path id={pathId} d={pathD} fill="none" stroke="none" />
                    {/* Visible dashed line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isHighlighted ? 0.8 + edge.similarity : 0.4 + edge.similarity * 0.3}
                      strokeDasharray="3 2"
                      opacity={isFiltered ? (isHighlighted ? 1 : 0.7) : 0.1}
                      style={{ transition: "all 0.4s ease" }}
                    />
                    {/* Label that follows the curve */}
                    {isHighlighted && isFiltered && (
                      <text
                        fontSize="4.2"
                        fill="rgba(167,139,250,0.95)"
                        fontFamily="Inter, sans-serif"
                        fontWeight={500}
                        dy="-1.5"
                      >
                        <textPath
                          href={`#${pathId}`}
                          startOffset="50%"
                          textAnchor="middle"
                        >
                          {topicLabel}
                        </textPath>
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map(node => {
                const style = CATEGORY_STYLES[node.category];
                const pos = getNodePos(node.id);
                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode === node.id;
                const isFiltered = filteredNodeIds.has(node.id);
                const isActive = isSelected || isHovered;
                const isConnected = connectedNodes.has(node.id);
                const dimmed = (hoveredNode || selectedNode) && !isConnected;
                const label = getNodeLabel(node);
                const isEditingThis = editingNodeId === node.id && !editingInPanel;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    style={{
                      cursor: node.id === "user" ? "pointer" : (dragNode === node.id ? "grabbing" : "grab"),
                      transition: dragNode === node.id ? "none" : "opacity 0.3s ease",
                    }}
                    opacity={!isFiltered ? 0.1 : dimmed ? 0.3 : 1}
                    onClick={() => setSelectedNode(isSelected ? null : node)}
                    onMouseEnter={() => { if (!dragNode) setHoveredNode(node.id); }}
                    onMouseLeave={() => setHoveredNode(null)}
                    onMouseDown={e => handleMouseDown(e, node.id)}
                  >
                    {/* Ambient glow */}
                    {isActive && (
                      <>
                        <circle
                          r={node.size / 2 + 5}
                          fill="none"
                          stroke={style.glow}
                          strokeWidth="0.3"
                          opacity="0.4"
                        >
                          <animate attributeName="r" values={`${node.size / 2 + 3};${node.size / 2 + 6};${node.size / 2 + 3}`} dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.4;0.2;0.4" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          r={node.size / 2 + 2}
                          fill="none"
                          stroke={style.glow}
                          strokeWidth="0.6"
                          opacity="0.6"
                        />
                      </>
                    )}

                    {/* Pulse ring for center node */}
                    {node.category === "user" && (
                      <circle r={node.size / 2 + 5} fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="0.3">
                        <animate attributeName="r" values={`${node.size / 2 + 3};${node.size / 2 + 8};${node.size / 2 + 3}`} dur="3s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.3;0.05;0.3" dur="3s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Shadow */}
                    <circle
                      r={node.size / 2}
                      fill="rgba(0,0,0,0.3)"
                      transform="translate(0.5, 0.5)"
                    />

                    {/* Main circle — user node shows avatar */}
                    {node.category === "user" && user?.avatar ? (
                      <>
                        <circle
                          r={node.size / 2}
                          fill={`url(#grad-${node.category})`}
                          filter={isActive ? "url(#glow-strong)" : "url(#glow)"}
                        />
                        <image
                          href={user.avatar}
                          x={-node.size / 2}
                          y={-node.size / 2}
                          width={node.size}
                          height={node.size}
                          clipPath={`circle(${node.size / 2}px)`}
                          style={{ borderRadius: "50%" }}
                        />
                      </>
                    ) : (
                      <circle
                        r={node.size / 2}
                        fill={`url(#grad-${node.category})`}
                        filter={isActive ? "url(#glow-strong)" : "url(#glow)"}
                      />
                    )}

                    {/* Glass highlight (skip for user avatar) */}
                    {node.category !== "user" && (
                      <ellipse
                        cx={-node.size * 0.1}
                        cy={-node.size * 0.15}
                        rx={node.size * 0.25}
                        ry={node.size * 0.12}
                        fill="rgba(255,255,255,0.15)"
                      />
                    )}

                    {/* Border ring */}
                    <circle
                      r={node.size / 2 - 0.5}
                      fill="none"
                      stroke={isActive ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)"}
                      strokeWidth="0.4"
                      style={{ transition: "stroke 0.3s" }}
                    />

                    {/* Icon text inside node */}
                    <text
                      textAnchor="middle"
                      dy="0.5"
                      fontSize={node.size * 0.25}
                      fill="rgba(255,255,255,0.9)"
                      fontFamily="Inter, sans-serif"
                      fontWeight="600"
                    >
                      {node.category === "user" ? "👤" : label.slice(0, 2)}
                    </text>

                    {/* Label below (editable on double-click) */}
                    {isEditingThis ? (
                      <foreignObject
                        x={-25}
                        y={node.size / 2 + 1}
                        width={50}
                        height={8}
                      >
                        <input
                          ref={editInputRef}
                          type="text"
                          defaultValue={label}
                          onBlur={e => handleLabelChange(node.id, e.target.value)}
                          onKeyDown={e => handleLabelKeyDown(e, node.id)}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          style={{
                            width: "100%",
                            height: "100%",
                            background: "rgba(0,0,0,0.7)",
                            border: "1px solid rgba(139,92,246,0.6)",
                            borderRadius: "2px",
                            color: "white",
                            fontSize: "3px",
                            textAlign: "center",
                            outline: "none",
                            padding: "0 2px",
                            fontFamily: "Inter, sans-serif",
                          }}
                        />
                      </foreignObject>
                    ) : (
                      <text
                        textAnchor="middle"
                        dy={node.size / 2 + 10}
                        fontSize="7"
                        fill={isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.65)"}
                        fontFamily="Inter, sans-serif"
                        fontWeight="600"
                        style={{ transition: "fill 0.3s", cursor: "text" }}
                        onDoubleClick={e => handleLabelDoubleClick(e, node.id)}
                      >
                        {label}
                      </text>
                    )}

                    {/* Conversation count badge */}
                    {node.conversations.length > 0 && (
                      <g transform={`translate(${node.size / 2 - 2}, ${-node.size / 2 + 2})`}>
                        <circle r="3" fill="oklch(0.12 0.015 265)" stroke={style.gradient[0]} strokeWidth="0.5" />
                        <text
                          textAnchor="middle"
                          dy="1"
                          fontSize="6"
                          fill="white"
                          fontFamily="Inter, sans-serif"
                          fontWeight="700"
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
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat as CategoryFilter ? "all" : cat as CategoryFilter)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all",
                    categoryFilter === cat
                      ? `${style.bgColor} ring-1 ring-white/20`
                      : style.bgColor,
                    "hover:brightness-125"
                  )}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: `linear-gradient(135deg, ${style.gradient[0]}, ${style.gradient[1]})` }} />
                  <span className={style.textColor}>{t(style.labelKey, lang)}</span>
                </button>
              ))}
            </div>

            {/* Stats overlay */}
            <div className="absolute top-4 left-4 text-[10px] text-white/20 space-y-0.5">
              <p>{t("memory.nodes", lang)}: {nodes.length - 1} · {t("memory.relatedNodes", lang)}: {edges.length}</p>
              <p>{t("memory.conversations", lang)}: {totalConversations}</p>
              {dragNode && <p className="text-blue-300">{t("memory.dragging", lang)}</p>}
            </div>
          </div>

          {/* Detail Panel */}
          {selectedNode && (
            <div className="w-80 border-l border-white/[0.06] bg-white/3 backdrop-blur-sm flex flex-col shrink-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center")}
                    style={{ background: `linear-gradient(135deg, ${CATEGORY_STYLES[selectedNode.category].gradient[0]}, ${CATEGORY_STYLES[selectedNode.category].gradient[1]})` }}
                  >
                    <Tag size={13} className="text-white" />
                  </div>
                  <div>
                    {editingNodeId === selectedNode.id && editingInPanel ? (
                      <input
                        ref={panelEditInputRef}
                        type="text"
                        defaultValue={getNodeLabel(selectedNode)}
                        onBlur={e => handleLabelChange(selectedNode.id, e.target.value)}
                        onKeyDown={e => handleLabelKeyDown(e, selectedNode.id)}
                        className="text-sm font-semibold text-white/90 bg-white/10 border border-violet-500/40 rounded px-1.5 py-0.5 outline-none w-36"
                      />
                    ) : (
                      <p
                        className="text-sm font-semibold text-white/90 cursor-text hover:text-violet-300 transition-colors"
                        onDoubleClick={() => handlePanelLabelDoubleClick(selectedNode.id)}
                        title={t("memory.editLabel", lang)}
                      >
                        {getNodeLabel(selectedNode)}
                      </p>
                    )}
                    <p className="text-[10px] text-white/40">
                      {t(CATEGORY_STYLES[selectedNode.category].labelKey, lang)} · {selectedNode.conversations.length} {t("memory.conversations", lang)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {selectedNode.id !== "user" && (
                    <button
                      onClick={() => {
                        if (window.confirm(t("memory.deleteConfirm", lang))) {
                          handleDeleteNode(selectedNode.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title={t("memory.deleteNode", lang)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Keywords */}
              {selectedNode.keywords && selectedNode.keywords.length > 0 && (
                <div className="px-4 py-2 border-b border-white/[0.04] flex flex-wrap gap-1">
                  {selectedNode.keywords.map(kw => (
                    <span key={kw} className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-white/35 border border-white/6">
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {selectedNode.conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <Sparkles size={24} className="mx-auto text-white/20 mb-2" />
                    <p className="text-sm text-white/30">{t("memory.coreNode", lang)}</p>
                    <p className="text-xs text-white/20 mt-1">{t("memory.coreNodeDesc", lang)}</p>
                  </div>
                ) : (
                  selectedNode.conversations.map(conv => (
                    <div
                      key={conv.id}
                      className="rounded-xl border border-white/8 bg-white/4 p-3 hover:bg-white/6 transition-colors cursor-pointer group"
                      onClick={() => {
                        if (conv.conversationId) {
                          saveUserData(userId, "active-conversation", conv.conversationId);
                        }
                        toast.info(
                          lang === "en"
                            ? `Navigating to conversation: "${conv.topic}"`
                            : `正在前往對話：「${conv.topic}」`,
                        );
                        window.location.href = "/";
                      }}
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
                      <div className="flex items-center gap-1 mt-2 text-white/25 group-hover:text-blue-400/60 transition-colors">
                        <MessageSquare size={10} />
                        <span className="text-[10px]">{t("memory.viewConversation", lang)}</span>
                        <ChevronRight size={10} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Related Nodes */}
              <div className="shrink-0 border-t border-white/[0.06] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">{t("memory.relatedNodes", lang)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {edges
                    .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
                    .sort((a, b) => b.strength - a.strength)
                    .map(e => {
                      const relId = e.from === selectedNode.id ? e.to : e.from;
                      const rel = nodes.find(n => n.id === relId);
                      if (!rel) return null;
                      const relStyle = CATEGORY_STYLES[rel.category];
                      return (
                        <button
                          key={relId}
                          onClick={() => setSelectedNode(rel)}
                          className={cn(
                            "text-[10px] px-2 py-1 rounded-lg border transition-colors hover:brightness-125",
                            relStyle.bgColor, relStyle.textColor
                          )}
                        >
                          {getNodeLabel(rel)}
                          {e.label && <span className="ml-1 text-white/20">({e.label})</span>}
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
