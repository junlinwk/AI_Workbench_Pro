# AI Workbench — 設計構思

## 三種設計方向

<response>
<text>

### 方向 A：Obsidian Terminal（深淵終端）
**Design Movement**: Neo-Brutalism × Terminal Noir
**Core Principles**:
1. 原始的程式碼美學：等寬字體、命令列風格的邊框
2. 高對比度：純黑背景搭配螢光綠/琥珀色文字
3. 刻意的「未完成感」：粗邊框、無圓角、像素級精確
4. 功能優先：零裝飾，每個像素都有目的

**Color Philosophy**: 黑色 #0a0a0a 底，螢光綠 #00ff41 作為主要強調色，琥珀 #ffb300 作為次要強調色，模擬 CRT 螢幕的磷光感。

**Layout Paradigm**: 全螢幕分割面板，類似 tmux/vim 的多窗格佈局，無任何圓角或陰影。

**Signature Elements**:
1. 閃爍的游標動畫
2. 打字機效果的文字出現動畫
3. 掃描線 (scanline) CSS 疊加效果

**Interaction Philosophy**: 鍵盤優先，所有操作都有快捷鍵提示，hover 時顯示命令行語法。

**Animation**: 文字逐字出現（typewriter），面板切換用 slide-in，無緩動曲線（linear）。

**Typography System**: JetBrains Mono 作為主字體，全站統一等寬字體，無 serif。

</text>
<probability>0.07</probability>
</response>

<response>
<text>

### 方向 B：Void Glass（虛空玻璃）✅ 選定方向
**Design Movement**: Glassmorphism × 2026 Dark SaaS
**Core Principles**:
1. 深度層次：多層半透明玻璃面板，製造空間感
2. 品牌漸層：電光藍 → 紫羅蘭作為核心品牌色彩
3. 精緻排版：Geist 字體系統，嚴格的字重層級
4. 動態光效：節點、邊框的微光動畫

**Color Philosophy**: 深空黑 oklch(0.08 0.01 260) 作為底色，品牌色採電光藍 oklch(0.65 0.22 255) 與紫羅蘭 oklch(0.55 0.25 290) 漸層，強調色用青藍 oklch(0.75 0.18 200)。中性灰作為介面文字層級。

**Layout Paradigm**: 三欄非對稱佈局 — 窄側邊欄（240px）+ 主聊天區（彈性）+ 右側 Artifacts 面板（400px）。各面板為獨立玻璃卡片，懸浮在深色背景上。

**Signature Elements**:
1. 玻璃態面板：backdrop-blur + 半透明邊框 + 微光邊緣
2. 品牌漸層文字：重要標題使用 linear-gradient clip-text
3. 脈衝光點：活躍節點/狀態指示器有呼吸燈效果

**Interaction Philosophy**: 懸停時面板微微上浮（translateY -2px），按鈕有流光掃過效果，模型切換時有平滑過渡動畫。

**Animation**: 
- 頁面載入：面板從底部 fade-up（staggered，間隔 100ms）
- 訊息出現：從左/右 slide-in + fade
- 知識圖譜節點：彈性縮放（spring physics）
- 模型切換下拉：scale + fade（origin: top）

**Typography System**: 
- 顯示字體：Geist（Google Fonts）— 用於標題、模型名稱
- 內文字體：Inter — 用於對話內容、說明文字
- 程式碼字體：JetBrains Mono — 用於 Artifacts 程式碼區

</text>
<probability>0.09</probability>
</response>

<response>
<text>

### 方向 C：Ivory Meridian（象牙子午線）
**Design Movement**: Refined Minimalism × Editorial
**Core Principles**:
1. 極致留白：內容密度低，每個元素都有呼吸空間
2. 紙質質感：米白底色，細緻的紙張紋理疊加
3. 墨水美學：深炭黑文字，如同精緻印刷品
4. 線條主義：用 1px 細線代替色塊來劃分區域

**Color Philosophy**: 象牙白 #faf8f5 底，炭黑 #1a1a1a 文字，品牌色用深靛藍 #1e3a5f，強調色用金銅 #c9a84c。

**Layout Paradigm**: 雜誌式排版，側邊欄用細線分隔而非色塊，主內容區大量留白，字體大小差異極大（12px 到 48px 跨度）。

**Signature Elements**:
1. 細線框架：所有卡片只有 1px border，無背景色
2. 大寫小型字母標籤（font-variant: small-caps）
3. 數字排版：表格數字使用 tabular-nums

**Interaction Philosophy**: 極度克制，hover 只改變文字顏色，無位移或縮放，保持靜謐感。

**Animation**: 僅使用 opacity 過渡（200ms），無任何位移動畫，追求「呼吸」而非「運動」。

**Typography System**: 
- 顯示字體：Playfair Display（Serif）— 用於大標題
- 內文字體：Source Serif 4 — 用於對話內容
- UI 字體：DM Sans — 用於按鈕、標籤

</text>
<probability>0.06</probability>
</response>

---

## 選定方向：方向 B — Void Glass（虛空玻璃）

採用 **Glassmorphism × 2026 Dark SaaS** 美學，以深空黑為底，電光藍/紫羅蘭漸層為品牌色，Geist + Inter + JetBrains Mono 字體系統，打造具有深度感與科技感的 AI 工作台介面。
