/**
 * AppLogo — Unified branding component
 *
 * Logo files (in /client/public/logos/):
 *   app-logo.png       — App icon (favicon, AI avatar, login, memory map)
 *   ai-workbench.png   — Brand wordmark (sidebar header)
 */

interface AppLogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export default function AppLogo({ size = 40, showText, className }: AppLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <img
        src="/logos/app-logo.png"
        alt="AI Workbench"
        width={size}
        height={size}
        className="rounded-xl"
        style={{ width: size, height: size, objectFit: "cover" }}
      />
      {showText && (
        <span className="text-sm font-bold text-white/90 tracking-tight">
          AI Workbench
        </span>
      )}
    </div>
  )
}

/**
 * AI avatar for chat bubbles
 */
export function AIAvatar({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/logos/app-logo.png"
      alt="AI"
      width={size}
      height={size}
      className="rounded-full"
      style={{ width: size, height: size, objectFit: "cover" }}
    />
  )
}
