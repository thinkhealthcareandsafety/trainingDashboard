"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Ticker } from "./Ticker";
import { effectiveStatus } from "@/lib/followups";

const NAV = [
  { href: "/", label: "Overview", icon: <path d="M3.5 4.5h5v5h-5zM11.5 4.5h5v5h-5zM3.5 12.5h5v3h-5zM11.5 12.5h5v3h-5z" /> },
  { href: "/follow-up", label: "Follow-ups", icon: <path d="M4 5.5h12M4 10h12M4 14.5h7" /> },
  { href: "/calendar", label: "Calendar", icon: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></> },
];

function timeAgo(iso: string, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = isDark ? "light" : "dark";
  try {
    localStorage.setItem("th.theme", root.dataset.theme);
  } catch {}
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function SyncStatus() {
  const { data, syncing, refresh, now } = useStore();
  if (!data) return null;
  const tone = data.error ? "bg-high" : data.source === "zoho" ? "bg-low" : "bg-medium";
  const label = data.error ? "Zoho isn’t responding" : data.source === "zoho" ? "Connected to Zoho" : "Sample data";
  return (
    <button
      onClick={refresh}
      className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
      title={data.error ?? "Sync now"}
    >
      <span className={`size-2 shrink-0 rounded-full ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink-2">{label}</span>
        <span className="block text-xs text-muted">{syncing ? "Updating…" : `Updated ${timeAgo(data.syncedAt, now)}`}</span>
      </span>
      <svg viewBox="0 0 20 20" className={`size-4 text-faint group-hover:text-ink ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5V7h-3.5" />
      </svg>
    </button>
  );
}

function StorageStatus() {
  const { storage } = useStore();
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-muted" title={storage === "team" ? "Calendar and follow-ups are shared through MongoDB" : "Add MONGODB_URI to share with your team"}>
      <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="10" cy="5.5" rx="6" ry="2.5" /><path d="M4 5.5v9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-9M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></svg>
      {storage === "team" ? "Saved to team database" : "Not saving to the team database — changes stay on this computer"}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { now, followUps, toasts, dismissToast, storage, ready } = useStore();
  // Only mention storage when something is wrong (team database not reachable).
  const storageWarn = ready && storage !== "team";
  const overdue = followUps.filter((f) => effectiveStatus(f, now) === "overdue").length;
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      <Ticker />
      <div className="flex min-h-[calc(100vh-36px)]">
        {/* Sidebar (desktop) */}
        <aside className="glass sticky top-9 hidden h-[calc(100vh-36px)] w-60 shrink-0 flex-col border-r border-line/70 px-3 py-5 lg:flex">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-[12px] font-bold text-brand-ink">TH</span>
            <span className="text-[14px] font-semibold tracking-tight">ThinkHealth</span>
          </Link>
          <nav className="space-y-0.5">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`press flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium ${
                  isOn(n.href) ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                <Icon>{n.icon}</Icon>
                <span className="flex-1">{n.label}</span>
                {n.href === "/follow-up" && overdue > 0 && (
                  <span className="rounded-md bg-high-bg px-1.5 text-[11px] font-semibold text-high num">{overdue}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-1 border-t border-line pt-3">
            <SyncStatus />
            {storageWarn && <StorageStatus />}
            <button onClick={toggleTheme} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted hover:bg-surface-2 hover:text-ink">
              <Icon><path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5Z" /></Icon>
              Appearance
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Top bar (mobile / tablet) */}
          <header className="glass sticky top-9 z-30 flex h-14 items-center gap-3 border-b border-line/70 px-4 lg:hidden">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-[12px] font-bold text-brand-ink">TH</span>
            <span className="text-[14px] font-semibold">ThinkHealth</span>
            <div className="ml-auto w-48"><SyncStatus /></div>
          </header>
          <main key={path} className="rise mx-auto max-w-[1680px] px-4 pb-28 pt-6 sm:px-8 lg:pb-14 lg:pt-10">{children}</main>
        </div>
      </div>

      {/* Bottom tabs (mobile / tablet) */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line/70 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isOn(n.href) ? "text-ink" : "text-muted"}`}>
            <Icon>{n.icon}</Icon>
            {n.label}
            {n.href === "/follow-up" && overdue > 0 && <span className="absolute right-[30%] top-1.5 size-1.5 rounded-full bg-high" />}
          </Link>
        ))}
      </nav>

      {/* Toasts */}
      <div className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2 lg:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className="modal-in flex items-center gap-4 rounded-full bg-ink/90 px-5 py-3 text-[13px] text-surface shadow-pop backdrop-blur">
            {t.text}
            {t.actionLabel && (
              <button
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  t.onAction?.();
                  dismissToast(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
