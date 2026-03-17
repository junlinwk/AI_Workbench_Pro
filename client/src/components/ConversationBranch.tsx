/**
 * ConversationBranch — Real Conversation Branch Manager
 * Void Glass Design System
 *
 * Manages branches of the current conversation. Users create branch points
 * from AI responses in the Chat tab, then switch between branches here.
 *
 * Event interface for ChatInterface integration:
 *   - Listens for: CustomEvent('branch-created', { detail: { messageId, preview, conversationId } })
 *   - Dispatches:  CustomEvent('switch-branch', { detail: { branchId, conversationId } })
 *
 * To add a "Branch" button in ChatInterface alongside Pin/Copy/Regenerate:
 *   dispatch a 'branch-created' event with { messageId, preview, conversationId }.
 */
import { useState, useEffect, useRef } from "react"
import {
  GitBranch,
  GitMerge,
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  ArrowRightLeft,
  Clock,
  MessageSquare,
  Hash,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSettings } from "@/contexts/SettingsContext"
import { useAuth } from "@/contexts/AuthContext"
import { loadUserData, saveUserData } from "@/lib/storage"
import { toast } from "sonner"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BranchPoint {
  id: string
  messageId: string
  messagePreview: string
  createdAt: string
  sourceBranchId: string
}

interface ConversationBranch {
  id: string
  name: string
  color: string
  branchPointId: string | null // null for "main"
  messageCount: number
  parentBranchId: string | null // null for "main"
  mergedInto?: string | null // branchId this was merged into (null = not merged)
  temperature?: number // per-branch temperature override (undefined = use global)
}

interface BranchData {
  branches: ConversationBranch[]
  branchPoints: BranchPoint[]
  activeBranchId: string
}

