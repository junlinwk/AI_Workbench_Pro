/**
 * HandGestureOverlay — Camera preview + gesture state indicator
 *
 * Shows a small mirrored camera preview (120×90) in the chat area,
 * with visual state badges and directional hints during FIST_GRABBED state.
 *
 * Supports popping out into a floating Document PiP window that stays
 * on top and keeps detecting even when the main tab is in background.
 */
import { cn } from "@/lib/utils"
import { Loader2, ExternalLink, Minimize2 } from "lucide-react"
import type { GestureState } from "@/lib/gestureStateMachine"

interface HandGestureOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  gestureState: GestureState
  isModelLoading: boolean
  modelLoadError: string | null
  audioLevel: number
  cameraActive: boolean
  lang: "zh-TW" | "en"
  isPiP: boolean
  pipSupported: boolean
  onPopOut: () => void
  onPopIn: () => void
}

const STATE_CONFIG: Record<
  GestureState,
  { border: string; label_zh: string; label_en: string; glow?: string }
> = {
  IDLE: {
    border: "border-white/20",
    label_zh: "伸出手掌 ✋",
    label_en: "Show palm ✋",
  },
  HAND_OPEN: {
    border: "border-blue-400/60",
    label_zh: "握拳開始錄音 ✊",
    label_en: "Make fist to record ✊",
    glow: "shadow-blue-500/30",
  },
  FIST_GRABBED: {
    border: "border-violet-400/60",
    label_zh: "前推發送 ↑ / 往後丟捨棄 ↓",
    label_en: "Push fwd to send / Pull back to discard",
    glow: "shadow-violet-500/30",
  },
  PUSH_SEND: {
    border: "border-emerald-400/60",
    label_zh: "發送中...",
    label_en: "Sending...",
    glow: "shadow-emerald-500/40",
  },
  THROW_DISCARD: {
    border: "border-red-400/60",
    label_zh: "已捨棄",
    label_en: "Discarded",
    glow: "shadow-red-500/40",
  },
}

export function HandGestureOverlay({
  videoRef,
  gestureState,
  isModelLoading,
  modelLoadError,
  audioLevel,
  cameraActive,
  lang,
  isPiP,
  pipSupported,
  onPopOut,
  onPopIn,
}: HandGestureOverlayProps) {
  const config = STATE_CONFIG[gestureState]
  const label = lang === "en" ? config.label_en : config.label_zh

  // When in PiP mode, show a minimal indicator instead of the full preview
  if (isPiP) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "px-2 py-1 rounded-lg text-[10px] backdrop-blur-sm transition-all duration-300",
            gestureState === "FIST_GRABBED"
              ? "bg-violet-500/20 text-violet-300"
              : gestureState === "PUSH_SEND"
                ? "bg-emerald-500/20 text-emerald-300 animate-pulse"
                : gestureState === "THROW_DISCARD"
                  ? "bg-red-500/20 text-red-300 animate-pulse"
                  : gestureState === "HAND_OPEN"
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-white/5 text-white/40",
          )}
        >
          {lang === "en" ? "Gesture PiP active" : "手勢懸浮窗啟用中"}
          <span className="ml-1.5 font-mono">{gestureState}</span>
        </div>
        <button
          onClick={onPopIn}
          className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
          title={lang === "en" ? "Close PiP window" : "關閉懸浮窗"}
        >
          <Minimize2 size={12} />
        </button>
        {/* Hidden video — keeps ref alive for when PiP closes */}
        <video
          ref={videoRef}
          className="hidden"
          autoPlay
          playsInline
          muted
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* State badge + PiP button */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "px-2 py-0.5 rounded-lg text-[10px] backdrop-blur-sm transition-all duration-300",
            gestureState === "FIST_GRABBED"
              ? "bg-violet-500/20 text-violet-300"
              : gestureState === "PUSH_SEND"
                ? "bg-emerald-500/20 text-emerald-300 animate-pulse"
                : gestureState === "THROW_DISCARD"
                  ? "bg-red-500/20 text-red-300 animate-pulse"
                  : gestureState === "HAND_OPEN"
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-white/5 text-white/40",
          )}
        >
          {isModelLoading ? (
            <span className="flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              {lang === "en" ? "Loading model..." : "載入模型中..."}
            </span>
          ) : modelLoadError ? (
            <span className="text-red-400">
              {lang === "en" ? "Error: " : "錯誤："}{modelLoadError}
            </span>
          ) : (
            label
          )}
        </div>

        {/* Pop-out to PiP button */}
        {pipSupported && cameraActive && (
          <button
            onClick={onPopOut}
            className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
            title={lang === "en" ? "Pop out to floating window" : "彈出懸浮窗"}
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {/* Camera preview */}
      <div className="relative">
        {/* Audio level pulse ring (when recording) */}
        {gestureState === "FIST_GRABBED" && (
          <div
            className="absolute inset-0 rounded-xl border-2 border-violet-400/40 pointer-events-none"
            style={{
              transform: `scale(${1 + audioLevel * 0.3})`,
              opacity: 0.3 + audioLevel * 0.7,
              transition: "transform 0.08s, opacity 0.08s",
            }}
          />
        )}

        {/* Recording dot */}
        {gestureState === "FIST_GRABBED" && (
          <div className="absolute top-1 left-1 z-20 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[8px] text-red-400">REC</span>
          </div>
        )}

        <video
          ref={videoRef}
          className={cn(
            "w-[120px] h-[90px] rounded-xl object-cover transition-all duration-300",
            "border-2 shadow-lg",
            config.border,
            config.glow && `shadow-lg ${config.glow}`,
            !cameraActive && "bg-black/60",
          )}
          style={{ transform: "scaleX(-1)" }}
          autoPlay
          playsInline
          muted
        />
      </div>
    </div>
  )
}
