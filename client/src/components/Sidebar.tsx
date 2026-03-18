/**
 * Sidebar Component — Void Glass Design System
 * Dark glassmorphism sidebar with chat history, folders, and user profile
 */
import { useState, useEffect, useCallback, useRef } from "react";

import {
  Search, Plus, ChevronDown, ChevronRight, MessageSquare,
  Folder, FolderOpen, Star, Clock, Settings,
  User, LogOut, MoreHorizontal, PanelLeftClose, PanelLeft,
  Trash2, Pin, PinOff, Edit3, Inbox, FolderPlus,
  ArrowRight, Lock, Unlock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { loadUserData, saveUserData } from "@/lib/storage";
import { t } from "@/i18n";

interface ChatItem {
  id: string;
  title: string;
  time: string;
  active?: boolean;
  pinned?: boolean;
  lockHash?: string; // SHA-256 hash of password, undefined = unlocked
}

interface FolderItem {
  id: string;
  name: string;
  icon: string; // icon key — rendered dynamically to allow serialization
  color: string;
  chats: ChatItem[];
  children: FolderItem[];  // sub-folders
  parentId?: string;       // null/undefined = top-level
  prompt?: string;         // folder-specific prompt
  lockHash?: string; // SHA-256 hash of password
}

/** Migrate old folder data (no `children` field) to new format */
function migrateFolder(f: any): FolderItem {
  return {
    ...f,
    children: Array.isArray(f.children) ? f.children.map(migrateFolder) : [],
    prompt: f.prompt || "",
  };
}

/** Check if `targetId` is a descendant of `folder` */
function isDescendant(folder: FolderItem, targetId: string): boolean {
  for (const child of folder.children) {
    if (child.id === targetId || isDescendant(child, targetId)) return true;
  }
  return false;
}

/** Count all chats in a folder including descendants */
function countAllChats(folder: FolderItem): number {
  return folder.chats.length + folder.children.reduce((sum, c) => sum + countAllChats(c), 0);
}

/** Find a folder by id anywhere in the tree, returning it and its parent chain prompts */
function findFolderById(folders: FolderItem[], id: string, promptChain: string[] = []): { folder: FolderItem; promptChain: string[] } | null {
  for (const f of folders) {
    if (f.id === id) return { folder: f, promptChain: [...promptChain, f.prompt || ""] };
    const found = findFolderById(f.children, id, [...promptChain, f.prompt || ""]);
    if (found) return found;
  }
  return null;
}

/** Find which folder contains a given chat id (searches recursively) */
function findFolderForChat(folders: FolderItem[], chatId: string, promptChain: string[] = []): { folder: FolderItem; promptChain: string[] } | null {
  for (const f of folders) {
    const chain = [...promptChain, f.prompt || ""];
    if (f.chats.some(c => c.id === chatId)) return { folder: f, promptChain: chain };
    const found = findFolderForChat(f.children, chatId, chain);
    if (found) return found;
  }
  return null;
}

/** Remove a folder by id from anywhere in the tree */
function removeFolderFromTree(folders: FolderItem[], folderId: string): FolderItem[] {
  return folders
    .filter(f => f.id !== folderId)
    .map(f => ({ ...f, children: removeFolderFromTree(f.children, folderId) }));
}

/** Add a folder as a child of targetId in the tree */
function addFolderAsChild(folders: FolderItem[], targetId: string, folderToAdd: FolderItem): FolderItem[] {
  return folders.map(f => {
    if (f.id === targetId) {
      return { ...f, children: [...f.children, { ...folderToAdd, parentId: targetId }] };
    }
    return { ...f, children: addFolderAsChild(f.children, targetId, folderToAdd) };
  });
}

/** Update a folder's field anywhere in the tree */
function updateFolderInTree(folders: FolderItem[], folderId: string, updater: (f: FolderItem) => FolderItem): FolderItem[] {
  return folders.map(f => {
    if (f.id === folderId) return updater(f);
    return { ...f, children: updateFolderInTree(f.children, folderId, updater) };
  });
}

/** Collect all folders in the tree as a flat list */
function flattenFolders(folders: FolderItem[]): FolderItem[] {
  const result: FolderItem[] = [];
  for (const f of folders) {
    result.push(f);
    result.push(...flattenFolders(f.children));
  }
  return result;
}

/** Remove a chat from anywhere in the folder tree */
function removeChatFromTree(folders: FolderItem[], chatId: string): FolderItem[] {
  return folders.map(f => ({
    ...f,
    chats: f.chats.filter(c => c.id !== chatId),
    children: removeChatFromTree(f.children, chatId),
  }));
}

/** Update chat fields across the whole tree */
function updateChatsInTree(folders: FolderItem[], updater: (c: ChatItem) => ChatItem): FolderItem[] {
  return folders.map(f => ({
    ...f,
    chats: f.chats.map(updater),
    children: updateChatsInTree(f.children, updater),
  }));
}

/** Filter chats by search query across the whole tree */
function filterFoldersByQuery(folders: FolderItem[], query: string): FolderItem[] {
  return folders.map(f => {
    const filteredChildren = filterFoldersByQuery(f.children, query);
    const filteredChats = f.chats.filter(c =>
      query === "" || c.title.toLowerCase().includes(query.toLowerCase())
    );
    return { ...f, chats: filteredChats, children: filteredChildren };
  }).filter(f => f.chats.length > 0 || f.children.length > 0 || query === "");
}

const FOLDER_ICONS: Record<string, React.ReactNode> = {
  star: <Star size={14} />,
  clock: <Clock size={14} />,
  folder: <Folder size={14} />,
};

const DEFAULT_FOLDERS: FolderItem[] = [
  { id: "pinned", name: "已釘選", icon: "star", color: "text-yellow-400", chats: [], children: [], prompt: "" },
  { id: "recent", name: "最近", icon: "clock", color: "text-blue-400", chats: [], children: [], prompt: "" },
  { id: "projects", name: "專案", icon: "folder", color: "text-violet-400", chats: [], children: [], prompt: "" },
];

const DEFAULT_FOLDER_IDS = new Set(["pinned", "recent", "projects"]);

const FOLDER_COLOR_CYCLE = [
  "text-emerald-400",
  "text-orange-400",
  "text-pink-400",
  "text-cyan-400",
  "text-amber-400",
  "text-rose-400",
  "text-teal-400",
  "text-indigo-400",
];

/** Hash a password with a salt using SHA-256 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + "ai-wb-lock-salt")
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Lock/Unlock password dialog */
function LockDialog({
  mode,
  onSubmit,
  onCancel,
  lang,
}: {
  mode: "set" | "unlock"
  onSubmit: (password: string) => void
  onCancel: () => void
  lang: string
}) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = () => {
    if (!password) {
      setError(lang === "en" ? "Password required" : "請輸入密碼")
      return
    }
    if (mode === "set" && password !== confirm) {
      setError(lang === "en" ? "Passwords do not match" : "密碼不一致")
      return
    }
    onSubmit(password)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto max-w-xs w-full mx-4 rounded-2xl border border-white/10 bg-[oklch(0.13_0.015_265)] backdrop-blur-2xl shadow-2xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-white/90">
              {mode === "set"
                ? lang === "en"
                  ? "Set Lock Password"
                  : "設定鎖定密碼"
                : lang === "en"
                  ? "Enter Password"
                  : "輸入密碼"}
            </h3>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit()
                if (e.key === "Escape") onCancel()
              }}
              placeholder={
                lang === "en" ? "Password" : "密碼"
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/25 focus:border-blue-500/50 focus:outline-none"
              autoFocus
            />
            {mode === "set" && (
              <input
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setError("")
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit()
                  if (e.key === "Escape") onCancel()
                }}
                placeholder={
                  lang === "en" ? "Confirm password" : "確認密碼"
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/25 focus:border-blue-500/50 focus:outline-none"
              />
            )}
            {error && (
              <p className="text-[0.65rem] text-red-400">{error}</p>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={onCancel}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors border border-white/10"
            >
              {lang === "en" ? "Cancel" : "取消"}
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white font-medium bg-gradient-to-r from-blue-600/80 to-violet-600/80 hover:from-blue-500 hover:to-violet-500 transition-colors"
            >
              {mode === "set"
                ? lang === "en"
                  ? "Set Lock"
                  : "上鎖"
                : lang === "en"
                  ? "Unlock"
                  : "解鎖"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/** Recursive folder node component */
interface FolderNodeProps {
  folder: FolderItem;
  depth: number;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  dragOverFolderId: string | null;
  dragChatId: string | null;
  dragFolderId: string | null;
  renamingFolderId: string | null;
  folderRenameValue: string;
  setFolderRenameValue: (v: string) => void;
  handleFolderRenameConfirm: () => void;
  setRenamingFolderId: (id: string | null) => void;
  handleFolderDoubleClick: (id: string) => void;
  handleDeleteFolder: (id: string) => void;
  handleDragOver: (e: React.DragEvent, folderId: string) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, targetFolderId: string) => void;
  handleDragStart: (e: React.DragEvent, chatId: string, folderId: string) => void;
  handleDragEnd: () => void;
  handleFolderDragStart: (e: React.DragEvent, folderId: string) => void;
  handleFolderDragEnd: () => void;
  handleChatClick: (chat: ChatItem) => void;
  handleContextMenu: (e: React.MouseEvent, chatId: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  handleRenameConfirm: () => void;
  setRenamingId: (id: string | null) => void;
  editingPromptFolderId: string | null;
  promptEditValue: string;
  setPromptEditValue: (v: string) => void;
  handlePromptEditToggle: (folderId: string) => void;
  lang: string;
  onLockChat: (chatId: string, mode: "set" | "unlock") => void;
  onLockFolder: (folderId: string, mode: "set" | "unlock") => void;
  unlockedIds: Set<string>;
  isAdmin: boolean;
}

function FolderNode({
  folder, depth, expandedFolders, toggleFolder,
  dragOverFolderId, dragChatId, dragFolderId,
  renamingFolderId, folderRenameValue, setFolderRenameValue,
  handleFolderRenameConfirm, setRenamingFolderId,
  handleFolderDoubleClick, handleDeleteFolder,
  handleDragOver, handleDragLeave, handleDrop,
  handleDragStart, handleDragEnd,
  handleFolderDragStart, handleFolderDragEnd,
  handleChatClick, handleContextMenu,
  renamingId, renameValue, setRenameValue, handleRenameConfirm, setRenamingId,
  editingPromptFolderId, promptEditValue, setPromptEditValue, handlePromptEditToggle,
  lang,
  onLockChat, onLockFolder, unlockedIds, isAdmin,
}: FolderNodeProps) {
  const isDefault = DEFAULT_FOLDER_IDS.has(folder.id);
  const totalCount = countAllChats(folder);

  return (
    <div
      draggable={!isDefault}
      onDragStart={e => { e.stopPropagation(); handleFolderDragStart(e, folder.id); }}
      onDragEnd={e => { e.stopPropagation(); handleFolderDragEnd(); }}
      onDragOver={e => { e.stopPropagation(); handleDragOver(e, folder.id); }}
      onDragLeave={e => { e.stopPropagation(); handleDragLeave(); }}
      onDrop={e => handleDrop(e, folder.id)}
      style={{ paddingLeft: depth > 0 ? `${depth * 8}px` : undefined }}
    >
      <div
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-white/40 hover:text-white/60 hover:bg-white/4 transition-colors group/folder",
          dragOverFolderId === folder.id && "bg-blue-500/15 border border-blue-500/30 text-white/70",
          dragFolderId === folder.id && "opacity-40"
        )}
      >
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0"
          onClick={() => toggleFolder(folder.id)}
          onDoubleClick={() => handleFolderDoubleClick(folder.id)}
        >
          {expandedFolders.has(folder.id)
            ? <ChevronDown size={12} />
            : <ChevronRight size={12} />
          }
          <span className={folder.color}>{FOLDER_ICONS[folder.icon] || <Folder size={14} />}</span>
          {renamingFolderId === folder.id ? (
            <input
              value={folderRenameValue}
              onChange={e => setFolderRenameValue(e.target.value)}
              onBlur={handleFolderRenameConfirm}
              onKeyDown={e => {
                if (e.key === "Enter") handleFolderRenameConfirm();
                if (e.key === "Escape") setRenamingFolderId(null);
              }}
              className="flex-1 min-w-0 bg-white/10 border border-blue-500/40 rounded px-1 py-0.5 text-[0.65rem] text-white/80 focus:outline-none font-medium tracking-wide uppercase"
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="font-medium tracking-wide uppercase text-[0.65rem] truncate">{folder.name}</span>
          )}
        </button>
        <span className="text-[0.65rem] text-white/20 shrink-0">{totalCount}</span>
        {/* Lock icon for folders */}
        {!isDefault && (
          <button
            onClick={e => {
              e.stopPropagation()
              if (folder.lockHash) {
                onLockFolder(folder.id, "unlock")
              } else {
                onLockFolder(folder.id, "set")
              }
            }}
            className={cn(
              "shrink-0 p-0.5 rounded transition-opacity",
              folder.lockHash
                ? "opacity-60 text-amber-400 hover:opacity-100"
                : "opacity-0 group-hover/folder:opacity-40 hover:!opacity-80 text-white/40"
            )}
            title={folder.lockHash
              ? (lang === "en" ? "Locked" : "已鎖定")
              : (lang === "en" ? "Lock folder" : "鎖定資料夾")
            }
          >
            {folder.lockHash ? <Lock size={11} /> : <Unlock size={11} />}
          </button>
        )}
        {/* Prompt edit button for custom folders */}
        {!isDefault && (
          <button
            onClick={e => { e.stopPropagation(); handlePromptEditToggle(folder.id); }}
            className={cn(
              "shrink-0 p-0.5 rounded transition-opacity",
              editingPromptFolderId === folder.id
                ? "opacity-80 text-blue-400"
                : "opacity-0 group-hover/folder:opacity-40 hover:!opacity-80 text-white/60"
            )}
            title={lang === "en" ? "Edit folder prompt" : "編輯資料夾提示"}
          >
            <Edit3 size={10} />
          </button>
        )}
        {!isDefault && totalCount === 0 && (
          <button
            onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
            className="shrink-0 opacity-0 group-hover/folder:opacity-40 hover:!opacity-80 p-0.5 rounded text-red-400"
            title={lang === "en" ? "Delete folder" : "刪除資料夾"}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
      {/* Folder prompt textarea */}
      {editingPromptFolderId === folder.id && (
        <div className="mx-2 mb-1" style={{ paddingLeft: depth > 0 ? `${depth * 8}px` : undefined }}>
          <textarea
            value={promptEditValue}
            onChange={e => setPromptEditValue(e.target.value)}
            onBlur={() => handlePromptEditToggle(folder.id)}
            onKeyDown={e => {
              if (e.key === "Escape") { setPromptEditValue(""); handlePromptEditToggle(folder.id); }
            }}
            placeholder={lang === "en" ? "Folder prompt (injected as context)..." : "資料夾提示（注入為上下文）..."}
            className="w-full bg-white/5 border border-blue-500/30 rounded-lg px-2 py-1.5 text-[0.65rem] text-white/70 placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 resize-none"
            rows={2}
            autoFocus
          />
        </div>
      )}
      {expandedFolders.has(folder.id) && !(folder.lockHash && !unlockedIds.has(folder.id) && !isAdmin) && (
        <div className="ml-2 space-y-0.5">
          {folder.chats.map(chat => (
            <button
              key={chat.id}
              draggable
              onDragStart={e => { e.stopPropagation(); handleDragStart(e, chat.id, folder.id); }}
              onDragEnd={handleDragEnd}
              className={cn(
                "w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 group",
                chat.active
                  ? "bg-blue-600/15 text-white/90 border border-blue-500/20"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5",
                dragChatId === chat.id && "opacity-40"
              )}
              onClick={() => handleChatClick(chat)}
              onContextMenu={e => handleContextMenu(e, chat.id)}
            >
              <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />
              <div className="flex-1 min-w-0">
                {renamingId === chat.id ? (
                  <input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={handleRenameConfirm}
                    onKeyDown={e => { if (e.key === "Enter") handleRenameConfirm(); if (e.key === "Escape") setRenamingId(null); }}
                    className="w-full bg-white/10 border border-blue-500/40 rounded px-1 py-0.5 text-xs text-white/80 focus:outline-none"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <p className={cn("text-xs truncate leading-tight", chat.lockHash && !unlockedIds.has(chat.id) && !isAdmin && "text-white/30 italic")}>
                      {chat.lockHash && !unlockedIds.has(chat.id) && !isAdmin && "🔒 "}
                      {chat.lockHash && !unlockedIds.has(chat.id) && !isAdmin
                        ? (lang === "en" ? "Locked" : "已鎖定")
                        : chat.title}
                    </p>
                    <p className="text-[0.65rem] text-white/25 mt-0.5">{chat.time}</p>
                  </>
                )}
              </div>
              {/* Lock icon — always visible if locked, hover-visible if unlocked */}
              <button
                onClick={e => {
                  e.stopPropagation()
                  if (chat.lockHash) {
                    onLockChat(chat.id, "unlock")
                  } else {
                    onLockChat(chat.id, "set")
                  }
                }}
                className={cn(
                  "shrink-0 mt-0.5 p-0.5 rounded transition-opacity",
                  chat.lockHash
                    ? "opacity-60 text-amber-400 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-40 hover:!opacity-80 text-white/40"
                )}
                title={chat.lockHash
                  ? (lang === "en" ? "Locked" : "已鎖定")
                  : (lang === "en" ? "Lock chat" : "鎖定對話")
                }
              >
                {chat.lockHash ? <Lock size={11} /> : <Unlock size={11} />}
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleContextMenu(e, chat.id); }}
                className="shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-80 mt-0.5 p-0.5 rounded"
              >
                <MoreHorizontal size={12} />
              </button>
            </button>
          ))}
          {/* Render child folders recursively */}
          {folder.children.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              dragOverFolderId={dragOverFolderId}
              dragChatId={dragChatId}
              dragFolderId={dragFolderId}
              renamingFolderId={renamingFolderId}
              folderRenameValue={folderRenameValue}
              setFolderRenameValue={setFolderRenameValue}
              handleFolderRenameConfirm={handleFolderRenameConfirm}
              setRenamingFolderId={setRenamingFolderId}
              handleFolderDoubleClick={handleFolderDoubleClick}
              handleDeleteFolder={handleDeleteFolder}
              handleDragOver={handleDragOver}
              handleDragLeave={handleDragLeave}
              handleDrop={handleDrop}
              handleDragStart={handleDragStart}
              handleDragEnd={handleDragEnd}
              handleFolderDragStart={handleFolderDragStart}
              handleFolderDragEnd={handleFolderDragEnd}
              handleChatClick={handleChatClick}
              handleContextMenu={handleContextMenu}
              renamingId={renamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              handleRenameConfirm={handleRenameConfirm}
              setRenamingId={setRenamingId}
              editingPromptFolderId={editingPromptFolderId}
              promptEditValue={promptEditValue}
              setPromptEditValue={setPromptEditValue}
              handlePromptEditToggle={handlePromptEditToggle}
              lang={lang}
              onLockChat={onLockChat}
              onLockFolder={onLockFolder}
              unlockedIds={unlockedIds}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  activeConversationId?: string;
  onOpenSettings?: () => void;
  onNewChatCreated?: (chatId: string, title: string) => void;
  onFolderContext?: (folderId: string | null, folderPrompt: string) => void;
}

export default function Sidebar({
  collapsed, onToggle, onNewChat, onSelectChat,
  activeConversationId, onOpenSettings, onNewChatCreated,
  onFolderContext,
}: SidebarProps) {
  const { settings } = useSettings();
  const { user, logout, isAdmin } = useAuth();
  const lang = settings.language;
  const effectiveUserId = user?.id || "anon";
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["pinned", "recent"]));
  const [folders, setFolders] = useState<FolderItem[]>(() => {
    const raw = loadUserData(effectiveUserId, "sidebar-folders", DEFAULT_FOLDERS);
    return (raw as any[]).map(migrateFolder);
  });
  const [contextMenu, setContextMenu] = useState<{
    chatId: string
    x: number
    y: number
    showMoveMenu?: boolean
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Folder rename state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");

  // Drag-and-drop state (chats)
  const [dragChatId, setDragChatId] = useState<string | null>(null);
  const [dragSourceFolder, setDragSourceFolder] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Drag-and-drop state (folders)
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);

  // Folder prompt editing
  const [editingPromptFolderId, setEditingPromptFolderId] = useState<string | null>(null);
  const [promptEditValue, setPromptEditValue] = useState("");

  // Lock state
  const [lockDialog, setLockDialog] = useState<{
    type: "chat" | "folder"
    id: string
    mode: "set" | "unlock" | "removeLock"
  } | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

  // Locked folder drop confirmation
  const [lockDropConfirm, setLockDropConfirm] = useState<{
    chatId: string
    targetFolderId: string
    folderName: string
  } | null>(null);
  const [lockDropSkipFolders, setLockDropSkipFolders] = useState<Set<string>>(new Set());

  // Guard: track last serialized folders to prevent infinite event loops
  const lastFolderJsonRef = useRef("");

  // Persist folders on every change + notify other components
  useEffect(() => {
    saveUserData(effectiveUserId, "sidebar-folders", folders);
    const json = JSON.stringify(folders);
    if (json === lastFolderJsonRef.current) return; // skip if no real change
    lastFolderJsonRef.current = json;
    window.dispatchEvent(new CustomEvent("folders-changed", { detail: { folders } }));
  }, [folders, effectiveUserId]);

  // Listen for folder changes from ContextPinning (bidirectional sync)
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        if (detail?.folders) {
          const json = JSON.stringify(detail.folders);
          if (json === lastFolderJsonRef.current) return; // already in sync
          lastFolderJsonRef.current = json;
          setFolders(detail.folders.map(migrateFolder));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("context-folder-moved", handler);
    return () => window.removeEventListener("context-folder-moved", handler);
  }, []);

  // Cleanup delete confirmation timer
  useEffect(() => {
    function handleRenameChat(e: Event) {
      const { chatId, title } = (e as CustomEvent).detail || {};
      if (!chatId || !title) return;
      setFolders((prev) =>
        updateChatsInTree(prev, (c) =>
          c.id === chatId ? { ...c, title } : c,
        ),
      );
    }
    window.addEventListener("rename-chat", handleRenameChat);
    return () => window.removeEventListener("rename-chat", handleRenameChat);
  }, []);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const toggleFolder = (id: string) => {
    // Check if folder is locked and not yet unlocked this session
    const folder = flattenFolders(folders).find(f => f.id === id);
    if (folder?.lockHash && !unlockedIds.has(id) && !isAdmin) {
      setLockDialog({ type: "folder", id, mode: "unlock" });
      return;
    }
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredFolders = filterFoldersByQuery(folders, searchQuery);

  const totalChats = folders.reduce((sum, f) => sum + countAllChats(f), 0);

  const handleChatClick = (chat: ChatItem) => {
    // Check if chat is locked and not yet unlocked this session
    if (chat.lockHash && !unlockedIds.has(chat.id) && !isAdmin) {
      setLockDialog({ type: "chat", id: chat.id, mode: "unlock" });
      return;
    }
    onSelectChat?.(chat.id);
    // Update active state across the tree
    setFolders(prev => updateChatsInTree(prev, c => ({ ...c, active: c.id === chat.id })));
    // Report folder context
    const result = findFolderForChat(folders, chat.id);
    if (result) {
      const combinedPrompt = result.promptChain.filter(Boolean).join("\n\n");
      onFolderContext?.(result.folder.id, combinedPrompt);
    } else {
      onFolderContext?.(null, "");
    }
  };

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    setContextMenu({ chatId, x: e.clientX, y: e.clientY });
  };

  const handleDeleteChat = useCallback((chatId: string) => {
    // Block delete if chat is locked
    const chat = flattenFolders(folders).flatMap(f => f.chats).find(c => c.id === chatId);
    if (chat?.lockHash && !unlockedIds.has(chatId) && !isAdmin) {
      toast.error(lang === "en" ? "Unlock this chat before deleting" : "請先解鎖才能刪除");
      return;
    }
    if (deleteConfirmId === chatId) {
      // Second click — actually delete
      setFolders(prev => removeChatFromTree(prev, chatId));
      setContextMenu(null);
      setDeleteConfirmId(null);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      toast.info(t("sidebar.chatDeleted", lang));
    } else {
      // First click — enter confirm mode
      setDeleteConfirmId(chatId);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => {
        setDeleteConfirmId(prev => (prev === chatId ? null : prev));
      }, 3000);
    }
  }, [deleteConfirmId, lang]);

  const handleRenameStart = (chat: ChatItem) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
    setContextMenu(null);
  };

  const handleRenameConfirm = () => {
    if (renamingId && renameValue.trim()) {
      setFolders(prev => updateChatsInTree(prev, c => c.id === renamingId ? { ...c, title: renameValue.trim() } : c));
    }
    setRenamingId(null);
  };

  const handleTogglePin = (chatId: string) => {
    let chatToMove: ChatItem | null = null;
    const allFlat = flattenFolders(folders);
    let sourceFolder = "";

    // Find the chat in the whole tree
    for (const f of allFlat) {
      const chat = f.chats.find(c => c.id === chatId);
      if (chat) {
        chatToMove = { ...chat };
        sourceFolder = f.id;
        break;
      }
    }

    if (!chatToMove) return;

    setFolders(prev => {
      const next = removeChatFromTree(prev, chatId);

      if (sourceFolder === "pinned") {
        // Unpin: move to recent
        const recentFolder = next.find(f => f.id === "recent");
        if (recentFolder) {
          recentFolder.chats.unshift({ ...chatToMove!, pinned: false });
        }
        toast.info(t("sidebar.unpinned", lang));
      } else {
        // Pin: move to pinned
        const pinnedFolder = next.find(f => f.id === "pinned");
        if (pinnedFolder) {
          pinnedFolder.chats.push({ ...chatToMove!, pinned: true });
        }
        toast.success(t("sidebar.pinned_action", lang));
      }

      return next;
    });

    setContextMenu(null);
  };

  const handleNewChat = () => {
    const chatId = `c-${Date.now()}`;
    const title = lang === "en" ? "New Chat" : "新對話";
    const now = new Date();
    const time = now.toLocaleDateString(lang === "en" ? "en-US" : "zh-TW", { month: "short", day: "numeric" });

    // Add to recent folder, deactivate all others
    setFolders(prev => {
      const deactivated = updateChatsInTree(prev, c => ({ ...c, active: false }));
      return deactivated.map(f => {
        if (f.id === "recent") {
          return {
            ...f,
            chats: [{ id: chatId, title, time, active: true }, ...f.chats],
          };
        }
        return f;
      });
    });

    onNewChat?.();
    onNewChatCreated?.(chatId, title);
    toast.success(t("sidebar.newChatCreated", lang));
  };

  // --- Create folder ---
  const handleCreateFolder = () => {
    const customCount = folders.filter(
      (f) => !DEFAULT_FOLDER_IDS.has(f.id),
    ).length;
    const color =
      FOLDER_COLOR_CYCLE[customCount % FOLDER_COLOR_CYCLE.length];
    const id = `folder-${Date.now()}`;
    const name = t("sidebar.newFolder", lang);
    const newFolder: FolderItem = {
      id,
      name,
      icon: "folder",
      color,
      chats: [],
      children: [],
      prompt: "",
    };
    setFolders((prev) => [...prev, newFolder]);
    setExpandedFolders((prev) => new Set([...prev, id]));
    // Enter rename mode immediately
    setRenamingFolderId(id);
    setFolderRenameValue(name);
    toast.success(t("sidebar.folderCreated", lang));
  };

  // --- Rename folder ---
  const handleFolderRenameConfirm = () => {
    if (renamingFolderId && folderRenameValue.trim()) {
      setFolders((prev) =>
        updateFolderInTree(prev, renamingFolderId!, f => ({ ...f, name: folderRenameValue.trim() }))
      );
      toast.info(t("sidebar.folderRenamed", lang));
    }
    setRenamingFolderId(null);
  };

  const handleFolderDoubleClick = (folderId: string) => {
    if (DEFAULT_FOLDER_IDS.has(folderId)) return;
    const result = findFolderById(folders, folderId);
    if (!result) return;
    setRenamingFolderId(folderId);
    setFolderRenameValue(result.folder.name);
  };

  // --- Delete custom folder ---
  const handleDeleteFolder = (folderId: string) => {
    if (DEFAULT_FOLDER_IDS.has(folderId)) return;
    const result = findFolderById(folders, folderId);
    if (!result) return;
    // Block delete if folder is locked
    if (result.folder.lockHash && !unlockedIds.has(folderId) && !isAdmin) {
      toast.error(lang === "en" ? "Unlock this folder before deleting" : "請先解鎖才能刪除");
      return;
    }
    if (countAllChats(result.folder) > 0) return;
    setFolders((prev) => removeFolderFromTree(prev, folderId));
    toast.info(t("sidebar.folderDeleted", lang));
  };

  // --- Drag-and-drop handlers ---
  const handleDragStart = (
    e: React.DragEvent,
    chatId: string,
    folderId: string,
  ) => {
    setDragChatId(chatId);
    setDragSourceFolder(folderId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chatId);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);

    // Check for notepad conversation drops
    const notepadFlag = e.dataTransfer.getData("application/x-notepad-conversation");
    if (notepadFlag) {
      const jsonText = e.dataTransfer.getData("application/json");
      if (jsonText) {
        try {
          const data = JSON.parse(jsonText);
          const content = data.content || jsonText;
          const preview = content.slice(0, 40).replace(/\n/g, " ");
          const chatId = `c-np-${Date.now()}`;
          const now = new Date();
          const time = now.toLocaleDateString(lang === "en" ? "en-US" : "zh-TW", { month: "short", day: "numeric" });
          const newChat: ChatItem = {
            id: chatId,
            title: preview || (lang === "en" ? "Notepad Import" : "記事本匯入"),
            time,
            active: false,
          };
          setFolders(prev =>
            updateFolderInTree(prev, targetFolderId, f => ({
              ...f,
              chats: [...f.chats, newChat],
            }))
          );
          // Save the conversation content as chat messages
          const effectiveUserId = user?.id || "anon";
          saveUserData(effectiveUserId, `chat-${chatId}`, [{
            id: `m${Date.now()}`,
            role: data.role || "assistant",
            content: content,
            timestamp: now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
          }]);
          toast.success(lang === "en" ? "Conversation imported from Notepad" : "已從記事本匯入對話");
        } catch { /* ignore */ }
      }
      return;
    }

    if (
      !dragChatId ||
      !dragSourceFolder ||
      dragSourceFolder === targetFolderId
    ) {
      setDragChatId(null);
      setDragSourceFolder(null);
      return;
    }
    moveChatToFolder(dragChatId, targetFolderId);
    setDragChatId(null);
    setDragSourceFolder(null);
  };

  const handleDragEnd = () => {
    setDragChatId(null);
    setDragSourceFolder(null);
    setDragOverFolderId(null);
  };

  // --- Move chat to folder (shared by drag-drop & context menu) ---
  const moveChatToFolder = (chatId: string, targetFolderId: string, skipLockCheck = false) => {
    // Check if target folder is locked — show confirmation unless skipped
    if (!skipLockCheck && !isAdmin) {
      const targetFolder = flattenFolders(folders).find(f => f.id === targetFolderId);
      if (targetFolder?.lockHash && !lockDropSkipFolders.has(targetFolderId)) {
        setLockDropConfirm({ chatId, targetFolderId, folderName: targetFolder.name });
        return;
      }
    }

    const allFlat = flattenFolders(folders);
    let chatToMove: ChatItem | null = null;
    for (const f of allFlat) {
      const chat = f.chats.find((c) => c.id === chatId);
      if (chat) {
        chatToMove = { ...chat };
        break;
      }
    }
    if (!chatToMove) return;

    const isPinTarget = targetFolderId === "pinned";
    setFolders((prev) => {
      const cleaned = removeChatFromTree(prev, chatId);
      return updateFolderInTree(cleaned, targetFolderId, f => ({
        ...f,
        chats: [...f.chats, { ...chatToMove!, pinned: isPinTarget }],
      }));
    });

    const targetResult = findFolderById(folders, targetFolderId);
    toast.info(
      t("sidebar.movedTo", lang, { folder: targetResult?.folder.name || "" }),
    );
    setContextMenu(null);
  };

  // --- Folder drag-and-drop handlers ---
  const handleFolderDragStart = (
    e: React.DragEvent,
    folderId: string,
  ) => {
    if (DEFAULT_FOLDER_IDS.has(folderId)) {
      e.preventDefault();
      return;
    }
    setDragFolderId(folderId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `folder:${folderId}`);
  };

  const handleFolderDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);

    // Handle folder-into-folder drop
    if (dragFolderId) {
      if (dragFolderId === targetFolderId) { setDragFolderId(null); return; }
      if (DEFAULT_FOLDER_IDS.has(dragFolderId)) { setDragFolderId(null); return; }
      // Prevent circular nesting
      const sourceResult = findFolderById(folders, dragFolderId);
      if (sourceResult && isDescendant(sourceResult.folder, targetFolderId)) { setDragFolderId(null); return; }

      setFolders(prev => {
        const sourceFolder = findFolderById(prev, dragFolderId!)?.folder;
        if (!sourceFolder) return prev;
        const cleaned = removeFolderFromTree(prev, dragFolderId!);
        return addFolderAsChild(cleaned, targetFolderId, { ...sourceFolder, parentId: targetFolderId });
      });
      setExpandedFolders(prev => new Set([...prev, targetFolderId]));
      setDragFolderId(null);
      toast.info(lang === "en" ? "Folder moved" : "資料夾已移動");
      return;
    }

    // Otherwise fall through to chat drop
    handleDrop(e, targetFolderId);
  };

  const handleFolderDragEnd = () => {
    setDragFolderId(null);
    setDragOverFolderId(null);
  };

  // --- Folder prompt editing ---
  const handlePromptEditToggle = (folderId: string) => {
    if (editingPromptFolderId === folderId) {
      // Save and close
      setFolders(prev => updateFolderInTree(prev, folderId, f => ({ ...f, prompt: promptEditValue })));
      setEditingPromptFolderId(null);
      toast.info(lang === "en" ? "Folder prompt saved" : "資料夾提示已儲存");
    } else {
      const result = findFolderById(folders, folderId);
      setPromptEditValue(result?.folder.prompt || "");
      setEditingPromptFolderId(folderId);
    }
  };

  // --- Lock handlers ---
  const handleLockChat = (chatId: string, mode: "set" | "unlock") => {
    setLockDialog({ type: "chat", id: chatId, mode });
  };

  const handleLockFolder = (folderId: string, mode: "set" | "unlock") => {
    setLockDialog({ type: "folder", id: folderId, mode });
  };

  const handleLockSubmit = async (password: string) => {
    if (!lockDialog) return;
    const hash = await hashPassword(password);

    if (lockDialog.mode === "set") {
      // Set lock
      if (lockDialog.type === "chat") {
        setFolders((prev) =>
          updateChatsInTree(prev, (c) =>
            c.id === lockDialog.id ? { ...c, lockHash: hash } : c,
          ),
        );
      } else {
        setFolders((prev) =>
          updateFolderInTree(prev, lockDialog.id, (f) => ({
            ...f,
            lockHash: hash,
          })),
        );
      }
      toast.success(lang === "en" ? "Lock set" : "已上鎖");
    } else if (lockDialog.mode === "removeLock") {
      // Verify password then remove the lock entirely
      const target =
        lockDialog.type === "chat"
          ? flattenFolders(folders)
            .flatMap((f) => f.chats)
            .find((c) => c.id === lockDialog.id)
          : flattenFolders(folders).find(
            (f) => f.id === lockDialog.id,
          );

      if (target?.lockHash === hash) {
        if (lockDialog.type === "chat") {
          setFolders((prev) =>
            updateChatsInTree(prev, (c) =>
              c.id === lockDialog.id
                ? { ...c, lockHash: undefined }
                : c,
            ),
          );
        } else {
          setFolders((prev) =>
            updateFolderInTree(prev, lockDialog.id, (f) => ({
              ...f,
              lockHash: undefined,
            })),
          );
        }
        setUnlockedIds((prev) => {
          const next = new Set(prev);
          next.delete(lockDialog.id);
          return next;
        });
        toast.success(
          lang === "en" ? "Lock removed" : "已移除鎖定",
        );
      } else {
        toast.error(lang === "en" ? "Wrong password" : "密碼錯誤");
        return; // Don't close dialog
      }
    } else {
      // Verify unlock (session-only)
      const target =
        lockDialog.type === "chat"
          ? flattenFolders(folders)
            .flatMap((f) => f.chats)
            .find((c) => c.id === lockDialog.id)
          : flattenFolders(folders).find(
            (f) => f.id === lockDialog.id,
          );

      if (target?.lockHash === hash) {
        setUnlockedIds(
          (prev) => new Set([...prev, lockDialog.id]),
        );
        toast.success(lang === "en" ? "Unlocked" : "已解鎖");
      } else {
        toast.error(lang === "en" ? "Wrong password" : "密碼錯誤");
        return; // Don't close dialog
      }
    }
    setLockDialog(null);
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-full transition-all duration-300 ease-in-out",
        "border-r border-white/[0.06]",
        "bg-[oklch(0.11_0.014_265)]",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center h-14 px-3 border-b border-white/[0.06] shrink-0",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <img src="/logos/app-logo.png" alt="" width={28} height={28} className="rounded-lg" style={{ objectFit: "cover" }} />
            <img
              src="/logos/ai-workbench.png"
              alt="AI Workbench"
              height={22}
              className="h-[22px] w-auto"
              style={{
                maskImage: "linear-gradient(to right, black 85%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, black 85%, transparent 100%)",
              }}
            />
          </div>
        )}
        {collapsed && (
          <img src="/logos/app-logo.png" alt="" width={28} height={28} className="rounded-lg" style={{ objectFit: "cover" }} />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-white/40 hover:text-white/80 hover:bg-white/5 shrink-0"
          onClick={onToggle}
        >
          {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
        </Button>
      </div>

      {/* New Chat Button */}
      <div className={cn("px-3 py-3 shrink-0", collapsed && "px-2")}>
        <Button
          className={cn(
            "w-full text-sm font-medium transition-all duration-200",
            "bg-gradient-to-r from-blue-600/80 to-violet-600/80 hover:from-blue-500 hover:to-violet-500",
            "text-white border-0 shadow-lg shadow-blue-900/30",
            collapsed ? "h-9 w-9 p-0 mx-auto flex" : "h-9 justify-start gap-2"
          )}
          onClick={handleNewChat}
        >
          <Plus size={15} />
          {!collapsed && <span>{t("sidebar.newChat", lang)}</span>}
        </Button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              placeholder={t("sidebar.searchChats", lang)}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 h-8 text-xs bg-white/5 border border-white/8 rounded-lg text-white/70 placeholder:text-white/25 focus:border-blue-500/50 focus:bg-white/8 focus:outline-none"
            />
          </div>
        </div>
      )}


      {/* Chat History */}
      <div
        className={cn(
          "flex-1 overflow-y-auto px-2 space-y-1 min-h-0",
          dragFolderId && dragOverFolderId === "__root__" && "bg-violet-500/10 ring-1 ring-inset ring-violet-500/20 rounded-lg",
        )}
        onDragOver={(e) => {
          if (!dragFolderId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverFolderId("__root__");
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the container itself, not entering a child
          if (e.currentTarget === e.target) setDragOverFolderId(null);
        }}
        onDrop={(e) => {
          if (!dragFolderId) return;
          e.preventDefault();
          setDragOverFolderId(null);
          if (DEFAULT_FOLDER_IDS.has(dragFolderId)) { setDragFolderId(null); return; }
          // Move folder to top level
          setFolders(prev => {
            const source = findFolderById(prev, dragFolderId!)?.folder;
            if (!source) return prev;
            const cleaned = removeFolderFromTree(prev, dragFolderId!);
            return [...cleaned, { ...source, parentId: undefined }];
          });
          setDragFolderId(null);
          toast.info(lang === "en" ? "Folder moved to top level" : "資料夾已移至最上層");
        }}
      >
        {!collapsed && totalChats === 0 && searchQuery === "" && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Inbox size={28} className="text-white/10 mb-3" />
            <p className="text-xs text-white/25">
              {lang === "en" ? "No conversations yet" : "尚無對話紀錄"}
            </p>
            <p className="text-[0.65rem] text-white/15 mt-1">
              {lang === "en" ? "Start a new chat to begin" : "開始新對話吧"}
            </p>
          </div>
        )}
        {!collapsed && filteredFolders.map(folder => (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            dragOverFolderId={dragOverFolderId}
            dragChatId={dragChatId}
            dragFolderId={dragFolderId}
            renamingFolderId={renamingFolderId}
            folderRenameValue={folderRenameValue}
            setFolderRenameValue={setFolderRenameValue}
            handleFolderRenameConfirm={handleFolderRenameConfirm}
            setRenamingFolderId={setRenamingFolderId}
            handleFolderDoubleClick={handleFolderDoubleClick}
            handleDeleteFolder={handleDeleteFolder}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleFolderDrop}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleFolderDragStart={handleFolderDragStart}
            handleFolderDragEnd={handleFolderDragEnd}
            handleChatClick={handleChatClick}
            handleContextMenu={handleContextMenu}
            renamingId={renamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            handleRenameConfirm={handleRenameConfirm}
            setRenamingId={setRenamingId}
            editingPromptFolderId={editingPromptFolderId}
            promptEditValue={promptEditValue}
            setPromptEditValue={setPromptEditValue}
            handlePromptEditToggle={handlePromptEditToggle}
            lang={lang}
            onLockChat={handleLockChat}
            onLockFolder={handleLockFolder}
            unlockedIds={unlockedIds}
            isAdmin={isAdmin}
          />
        ))}
        {/* Create Folder button */}
        {!collapsed && (
          <button
            onClick={handleCreateFolder}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-white/25 hover:text-white/50 hover:bg-white/4 transition-colors mt-1"
          >
            <FolderPlus size={12} />
            <span className="text-[0.65rem] font-medium">{t("sidebar.createFolder", lang)}</span>
          </button>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-1 pt-1">
            {[...Array(5)].map((_, i) => (
              <button
                key={i}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
                onClick={onToggle}
              >
                <MessageSquare size={14} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => { setContextMenu(null); setDeleteConfirmId(null); }} />
          <div
            className="fixed z-50 w-40 rounded-xl border border-white/10 bg-[oklch(0.12_0.015_265)] backdrop-blur-2xl shadow-xl overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="p-1">
              <button
                onClick={() => {
                  const chat = folders.flatMap(f => f.chats).find(c => c.id === contextMenu.chatId);
                  if (chat) handleRenameStart(chat);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:bg-white/8 transition-colors"
              >
                <Edit3 size={12} /> {t("sidebar.rename", lang)}
              </button>
              <button
                onClick={() => handleTogglePin(contextMenu.chatId)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:bg-white/8 transition-colors"
              >
                {folders.find(f => f.id === "pinned")?.chats.some(c => c.id === contextMenu.chatId)
                  ? <><PinOff size={12} /> {t("sidebar.unpin", lang)}</>
                  : <><Pin size={12} /> {t("sidebar.pin", lang)}</>
                }
              </button>
              {/* Move to... submenu */}
              <div className="relative">
                <button
                  onClick={() => setContextMenu(prev => prev ? { ...prev, showMoveMenu: !prev.showMoveMenu } : prev)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:bg-white/8 transition-colors"
                >
                  <ArrowRight size={12} /> {t("sidebar.moveTo", lang)}
                  <ChevronRight size={10} className="ml-auto" />
                </button>
                {contextMenu.showMoveMenu && (
                  <div className="absolute left-full top-0 ml-1 w-36 rounded-xl border border-white/10 bg-[oklch(0.12_0.015_265)] backdrop-blur-2xl shadow-xl overflow-hidden z-50 max-h-60 overflow-y-auto">
                    <div className="p-1">
                      {flattenFolders(folders)
                        .filter(f => {
                          // Hide the folder this chat is already in
                          return !f.chats.some(c => c.id === contextMenu.chatId);
                        })
                        .map(f => (
                          <button
                            key={f.id}
                            onClick={() => moveChatToFolder(contextMenu.chatId, f.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:bg-white/8 transition-colors"
                          >
                            <span className={f.color}>{FOLDER_ICONS[f.icon] || <Folder size={12} />}</span>
                            <span className="truncate">{f.name}</span>
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
              {/* Lock / Remove Lock */}
              <button
                onClick={() => {
                  const chat = flattenFolders(folders).flatMap(f => f.chats).find(c => c.id === contextMenu.chatId);
                  if (chat?.lockHash) {
                    // Already locked — remove lock (requires password)
                    setLockDialog({ type: "chat", id: contextMenu.chatId, mode: "removeLock" });
                  } else {
                    setLockDialog({ type: "chat", id: contextMenu.chatId, mode: "set" });
                  }
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:bg-white/8 transition-colors"
              >
                {flattenFolders(folders).flatMap(f => f.chats).find(c => c.id === contextMenu.chatId)?.lockHash
                  ? <><Unlock size={12} /> {lang === "en" ? "Remove Lock" : "移除鎖定"}</>
                  : <><Lock size={12} /> {lang === "en" ? "Lock" : "上鎖"}</>
                }
              </button>
              <button
                onClick={() => handleDeleteChat(contextMenu.chatId)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors",
                  deleteConfirmId === contextMenu.chatId
                    ? "text-red-300 bg-red-500/20 hover:bg-red-500/30"
                    : "text-red-400 hover:bg-red-500/10"
                )}
              >
                <Trash2 size={12} />
                {deleteConfirmId === contextMenu.chatId
                  ? (lang === "en" ? "Confirm?" : "確認刪除?")
                  : t("sidebar.delete", lang)
                }
              </button>
            </div>
          </div>
        </>
      )}

      {/* User Profile */}
      <div className={cn(
        "shrink-0 border-t border-white/[0.06] p-3",
        collapsed && "p-2"
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-1">
            {user?.avatar ? (
              <img src={user.avatar} className="w-7 h-7 rounded-full shrink-0" alt="" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
                <User size={13} className="text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/80 truncate">{user?.username || t("sidebar.user", lang)}</p>
              <p className="text-[0.65rem] text-white/35 truncate">{user?.email || t("sidebar.plan", lang)}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white/30 hover:text-white/60 hover:bg-white/5"
              onClick={onOpenSettings}>
              <Settings size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white/30 hover:text-red-400 hover:bg-red-500/10"
              onClick={logout}
              title={lang === "en" ? "Logout" : "登出"}>
              <LogOut size={12} />
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <User size={13} className="text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Lock Dialog */}
      {lockDialog && (
        <LockDialog
          mode={lockDialog.mode === "removeLock" ? "unlock" : lockDialog.mode}
          onSubmit={handleLockSubmit}
          onCancel={() => setLockDialog(null)}
          lang={lang}
        />
      )}

      {/* Locked folder drop confirmation */}
      {lockDropConfirm && (() => {
        const [dontAskChecked, setDontAskChecked] = [
          lockDropSkipFolders.has(lockDropConfirm.targetFolderId),
          (v: boolean) => {
            if (v) setLockDropSkipFolders(prev => new Set([...prev, lockDropConfirm.targetFolderId]));
            else setLockDropSkipFolders(prev => { const n = new Set(prev); n.delete(lockDropConfirm.targetFolderId); return n; });
          },
        ] as const;
        return (
          <>
            <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={() => setLockDropConfirm(null)} />
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-none">
              <div
                className="pointer-events-auto w-full max-w-xs rounded-2xl border border-amber-500/20 bg-[oklch(0.12_0.015_265)] shadow-2xl shadow-black/60 p-5"
                style={{ fontSize: 14 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white/90">
                    {lang === "en" ? "Move to Locked Folder" : "移動至已鎖定的資料夾"}
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed mb-4">
                  {lang === "en"
                    ? `"${lockDropConfirm.folderName}" is locked. The conversation will be locked with this folder. Continue?`
                    : `「${lockDropConfirm.folderName}」已鎖定。對話將隨此資料夾一同被鎖定。確認移入？`}
                </p>
                <label className="flex items-center gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lockDropSkipFolders.has(lockDropConfirm.targetFolderId)}
                    onChange={e => {
                      if (e.target.checked) setLockDropSkipFolders(prev => new Set([...prev, lockDropConfirm.targetFolderId]));
                      else setLockDropSkipFolders(prev => { const n = new Set(prev); n.delete(lockDropConfirm.targetFolderId); return n; });
                    }}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-amber-500"
                  />
                  <span className="text-[11px] text-white/40">
                    {lang === "en" ? "Don't ask again for this folder (this session)" : "本次登入不再對此資料夾提示"}
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLockDropConfirm(null)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs text-white/50 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    {lang === "en" ? "Cancel" : "取消"}
                  </button>
                  <button
                    onClick={() => {
                      const { chatId, targetFolderId } = lockDropConfirm;
                      setLockDropConfirm(null);
                      moveChatToFolder(chatId, targetFolderId, true);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 transition-colors"
                  >
                    {lang === "en" ? "Confirm" : "確認移入"}
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </aside>
  );
}
