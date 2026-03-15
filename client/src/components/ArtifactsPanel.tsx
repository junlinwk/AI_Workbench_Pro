/**
 * ArtifactsPanel Component — Void Glass Design System
 * Right-side canvas panel with Code editor + Live Preview tabs
 */
import { useState } from "react";
import {
  Code2, Eye, Copy, Download, Maximize2, X, ChevronDown,
  Play, RotateCcw, Check, FileCode, Globe, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart
} from "recharts";

const DEMO_CODE = `import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// 保費趨勢儀表板
const data = [
  { month: '1月', premium: 4200, claims: 1800 },
  { month: '2月', premium: 3800, claims: 2100 },
  { month: '3月', premium: 5100, claims: 1500 },
  { month: '4月', premium: 4700, claims: 2300 },
  { month: '5月', premium: 5900, claims: 1900 },
  { month: '6月', premium: 6200, claims: 2800 },
];

export default function InsuranceDashboard() {
  const [activeMetric, setActiveMetric] = useState('premium');

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-6">
        保險業務儀表板
      </h1>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-600/20 rounded-xl p-4 border border-blue-500/20">
          <p className="text-sm text-blue-300">總保費收入</p>
          <p className="text-2xl font-bold mt-1">NT$29.9M</p>
          <p className="text-xs text-green-400 mt-1">↑ 12.3%</p>
        </div>
        <div className="bg-violet-600/20 rounded-xl p-4 border border-violet-500/20">
          <p className="text-sm text-violet-300">理賠件數</p>
          <p className="text-2xl font-bold mt-1">1,247</p>
          <p className="text-xs text-red-400 mt-1">↑ 5.1%</p>
        </div>
        <div className="bg-emerald-600/20 rounded-xl p-4 border border-emerald-500/20">
          <p className="text-sm text-emerald-300">客戶滿意度</p>
          <p className="text-2xl font-bold mt-1">94.2%</p>
          <p className="text-xs text-green-400 mt-1">↑ 2.8%</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <h2 className="text-sm font-medium text-white/70 mb-4">
          月度趨勢
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: '#1e1e3f',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px'
              }}
            />
            <Area
              type="monotone"
              dataKey="premium"
              stroke="#3b82f6"
              fill="url(#grad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}`;

const CHART_DATA = [
  { month: "1月", premium: 4200, claims: 1800 },
  { month: "2月", premium: 3800, claims: 2100 },
  { month: "3月", premium: 5100, claims: 1500 },
  { month: "4月", premium: 4700, claims: 2300 },
  { month: "5月", premium: 5900, claims: 1900 },
  { month: "6月", premium: 6200, claims: 2800 },
];

