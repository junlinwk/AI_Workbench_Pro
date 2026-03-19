/**
 * Notepad Component — Void Glass Design System
 * Slide-in scratchpad panel with multi-note tabs, text entries,
 * image drops, and conversation drops. Persisted to localStorage.
 */
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react"
import {
  StickyNote,
  Plus,
  X,
  Settings2,
  Trash2,
  Download,
  ChevronDown,
  ChevronRight,
  Image,
  MessageSquare,
  Edit3,
  Check,
  Sparkles,
  Loader2,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useSettings } from "@/contexts/SettingsContext"
import { useAuth } from "@/contexts/AuthContext"
import { loadUserData, saveUserData } from "@/lib/storage"
import { callAI } from "@/lib/aiClient"
import { ALL_MODELS } from "@/components/ModelSwitcher"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NoteEntry {
  id: string
  type: "text" | "image" | "conversation"
  content: string
  createdAt: string
  collapsed?: boolean
}

interface Note {
  id: string
  title: string
  entries: NoteEntry[]
  createdAt: string
  updatedAt: string
}

interface NotepadState {
  notes: Note[]
  activeNoteId: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** Convert a note's entries into a markdown string */
function noteToMarkdown(note: Note): string {
  const lines: string[] = [`## ${note.title}`, ""]
  for (const entry of note.entries) {
    if (entry.type === "text") {
      lines.push(entry.content, "")
    } else if (entry.type === "image") {
      lines.push(`![image](${entry.content})`, "")
    } else if (entry.type === "conversation") {
      try {
        const parsed = JSON.parse(entry.content)
        const role = parsed.role ?? "unknown"
        const content = parsed.content ?? entry.content
        lines.push(`**${role}:** ${content}`, "")
      } catch {
        lines.push(entry.content, "")
      }
    }
  }
  return lines.join("\n")
}

function createNote(title: string): Note {
  const now = new Date().toISOString()
  return {
    id: uid(),
    title,
    entries: [],
    createdAt: now,
    updatedAt: now,
  }
}

function defaultState(): NotepadState {
  const first = createNote("Scratchpad")
  return { notes: [first], activeNoteId: first.id }
}

/* ------------------------------------------------------------------ */
/*  Translations                                                       */
/* ------------------------------------------------------------------ */

const i18n: Record<string, Record<string, string>> = {
  "zh-TW": {
    notepad: "記事本",
    scratchpad: "便條",
    newNote: "新增筆記",
    typeHere: "輸入文字...",
    dropImage: "拖放圖片到此處",
    manage: "管理筆記",
    exportAll: "匯出全部",
    clearAll: "清除全部",
    clearConfirm: "確定要清除所有筆記嗎？",
    rename: "重新命名",
    delete: "刪除",
    totalEntries: "總條目",
    user: "使用者",
    ai: "AI",
    clickExpand: "點擊展開",
    cancel: "取消",
    confirm: "確認",
    noEntries: "尚無內容 — 輸入文字或拖放項目",
    exportSelected: "匯出選取",
    condense: "AI 濃縮整理",
    condensing: "AI 整理中...",
    condensedTitle: "濃縮：",
    condensedLink: "condensed_summary.md — 點擊開啟",
    noApiKey: "請先設定 API Key",
    noEntriesToCondense: "沒有可整理的內容",
    condenseError: "AI 整理失敗",
    dragHint: "拖曳到 Artifacts 面板",
  },
  en: {
    notepad: "Notepad",
    scratchpad: "Scratchpad",
    newNote: "New Note",
    typeHere: "Type here...",
    dropImage: "Drop image here",
    manage: "Manage Notes",
    exportAll: "Export All",
    clearAll: "Clear All",
    clearConfirm: "Are you sure you want to clear all notes?",
    rename: "Rename",
    delete: "Delete",
    totalEntries: "Total entries",
    user: "User",
    ai: "AI",
    clickExpand: "Click to expand",
    cancel: "Cancel",
    confirm: "Confirm",
    noEntries: "No entries yet — type or drop items here",
    exportSelected: "Export Selected",
    condense: "AI Condense",
    condensing: "AI condensing...",
    condensedTitle: "Condensed: ",
    condensedLink: "condensed_summary.md — click to open",
    noApiKey: "Please set an API key first",
    noEntriesToCondense: "No entries to condense",
    condenseError: "AI condensation failed",
    dragHint: "Drag to Artifacts panel",
  },
}

function txt(key: string, lang: string): string {
  return i18n[lang]?.[key] ?? i18n.en[key] ?? key
}

/* ------------------------------------------------------------------ */
/*  Image Preview Modal                                                */
/* ------------------------------------------------------------------ */

function ImageModal({
  src,
  onClose,
}: {
  src: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]">
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 rounded-full bg-white/10 p-1.5 text-white/70 hover:bg-white/20 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src={src}
          alt=""
          className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Entry Card                                                         */
/* ------------------------------------------------------------------ */

function EntryCard({
  entry,
  lang,
  onUpdate,
  onDelete,
}: {
  entry: NoteEntry
  lang: string
  onUpdate: (patch: Partial<NoteEntry>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(entry.content)
  const [imagePreview, setImagePreview] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.selectionStart = editRef.current.value.length
    }
  }, [editing])

  /* ---- Text entry ---- */
  if (entry.type === "text") {
    return (
      <div className="group animate-fadeSlideIn rounded-lg bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.06]">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              ref={editRef}
              className="w-full resize-none rounded bg-white/[0.06] p-2 text-sm text-white/90 outline-none focus:ring-1 focus:ring-blue-500/40"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={Math.min(editValue.split("\n").length, 6)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditing(false)
                  setEditValue(entry.content)
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  if (editValue.trim()) {
                    onUpdate({ content: editValue.trim() })
                  }
                  setEditing(false)
                }
              }}
            />
            <div className="flex justify-end gap-1.5">
              <button
                className="rounded px-2 py-0.5 text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
                onClick={() => {
                  setEditing(false)
                  setEditValue(entry.content)
                }}
              >
                <X className="h-3 w-3" />
              </button>
              <button
                className="rounded px-2 py-0.5 text-xs text-blue-400 hover:bg-blue-500/10"
                onClick={() => {
                  if (editValue.trim()) {
                    onUpdate({ content: editValue.trim() })
                  }
                  setEditing(false)
                }}
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <p
              className="flex-1 cursor-pointer whitespace-pre-wrap text-sm text-white/80"
              onClick={() => {
                setEditValue(entry.content)
                setEditing(true)
              }}
            >
              {entry.content}
            </p>
            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/60"
                onClick={() => {
                  setEditValue(entry.content)
                  setEditing(true)
                }}
              >
                <Edit3 className="h-3 w-3" />
              </button>
              <button
                className="rounded p-1 text-white/30 hover:bg-red-500/20 hover:text-red-400"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ---- Image entry ---- */
  if (entry.type === "image") {
    return (
      <>
        <div className="group animate-fadeSlideIn rounded-lg bg-white/[0.04] p-2 transition-colors hover:bg-white/[0.06]">
          <div className="relative">
            <img
              src={entry.content}
              alt=""
              className="max-h-[200px] w-full cursor-pointer rounded-md object-cover"
              onClick={() => setImagePreview(true)}
            />
            <button
              className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white/50 opacity-0 transition-opacity hover:bg-black/70 hover:text-white/80 group-hover:opacity-100"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {imagePreview && (
          <ImageModal
            src={entry.content}
            onClose={() => setImagePreview(false)}
          />
        )}
      </>
    )
  }

  /* ---- Conversation entry ---- */
  if (entry.type === "conversation") {
    let parsed: { role?: string; content?: string } = {}
    try {
      parsed = JSON.parse(entry.content)
    } catch {
      parsed = { role: "unknown", content: entry.content }
    }

    const role = parsed.role ?? "unknown"
    const content = parsed.content ?? entry.content
    const isCollapsed = entry.collapsed !== false
    const firstLine = content.split("\n")[0].slice(0, 100)
    const roleLabel =
      role === "user" || role === "User"
        ? txt("user", lang)
        : txt("ai", lang)

    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/json", entry.content)
          e.dataTransfer.setData("application/x-notepad-conversation", "true")
          e.dataTransfer.setData("text/plain", entry.content)
          e.dataTransfer.effectAllowed = "copy"
        }}
        className="group animate-fadeSlideIn rounded-lg bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.06] cursor-grab active:cursor-grabbing"
      >
        <div
          className="flex cursor-pointer items-start gap-2"
          onClick={() => onUpdate({ collapsed: !isCollapsed })}
        >
          {isCollapsed ? (
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
          ) : (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
          )}
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400/60" />
          <div className="flex-1 overflow-hidden">
            <span className="text-xs font-medium text-violet-400/80">
              {roleLabel}
            </span>
            {isCollapsed ? (
              <p className="truncate text-sm text-white/60">
                {firstLine}
                {content.length > firstLine.length ? "..." : ""}
              </p>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-white/80">
                {content}
              </p>
            )}
          </div>
          <button
            className="shrink-0 rounded p-1 text-white/30 opacity-0 hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  return null
}

