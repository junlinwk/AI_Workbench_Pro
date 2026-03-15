/**
 * ChatInterface Component — Void Glass Design System
 * Main chat area with message feed, input bar, and Markdown rendering
 */
import { useState, useRef, useEffect } from "react";
import {
  Send, Plus, Link2, RefreshCw, Edit3, Copy, ThumbsUp, ThumbsDown,
  FileText, Image as ImageIcon, Code2, Globe, ChevronDown, Paperclip,
  Sparkles, User, MoreHorizontal, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

interface Citation {
  id: number;
  title: string;
  url: string;
  domain: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: Citation[];
  isWidget?: boolean;
}

const DEMO_MESSAGES: Message[] = [
  {
    id: "m1",
    role: "user",
    content: "請幫我設計一個 React 保險應用程式的架構，需要支援多語言和深色模式。",
    timestamp: "14:23",
  },
  {
    id: "m2",
    role: "assistant",
    content: `## 保險應用程式架構設計

根據您的需求，我建議採用以下架構方案：

### 技術棧選擇

\`\`\`typescript
// 核心依賴
{
  "framework": "React 19 + TypeScript",
  "state": "Zustand + React Query",
  "i18n": "react-i18next",
  "styling": "Tailwind CSS + shadcn/ui",
  "routing": "React Router v6"
}
\`\`\`

### 目錄結構

\`\`\`
src/
├── features/          # 功能模組
│   ├── auth/          # 認證
│   ├── policies/      # 保單管理
│   ├── claims/        # 理賠申請
│   └── dashboard/     # 儀表板
├── shared/            # 共用元件
│   ├── components/
│   ├── hooks/
│   └── utils/
└── i18n/              # 多語言資源
    ├── zh-TW.json
    └── en.json
\`\`\`

### 多語言實作

使用 **react-i18next** 搭配動態載入，避免初始包體積過大。每個功能模組維護自己的翻譯命名空間。

### 深色模式

透過 CSS 變數 + \`next-themes\` 實現系統級主題同步，確保 SSR 無閃爍問題。

> 💡 **建議**：將保單資料的狀態機邏輯抽離到獨立的 \`policyMachine.ts\`，使用 XState 管理複雜的業務流程。`,
    timestamp: "14:23",
    citations: [
      { id: 1, title: "React 架構最佳實踐 2026", url: "#", domain: "react.dev" },
      { id: 2, title: "i18next 官方文件", url: "#", domain: "i18next.com" },
      { id: 3, title: "Zustand 狀態管理指南", url: "#", domain: "zustand.docs" },
    ],
  },
  {
    id: "m3",
    role: "user",
    content: "很好！能幫我生成一個記帳追蹤的 Widget 嗎？",
    timestamp: "14:25",
  },
  {
    id: "m4",
    role: "assistant",
    content: "當然！我已為您生成了一個互動式記帳 Widget，您可以直接在對話中使用它：",
    timestamp: "14:25",
    isWidget: true,
  },
];

function LedgerWidget() {
  const [entries, setEntries] = useState([
    { id: 1, desc: "午餐", amount: 180, category: "餐飲" },
    { id: 2, desc: "交通費", amount: 45, category: "交通" },
    { id: 3, desc: "書籍", amount: 350, category: "教育" },
  ]);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("餐飲");

  const total = entries.reduce((sum, e) => sum + e.amount, 0);

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

  const categoryColors: Record<string, string> = {
    "餐飲": "bg-orange-500/20 text-orange-300",
    "交通": "bg-blue-500/20 text-blue-300",
    "教育": "bg-violet-500/20 text-violet-300",
    "娛樂": "bg-pink-500/20 text-pink-300",
    "其他": "bg-gray-500/20 text-gray-300",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden w-full max-w-sm">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-indicator" />
          <span className="text-sm font-semibold text-white/90">記帳追蹤器</span>
        </div>
        <span className="text-xs text-white/40">互動 Widget</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Input Row */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="項目描述"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="flex-1 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
          />
          <input
            type="number"
            placeholder="金額"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-20 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-white/8 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-blue-500/50"
          >
            {Object.keys(categoryColors).map(c => (
              <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAdd}
          className="w-full py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium transition-colors"
        >
          新增記錄
        </button>
        {/* Entries */}
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {entries.map(e => (
            <div key={e.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/4">
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-medium", categoryColors[e.category] || categoryColors["其他"])}>
                  {e.category}
                </span>
                <span className="text-xs text-white/70">{e.desc}</span>
              </div>
              <span className="text-xs font-mono text-white/80">NT${e.amount}</span>
            </div>
          ))}
        </div>
        {/* Total */}
        <div className="flex justify-between items-center pt-1 border-t border-white/8">
          <span className="text-xs text-white/40">總計</span>
          <span className="text-sm font-bold text-white font-mono">NT${total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "flex gap-3 group",
      isUser ? "flex-row-reverse" : "flex-row"
    )}>
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
        isUser
          ? "bg-gradient-to-br from-blue-500 to-violet-600"
          : "bg-gradient-to-br from-violet-600 to-blue-500 ring-1 ring-white/10"
      )}>
        {isUser ? <User size={14} className="text-white" /> : <Sparkles size={14} className="text-white" />}
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0", isUser ? "items-end" : "items-start", "flex flex-col gap-1")}>
        <div className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-blue-600/25 border border-blue-500/20 text-white/90 rounded-tr-sm"
            : "bg-white/5 border border-white/8 text-white/85 rounded-tl-sm"
        )}>
          {message.isWidget ? (
            <div className="space-y-3">
              <p className="text-sm text-white/80">{message.content}</p>
              <LedgerWidget />
            </div>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-white/90 prose-headings:font-semibold
              prose-p:text-white/75 prose-p:leading-relaxed
              prose-code:text-blue-300 prose-code:bg-blue-900/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
              prose-pre:bg-[oklch(0.10_0.015_265)] prose-pre:border prose-pre:border-white/8 prose-pre:rounded-xl
              prose-strong:text-white/90
              prose-blockquote:border-l-blue-500/50 prose-blockquote:text-white/60
              prose-li:text-white/75
            ">
              <Streamdown>{message.content}</Streamdown>
            </div>
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-w-[85%]">
            {message.citations.map(c => (
              <a
                key={c.id}
                href={c.url}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/8 hover:bg-white/8 transition-colors"
                onClick={e => { e.preventDefault(); toast.info(`來源：${c.title}`); }}
              >
                <Globe size={10} className="text-white/30" />
                <span className="text-[10px] text-white/45">{c.domain}</span>
                <span className="text-[10px] text-white/30">[{c.id}]</span>
              </a>
            ))}
          </div>
        )}

        {/* Actions (AI messages only) */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              <span className="text-[10px]">{copied ? "已複製" : "複製"}</span>
            </button>
            <button
              onClick={() => toast.info("重新生成中...")}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <RefreshCw size={11} />
              <span className="text-[10px]">重新生成</span>
            </button>
            <button
              onClick={() => toast.success("已標記為有幫助")}
              className="p-1 rounded-lg text-white/30 hover:text-emerald-400 hover:bg-white/5 transition-colors"
            >
              <ThumbsUp size={11} />
            </button>
            <button
              onClick={() => toast.info("感謝您的回饋")}
              className="p-1 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
            >
              <ThumbsDown size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 ring-1 ring-white/10 flex items-center justify-center shrink-0">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 typing-dot" />
        </div>
      </div>
    </div>
  );
}

