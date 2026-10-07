"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ZOHO_SYNCED, useStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { MembersScreen } from "./followups/MembersScreen";
import { Avatar, btn } from "./ui";
import type { Member } from "@/lib/types";
import { Ticker } from "./Ticker";
import { SyncLogWindow } from "./SyncLog";
import { effectiveStatus } from "@/lib/followups";

const NAV = [
  { href: "/", label: "Overview", icon: <path d="M3.5 4.5h5v5h-5zM11.5 4.5h5v5h-5zM3.5 12.5h5v3h-5zM11.5 12.5h5v3h-5z" /> },
  { href: "/follow-up", label: "Follow-ups", icon: <path d="M4 5.5h12M4 10h12M4 14.5h7" /> },
  { href: "/calendar", label: "Calendar", icon: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></> },
];

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

/* ---------------- Zoho sync: heartbeat, Sync now, last / next sync ---------------- */

type SyncInfo = { enabled?: boolean; syncedAt?: string; error?: string; due?: boolean; running?: boolean; nextAt?: number; ran?: boolean };

const clock = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
/** "Today, 10:00 am" · "Yesterday, 3:00 pm" · "Tomorrow, 9:00 am" · "Mon 12 Oct, 9:00 am". */
function dayTime(t: string | number, now: Date): string {
  const d = new Date(t);
  const shift = (n: number) => { const x = new Date(now); x.setDate(x.getDate() + n); return x.toDateString(); };
  const day = d.toDateString();
  const label = day === now.toDateString() ? "Today" : day === shift(-1) ? "Yesterday" : day === shift(1) ? "Tomorrow"
    : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return `${label}, ${clock(d)}`;
}

/**
 * One per page (signed in): asks the server every 2 minutes (and when the tab comes back) — the server runs the hourly
 * sync right then if it's due — and tells the pages to reload their Zoho data whenever a sync has finished.
 */
function useZohoSync(active: boolean) {
  const { toast } = useStore();
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [forcing, setForcing] = useState(false);
  const seen = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const take = useCallback((j: SyncInfo) => {
    setInfo(j);
    if (j.syncedAt && seen.current && j.syncedAt !== seen.current) window.dispatchEvent(new Event(ZOHO_SYNCED));
    if (j.syncedAt) seen.current = j.syncedAt;
  }, []);
  const beat = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const res = await fetch("/api/zoho/sync", { cache: "no-store" });
      if (res.ok || res.status === 502) take(await res.json());
    } catch {} finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [take]);
  useEffect(() => {
    if (!active) return;
    beat();
    const t = setInterval(beat, 2 * 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, beat]);
  const syncNow = async () => {
    if (forcing) return;
    setForcing(true);
    try {
      const res = await fetch("/api/zoho/sync", { method: "POST", cache: "no-store" });
      const j = (await res.json()) as SyncInfo;
      take(j);
      toast({ text: j.error ? `Zoho sync failed: ${j.error}` : j.ran ? "Synced with Zoho Books" : "Synced less than a minute ago — try again in a moment" });
    } catch (e) {
      toast({ text: `Zoho sync failed: ${String(e)}` });
    } finally {
      setForcing(false);
    }
  };
  // "Syncing…" while a sync runs anywhere, or while our heartbeat is waiting on a sync that was due.
  const syncing = forcing || Boolean(info?.running) || (checking && Boolean(info?.due));
  return { info, syncing, syncNow };
}
type ZohoSync = ReturnType<typeof useZohoSync>;