interface ConversationBranchProps {
  conversationId?: string
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BRANCH_COLORS = [
  "#a78bfa", // violet
  "#67e8f9", // cyan
  "#f472b6", // pink
  "#fbbf24", // amber
  "#34d399", // emerald
  "#fb923c", // orange
  "#818cf8", // indigo
  "#f87171", // red
]

const STORAGE_NS = "conv-branches"

function getStorageKey(conversationId: string): string {
  return `${STORAGE_NS}:${conversationId}`
}

function createDefaultData(): BranchData {
  return {
    branches: [
      {
        id: "main",
        name: "main",
        color: "rgb(96,165,250)",
        branchPointId: null,
        messageCount: 0,
        parentBranchId: null,
      },
    ],
    branchPoints: [],
    activeBranchId: "main",
  }
}

function pickColor(existingBranches: ConversationBranch[]): string {
  const used = new Set(existingBranches.map((b) => b.color))
  return (
    BRANCH_COLORS.find((c) => !used.has(c)) ??
    BRANCH_COLORS[existingBranches.length % BRANCH_COLORS.length]
  )
}

function generateId(): string {
  return `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function formatTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return lang === "en" ? "just now" : "剛剛"
    if (diffMin < 60)
      return lang === "en" ? `${diffMin}m ago` : `${diffMin} 分鐘前`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24)
      return lang === "en" ? `${diffH}h ago` : `${diffH} 小時前`
    const diffD = Math.floor(diffH / 24)
    return lang === "en" ? `${diffD}d ago` : `${diffD} 天前`
  } catch {
    return ""
  }
}

/* ------------------------------------------------------------------ */
/*  BranchGraph — SVG timeline visualization                           */
/* ------------------------------------------------------------------ */

interface UserMessageDot {
  branchId: string
  messageId: string // id of the user message
  preview: string // first ~40 chars of user message
  // Index of the AI response that follows this user message (for branch point matching)
  nextAiMessageId: string | null
}

interface BranchGraphProps {
  branches: ConversationBranch[]
  branchPoints: BranchPoint[]
  activeBranchId: string
  selectedBranchId: string
  newlyCreatedId: string | null
  onSelectBranch: (id: string) => void
  lang: string
  userDots: Record<string, UserMessageDot[]> // branchId -> user message previews
}

function BranchGraph({
  branches,
  branchPoints,
  activeBranchId,
  selectedBranchId,
  newlyCreatedId,
  onSelectBranch,
  lang,
  userDots,
}: BranchGraphProps) {
  const mainBranch = branches.find((b) => b.id === "main")
  const [hoveredDot, setHoveredDot] = useState<{ x: number; y: number; text: string } | null>(null)

  // Pan state
  const [panX, setPanX] = useState(0)
  const panRef = useRef<{ startX: number; startPan: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    panRef.current = { startX: e.clientX, startPan: panX }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!panRef.current) return
    const dx = e.clientX - panRef.current.startX
    setPanX(panRef.current.startPan + dx)
  }
  const handlePointerUp = () => {
    panRef.current = null
  }

  // Layout constants
  const dotSpacing = 20
  const halfDot = dotSpacing / 2
  const trackGap = 45
  const startX = 50
  const mainY = 130
  const svgHeight = 300

  // Get children of a branch
  const getChildren = (parentId: string) =>
    branches.filter(
      (b) => (b.parentBranchId ?? "main") === parentId && b.id !== "main",
    )

  // Compute positions for each branch
  type TrackInfo = { forkX: number; y: number; parentY: number; direction: -1 | 1 }
  const trackMap = new Map<string, TrackInfo>()

  // Main branch
  const mainDots = userDots["main"] || []
  const mainDotCount = Math.min(mainDots.length, 30)
  const mainTrackEndX = startX + mainDotCount * dotSpacing + 40
  trackMap.set("main", { forkX: startX, y: mainY, parentY: mainY, direction: -1 })

  /**
   * Find the dot index on the parent track where this branch forks.
   * The branch point messageId is an AI message. We find which user dot
   * has that AI message as its nextAiMessageId, then place the fork
   * at dotIndex + 0.5 (half-interval after the user dot, which is
   * right after the AI response).
   */
  function findForkDotIndex(bp: BranchPoint | undefined, parentId: string): number {
    if (!bp) return 0
    const parentDots = userDots[parentId] || []
    // The branchPoint.messageId is the AI response message
    const idx = parentDots.findIndex((d) => d.nextAiMessageId === bp.messageId)
    if (idx !== -1) return idx
    // Fallback: try matching user message directly (shouldn't happen but safe)
    const idx2 = parentDots.findIndex((d) => d.messageId === bp.messageId)
    if (idx2 !== -1) return idx2
    // Last resort: use last dot
    return Math.max(0, parentDots.length - 1)
  }

  // BFS to assign positions — children grow AWAY from main
  const queue: string[] = ["main"]
  // Track how many children have been placed per parent (for Y stacking)
  const childCountPerParent = new Map<string, number>()

  while (queue.length > 0) {
    const parentId = queue.shift()!
    const parentTrack = trackMap.get(parentId)!
    const children = getChildren(parentId)

    children.forEach((child, localIdx) => {
      const bp = child.branchPointId
        ? branchPoints.find((p) => p.id === child.branchPointId)
        : undefined

      // X: fork at the half-interval after the user dot on parent track
      const dotIdx = findForkDotIndex(bp, parentId)
      // Parent's start X + dotIdx dots + half interval (AI response position)
      const forkX = parentTrack.forkX + (dotIdx + 1) * dotSpacing + halfDot

      // Direction: children of main alternate above/below
      // Children of non-main go FURTHER from main (same direction as parent)
      const siblingIdx = childCountPerParent.get(parentId) || 0
      childCountPerParent.set(parentId, siblingIdx + 1)

      let direction: -1 | 1
      if (parentId === "main") {
        direction = siblingIdx % 2 === 0 ? -1 : 1
      } else {
        direction = parentTrack.direction // same as parent → away from main
      }

      const branchY = parentTrack.y + direction * trackGap
      const clampedY = Math.max(20, Math.min(svgHeight - 20, branchY))

      trackMap.set(child.id, {
        forkX,
        y: clampedY,
        parentY: parentTrack.y,
        direction,
      })

      queue.push(child.id)
    })
  }

  const nonMainBranches = branches.filter((b) => b.id !== "main")
  const maxX = Math.max(
    mainTrackEndX,
    ...nonMainBranches.map((b) => {
      const t = trackMap.get(b.id)
      const dots = userDots[b.id] || []
      const count = Math.min(dots.length, 20)
      return (t?.forkX || 0) + count * dotSpacing + 40
    }),
  )
  const svgWidth = Math.max(500, maxX + 60)

  return (
    <div
      className="relative w-full rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md overflow-hidden cursor-grab active:cursor-grabbing select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { handlePointerUp(); setHoveredDot(null) }}
    >
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`${-panX} 0 ${svgWidth} ${svgHeight}`}
        className="block"
      >
        <defs>
          <filter id="glow-active" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Main branch track line */}
        <line
          x1={startX - 20}
          y1={mainY}
          x2={Math.max(mainTrackEndX, startX + 60)}
          y2={mainY}
          stroke="rgb(96,165,250)"
          strokeWidth={2.5}
          strokeOpacity={activeBranchId === "main" ? 0.6 : 0.3}
        />

        {/* Main branch user dots with hover preview */}
        {mainDots.slice(0, 30).map((dot, i) => {
          const cx = startX + (i + 1) * dotSpacing
          return (
            <circle
              key={`main-dot-${i}`}
              cx={cx}
              cy={mainY}
              r={3}
              fill="rgb(96,165,250)"
              fillOpacity={0.5}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredDot({ x: cx, y: mainY - 18, text: dot.preview })}
              onMouseLeave={() => setHoveredDot(null)}
            />
          )
        })}

        {/* Main branch node */}
        <g onClick={() => onSelectBranch("main")} className="cursor-pointer">
          <circle
            cx={startX}
            cy={mainY}
            r={selectedBranchId === "main" ? 9 : 7}
            fill={mainBranch?.color ?? "rgb(96,165,250)"}
            fillOpacity={0.9}
            filter={activeBranchId === "main" ? "url(#glow-active)" : undefined}
          />
          {activeBranchId === "main" && (
            <circle cx={startX} cy={mainY} r={13} fill="none" stroke="rgb(96,165,250)" strokeWidth={1.5} strokeOpacity={0.4}>
              <animate attributeName="r" values="11;15;11" dur="2s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
            </circle>
          )}
          <text x={startX} y={mainY + 26} textAnchor="middle" fill={selectedBranchId === "main" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"} fontSize={10} fontFamily="monospace" fontWeight={selectedBranchId === "main" ? 600 : 400}>
            main
          </text>
        </g>

        {/* Branch tracks (hierarchical, away from main) */}
        {nonMainBranches.map((branch) => {
          const track = trackMap.get(branch.id)
          if (!track) return null
          const bpX = track.forkX
          const branchY = track.y
          const isActive = activeBranchId === branch.id
          const isSelected = selectedBranchId === branch.id
          const isNew = newlyCreatedId === branch.id
          const isMerged = !!branch.mergedInto
          const branchDots = userDots[branch.id] || []
          const dotCount = Math.min(branchDots.length, 20)
          const trackEndX = bpX + Math.max(dotCount * dotSpacing, 20) + 10

          // Bezier from parent track to branch
          const midY = (track.parentY + branchY) / 2

          // Opacity: dimmed if merged
          const trackOpacity = isMerged ? 0.2 : isActive ? 0.5 : 0.25
          const curveOpacity = isMerged ? 0.2 : isActive ? 0.6 : 0.3

          // Merge-back line: from end of branch track back to the merge target's track
          let mergeBackTarget: TrackInfo | undefined
          if (isMerged) {
            mergeBackTarget = trackMap.get(branch.mergedInto!)
          }

          return (
            <g key={branch.id}>
              {/* Fork point diamond on parent track */}
              <polygon
                points={`${bpX},${track.parentY - 4} ${bpX + 4},${track.parentY} ${bpX},${track.parentY + 4} ${bpX - 4},${track.parentY}`}
                fill={isMerged ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.35)"}
              />

              {/* Curved connection from parent to branch */}
              <path
                d={`M ${bpX} ${track.parentY} C ${bpX} ${midY} ${bpX} ${midY} ${bpX} ${branchY}`}
                fill="none"
                stroke={branch.color}
                strokeWidth={isActive ? 2 : 1.5}
                strokeOpacity={curveOpacity}
                strokeDasharray={isMerged ? "4 3" : undefined}
              />

              {/* Branch track line (grows right) */}
              <line
                x1={bpX}
                y1={branchY}
                x2={trackEndX}
                y2={branchY}
                stroke={branch.color}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeOpacity={trackOpacity}
                strokeDasharray={isMerged ? "4 3" : undefined}
              />

              {/* User message dots with hover preview */}
              {branchDots.slice(0, 20).map((dot, j) => {
                const cx = bpX + (j + 1) * dotSpacing
                return (
                  <circle
                    key={`${branch.id}-dot-${j}`}
                    cx={cx}
                    cy={branchY}
                    r={3}
                    fill={branch.color}
                    fillOpacity={isMerged ? 0.25 : 0.5}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredDot({ x: cx, y: branchY - 18, text: dot.preview })}
                    onMouseLeave={() => setHoveredDot(null)}
                  />
                )
              })}

              {/* Merge-back curve: from branch end → merge target track */}
              {isMerged && mergeBackTarget && (
                <>
                  <path
                    d={`M ${trackEndX} ${branchY} C ${trackEndX + 15} ${branchY} ${trackEndX + 15} ${mergeBackTarget.y} ${trackEndX} ${mergeBackTarget.y}`}
                    fill="none"
                    stroke={branch.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.3}
                    strokeDasharray="4 3"
                  />
                  {/* Merge arrow on target track */}
                  <polygon
                    points={`${trackEndX},${mergeBackTarget.y - 3} ${trackEndX + 5},${mergeBackTarget.y} ${trackEndX},${mergeBackTarget.y + 3}`}
                    fill={branch.color}
                    fillOpacity={0.4}
                  />
                </>
              )}

              {/* Branch node */}
              <g onClick={() => onSelectBranch(branch.id)} className="cursor-pointer">
                {isNew && (
                  <circle cx={bpX} cy={branchY} r={6} fill="#34d399" fillOpacity={0.6}>
                    <animate attributeName="r" values="6;20;6" dur="0.8s" repeatCount="3" />
                    <animate attributeName="fill-opacity" values="0.6;0;0.6" dur="0.8s" repeatCount="3" />
                  </circle>
                )}

                <circle
                  cx={bpX}
                  cy={branchY}
                  r={isSelected ? 8 : 6}
                  fill={branch.color}
                  fillOpacity={isMerged ? 0.5 : 0.9}
                  filter={isActive ? "url(#glow-active)" : undefined}
                />

                {isActive && !isMerged && (
                  <circle cx={bpX} cy={branchY} r={12} fill="none" stroke={branch.color} strokeWidth={1.5} strokeOpacity={0.4}>
                    <animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}

                {isSelected && !isActive && (
                  <circle cx={bpX} cy={branchY} r={11} fill="none" stroke={branch.color} strokeWidth={1} strokeOpacity={0.3} />
                )}

                {/* Label */}
                <text
                  x={bpX}
                  y={branchY < track.parentY ? branchY - 14 : branchY + 18}
                  textAnchor="middle"
                  fill={isSelected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}
                  fontSize={10}
                  fontFamily="monospace"
                  fontWeight={isSelected ? 600 : 400}
                >
                  {branch.name.length > 14 ? branch.name.slice(0, 12) + ".." : branch.name}
                </text>

                {isActive && !isMerged && (
                  <text
                    x={bpX}
                    y={branchY < track.parentY ? branchY - 26 : branchY + 30}
                    textAnchor="middle"
                    fill={branch.color}
                    fontSize={8}
                    fontFamily="sans-serif"
                  >
                    {lang === "en" ? "active" : "使用中"}
                  </text>
                )}
                {isMerged && (
                  <text
                    x={bpX}
                    y={branchY < track.parentY ? branchY - 26 : branchY + 30}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.3)"
                    fontSize={8}
                    fontFamily="sans-serif"
                  >
                    {lang === "en" ? "merged" : "已合併"}
                  </text>
                )}
              </g>
            </g>
          )
        })}

        {/* Hover tooltip */}
        {hoveredDot && (
          <g>
            <rect
              x={hoveredDot.x - 80}
              y={hoveredDot.y - 16}
              width={160}
              height={20}
              rx={4}
              fill="rgba(0,0,0,0.85)"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={0.5}
            />
            <text
              x={hoveredDot.x}
              y={hoveredDot.y - 3}
              textAnchor="middle"
              fill="rgba(255,255,255,0.8)"
              fontSize={9}
              fontFamily="sans-serif"
            >
              {hoveredDot.text.length > 30 ? hoveredDot.text.slice(0, 28) + "…" : hoveredDot.text}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ConversationBranch({
  conversationId = "default",
}: ConversationBranchProps) {
  const { settings } = useSettings()
  const lang = settings.language
  const { user } = useAuth()
  const userId = user?.id ?? "anonymous"

  /* ---- state ---- */
  const [data, setData] = useState<BranchData>(() =>
    loadUserData<BranchData>(
      userId,
      getStorageKey(conversationId),
      createDefaultData()
    )
  )
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    data.activeBranchId
  )
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null)

  // User message dots per branch (only user messages, with previews)
  type UserDotInfo = { branchId: string; messageId: string; preview: string; nextAiMessageId: string | null }
  const [userDots, setUserDots] = useState<Record<string, UserDotInfo[]>>({})
  // Also keep total message counts for the stats display
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})

  const computeUserDots = () => {
    try {
      const messagesKey = `conv-messages:${conversationId}`
      const allMessages = loadUserData<any[]>(userId, messagesKey, [])
      const dots: Record<string, UserDotInfo[]> = {}
      const counts: Record<string, number> = {}

      // Group messages by branch preserving order
      const byBranch: Record<string, any[]> = {}
      for (const m of allMessages) {
        const bid = m.branchId || "main"
        counts[bid] = (counts[bid] || 0) + 1
        if (!byBranch[bid]) byBranch[bid] = []
        byBranch[bid].push(m)
      }

      // For each branch, find user messages and the AI response that follows
      for (const [bid, msgs] of Object.entries(byBranch)) {
        dots[bid] = []
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i]
          if (m.role === "user") {
            // Find the next AI message in this branch
            let nextAi: string | null = null
            for (let j = i + 1; j < msgs.length; j++) {
              if (msgs[j].role === "assistant") {
                nextAi = msgs[j].id
                break
              }
            }
            dots[bid].push({
              branchId: bid,
              messageId: m.id,
              preview: (m.content || "").replace(/[#*`\n]/g, " ").trim().slice(0, 40),
              nextAiMessageId: nextAi,
            })
          }
        }
      }

      setUserDots(dots)
      setMessageCounts(counts)
    } catch {}
  }

  // Compute on mount and when messages update
  useEffect(() => {
    computeUserDots()
    function handleMessagesUpdated(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.conversationId === conversationId) {
        computeUserDots()
      }
    }
    window.addEventListener("conv-messages-updated", handleMessagesUpdated)
    return () =>
      window.removeEventListener("conv-messages-updated", handleMessagesUpdated)
  }, [userId, conversationId])

  /* ---- persist ---- */
  useEffect(() => {
    saveUserData(userId, getStorageKey(conversationId), data)
  }, [data, userId, conversationId])

  /* ---- reload when user or conversation changes ---- */
  useEffect(() => {
    const loaded = loadUserData<BranchData>(
      userId,
      getStorageKey(conversationId),
      createDefaultData()
    )
    // Ensure new fields exist on loaded data
    const normalized: BranchData = {
      ...loaded,
      branches: loaded.branches.map((b) => ({
        ...b,
        parentBranchId: b.parentBranchId ?? (b.id === "main" ? null : "main"),
      })),
      branchPoints: loaded.branchPoints.map((bp) => ({
        ...bp,
        sourceBranchId: (bp as any).sourceBranchId ?? "main",
      })),
    }
    setData(normalized)
    setSelectedBranchId(normalized.activeBranchId)
    computeUserDots()
  }, [userId, conversationId])

  /* ---- listen for branch-created events from ChatInterface ---- */
  useEffect(() => {
    function handleBranchCreated(e: Event) {
      try {
        const detail = (e as CustomEvent).detail
        if (!detail) return
        const { conversationId: evtConvId } = detail
        if (evtConvId && evtConvId !== conversationId) return

        // ChatInterface already wrote to localStorage — reload from it
        const loaded = loadUserData<BranchData>(
          userId,
          getStorageKey(conversationId),
          createDefaultData(),
        )
        setData(loaded)
        // Select the newest branch (last in array)
        const newestBranch = loaded.branches[loaded.branches.length - 1]
        if (newestBranch) {
          setSelectedBranchId(newestBranch.id)
          // Show success animation on the new branch in the graph
          setNewlyCreatedId(newestBranch.id)
          setTimeout(() => setNewlyCreatedId(null), 2500)
        }
      } catch (err) {
        console.error("[ConversationBranch] Error handling branch-created:", err)
        toast.error(
          lang === "en"
            ? "Failed to create branch. Please try again."
            : "建立分支失敗，請再試一次。"
        )
      }
    }

    window.addEventListener("branch-created", handleBranchCreated)
    return () =>
      window.removeEventListener("branch-created", handleBranchCreated)
  }, [conversationId, userId, lang])

  /* ---- helpers ---- */
  const selectedBranch =
    data.branches.find((b) => b.id === selectedBranchId) ?? data.branches[0]

  const getBranchPoint = (bpId: string | null): BranchPoint | undefined =>
    bpId ? data.branchPoints.find((bp) => bp.id === bpId) : undefined

  const handleSwitchBranch = (branchId: string) => {
    setData((prev) => ({ ...prev, activeBranchId: branchId }))
    setSelectedBranchId(branchId)
    const branch = data.branches.find((b) => b.id === branchId)
    const bp = branch?.branchPointId
      ? data.branchPoints.find((p) => p.id === branch.branchPointId)
      : undefined
    window.dispatchEvent(
      new CustomEvent("switch-branch", {
        detail: {
          branchId,
          conversationId,
          branchPointMessageId: bp?.messageId ?? null,
        },
      })
    )
    toast.success(
      lang === "en"
        ? `Switched to branch "${branch?.name}" -- go to Chat tab to continue`
        : `已切換至分支「${branch?.name}」— 前往 Chat 頁面繼續對話`,
      { icon: <ArrowRightLeft size={16} className="text-blue-400" /> }
    )
  }

  const handleDeleteBranch = (branchId: string) => {
    if (branchId === "main") return
    const branch = data.branches.find((b) => b.id === branchId)
    setData((prev) => {
      const newBranches = prev.branches.filter((b) => b.id !== branchId)
      const usedBpIds = new Set(
        newBranches.map((b) => b.branchPointId).filter(Boolean)
      )
      const newBps = prev.branchPoints.filter((bp) => usedBpIds.has(bp.id))
      return {
        ...prev,
        branches: newBranches,
        branchPoints: newBps,
        activeBranchId:
          prev.activeBranchId === branchId ? "main" : prev.activeBranchId,
      }
    })
    if (selectedBranchId === branchId) setSelectedBranchId("main")
    setDeleteConfirmId(null)
    toast(
      lang === "en"
        ? `Deleted branch "${branch?.name}"`
        : `已刪除分支「${branch?.name}」`
    )
  }

  const handleRename = (branchId: string) => {
    const trimmed = editValue.trim()
    if (!trimmed) {
      setEditingName(null)
      return
    }
    setData((prev) => ({
      ...prev,
      branches: prev.branches.map((b) =>
        b.id === branchId ? { ...b, name: trimmed } : b
      ),
    }))
    setEditingName(null)
  }

  const handleMergeBranch = (branchId: string) => {
    const branch = data.branches.find((b) => b.id === branchId)
    if (!branch) return

    // Determine merge target: parent if it still exists and not merged, else main
    const parentId = branch.parentBranchId ?? "main"
    const parent = data.branches.find((b) => b.id === parentId)
    const parentUsable = parent && !parent.mergedInto
    const mergeTarget = parentUsable ? parentId : "main"
    const targetBranch = data.branches.find((b) => b.id === mergeTarget)

    // Dispatch merge event for ChatInterface to handle memory
    window.dispatchEvent(
      new CustomEvent("merge-branch", {
        detail: { branchId, mergeTarget, conversationId },
      })
    )

    // Keep the branch but mark it as merged; re-parent children
    setData((prev) => ({
      ...prev,
      branches: prev.branches.map((b) => {
        if (b.id === branchId) return { ...b, mergedInto: mergeTarget }
        if (b.parentBranchId === branchId) return { ...b, parentBranchId: mergeTarget }
        return b
      }),
      activeBranchId:
        prev.activeBranchId === branchId
          ? mergeTarget
          : prev.activeBranchId,
    }))

    toast.success(
      lang === "en"
        ? `Merged "${branch.name}" into ${targetBranch?.name || mergeTarget}`
        : `已將「${branch.name}」合併至 ${targetBranch?.name || mergeTarget}`,
      { icon: <GitMerge size={16} className="text-emerald-400" /> }
    )
  }

  const handleCreateBranchClick = () => {
    // Dispatch feature-switch event so WorkbenchPage can auto-switch to Chat
    window.dispatchEvent(
      new CustomEvent("feature-switch", {
        detail: { feature: "chat", reason: "create-branch" },
      })
    )
    toast(
      lang === "en"
        ? "Switching to Chat tab -- hover an AI response and click the Branch button to create a branch from that point."
        : "正在切換至 Chat 頁面 — 將滑鼠懸停在 AI 回覆上，點擊「分支」按鈕即可建立分支。",
      {
        duration: 5000,
        icon: <GitBranch size={16} className="text-blue-400" />,
      }
    )
  }

  const nonMainBranches = data.branches.filter((b) => b.id !== "main")
  const hasBranches = nonMainBranches.length > 0

  /* ---------------------------------------------------------------- */
  /*  Empty state                                                      */
  /* ---------------------------------------------------------------- */

  if (!hasBranches) {
    return (
      <div className="flex flex-col gap-4 w-full h-full p-4">
        {/* header */}
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-blue-400" />
          <h2 className="text-base font-semibold text-white/90 tracking-tight">
            {lang === "en" ? "Conversation Branching" : "對話分支管理"}
          </h2>
          <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
            1
          </span>
        </div>

        {/* main branch card */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] backdrop-blur-md p-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-sm font-semibold text-blue-400 font-mono">
              main
            </span>
            <span className="text-[11px] text-white/30 ml-auto">
              {lang === "en" ? "active" : "使用中"}
            </span>
          </div>
        </div>

        {/* empty state */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
            <GitBranch size={28} className="text-white/20" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-white/50">
              {lang === "en" ? "No branches yet" : "尚無分支"}
            </p>
            <p className="text-xs text-white/30 max-w-[320px] leading-relaxed">
              {lang === "en"
                ? "Create a branch from any AI response in the Chat tab to explore different conversation paths"
                : "在 Chat 頁面中，從任何 AI 回覆建立分支，以探索不同的對話路徑"}
            </p>
          </div>
          <button
            onClick={handleCreateBranchClick}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white transition-colors"
          >
            <Plus size={15} />
            {lang === "en" ? "Create Branch" : "建立分支"}
          </button>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Two-panel layout with graph                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col gap-4 w-full h-full p-4">
      {/* header */}
      <div className="flex items-center gap-2">
        <GitBranch size={18} className="text-blue-400" />
        <h2 className="text-base font-semibold text-white/90 tracking-tight">
          {lang === "en" ? "Conversation Branching" : "對話分支管理"}
        </h2>
        <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
          {data.branches.length}
        </span>
      </div>

      {/* SVG Branch Graph */}
      <BranchGraph
        branches={data.branches}
        branchPoints={data.branchPoints}
        activeBranchId={data.activeBranchId}
        selectedBranchId={selectedBranchId}
        newlyCreatedId={newlyCreatedId}
        onSelectBranch={setSelectedBranchId}
        lang={lang}
        userDots={userDots}
      />

      {/* panels */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* -------- LEFT: Branch list -------- */}
        <div className="w-[300px] shrink-0 flex flex-col rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden">
          {/* list header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              {lang === "en" ? "Branches" : "分支"}
            </span>
            <span className="text-[10px] text-white/30">
              {data.branches.length}
            </span>
          </div>

          {/* list body */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
            {/* main always first */}
            {data.branches
              .sort((a, b) =>
                a.id === "main" ? -1 : b.id === "main" ? 1 : 0
              )
              .map((branch) => {
                const isActive = data.activeBranchId === branch.id
                const isSelected = selectedBranchId === branch.id
                const bp = getBranchPoint(branch.branchPointId)

                return (
                  <div
                    key={branch.id}
                    onClick={() => setSelectedBranchId(branch.id)}
                    className={cn(
                      "px-4 py-3 cursor-pointer border-l-2 transition-all duration-200",
                      isSelected
                        ? "bg-white/[0.06] border-l-blue-400"
                        : "border-l-transparent hover:bg-white/[0.03]",
                      isActive && "ring-1 ring-inset ring-blue-500/20"
                    )}
                    style={
                      isActive
                        ? {
                            boxShadow:
                              "inset 0 0 16px rgba(96,165,250,0.08)",
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: branch.color }}
                      />
                      <span className="text-sm font-medium text-white/80 truncate font-mono">
                        {branch.name}
                      </span>
                      {isActive && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 ml-auto shrink-0">
                          {lang === "en" ? "active" : "使用中"}
                        </span>
                      )}
                      {branch.id !== "main" && !isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirmId(
                              deleteConfirmId === branch.id
                                ? null
                                : branch.id
                            )
                          }}
                          className="ml-auto p-1 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors shrink-0"
                          title={lang === "en" ? "Delete" : "刪除"}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {/* metadata row */}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/30">
                      <span className="flex items-center gap-1">
                        <Hash size={9} />
                        {messageCounts[branch.id] || 0}
                      </span>
                      {bp && (
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
                          {formatTime(bp.createdAt, lang)}
                        </span>
                      )}
                    </div>

                    {/* inline delete confirmation */}
                    {deleteConfirmId === branch.id && (
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <span className="text-red-400/70">
                          {lang === "en" ? "Delete?" : "確認刪除？"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteBranch(branch.id)
                          }}
                          className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                        >
                          {lang === "en" ? "Yes" : "是"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirmId(null)
                          }}
                          className="px-2 py-0.5 rounded bg-white/5 text-white/40 hover:bg-white/10 transition-colors"
                        >
                          {lang === "en" ? "No" : "否"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>

          {/* create branch button */}
          <div className="p-3 border-t border-white/10">
            <button
              onClick={handleCreateBranchClick}
              className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.06] text-white/50 hover:text-white/70 transition-colors"
            >
              <Plus size={14} />
              {lang === "en" ? "Create Branch" : "建立分支"}
            </button>
          </div>
        </div>

        {/* -------- RIGHT: Branch info -------- */}
        <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
          {selectedBranch && (
            <div className="p-5 space-y-5">
              {/* branch name (editable) */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5 block">
                  {lang === "en" ? "Branch Name" : "分支名稱"}
                </label>
                {editingName === selectedBranch.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          handleRename(selectedBranch.id)
                        if (e.key === "Escape") setEditingName(null)
                      }}
                      autoFocus
                      className="flex-1 bg-white/[0.06] border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white/90 font-mono focus:outline-none focus:border-blue-500/40"
                    />
                    <button
                      onClick={() => handleRename(selectedBranch.id)}
                      className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingName(null)}
                      className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: selectedBranch.color }}
                    />
                    <span className="text-lg font-semibold text-white/90 font-mono">
                      {selectedBranch.name}
                    </span>
                    {selectedBranch.id !== "main" && (
                      <button
                        onClick={() => {
                          setEditingName(selectedBranch.id)
                          setEditValue(selectedBranch.name)
                        }}
                        className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {data.activeBranchId === selectedBranch.id && !selectedBranch.mergedInto && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 ml-2">
                        {lang === "en" ? "active" : "使用中"}
                      </span>
                    )}
                    {selectedBranch.mergedInto && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 ml-2">
                        {lang === "en" ? "merged" : "已合併"}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* per-branch temperature */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5 block">
                  {lang === "en" ? "Temperature" : "Temperature（溫度）"}
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-cyan-400/70 shrink-0 w-8 text-right">
                    {lang === "en" ? "Precise" : "精確"}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={Math.round((selectedBranch.temperature ?? settings.temperature) * 100)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) / 100
                      setData((prev) => ({
                        ...prev,
                        branches: prev.branches.map((b) =>
                          b.id === selectedBranch.id
                            ? { ...b, temperature: val }
                            : b
                        ),
                      }))
                      // Dispatch event so ChatInterface can pick up the per-branch temperature
                      window.dispatchEvent(
                        new CustomEvent("branch-data-changed", {
                          detail: { conversationId },
                        })
                      )
                    }}
                    className="flex-1 h-1 accent-blue-500 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400"
                  />
                  <span className="text-[10px] text-orange-400/70 shrink-0 w-8">
                    {lang === "en" ? "Creative" : "創意"}
                  </span>
                  <span className="text-xs font-mono text-white/60 w-10 text-right shrink-0">
                    {(selectedBranch.temperature ?? settings.temperature).toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-white/20 mt-1">
                  {lang === "en"
                    ? `Global: ${settings.temperature} · This branch overrides temperature for its conversations`
                    : `全域：${settings.temperature} · 此分支會覆蓋對話的 temperature 設定`}
                </p>
              </div>

              {/* branch point info with prominent preview */}
              {selectedBranch.branchPointId && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5 block">
                    {lang === "en" ? "Branch Point" : "分支起點"}
                  </label>
                  {(() => {
                    const bp = getBranchPoint(selectedBranch.branchPointId)
                    if (!bp) return null
                    return (
                      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                        {/* Prominent message preview */}
                        {bp.messagePreview && (
                          <div
                            className="rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
                            style={{
                              borderLeftWidth: 3,
                              borderLeftColor: selectedBranch.color,
                            }}
                          >
                            <p className="text-sm text-white/80 leading-relaxed font-medium">
                              {bp.messagePreview}
                              {bp.messagePreview.length >= 60 && "..."}
                            </p>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <MessageSquare
                            size={14}
                            className="text-white/30 mt-0.5 shrink-0"
                          />
                          <div className="min-w-0">
                            {!bp.messagePreview && (
                              <p className="text-sm text-white/40 italic">
                                {lang === "en"
                                  ? "(no preview)"
                                  : "(無預覽)"}
                              </p>
                            )}
                            <p className="text-[10px] text-white/25 mt-1 font-mono">
                              {lang === "en" ? "Message" : "訊息"}:{" "}
                              {bp.messageId.slice(0, 12)}...{" | "}
                              {formatTime(bp.createdAt, lang)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* stats */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5 block">
                  {lang === "en" ? "Messages" : "訊息數量"}
                </label>
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Hash size={14} className="text-white/30" />
                  <span>{messageCounts[selectedBranch.id] || 0}</span>
                  <span className="text-white/20">
                    {lang === "en"
                      ? "messages in this branch"
                      : "則訊息"}
                  </span>
                </div>
              </div>

              {/* actions */}
              <div className="space-y-2 pt-2">
                {/* Switch button — always available (view history of merged branches) */}
                {data.activeBranchId !== selectedBranch.id && (
                  <button
                    onClick={() => handleSwitchBranch(selectedBranch.id)}
                    className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
                  >
                    <ArrowRightLeft size={15} />
                    {selectedBranch.mergedInto
                      ? (lang === "en" ? "View branch history" : "查看分支歷史")
                      : (lang === "en" ? "Switch to this branch" : "切換至此分支")}
                  </button>
                )}

                {/* Merged branch info */}
                {selectedBranch.mergedInto && (
                  <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.05] p-3 space-y-2">
                    <p className="text-xs text-amber-300/70">
                      {lang === "en"
                        ? `This branch has been merged into `
                        : `此分支已合併至 `}
                      <span className="font-semibold text-amber-300/90 font-mono">
                        {data.branches.find((b) => b.id === selectedBranch.mergedInto)?.name || selectedBranch.mergedInto}
                      </span>
                      {lang === "en"
                        ? `. You can still view its history but cannot send new messages.`
                        : `。你仍可查看歷史記錄，但無法發送新訊息。`}
                    </p>
                    <button
                      onClick={() => handleSwitchBranch(selectedBranch.mergedInto!)}
                      className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors"
                    >
                      <ArrowRightLeft size={13} />
                      {lang === "en"
                        ? `Switch to ${data.branches.find((b) => b.id === selectedBranch.mergedInto)?.name || selectedBranch.mergedInto}`
                        : `切換至 ${data.branches.find((b) => b.id === selectedBranch.mergedInto)?.name || selectedBranch.mergedInto}`}
                    </button>
                  </div>
                )}

                {/* Merge / Delete — only for non-main, non-merged branches */}
                {selectedBranch.id !== "main" && !selectedBranch.mergedInto && (
                  <>
                    <button
                      onClick={() => handleMergeBranch(selectedBranch.id)}
                      className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                    >
                      <GitMerge size={15} />
                      {(() => {
                        const parentId = selectedBranch.parentBranchId ?? "main"
                        const parent = data.branches.find((b) => b.id === parentId)
                        const parentUsable = parent && !parent.mergedInto
                        const target = parentUsable ? parentId : "main"
                        const targetName = data.branches.find((b) => b.id === target)?.name || target
                        return lang === "en" ? `Merge to ${targetName}` : `合併至 ${targetName}`
                      })()}
                    </button>

                    <button
                      onClick={() =>
                        setDeleteConfirmId(
                          deleteConfirmId === selectedBranch.id
                            ? null
                            : selectedBranch.id
                        )
                      }
                      className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-red-500/15 bg-red-500/[0.05] hover:bg-red-500/15 text-red-400/70 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={15} />
                      {lang === "en" ? "Delete branch" : "刪除分支"}
                    </button>

                    {deleteConfirmId === selectedBranch.id && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3 text-center space-y-2">
                        <p className="text-xs text-red-400/80">
                          {lang === "en"
                            ? "Are you sure? This cannot be undone."
                            : "確定要刪除嗎？此操作無法復原。"}
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() =>
                              handleDeleteBranch(selectedBranch.id)
                            }
                            className="px-4 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            {lang === "en" ? "Confirm Delete" : "確認刪除"}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-4 py-1.5 text-xs rounded-lg bg-white/5 text-white/50 hover:bg-white/10 transition-colors"
                          >
                            {lang === "en" ? "Cancel" : "取消"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {selectedBranch.id === "main" && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="text-[11px] text-white/30">
                      {lang === "en"
                        ? "This is the main branch. It cannot be deleted or merged."
                        : "這是主分支，無法刪除或合併。"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* footer hint */}
      <p className="text-[10px] text-white/20 text-center select-none">
        {lang === "en"
          ? "Hover an AI response in the Chat tab and click Branch to create a new branch point."
          : "在 Chat 頁面中懸停 AI 回覆並點擊「分支」即可建立新的分支點。"}
      </p>
    </div>
  )
}