function LivePreview() {
  return (
    <div className="h-full bg-[#0f0f1a] overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">保險業務儀表板</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "總保費收入", value: "NT$29.9M", change: "↑ 12.3%", color: "blue", up: true },
          { label: "理賠件數", value: "1,247", change: "↑ 5.1%", color: "violet", up: false },
          { label: "客戶滿意度", value: "94.2%", change: "↑ 2.8%", color: "emerald", up: true },
        ].map(kpi => (
          <div
            key={kpi.label}
            className={cn(
              "rounded-xl p-4 border",
              kpi.color === "blue" && "bg-blue-600/20 border-blue-500/20",
              kpi.color === "violet" && "bg-violet-600/20 border-violet-500/20",
              kpi.color === "emerald" && "bg-emerald-600/20 border-emerald-500/20",
            )}
          >
            <p className={cn(
              "text-xs",
              kpi.color === "blue" && "text-blue-300",
              kpi.color === "violet" && "text-violet-300",
              kpi.color === "emerald" && "text-emerald-300",
            )}>{kpi.label}</p>
            <p className="text-xl font-bold text-white mt-1">{kpi.value}</p>
            <p className={cn("text-xs mt-1", kpi.up ? "text-emerald-400" : "text-red-400")}>{kpi.change}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <h2 className="text-sm font-medium text-white/70 mb-4">月度趨勢</h2>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={CHART_DATA}>
            <defs>
              <linearGradient id="premGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "#1e1e3f",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "white",
                fontSize: "12px",
              }}
            />
            <Area type="monotone" dataKey="premium" stroke="#3b82f6" fill="url(#premGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CodeLine({ line, lineNum }: { line: string; lineNum: number }) {
  const tokenize = (text: string) => {
    const tokens: { type: string; value: string }[] = [];
    const patterns: [RegExp, string][] = [
      [/^(import|export|from|const|let|var|function|return|default|if|else|class|new|typeof|useState|useEffect)\b/, "keyword"],
      [/^(['"`])(?:(?!\1)[^\\]|\\.)*\1/, "string"],
      [/^\/\/.*/, "comment"],
      [/^[{}[\]().,;:<>]/, "punctuation"],
      [/^\d+/, "number"],
      [/^[a-zA-Z_$][a-zA-Z0-9_$]*/, "identifier"],
      [/^\s+/, "whitespace"],
    ];
    let remaining = text;
    while (remaining.length > 0) {
      let matched = false;
      for (const [pattern, type] of patterns) {
        const m = remaining.match(pattern);
        if (m) {
          tokens.push({ type, value: m[0] });
          remaining = remaining.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        tokens.push({ type: "other", value: remaining[0] });
        remaining = remaining.slice(1);
      }
    }
    return tokens;
  };

  const colorMap: Record<string, string> = {
    keyword: "text-violet-400",
    string: "text-emerald-400",
    comment: "text-white/30 italic",
    punctuation: "text-white/50",
    number: "text-orange-400",
    identifier: "text-blue-300",
    whitespace: "",
    other: "text-white/70",
  };

  return (
    <div className="flex hover:bg-white/3 group">
      <span className="w-10 shrink-0 text-right pr-4 text-white/20 select-none text-xs leading-6 group-hover:text-white/35">
        {lineNum}
      </span>
      <span className="flex-1 text-xs leading-6 font-mono">
        {tokenize(line).map((token, i) => (
          <span key={i} className={colorMap[token.type] || "text-white/70"}>
            {token.value}
          </span>
        ))}
      </span>
    </div>
  );
}

interface ArtifactsPanelProps {
  onClose?: () => void;
}

export default function ArtifactsPanel({ onClose }: ArtifactsPanelProps) {
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [copied, setCopied] = useState(false);
  const [filename] = useState("InsuranceDashboard.tsx");

  const handleCopy = () => {
    navigator.clipboard.writeText(DEMO_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeLines = DEMO_CODE.split("\n");

  return (
    <div className="flex flex-col h-full border-l border-white/[0.06] bg-[oklch(0.10_0.015_265)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-5 h-5 rounded-md bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
            <FileCode size={11} className="text-blue-400" />
          </div>
          <span className="text-sm font-medium text-white/80 truncate">{filename}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-600/15 text-blue-400 border border-blue-500/20 shrink-0">
            TSX
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-xs"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? "已複製" : "複製"}</span>
          </button>
          <button
            onClick={() => toast.info("下載功能即將推出")}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-xs"
          >
            <Download size={12} />
            <span>下載</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] shrink-0">
        {[
          { id: "code" as const, label: "程式碼", icon: <Code2 size={12} /> },
          { id: "preview" as const, label: "預覽", icon: <Eye size={12} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
              activeTab === tab.id
                ? "bg-blue-600/20 text-blue-300 border border-blue-500/20"
                : "text-white/40 hover:text-white/60 hover:bg-white/5"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => toast.info("全螢幕模式即將推出")}
          className="p-1.5 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === "code" ? (
          <div className="h-full overflow-y-auto py-3 pr-2">
            {codeLines.map((line, i) => (
              <CodeLine key={i} line={line} lineNum={i + 1} />
            ))}
          </div>
        ) : (
          <LivePreview />
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-white/30">已渲染</span>
        </div>
        <span className="text-[10px] text-white/25 font-mono">{codeLines.length} 行</span>
      </div>
    </div>
  );
}