const SyncIcon = ({ spin }: { spin?: boolean }) => (
  <svg viewBox="0 0 20 20" className={`size-4 shrink-0 ${spin ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5V7h-3.5" />
  </svg>
);

const LogIcon = () => (
  <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6.5 5.5h9M6.5 10h9M6.5 14.5h9M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01" />
  </svg>
);

/** Sidebar: Sync now, then Last sync / Next sync (red when the last attempt failed), and the Sync log. */
function SyncPanel({ sync, compact, onLog }: { sync: ZohoSync; compact?: boolean; onLog?: () => void }) {
  const { now } = useStore();
  const { info, syncing, syncNow } = sync;
  if (info?.enabled === false) return null;
  const last = info?.syncedAt ? dayTime(info.syncedAt, now) : "—";
  const next = syncing ? "Syncing now…" : info?.due ? "Due now" : info?.nextAt ? dayTime(info.nextAt, now) : "—";
  const lines = (
    <>
      <span className="block truncate"><span className="text-faint">Last sync:</span> <span className="font-medium text-ink-2">{info ? last : "Checking…"}</span></span>
      <span className="block truncate"><span className="text-faint">Next sync:</span> <span className="font-medium text-ink-2">{info ? next : "—"}</span></span>
      {info?.error && <span className="block truncate text-high" title={info.error}>Last try failed: {info.error}</span>}
    </>
  );
  if (compact) {
    return (
      <button onClick={syncNow} disabled={syncing} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11.5px] leading-tight text-muted hover:bg-surface-2 disabled:opacity-70" title="Sync now">
        <span className="min-w-0 flex-1">{lines}</span>
        <SyncIcon spin={syncing} />
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-surface/60 p-2">
      <button
        onClick={syncNow}
        disabled={syncing}
        className={`press flex h-8 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition ${info?.error ? "bg-high-bg text-high" : "bg-brand-soft text-brand hover:brightness-95"} disabled:opacity-70`}
        title="Fetch the latest from Zoho Books now"
      >
        <SyncIcon spin={syncing} />
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      <div className="mt-1.5 space-y-0.5 px-1 text-[12px] leading-snug text-muted">{lines}</div>
      {onLog && (
        <button onClick={onLog} className="mt-1 flex h-7 w-full items-center gap-2 rounded-lg px-1 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink" title="Every sync, hour by hour">
          <LogIcon />
          Sync log
        </button>
      )}
    </div>
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

/** Desktop sidebar can be hidden (X) down to a slim icon rail; remembered per browser. */
function useSidebar() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("th.sidebar") === "hidden");
    } catch {}
  }, []);
  const set = (v: boolean) => {
    setHidden(v);
    try {
      localStorage.setItem("th.sidebar", v ? "hidden" : "shown");
    } catch {}
  };
  return { hidden, hide: () => set(true), show: () => set(false) };
}

/** The whole site starts here when nobody is signed in: name + PIN, then the Dashboard. */
function SignInPage({ onSignIn }: { onSignIn: (m: Member, token: string) => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-[14px] font-bold text-brand-ink">TH</span>
          <span className="text-[18px] font-semibold tracking-tight">ThinkHealth Training Dashboard</span>
        </div>
        <MembersScreen onPick={onSignIn} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const sidebar = useSidebar();
  // Every page needs a signed-in member (the data behind them is protected).
  const session = useSession();
  const { now, followUps, toasts, dismissToast, storage, ready } = useStore();
  // Only mention storage when something is wrong (team database not reachable).
  const storageWarn = ready && storage !== "team";
  const overdue = followUps.filter((f) => effectiveStatus(f, now) === "overdue").length;
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const router = useRouter();
  const zoho = useZohoSync(Boolean(session.ready && session.member));
  const [logOpen, setLogOpen] = useState(false);

  // One sign-in for the whole site, before anything else shows; after it, the Dashboard is the landing page.
  if (!session.ready) return null;
  if (!session.member) {
    return (
      <SignInPage
        onSignIn={(m, token) => {
          session.signIn(m, token);
          router.replace("/");
        }}
      />
    );
  }

  return (
    <>
      <Ticker />
      <div className="flex min-h-[calc(100vh-36px)]">
        {/* Sidebar (desktop): hidden to a slim rail with the X, reopened from the rail's menu button */}
        {sidebar.hidden && (
          <aside className="glass sticky top-9 hidden h-[calc(100vh-36px)] w-14 shrink-0 flex-col items-center gap-1 border-r border-line/70 py-5 lg:flex">
            <button onClick={sidebar.show} aria-label="Show sidebar" title="Show sidebar" className="mb-5 grid size-9 place-items-center rounded-[10px] text-muted hover:bg-ink/[0.04] hover:text-ink">
              <Icon><path d="M4 5.5h12M4 10h12M4 14.5h12" /></Icon>
            </button>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.label}
                title={n.label}
                className={`press relative grid size-9 place-items-center rounded-[10px] ${isOn(n.href) ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink"}`}
              >
                <Icon>{n.icon}</Icon>
                {n.href === "/follow-up" && overdue > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-high" />}
              </Link>
            ))}
            <button onClick={session.signOut} aria-label="Sign out" title={`Sign out (${session.member.name})`} className="mt-auto grid size-9 place-items-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-ink">
              <Icon><path d="M8 4.5H5.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H8M12 13.5 15.5 10 12 6.5M15.5 10H8" /></Icon>
            </button>
            {zoho.info?.enabled !== false && (
              <button
                onClick={zoho.syncNow}
                disabled={zoho.syncing}
                aria-label="Sync now"
                title={`Sync now\nLast sync: ${zoho.info?.syncedAt ? dayTime(zoho.info.syncedAt, now) : "—"}\nNext sync: ${zoho.info?.nextAt ? dayTime(zoho.info.nextAt, now) : "—"}`}
                className={`grid size-9 place-items-center rounded-[10px] hover:bg-surface-2 hover:text-ink ${zoho.info?.error ? "text-high" : "text-muted"}`}
              >
                <SyncIcon spin={zoho.syncing} />
              </button>
            )}
            {zoho.info?.enabled !== false && (
              <button onClick={() => setLogOpen(true)} aria-label="Sync log" title="Sync log" className="grid size-9 place-items-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-ink">
                <LogIcon />
              </button>
            )}
            <button onClick={toggleTheme} aria-label="Appearance" title="Appearance" className="grid size-9 place-items-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-ink">
              <Icon><path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5Z" /></Icon>
            </button>
          </aside>
        )}
        <aside className={`glass sticky top-9 hidden h-[calc(100vh-36px)] w-60 shrink-0 flex-col border-r border-line/70 px-3 py-5 ${sidebar.hidden ? "" : "lg:flex"}`}>
          <div className="mb-6 flex items-center justify-between gap-2">
            <Link href="/" className="flex items-center gap-2.5 px-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-brand text-[12px] font-bold text-brand-ink">TH</span>
              <span className="text-[14px] font-semibold tracking-tight">ThinkHealth</span>
            </Link>
            <button onClick={sidebar.hide} aria-label="Hide sidebar" title="Hide sidebar" className="grid size-7 place-items-center rounded-lg text-faint hover:bg-ink/[0.04] hover:text-ink">
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          </div>
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
            <div className="flex items-center gap-2.5 px-2.5 py-1.5">
              <Avatar name={session.member.name} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-2">{session.member.name}</span>
              <button onClick={session.signOut} className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink">Sign out</button>
            </div>
            {storageWarn && <StorageStatus />}
            <SyncPanel sync={zoho} onLog={() => setLogOpen(true)} />
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
            <div className="ml-auto w-48"><SyncPanel sync={zoho} compact /></div>
            {zoho.info?.enabled !== false && (
              <button onClick={() => setLogOpen(true)} aria-label="Sync log" title="Sync log" className="-ml-2 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                <LogIcon />
              </button>
            )}
          </header>
          <main key={path} className={`rise mx-auto px-4 pb-28 pt-6 sm:px-8 lg:pb-14 lg:pt-10 ${path.startsWith("/follow-up") ? "max-w-none" : "max-w-[1680px]"}`}>{children}</main>
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

      {logOpen && <SyncLogWindow open onClose={() => setLogOpen(false)} />}

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

/** Who is signed in, with Sign out (also how you switch person) — top right of every page. */
export function MemberPill() {
  const { member, signOut } = useSession();
  if (!member) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-1.5 text-[13px] shadow-card">
      <Avatar name={member.name} />
      <span className="font-medium text-ink">{member.name}</span>
      <button className={btn.quiet} onClick={signOut} title="Sign out, or switch to someone else">Sign out</button>
    </span>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <MemberPill />
      </div>
    </div>
  );
}
