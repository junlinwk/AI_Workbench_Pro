/**
 * WidgetsShowcase — Void Glass Design System
 * Demonstrates AI-generated interactive widgets embedded in chat
 * Features: Ledger Widget, Bar Chart, Real-time updates
 */
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { cn } from "@/lib/utils";
import { Sparkles, User, TrendingUp, PlusCircle, Trash2 } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "餐飲": "#f97316",
  "交通": "#3b82f6",
  "教育": "#8b5cf6",
  "娛樂": "#ec4899",
  "購物": "#10b981",
  "其他": "#6b7280",
};

interface Entry {
  id: number;
  desc: string;
  amount: number;
  category: string;
}

function LedgerWidgetFull() {
  const [entries, setEntries] = useState<Entry[]>([
    { id: 1, desc: "午餐便當", amount: 180, category: "餐飲" },
    { id: 2, desc: "捷運月票", amount: 1280, category: "交通" },
    { id: 3, desc: "程式設計書籍", amount: 650, category: "教育" },
    { id: 4, desc: "電影票", amount: 320, category: "娛樂" },
    { id: 5, desc: "超市採購", amount: 890, category: "購物" },
  ]);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("餐飲");

  const total = entries.reduce((s, e) => s + e.amount, 0);

  const chartData = Object.entries(
    entries.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const handleAdd = () => {
    if (!amount || !desc) return;
    setEntries(prev => [...prev, {
      id: Date.now(),
      desc,
      amount: parseFloat(amount),
      category,
    }]);
    setAmount("");
    setDesc("");
  };

  const handleDelete = (id: number) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Widget Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-indicator" />
          <span className="text-sm font-semibold text-white/90">記帳追蹤器</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-600/15 text-blue-400 border border-blue-500/20">
            互動 Widget
          </span>
        </div>
        <span className="text-xs font-mono text-white/50">NT${total.toLocaleString()}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Input Row */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="項目描述"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="flex-1 bg-white/8 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
          />
          <input
            type="number"
            placeholder="金額"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="w-24 bg-white/8 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-white/8 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-blue-500/50"
          >
            {Object.keys(CATEGORY_COLORS).map(c => (
              <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            className="p-2 rounded-xl bg-blue-600/80 hover:bg-blue-500 text-white transition-colors"
          >
            <PlusCircle size={14} />
          </button>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-2 gap-4">
          {/* Entries List */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">支出記錄</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {entries.map(e => (
                <div
                  key={e.id}
                  className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/4 group hover:bg-white/6 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: CATEGORY_COLORS[e.category] || "#6b7280" }}
                    />
                    <span className="text-xs text-white/70 truncate">{e.desc}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-white/80">NT${e.amount.toLocaleString()}</span>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Total */}
            <div className="flex justify-between items-center pt-2 border-t border-white/8">
              <span className="text-xs text-white/40">總計</span>
              <span className="text-sm font-bold text-white font-mono">NT${total.toLocaleString()}</span>
            </div>
          </div>

          {/* Pie Chart */}
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">分類佔比</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="45%"
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={CATEGORY_COLORS[entry.name] || "#6b7280"}
                      opacity={0.85}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1a1a2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                    fontSize: "11px",
                  }}
                  formatter={(value: number) => [`NT$${value.toLocaleString()}`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {chartData.map(item => (
                <div key={item.name} className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_COLORS[item.name] }} />
                  <span className="text-[10px] text-white/40">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WidgetsShowcase() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Chat context */}
      <div className="px-6 py-6 space-y-6">
        {/* User message */}
        <div className="flex gap-3 flex-row-reverse">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
            <User size={14} className="text-white" />
          </div>
          <div className="max-w-[70%] rounded-2xl rounded-tr-sm px-4 py-3 bg-blue-600/25 border border-blue-500/20">
            <p className="text-sm text-white/90">能幫我生成一個記帳追蹤的 Widget 嗎？我想在對話中直接使用它。</p>
          </div>
        </div>

        {/* AI response with widget */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 ring-1 ring-white/10 flex items-center justify-center shrink-0 mt-1">
            <Sparkles size={14} className="text-white" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-3 bg-white/5 border border-white/8">
              <p className="text-sm text-white/80 mb-1">當然！我已為您生成了一個互動式記帳 Widget，您可以直接在對話中使用它：</p>
              <div className="flex items-center gap-1.5 mt-2">
                <TrendingUp size={12} className="text-emerald-400" />
                <span className="text-xs text-white/40">支援即時圖表更新 · 可新增/刪除記錄 · 自動計算總計</span>
              </div>
            </div>
            {/* The Widget */}
            <div className="max-w-[90%]">
              <LedgerWidgetFull />
            </div>
          </div>
        </div>

        {/* Follow-up */}
        <div className="flex gap-3 flex-row-reverse">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
            <User size={14} className="text-white" />
          </div>
          <div className="max-w-[70%] rounded-2xl rounded-tr-sm px-4 py-3 bg-blue-600/25 border border-blue-500/20">
            <p className="text-sm text-white/90">很棒！這個 Widget 非常實用，可以繼續新增更多功能嗎？</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 ring-1 ring-white/10 flex items-center justify-center shrink-0">
            <Sparkles size={14} className="text-white" />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 bg-white/5 border border-white/8">
            <p className="text-sm text-white/80">當然可以！我可以為這個 Widget 新增以下功能：</p>
            <ul className="mt-2 space-y-1">
              {["匯出 CSV 報表", "設定月度預算上限", "重複記帳提醒", "多幣別支援"].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                  <div className="w-1 h-1 rounded-full bg-blue-400" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/40 mt-2">請告訴我您最需要哪個功能，我會立即生成更新版本。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
