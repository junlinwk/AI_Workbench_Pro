/**
 * AppLogo — Unified branding component
 *
 * Usage:
 *   <AppLogo size={48} />              — renders the app logo
 *   <AppLogo size={48} showText />     — logo + "AI Workbench" text
 *
 * To customize: replace /logos/app-logo.svg with your own SVG.
 * The AI chat bubble avatar also uses this for consistency.
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
        src="/logos/app-logo.svg"
        alt="AI Workbench"
        width={size}
        height={size}
        className="rounded-xl"
        style={{ width: size, height: size }}
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
 * AI avatar for chat bubbles — uses the app logo for brand consistency.
 * Falls back to the gradient + sparkle icon if logo not available.
 */
export function AIAvatar({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/logos/app-logo.svg"
      alt="AI"
      width={size}
      height={size}
      className="rounded-full"
      style={{ width: size, height: size }}
    />
  )
}
