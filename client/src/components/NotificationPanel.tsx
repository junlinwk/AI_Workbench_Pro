/**
 * NotificationPanel — Dropdown notification center
 */
import { useState, useEffect } from "react";
import { Check, CheckCheck, Sparkles, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { loadUserData, saveUserData } from "@/lib/storage";
import { t } from "@/i18n";

interface Notification {
  id: string;
  type: "info" | "success" | "warning";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

/**
 * Push a notification to the user's notification list.
 * Persists to storage and dispatches a window event so the open panel updates in real time.
 */
export function pushNotification(
  userId: string,
  notif: Omit<Notification, "id" | "read">
) {
  const id = `n-${Date.now()}`;
  const full: Notification = { ...notif, id, read: false };
  const stored: Notification[] = loadUserData(userId, "notifications", []);
  stored.unshift(full);
  saveUserData(userId, "notifications", stored.slice(0, 50)); // Keep max 50
  window.dispatchEvent(
    new CustomEvent("push-notification", { detail: full })
  );
}

const typeStyles = {
  info: { icon: <Info size={14} />, color: "text-blue-400", bg: "bg-blue-500/10" },
  success: { icon: <Sparkles size={14} />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  warning: { icon: <AlertCircle size={14} />, color: "text-amber-400", bg: "bg-amber-500/10" },
};

interface NotificationPanelProps {
  onClose: () => void;
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const lang = settings.language;
  const [notifications, setNotifications] = useState<Notification[]>(() =>
    loadUserData(user?.id || "anon", "notifications", [])
  );

  // Persist on every change
  useEffect(() => {
    if (user?.id) saveUserData(user.id, "notifications", notifications);
  }, [notifications, user?.id]);

  // Listen for push-notification events (from pushNotification helper or other sources)
  useEffect(() => {
    const handler = (e: Event) => {
      const notif = (e as CustomEvent<Notification>).detail;
      if (notif) {
        setNotifications(prev => {
          // Avoid duplicates
          if (prev.some(n => n.id === notif.id)) return prev;
          return [notif, ...prev].slice(0, 50);
        });
      }
    };
    window.addEventListener("push-notification", handler);
    return () => window.removeEventListener("push-notification", handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const dismiss = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full right-0 mt-2 w-80 z-50 rounded-2xl border border-white/10 bg-[oklch(0.12_0.015_265)] backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white/80">{t("notif.title", lang)}</span>
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-semibold">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
              {t("notif.markAllRead", lang)}
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCheck size={24} className="mx-auto text-white/15 mb-2" />
              <p className="text-sm text-white/30">{t("notif.empty", lang)}</p>
            </div>
          ) : (
            notifications.map(notif => {
              const style = typeStyles[notif.type];
              return (
                <div
                  key={notif.id}
                  onClick={() => markRead(notif.id)}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b border-white/4 hover:bg-white/3 transition-colors cursor-pointer group",
                    !notif.read && "bg-white/2"
                  )}
                >
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", style.bg)}>
                    <span className={style.color}>{style.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-xs font-semibold", notif.read ? "text-white/50" : "text-white/80")}>
                        {notif.title}
                      </p>
                      {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </div>
                    <p className="text-xs text-white/35 mt-0.5 line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-white/20 mt-1">{notif.time}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); dismiss(notif.id); }}
                    className="p-1 rounded text-white/0 group-hover:text-white/30 hover:!text-white/60 transition-colors shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
