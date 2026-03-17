/**
 * ComputeToggle — Hybrid Compute Resource Toggle
 * Void Glass design: dark glassmorphism, oklch accent colors
 * Displays local vs cloud compute metrics with animated real-time stats
 */
import { useState, useEffect } from "react";
import {
  Cpu, Cloud, Monitor, Zap, Activity, HardDrive, Gauge, ChevronDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";

type ComputeMode = "local" | "cloud";
type CloudTier = "standard" | "pro" | "ultra";

function randomFluctuate(base: number, range: number): number {
  return Math.max(0, Math.min(100, base + (Math.random() - 0.5) * range));
}

function ProgressBar({
  value,
  color,
  label,
  suffix = "%",
}: {
  value: number;
  color: string;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 font-mono tabular-nums">
          {Math.round(value)}{suffix}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-[1800ms] ease-in-out", color)}
          style={{ width: `${Math.round(value)}%` }}
        />
      </div>
    </div>
  );
}

export default function ComputeToggle() {
  const { settings } = useSettings();
  const lang = settings.language;

  const [mode, setMode] = useState<ComputeMode>("local");
  const [cloudTier, setCloudTier] = useState<CloudTier>("pro");
  const [autoSelect, setAutoSelect] = useState(false);

  // Animated metrics
  const [localMetrics, setLocalMetrics] = useState({
    npu: 62,
    gpu: 45,
    ram: 71,
    disk: 38,
  });

  const [cloudMetrics, setCloudMetrics] = useState({
    latency: 118,
    throughput: 74,
    queue: 2,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalMetrics({
        npu: randomFluctuate(62, 16),
        gpu: randomFluctuate(45, 12),
        ram: randomFluctuate(71, 8),
        disk: randomFluctuate(38, 4),
      });
      setCloudMetrics({
        latency: Math.round(randomFluctuate(120, 40)),
        throughput: randomFluctuate(74, 18),
        queue: Math.max(0, Math.round(randomFluctuate(2, 4))),
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const cloudTiers: { id: CloudTier; label: string; cost: string }[] = [
    { id: "standard", label: "Standard", cost: "$0.002" },
    { id: "pro", label: "Pro", cost: "$0.008" },
    { id: "ultra", label: "Ultra", cost: "$0.024" },
  ];

  return (
    <div className="w-full max-w-[400px] space-y-3 select-none">
      {/* Mode Toggle */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-3.5 h-3.5 text-white/40" />
          <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
            {lang === "en" ? "Compute Resource" : "運算資源"}
          </span>
        </div>

        <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5">
          <button
            onClick={() => setMode("local")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all duration-300",
              mode === "local"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                : "text-white/40 hover:text-white/60 border border-transparent"
            )}
          >
            <Monitor className="w-3.5 h-3.5" />
            Local
          </button>
          <button
            onClick={() => setMode("cloud")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all duration-300",
              mode === "cloud"
                ? "bg-blue-500/15 text-blue-400 border border-blue-500/25 shadow-[0_0_12px_rgba(59,130,246,0.1)]"
                : "text-white/40 hover:text-white/60 border border-transparent"
            )}
          >
            <Cloud className="w-3.5 h-3.5" />
            Cloud
          </button>
        </div>
      </div>

      {/* Local Panel */}
      {mode === "local" && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 backdrop-blur-md space-y-3 animate-in fade-in duration-300">
          {/* Device header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-medium text-white/80">M2 Pro Core</div>
                <div className="text-[10px] text-white/35">
                  {lang === "en" ? "Local Device" : "本機裝置"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                {"< 10ms"}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                {"🔒 "}{lang === "en" ? "Private" : "隱私"}
              </span>
            </div>
          </div>

          {/* Hardware stats */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3 h-3 text-emerald-400/60" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">
                {lang === "en" ? "Hardware Stats" : "硬體狀態"}
              </span>
              {/* Pulse indicator */}
              <div className="ml-auto flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400/60">
                  {lang === "en" ? "Live" : "即時"}
                </span>
              </div>
            </div>

            <ProgressBar
              label={lang === "en" ? "NPU Usage" : "NPU 使用率"}
              value={localMetrics.npu}
              color="bg-gradient-to-r from-emerald-500 to-emerald-400"
            />
            <ProgressBar
              label={lang === "en" ? "GPU Usage" : "GPU 使用率"}
              value={localMetrics.gpu}
              color="bg-gradient-to-r from-teal-500 to-emerald-400"
            />
            <ProgressBar
              label="RAM"
              value={localMetrics.ram}
              color="bg-gradient-to-r from-cyan-500 to-teal-400"
            />
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3 h-3 text-white/30" />
              <ProgressBar
                label={lang === "en" ? "Disk I/O" : "磁碟 I/O"}
                value={localMetrics.disk}
                color="bg-gradient-to-r from-emerald-600 to-emerald-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Cloud Panel */}
      {mode === "cloud" && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 backdrop-blur-md space-y-3 animate-in fade-in duration-300">
          {/* Cloud header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Cloud className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs font-medium text-white/80">
                  {lang === "en" ? "Cloud Compute" : "雲端運算"}
                </div>
                <div className="text-[10px] text-white/35 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  us-west-2
                </div>
              </div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono">
              ~{cloudMetrics.latency}ms
            </span>
          </div>

          {/* Tier selection */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-blue-400/60" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">
                {lang === "en" ? "Cloud Tier" : "雲端方案"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {cloudTiers.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setCloudTier(tier.id)}
                  className={cn(
                    "relative rounded-lg py-2 px-2 text-center transition-all duration-200 border",
                    cloudTier === tier.id
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/10"
                  )}
                >
                  {cloudTier === tier.id && (
                    <Check className="absolute top-1 right-1 w-2.5 h-2.5 text-blue-400" />
                  )}
                  <div className="text-[11px] font-medium">{tier.label}</div>
                  <div className="text-[9px] opacity-60 mt-0.5">
                    {tier.cost}/{lang === "en" ? "1K tok" : "千 tok"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Cloud metrics */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3 h-3 text-blue-400/60" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">
                {lang === "en" ? "Cloud Metrics" : "雲端指標"}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] text-blue-400/60">
                  {lang === "en" ? "Live" : "即時"}
                </span>
              </div>
            </div>

            <ProgressBar
              label={lang === "en" ? "API Latency" : "API 延遲"}
              value={Math.min(100, (cloudMetrics.latency / 200) * 100)}
              color="bg-gradient-to-r from-blue-500 to-blue-400"
              suffix={`% (${cloudMetrics.latency}ms)`}
            />
            <ProgressBar
              label={lang === "en" ? "Throughput" : "吞吐量"}
              value={cloudMetrics.throughput}
              color="bg-gradient-to-r from-indigo-500 to-blue-400"
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/50">
                {lang === "en" ? "Queue Position" : "佇列位置"}
              </span>
              <span className="text-white/70 font-mono tabular-nums">
                #{cloudMetrics.queue}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Auto toggle */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400/60" />
            <div>
              <div className="text-[11px] font-medium text-white/70">Auto</div>
              <div className="text-[9px] text-white/35 max-w-[240px]">
                {lang === "en"
                  ? "AI auto-selects based on task complexity"
                  : "AI 依任務複雜度自動選擇運算資源"}
              </div>
            </div>
          </div>
          <button
            onClick={() => setAutoSelect(!autoSelect)}
            className={cn(
              "relative w-8 h-[18px] rounded-full transition-all duration-300 border",
              autoSelect
                ? "bg-amber-500/20 border-amber-500/30"
                : "bg-white/[0.04] border-white/[0.08]"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 w-3 h-3 rounded-full transition-all duration-300",
                autoSelect
                  ? "left-[15px] bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.4)]"
                  : "left-0.5 bg-white/30"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