/* ------------------------------------------------------------------ */
/*  Management Overlay                                                 */
/* ------------------------------------------------------------------ */

function ManageOverlay({
  state,
  lang,
  onRename,
  onDeleteNote,
  onExport,
  onExportSelected,
  onClearAll,
  onClose,
}: {
  state: NotepadState
  lang: string
  onRename: (noteId: string, title: string) => void
  onDeleteNote: (noteId: string) => void
  onExport: () => void
  onExportSelected: (noteIds: string[]) => void
  onClearAll: () => void
  onClose: () => void
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus()
  }, [renamingId])

  const totalEntries = state.notes.reduce(
    (sum, n) => sum + n.entries.length,
    0,
  )

  const toggleSelect = (noteId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  return (
    <div className="absolute inset-x-0 top-12 bottom-0 z-10 flex flex-col bg-[oklch(0.10_0.015_265)]/95 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-sm font-medium text-white/80">
          {txt("manage", lang)}
        </h3>
        <button
          className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/70"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 text-xs text-white/40">
          {txt("totalEntries", lang)}: {totalEntries}
        </div>

        <div className="flex flex-col gap-1.5">
          {state.notes.map((note) => (
            <div
              key={note.id}
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2"
            >
              {/* Export selection checkbox */}
              <input
                type="checkbox"
                checked={selectedIds.has(note.id)}
                onChange={() => toggleSelect(note.id)}
                className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-white/20 bg-white/5 accent-blue-500"
              />

              {renamingId === note.id ? (
                <input
                  ref={renameRef}
                  className="flex-1 rounded bg-white/[0.06] px-2 py-0.5 text-sm text-white/90 outline-none focus:ring-1 focus:ring-blue-500/40"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (renameValue.trim()) {
                        onRename(note.id, renameValue.trim())
                      }
                      setRenamingId(null)
                    }
                    if (e.key === "Escape") setRenamingId(null)
                  }}
                  onBlur={() => {
                    if (renameValue.trim()) {
                      onRename(note.id, renameValue.trim())
                    }
                    setRenamingId(null)
                  }}
                />
              ) : (
                <span className="flex-1 truncate text-sm text-white/70">
                  {note.title}
                </span>
              )}

              <span className="text-xs text-white/30">
                {note.entries.length}
              </span>

              <button
                className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/60"
                onClick={() => {
                  setRenamingId(note.id)
                  setRenameValue(note.title)
                }}
              >
                <Edit3 className="h-3 w-3" />
              </button>
              {state.notes.length > 1 && (
                <button
                  className="rounded p-1 text-white/30 hover:bg-red-500/20 hover:text-red-400"
                  onClick={() => onDeleteNote(note.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/[0.06] px-4 py-3">
        {/* Export Selected as Markdown */}
        {selectedIds.size > 0 && (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600/15 px-3 py-2 text-sm text-blue-300 hover:bg-blue-600/25 border border-blue-500/20"
            onClick={() => {
              onExportSelected(Array.from(selectedIds))
              setSelectedIds(new Set())
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            {txt("exportSelected", lang)} ({selectedIds.size})
          </button>
        )}

        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.1] hover:text-white/90"
          onClick={onExport}
        >
          <Download className="h-3.5 w-3.5" />
          {txt("exportAll", lang)}
        </button>

        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-red-400">
              {txt("clearConfirm", lang)}
            </span>
            <button
              className="rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10"
              onClick={() => setConfirmClear(false)}
            >
              {txt("cancel", lang)}
            </button>
            <button
              className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30"
              onClick={() => {
                onClearAll()
                setConfirmClear(false)
              }}
            >
              {txt("confirm", lang)}
            </button>
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400/70 hover:bg-red-500/20 hover:text-red-400"
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {txt("clearAll", lang)}
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab Context Menu                                                   */
/* ------------------------------------------------------------------ */

function TabContextMenu({
  x,
  y,
  lang,
  canDelete,
  onRename,
  onDelete,
  onClose,
}: {
  x: number
  y: number
  lang: string
  canDelete: boolean
  onRename: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-[70] min-w-[120px] rounded-lg border border-white/[0.08] bg-[oklch(0.12_0.015_265)] p-1 shadow-xl backdrop-blur-lg"
      style={{ left: x, top: y }}
    >
      <button
        className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/[0.08] hover:text-white/90"
        onClick={() => {
          onRename()
          onClose()
        }}
      >
        <Edit3 className="h-3 w-3" />
        {txt("rename", lang)}
      </button>
      {canDelete && (
        <button
          className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
          onClick={() => {
            onDelete()
            onClose()
          }}
        >
          <Trash2 className="h-3 w-3" />
          {txt("delete", lang)}
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Notepad Component                                             */
/* ------------------------------------------------------------------ */

const STORAGE_NS = "notepad"

export default function Notepad() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const lang = settings.language ?? "zh-TW"
  const userId = user?.id ?? "anonymous"

  /* ---- Panel visibility state ---- */
  const [isOpen, setIsOpen] = useState(false)
  const [crackVisible, setCrackVisible] = useState(false) // thin strip peeking out
  const [showManage, setShowManage] = useState(false)

  // Panel right offset in px (8 = default, larger = more left, negative = offscreen)
  const [panelRight, setPanelRight] = useState(8)
  const panelDragRef = useRef<{ startClientX: number; startRight: number; lastX: number; lastTime: number; velocity: number } | null>(null)
  const momentumRef = useRef<number | null>(null)

  /* ---- Hover trigger: mouse near right edge → show crack, leave → hide ---- */
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) return
    const handleMouseMove = (e: MouseEvent) => {
      const threshold = 30 // pixels from right edge
      const nearRight = e.clientX >= window.innerWidth - threshold
      if (nearRight) {
        // Cancel any pending hide
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
        // Start showing if not already visible
        if (!crackVisible && !hoverTimerRef.current) {
          hoverTimerRef.current = setTimeout(() => {
            setCrackVisible(true)
            hoverTimerRef.current = null
          }, 600) // 0.6s to appear
        }
      } else {
        // Mouse left the zone — cancel show timer
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
        // Start hiding if visible (with short delay so it doesn't flicker)
        if (crackVisible && !hideTimerRef.current) {
          hideTimerRef.current = setTimeout(() => {
            setCrackVisible(false)
            hideTimerRef.current = null
          }, 800) // 0.8s grace period before hiding
        }
      }
    }
    window.addEventListener("mousemove", handleMouseMove)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isOpen, crackVisible])

  /* ---- Data state ---- */
  const [state, setState] = useState<NotepadState>(() =>
    loadUserData(userId, STORAGE_NS, defaultState()),
  )

  /* ---- Debounced persistence ---- */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistState = useCallback(
    (next: NotepadState) => {
      setState(next)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveUserData(userId, STORAGE_NS, next)
      }, 500)
    },
    [userId],
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  /* ---- Reload on user change ---- */
  useEffect(() => {
    setState(loadUserData(userId, STORAGE_NS, defaultState()))
  }, [userId])

  /* ---- Active note ---- */
  const activeNote = useMemo(
    () =>
      state.notes.find((n) => n.id === state.activeNoteId) ??
      state.notes[0],
    [state],
  )

  /* ---- Mutators ---- */
  const updateNote = useCallback(
    (noteId: string, updater: (n: Note) => Note) => {
      persistState({
        ...state,
        notes: state.notes.map((n) =>
          n.id === noteId ? updater(n) : n,
        ),
      })
    },
    [state, persistState],
  )

  const addEntry = useCallback(
    (entry: Omit<NoteEntry, "id" | "createdAt">) => {
      if (!activeNote) return
      const now = new Date().toISOString()
      updateNote(activeNote.id, (n) => ({
        ...n,
        updatedAt: now,
        entries: [
          ...n.entries,
          { ...entry, id: uid(), createdAt: now },
        ],
      }))
    },
    [activeNote, updateNote],
  )

  const updateEntry = useCallback(
    (entryId: string, patch: Partial<NoteEntry>) => {
      if (!activeNote) return
      updateNote(activeNote.id, (n) => ({
        ...n,
        updatedAt: new Date().toISOString(),
        entries: n.entries.map((e) =>
          e.id === entryId ? { ...e, ...patch } : e,
        ),
      }))
    },
    [activeNote, updateNote],
  )

  const deleteEntry = useCallback(
    (entryId: string) => {
      if (!activeNote) return
      updateNote(activeNote.id, (n) => ({
        ...n,
        updatedAt: new Date().toISOString(),
        entries: n.entries.filter((e) => e.id !== entryId),
      }))
    },
    [activeNote, updateNote],
  )

  const addNote = useCallback(() => {
    const note = createNote(
      txt("newNote", lang) + ` ${state.notes.length + 1}`,
    )
    persistState({
      notes: [...state.notes, note],
      activeNoteId: note.id,
    })
  }, [state, lang, persistState])

  const deleteNote = useCallback(
    (noteId: string) => {
      const remaining = state.notes.filter((n) => n.id !== noteId)
      if (remaining.length === 0) return
      persistState({
        notes: remaining,
        activeNoteId:
          state.activeNoteId === noteId
            ? remaining[0].id
            : state.activeNoteId,
      })
    },
    [state, persistState],
  )

  const renameNote = useCallback(
    (noteId: string, title: string) => {
      updateNote(noteId, (n) => ({ ...n, title }))
    },
    [updateNote],
  )

  const clearAll = useCallback(() => {
    const fresh = defaultState()
    persistState(fresh)
    toast.success(lang === "zh-TW" ? "已清除全部筆記" : "All notes cleared")
  }, [lang, persistState])

  const exportAll = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `notepad-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(lang === "zh-TW" ? "已匯出" : "Exported")
  }, [state, lang])

  /* ---- Export selected notes as markdown ---- */
  const exportSelectedAsMarkdown = useCallback(
    (noteIds: string[]) => {
      const selected = state.notes.filter((n) => noteIds.includes(n.id))
      if (selected.length === 0) return
      const markdown = selected.map((n) => noteToMarkdown(n)).join("\n---\n\n")
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `notes-export-${new Date().toISOString().slice(0, 10)}.md`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(
        lang === "zh-TW"
          ? `已匯出 ${selected.length} 筆記為 Markdown`
          : `Exported ${selected.length} note(s) as Markdown`,
      )
    },
    [state, lang],
  )

  /* ---- AI Condensation ---- */
  const [isCondensing, setIsCondensing] = useState(false)

  const handleCondense = useCallback(async () => {
    if (!activeNote || activeNote.entries.length === 0) {
      toast.error(txt("noEntriesToCondense", lang))
      return
    }

    const model = ALL_MODELS.find(
      (m) => m.id === settings.selectedModelId,
    ) || ALL_MODELS[0]
    setIsCondensing(true)

    try {
      const markdownContent = noteToMarkdown(activeNote)
      const result = await callAI(
        [
          {
            role: "user",
            content: `Condense and organize the following notes into a well-structured markdown document. Preserve key information, organize by topic, and format with headings, lists, and tables where appropriate.\n\n${markdownContent}`,
          },
        ],
        settings.selectedModelId,
        undefined,
        0.3,
        4096,
        "You are a helpful note organization assistant. Output clean, well-structured markdown.",
      )

      // Immediately create a new note with the condensed result
      // so it's persisted to localStorage and never lost
      const noteTitle = activeNote.title
      const note = createNote(
        txt("condensedTitle", lang) + noteTitle,
      )
      note.entries.push({
        id: uid(),
        type: "text",
        content: result,
        createdAt: new Date().toISOString(),
      })
      setState((prev) => {
        const next = {
          notes: [...prev.notes, note],
          activeNoteId: note.id,
        }
        // Persist immediately (no debounce) to avoid data loss
        saveUserData(userId, STORAGE_NS, next)
        return next
      })
      toast.success(
        lang === "zh-TW" ? "AI 濃縮整理完成" : "AI condensation complete",
      )
    } catch (err) {
      toast.error(
        `${txt("condenseError", lang)}: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setIsCondensing(false)
    }
  }, [activeNote, settings, lang, userId])

  /* ---- Input state ---- */
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    addEntry({ type: "text", content: trimmed })
    setInputValue("")
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
    }
  }, [inputValue, addEntry])

  /* ---- Drag & drop ---- */
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsDragging(false)

      /* Check for image files */
      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter((f) => f.type.startsWith("image/"))

      if (imageFiles.length > 0) {
        imageFiles.forEach((file) => {
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === "string") {
              addEntry({ type: "image", content: reader.result })
            }
          }
          reader.readAsDataURL(file)
        })
        return
      }

      /* Check for JSON conversation data */
      const jsonText = e.dataTransfer.getData("application/json")
      if (jsonText) {
        try {
          const data = JSON.parse(jsonText)
          if (data.role && data.content) {
            addEntry({
              type: "conversation",
              content: jsonText,
              collapsed: true,
            })
            return
          }
        } catch {
          /* not JSON — fall through */
        }
      }

      /* Check for plain text that might be conversation JSON */
      const plainText = e.dataTransfer.getData("text/plain")
      if (plainText) {
        try {
          const data = JSON.parse(plainText)
          if (data.role && data.content) {
            addEntry({
              type: "conversation",
              content: plainText,
              collapsed: true,
            })
            return
          }
        } catch {
          /* not JSON — treat as text */
        }

        if (plainText.trim()) {
          addEntry({ type: "text", content: plainText.trim() })
        }
      }
    },
    [addEntry],
  )

  /* ---- Tab context menu ---- */
  const [tabMenu, setTabMenu] = useState<{
    noteId: string
    x: number
    y: number
  } | null>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameTabValue, setRenameTabValue] = useState("")
  const renameTabRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingTabId && renameTabRef.current) {
      renameTabRef.current.focus()
      renameTabRef.current.select()
    }
  }, [renamingTabId])

  /* ---- Free horizontal drag on header ---- */
  const panelRef = useRef<HTMLDivElement>(null)

  const handlePanelDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-notepad-header]")) return
      // Cancel any ongoing momentum
      if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null }
      panelDragRef.current = {
        startClientX: e.clientX,
        startRight: panelRight,
        lastX: e.clientX,
        lastTime: Date.now(),
        velocity: 0,
      }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [panelRight],
  )

  const handlePanelDragMove = useCallback((e: React.PointerEvent) => {
    if (!panelDragRef.current) return
    const now = Date.now()
    const dt = Math.max(1, now - panelDragRef.current.lastTime)
    const dxFromLast = panelDragRef.current.lastX - e.clientX // positive = moving left
    // Track velocity (pixels per ms, positive = leftward)
    panelDragRef.current.velocity = dxFromLast / dt
    panelDragRef.current.lastX = e.clientX
    panelDragRef.current.lastTime = now

    const dx = panelDragRef.current.startClientX - e.clientX
    const newRight = panelDragRef.current.startRight + dx
    const clamped = Math.max(-320, Math.min(newRight, window.innerWidth - 400))
    setPanelRight(clamped)
  }, [])

  const handlePanelDragEnd = useCallback(() => {
    if (!panelDragRef.current) return
    const vel = panelDragRef.current.velocity // px/ms, positive = leftward
    panelDragRef.current = null

    // Apply momentum with deceleration
    if (Math.abs(vel) > 0.3) {
      let currentRight = panelRight
      let currentVel = vel * 12 // scale up for visual effect
      const friction = 0.92
      const animate = () => {
        currentVel *= friction
        currentRight += currentVel
        currentRight = Math.max(-320, Math.min(currentRight, window.innerWidth - 400))
        setPanelRight(currentRight)
        if (Math.abs(currentVel) > 0.5) {
          momentumRef.current = requestAnimationFrame(animate)
        } else {
          momentumRef.current = null
          // Snap: if too far right, collapse
          if (currentRight < -200) {
            setIsOpen(false)
            setCrackVisible(false)
            setPanelRight(8)
          }
        }
      }
      momentumRef.current = requestAnimationFrame(animate)
    } else {
      // No momentum — check if should collapse
      if (panelRight < -200) {
        setIsOpen(false)
        setCrackVisible(true)
        setPanelRight(8)
      }
    }
  }, [panelRight])

  // Cleanup momentum on unmount
  useEffect(() => {
    return () => { if (momentumRef.current) cancelAnimationFrame(momentumRef.current) }
  }, [])

  /* ---- Content area ref for scroll ---- */
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [activeNote?.entries.length])

  /* ---- Auto-grow input ---- */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value)
      const el = e.target
      el.style.height = "auto"
      const maxHeight = 4 * 24 // ~4 lines
      el.style.height = Math.min(el.scrollHeight, maxHeight) + "px"
    },
    [],
  )

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <>
      {/* ---- CSS Keyframes ---- */}
      <style>{`
        @keyframes notepadFadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeSlideIn {
          animation: notepadFadeSlideIn 0.25s ease-out;
        }
        @keyframes notepadCrackSlideIn {
          from { width: 0; opacity: 0; }
          to { width: 20px; opacity: 1; }
        }
        @keyframes notepadCrackGlow {
          0%, 100% { box-shadow: inset 2px 0 12px oklch(0.55 0.2 250 / 0.15); }
          50% { box-shadow: inset 2px 0 20px oklch(0.55 0.2 250 / 0.3); }
        }
        @keyframes notepadDropPulse {
          0%, 100% { border-color: oklch(0.6 0.18 250 / 0.4); }
          50% { border-color: oklch(0.6 0.18 250 / 0.8); }
        }
        .animate-drop-pulse {
          animation: notepadDropPulse 1s ease-in-out infinite;
        }
      `}</style>

      {/* ---- Crack strip: wide glowing edge peeking from right ---- */}
      {crackVisible && !isOpen && (
        <button
          className="fixed right-0 top-0 z-50 h-full cursor-pointer border-l border-white/[0.08] transition-all duration-300 hover:border-blue-500/30"
          style={{
            width: "20px",
            background: "linear-gradient(to left, oklch(0.13 0.02 265 / 0.95), oklch(0.11 0.015 265 / 0.6), transparent)",
            animation: "notepadCrackSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards, notepadCrackGlow 3s ease-in-out infinite",
            backdropFilter: "blur(12px)",
          }}
          onClick={() => {
            setIsOpen(true)
            setCrackVisible(false)
            setPanelRight(8)
          }}
          title={txt("notepad", lang)}
        >
          <div className="flex h-full flex-col items-center justify-center gap-3">
            {/* Glowing line indicator */}
            <div className="h-16 w-[2px] rounded-full bg-gradient-to-b from-transparent via-blue-400/60 to-transparent" />
            {/* Small icon hint */}
            <StickyNote className="h-3 w-3 text-blue-400/50" />
            <div className="h-16 w-[2px] rounded-full bg-gradient-to-b from-transparent via-violet-400/40 to-transparent" />
          </div>
        </button>
      )}

      {/* ---- Floating Panel ---- */}
      <div
        ref={panelRef}
        className={cn(
          "fixed z-50 flex w-[360px] flex-col",
          "rounded-2xl border border-white/[0.08]",
          "bg-[oklch(0.10_0.015_265)]/95 backdrop-blur-xl",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{
          right: isOpen ? `${panelRight}px` : "-380px",
          top: "50%",
          transform: "translateY(-50%)",
          height: "min(70vh, 650px)",
          transition: panelDragRef.current
            ? "none"
            : "right 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease-out",
          boxShadow: isOpen
            ? "0 0 60px oklch(0.3 0.1 260 / 0.15), 0 8px 32px oklch(0 0 0 / 0.4)"
            : "none",
        }}
        onPointerDown={handlePanelDragStart}
        onPointerMove={handlePanelDragMove}
        onPointerUp={handlePanelDragEnd}
      >
        {/* ---- Header ---- */}
        <div
          data-notepad-header
          className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3"
        >
          <StickyNote className="h-4 w-4 text-blue-400/70" />
          <span className="flex-1 text-sm font-medium text-white/80">
            {txt("notepad", lang)}
          </span>
          <button
            className={cn(
              "rounded p-1.5 transition-colors",
              isCondensing
                ? "text-violet-400 bg-violet-500/10"
                : "text-white/40 hover:bg-violet-500/10 hover:text-violet-400",
            )}
            onClick={handleCondense}
            disabled={isCondensing}
            title={txt("condense", lang)}
          >
            {isCondensing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            className="rounded p-1.5 text-white/40 hover:bg-white/[0.08] hover:text-white/70"
            onClick={() => setShowManage(true)}
            title={txt("manage", lang)}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1.5 text-white/40 hover:bg-white/[0.08] hover:text-white/70"
            onClick={() => {
              setIsOpen(false)
              setCrackVisible(false) // crack will re-appear when mouse nears edge
              setPanelRight(8)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ---- Tab bar ---- */}
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-white/[0.06] px-2 py-1.5 scrollbar-none">
          {state.notes.map((note) => (
            <div key={note.id} className="relative shrink-0">
              {renamingTabId === note.id ? (
                <input
                  ref={renameTabRef}
                  className="w-24 rounded bg-white/[0.08] px-2 py-1 text-xs text-white/90 outline-none focus:ring-1 focus:ring-blue-500/40"
                  value={renameTabValue}
                  onChange={(e) => setRenameTabValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (renameTabValue.trim()) {
                        renameNote(note.id, renameTabValue.trim())
                      }
                      setRenamingTabId(null)
                    }
                    if (e.key === "Escape") setRenamingTabId(null)
                  }}
                  onBlur={() => {
                    if (renameTabValue.trim()) {
                      renameNote(note.id, renameTabValue.trim())
                    }
                    setRenamingTabId(null)
                  }}
                />
              ) : (
                <button
                  draggable
                  onDragStart={(e) => {
                    const md = noteToMarkdown(note)
                    e.dataTransfer.setData(
                      "application/json",
                      JSON.stringify({
                        type: "notepad-tab",
                        title: note.title,
                        content: md,
                      }),
                    )
                    e.dataTransfer.setData("text/plain", md)
                    e.dataTransfer.effectAllowed = "copy"
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs transition-colors cursor-grab active:cursor-grabbing",
                    note.id === state.activeNoteId
                      ? "bg-white/[0.08] text-white/90"
                      : "text-white/40 hover:bg-white/[0.04] hover:text-white/60",
                  )}
                  onClick={() =>
                    persistState({ ...state, activeNoteId: note.id })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setTabMenu({
                      noteId: note.id,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }}
                >
                  {note.title}
                </button>
              )}
            </div>
          ))}
          <button
            className="shrink-0 rounded p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/60"
            onClick={addNote}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ---- Content area (drop zone) ---- */}
        <div
          ref={contentRef}
          className={cn(
            "relative flex-1 overflow-y-auto px-3 py-3",
            isDragging && "ring-2 ring-inset ring-blue-500/40",
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drop zone overlay */}
          {isDragging && (
            <div className="animate-drop-pulse pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-500/50 bg-blue-500/[0.06]">
              <div className="flex items-center gap-2 text-sm text-blue-400/80">
                <Image className="h-4 w-4" />
                {txt("dropImage", lang)}
              </div>
            </div>
          )}

          {/* AI Condensation loading */}
          {isCondensing && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
              <span className="text-xs text-violet-300">
                {txt("condensing", lang)}
              </span>
            </div>
          )}

          {/* Entries */}
          {activeNote && activeNote.entries.length > 0 ? (
            <div className="flex flex-col gap-2">
              {activeNote.entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  lang={lang}
                  onUpdate={(patch) => updateEntry(entry.id, patch)}
                  onDelete={() => deleteEntry(entry.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-xs text-white/25">
                {txt("noEntries", lang)}
              </p>
            </div>
          )}
        </div>

        {/* ---- Input area ---- */}
        <div className="border-t border-white/[0.06] px-3 py-2.5">
          <div className="flex items-end gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
            <textarea
              ref={inputRef}
              className="flex-1 resize-none bg-transparent text-sm text-white/80 placeholder-white/25 outline-none"
              placeholder={txt("typeHere", lang)}
              value={inputValue}
              onChange={handleInputChange}
              rows={1}
              style={{ maxHeight: `${4 * 24}px` }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <button
              className={cn(
                "shrink-0 rounded p-1 transition-colors",
                inputValue.trim()
                  ? "text-blue-400 hover:bg-blue-500/10"
                  : "text-white/20",
              )}
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
            >
              <StickyNote className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ---- Management overlay ---- */}
        {showManage && (
          <ManageOverlay
            state={state}
            lang={lang}
            onRename={renameNote}
            onDeleteNote={deleteNote}
            onExport={exportAll}
            onExportSelected={exportSelectedAsMarkdown}
            onClearAll={clearAll}
            onClose={() => setShowManage(false)}
          />
        )}
      </div>

      {/* ---- Tab context menu ---- */}
      {tabMenu && (
        <TabContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          lang={lang}
          canDelete={state.notes.length > 1}
          onRename={() => {
            const note = state.notes.find(
              (n) => n.id === tabMenu.noteId,
            )
            if (note) {
              setRenamingTabId(note.id)
              setRenameTabValue(note.title)
            }
          }}
          onDelete={() => deleteNote(tabMenu.noteId)}
          onClose={() => setTabMenu(null)}
        />
      )}
    </>
  )
}