interface ChatInterfaceProps {
  onArtifactOpen?: () => void;
}

export default function ChatInterface({ onArtifactOpen }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: `m${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const aiMsg: Message = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: `感謝您的提問！這是一個展示用的 AI Workbench 介面。\n\n您的訊息：**"${userMsg.content}"** 已收到。\n\n在實際部署中，這裡會連接到真實的 AI 模型 API，提供完整的對話功能。`,
        timestamp: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, aiMsg]);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className="fade-up"
            style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}
          >
            <MessageBubble message={msg} />
          </div>
        ))}
        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 pb-4">
        <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden
          focus-within:border-blue-500/40 focus-within:bg-white/7 transition-all duration-200
          shadow-lg shadow-black/20">
          {/* Attachment Menu */}
          {showAttachMenu && (
            <div className="absolute bottom-full left-0 mb-2 flex gap-2 p-2 rounded-xl bg-[oklch(0.12_0.015_265)] border border-white/10 shadow-xl">
              {[
                { icon: <FileText size={14} />, label: "PDF", color: "text-red-400" },
                { icon: <ImageIcon size={14} />, label: "圖片", color: "text-green-400" },
                { icon: <Code2 size={14} />, label: "程式碼", color: "text-blue-400" },
              ].map(item => (
                <button
                  key={item.label}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/8 transition-colors"
                  onClick={() => { setShowAttachMenu(false); toast.info(`上傳 ${item.label} 功能即將推出`); }}
                >
                  <span className={item.color}>{item.icon}</span>
                  <span className="text-[10px] text-white/50">{item.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 p-3">
            {/* Attach Button */}
            <button
              onClick={() => setShowAttachMenu(prev => !prev)}
              className={cn(
                "p-2 rounded-xl transition-all duration-150 shrink-0",
                showAttachMenu
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-white/30 hover:text-white/60 hover:bg-white/8"
              )}
            >
              <Plus size={16} />
            </button>

            {/* URL Button */}
            <button
              onClick={() => toast.info("URL 輸入功能即將推出")}
              className="p-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/8 transition-all duration-150 shrink-0"
            >
              <Link2 size={16} />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息... (Shift+Enter 換行)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-white/85 placeholder:text-white/25 resize-none focus:outline-none leading-relaxed py-1 min-h-[28px] max-h-40"
            />

            {/* Artifact Button */}
            <button
              onClick={onArtifactOpen}
              className="p-2 rounded-xl text-white/30 hover:text-violet-400 hover:bg-violet-600/10 transition-all duration-150 shrink-0"
              title="開啟 Artifacts 面板"
            >
              <Code2 size={16} />
            </button>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "p-2 rounded-xl transition-all duration-150 shrink-0",
                input.trim()
                  ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40"
                  : "text-white/20 bg-white/5 cursor-not-allowed"
              )}
            >
              <Send size={16} />
            </button>
          </div>

          {/* Bottom hint */}
          <div className="px-4 pb-2 flex items-center justify-between">
            <span className="text-[10px] text-white/20">Enter 發送 · Shift+Enter 換行</span>
            <span className="text-[10px] text-white/20">{input.length}/4096</span>
          </div>
        </div>
      </div>
    </div>
  );
}
