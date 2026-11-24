"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ZOHO_SYNCED, useStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { loadAccountTheme, pickTheme } from "@/lib/accountTheme";
import { MembersScreen } from "./followups/MembersScreen";
import { Avatar, btn } from "./ui";
import type { Member } from "@/lib/types";
import { Ticker } from "./Ticker";
import { SyncLogWindow } from "./SyncLog";
import { RevertConfirm } from "./RevertConfirm";
import { DayReminders } from "./DayReminders";
import { AnalyticsConnect } from "./AnalyticsConnect";
import { ProgressToasts, useProgressPulse } from "./progress/ProgressPulse";
import { isAdmin } from "@/lib/roles";
import { type DashboardPage, dashboardPages, pageAt, pageSections } from "@/lib/apps";
import { APP_ICONS } from "./appIcons";

// The pages, their sections (owner, 23 Nov: Overview / Sales / Inventory / Utilities) and who sees each: lib/apps.ts,
// shared with the apps page. Each item shows only with its page in the owner's sheet (roles.ts ACCESS, 18 Nov).
// The Progress tracker is hidden entirely (owner, 18 Nov); nothing of it is deleted.

/**
 * Change theme (owner, 21–22 Oct): a gradient behind the cards — globals.css [data-bg]; saved to the account (24 Nov, lib/accountTheme.ts). A theme is
 * light or dark (picking one sets the mode; there's no separate Appearance switch any more). "" = plain. The full themes
 * (`full`) colour the cards, lines and text too (`card` / `accent` only draw their swatch) — no longer "experimental"
 * (owner, 30 Oct: "light with light, dark with dark … i like them no need to keep them experimental").
 */
type Mode = "light" | "dark";
type Theme = { mode: Mode; id: string; label: string; full?: boolean; card?: string; accent?: string };
const THEMES: Theme[] = [
  { mode: "light", id: "", label: "Plain" },
  { mode: "light", id: "blush", label: "Blush" },
  { mode: "light", id: "peach", label: "Peach" },
  { mode: "light", id: "lemon", label: "Lemon" },
  { mode: "light", id: "mint", label: "Mint" },
  { mode: "light", id: "aqua", label: "Aqua" },
  { mode: "light", id: "sky", label: "Sky" },
  { mode: "light", id: "lavender", label: "Lavender" },
  { mode: "light", id: "smoky", label: "Smoky pastel" },
  { mode: "dark", id: "", label: "Black" },
  { mode: "dark", id: "dark-midnight", label: "Midnight" },
  { mode: "dark", id: "dark-ocean", label: "Ocean" },
  { mode: "dark", id: "dark-aurora", label: "Aurora" },
  { mode: "dark", id: "dark-forest", label: "Forest" },
  { mode: "dark", id: "dark-plum", label: "Plum" },
  { mode: "dark", id: "dark-ember", label: "Ember" },
  { mode: "dark", id: "dark-xplum", label: "Plum night", full: true, card: "#22152a", accent: "#e29ad6" },
  { mode: "light", id: "xcoastal", label: "Smoky coastal", full: true, card: "#f2f7f7", accent: "#1f6f8b" },
  // 27 Oct (owner: "add more experimental themes, i like them") — full themes since 30 Oct.
  { mode: "dark", id: "dark-xocean", label: "Deep sea", full: true, card: "#0f1f2e", accent: "#5cc8e6" },
  { mode: "dark", id: "dark-xespresso", label: "Espresso", full: true, card: "#211812", accent: "#e6a65c" },
  { mode: "dark", id: "dark-xemerald", label: "Emerald night", full: true, card: "#102019", accent: "#5fd4a0" },
  { mode: "light", id: "xsakura", label: "Sakura", full: true, card: "#fff8fa", accent: "#b83d68" },
  { mode: "light", id: "xsand", label: "Sand dune", full: true, card: "#fcf8f1", accent: "#a8552f" },
  { mode: "light", id: "xnordic", label: "Nordic", full: true, card: "#f7f8fb", accent: "#3f56a6" },
  // 24 Nov (owner: more themes).
  { mode: "light", id: "xmatcha", label: "Matcha", full: true, card: "#f8faf3", accent: "#4c7030" },
  { mode: "light", id: "xlilac", label: "Lilac", full: true, card: "#faf8fe", accent: "#7448b0" },
  { mode: "light", id: "xhoney", label: "Honey", full: true, card: "#fefaf0", accent: "#8a5c00" },
  { mode: "dark", id: "dark-xindigo", label: "Indigo night", full: true, card: "#171a30", accent: "#9aa8ff" },
  { mode: "dark", id: "dark-xgraphite", label: "Graphite", full: true, card: "#1e2226", accent: "#a9c3d6" },
  { mode: "dark", id: "dark-xwine", label: "Wine", full: true, card: "#25141a", accent: "#f09ab0" },
];
// Light with light, dark with dark: the gradients first, then the full themes.
const GROUPS = (["light", "dark"] as const).map((mode) => ({
  key: mode, label: mode === "light" ? "Light" : "Dark",
  themes: [...THEMES.filter((t) => t.mode === mode && !t.full), ...THEMES.filter((t) => t.mode === mode && t.full)],
}));
const PALETTE = <path d="M10 3.5a6.5 6.5 0 1 0 0 13c.9 0 1.4-.6 1.4-1.3 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.6-1.3 1.4-1.3h1.6a3 3 0 0 0 2.9-3C16.5 6 13.6 3.5 10 3.5ZM6.5 10h.01M8 6.8h.01M12 6.8h.01" />;

const currentMode = (): Mode => {
  const root = document.documentElement;
  return (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
};

function ThemePicker({ me, onClose }: { me: string; onClose: () => void }) {
  const [browserOnly, setBrowserOnly] = useState(false);
  const [current, setCurrent] = useState(() => ({ mode: currentMode(), id: document.documentElement.dataset.bg ?? "" }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fade-in fixed inset-0 z-[80] grid place-items-center bg-black/25 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Change theme" className="modal-in max-h-full w-full max-w-[560px] overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-bold tracking-tight text-ink">Change theme</h3>
            <p className="mt-0.5 text-[13px] text-muted">{browserOnly ? "Couldn't reach your account: saved on this browser only for now." : "Saved to your account, so it follows you to any computer."}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        {GROUPS.map((g) => (
          <div key={g.key} className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wide text-muted">{g.label}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {g.themes.map((t) => {
                const on = current.mode === t.mode && current.id === t.id;
                return (
                  <button
                    key={t.id || t.mode}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { void pickTheme({ mode: t.mode, id: t.id }, me).then((ok) => setBrowserOnly(!ok)); setCurrent({ mode: t.mode, id: t.id }); }}
                    className={`press flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-center text-[12.5px] font-medium ${on ? "text-ink ring-2 ring-brand" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
                  >
                    <span data-bg={t.id || undefined} className="relative h-12 w-full overflow-hidden rounded-lg border border-line" style={{ backgroundColor: t.mode === "light" ? "#f5f5f7" : "#000000", backgroundImage: t.id ? "var(--bg-art)" : "none" }}>
                      {/* A full theme: a little card in the theme's own colours. */}
                      {t.card && (
                        <span className="absolute inset-x-2.5 bottom-0 top-3 rounded-t-md p-1.5" style={{ background: t.card }}>
                          <span className="block h-1.5 w-2/3 rounded-full" style={{ background: t.accent }} />
                        </span>
                      )}
                    </span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/* ---------------- Zoho sync: heartbeat, Sync now, last / next sync ---------------- */

type SyncInfo = { enabled?: boolean; syncedAt?: string; error?: string; due?: boolean; running?: boolean; nextAt?: number; ran?: boolean; full?: boolean };

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
    const t = setInterval(beat, 60_000); // live sync (owner, 12 Nov): the server runs one each minute, paced to the daily limit
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
      toast({
        text: j.error ? `Zoho sync failed: ${j.error}`
          : !j.ran ? "Synced less than a minute ago — try again in a moment"
          : j.full ? "Synced with Zoho Books — full check, deletions included"
          : "Synced with Zoho Books — quick check (a full one ran in the last 10 minutes)",
      });
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
    <div className="sign-in grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-11 place-items-center rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink shadow-card">TH</span>
          <span className="text-[21px] font-semibold tracking-[-0.02em]">Think Health Dashboard</span>
        </div>
        <MembersScreen onPick={onSignIn} />
      </div>
    </div>
  );
}

/** A page's icon on a soft tint of its own colour (owner, 24 Nov: soft and airy). */
function Chip({ page, size = "size-7" }: { page: DashboardPage; size?: string }) {
  return (
    <span className={`tint-chip grid ${size} shrink-0 place-items-center rounded-[10px]`} style={{ "--c": page.color } as React.CSSProperties}>
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{APP_ICONS[page.icon]}</svg>
    </span>
  );
}

/*
 * The top-right tools on every page (owner, 23 Nov: "move Sync now to the top right with Sign out, and Change theme too —
 * a single palette button — and remove everything else from the sidebar's bottom"). AppShell holds the sync and the
 * windows; PageHeader draws them beside the name and Sign out.
 */
type ShellTools = { zoho: ZohoSync; openLog: () => void; openTheme: () => void; openAnalytics?: () => void };
const ShellCtx = createContext<ShellTools | null>(null);

export function HeaderTools() {
  const t = useContext(ShellCtx);
  const { now } = useStore();
  if (!t) return null;
  const { info, syncing, syncNow } = t.zoho;
  const iconBtn = "grid size-9 place-items-center rounded-full bg-surface text-ink-2 shadow-card hover:text-ink";
  const last = info?.syncedAt ? dayTime(info.syncedAt, now) : "—";
  const next = syncing ? "Syncing now…" : info?.due ? "Due now" : info?.nextAt ? dayTime(info.nextAt, now) : "—";
  return (
    <>
      {info?.enabled !== false && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface p-1 shadow-card">
          <button
            onClick={syncNow}
            disabled={syncing}
            title={`Fetch the latest from Zoho Books now\nLast sync: ${info ? last : "Checking…"}\nNext sync: ${info ? next : "—"}${info?.error ? `\nLast try failed: ${info.error}` : ""}`}
            className={`press inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-70 ${info?.error ? "bg-high-bg text-high" : "bg-brand-soft text-brand hover:brightness-95"}`}
          >
            <SyncIcon spin={syncing} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <button onClick={t.openLog} aria-label="Sync log" title={`Sync log · last sync ${last}`} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <LogIcon />
          </button>
        </span>
      )}
      <button onClick={t.openTheme} aria-label="Change theme" title="Change theme" className={iconBtn}>
        <Icon>{PALETTE}</Icon>
      </button>
      {/* Admin: the owner's Zoho Analytics workspace (read-only) — ANALYTICS-PLAN.md §2b.2. */}
      {t.openAnalytics && (
        <button onClick={t.openAnalytics} aria-label="Zoho Analytics" title="Zoho Analytics" className={iconBtn}>
          <Icon><path d="M4 16V9M8.5 16V5M13 16v-4.5M16.5 16V7.5" /></Icon>
        </button>
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const sidebar = useSidebar();
  // Every page needs a signed-in member (the data behind them is protected).
  const session = useSession();
  const { now, toasts, dismissToast, storage, ready } = useStore();
  // Only mention storage when something is wrong (team database not reachable).
  const storageWarn = ready && storage !== "team";
  const router = useRouter();
  const zoho = useZohoSync(Boolean(session.ready && session.member));
  // The Progress tracker is hidden (owner, 18 Nov): no presence beat, so no red count and no notices.
  const progress = useProgressPulse(false);
  const [logOpen, setLogOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  // The account's theme, once signed in (also on the apps home page).
  const themeFor = session.verified ? session.member?.id : undefined;
  useEffect(() => { if (themeFor) void loadAccountTheme(themeFor); }, [themeFor]);
  const closeTheme = useCallback(() => setThemeOpen(false), []);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const closeAnalytics = useCallback(() => setAnalyticsOpen(false), []);

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
  const me = session.member!;
  // The owner's sheet (18 Nov): a page each; Follow-ups needs a board too; Reports also shows for the Invoice Converter alone (/reports forwards there).
  const nav = dashboardPages(me);
  const sections = pageSections(me);
  const current = pageAt(path, nav);
  const isOnPage = (p: DashboardPage) => p.href === current;
  // Phones: the bottom tabs keep to the main pages (the two Reports tools are in the sidebar and the apps page).
  const tabs = nav.filter((p) => p.id !== "sheet" && p.id !== "converter");
  // The apps home page (owner, 23 Nov) is its own full page: no sidebar, no ticker.
  if (path === "/" || path === "/dashboard") return <>{children}</>;
  const tools: ShellTools = { zoho, openLog: () => setLogOpen(true), openTheme: () => setThemeOpen(true), ...(isAdmin(me) ? { openAnalytics: () => setAnalyticsOpen(true) } : {}) };
  return (
    <ShellCtx.Provider value={tools}>
      <Ticker />
      <div className="flex min-h-[calc(100vh-36px)]">
        {/* Sidebar (desktop): hidden to a slim rail with the X, reopened from the rail's menu button */}
        {sidebar.hidden && (
          <aside className="glass sticky top-12 my-3 ml-3 hidden h-[calc(100vh-60px)] w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-[24px] py-4 shadow-card no-scrollbar lg:flex">
            <button onClick={sidebar.show} aria-label="Show sidebar" title="Show sidebar" className="mb-5 grid size-9 place-items-center rounded-[10px] text-muted hover:bg-ink/[0.04] hover:text-ink">
              <Icon><path d="M4 5.5h12M4 10h12M4 14.5h12" /></Icon>
            </button>
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.name}
                title={n.name}
                className={`press relative grid size-10 place-items-center rounded-[14px] ${isOnPage(n) ? "bg-brand-soft" : "hover:bg-ink/[0.05]"}`}
              >
                <Chip page={n} />
                {n.id === "reports" && progress.needs > 0 && <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-high ring-2 ring-surface" aria-hidden />}
              </Link>
            ))}
          </aside>
        )}
        <aside className={`glass sticky top-12 my-3 ml-3 hidden h-[calc(100vh-60px)] w-60 shrink-0 flex-col overflow-y-auto rounded-[24px] px-3 py-5 shadow-card no-scrollbar ${sidebar.hidden ? "" : "lg:flex"}`}>
          <div className="mb-6 flex items-center justify-between gap-2">
            <Link href="/" className="flex items-center gap-2.5 px-2.5" title="All apps">
              <span className="grid size-7 place-items-center rounded-[9px] bg-brand text-[12px] font-bold text-brand-ink">TH</span>
              <span className="text-[14px] font-semibold tracking-tight">ThinkHealth</span>
            </Link>
            <button onClick={sidebar.hide} aria-label="Hide sidebar" title="Hide sidebar" className="grid size-7 place-items-center rounded-lg text-faint hover:bg-ink/[0.04] hover:text-ink">
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          </div>
          <nav className="space-y-0.5">
            {/* Back to the apps home page (owner, 23 Nov). */}
            <Link href="/" className="press mb-1 flex h-10 items-center gap-3 rounded-[14px] px-2 text-[13.5px] font-medium text-ink-2 hover:bg-ink/[0.05] hover:text-ink">
              <span className="grid size-7 place-items-center rounded-lg bg-ink/[0.06]"><Icon><path d="M4 4h4v4H4zM12 4h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4z" /></Icon></span>
              <span className="flex-1">All apps</span>
            </Link>
            {sections.map((s) => (
              <div key={s.section} className="pt-3">
                <p className="px-2.5 pb-1.5 text-[12.5px] font-medium text-muted">{s.section}</p>
                {s.pages.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={isOnPage(n) ? "page" : undefined}
                    className={`press flex h-10 items-center gap-3 rounded-[14px] px-2 text-[13.5px] ${
                      isOnPage(n) ? "bg-brand-soft font-semibold text-ink" : "font-medium text-ink-2 hover:bg-ink/[0.05] hover:text-ink"
                    }`}
                  >
                    <Chip page={n} />
                    <span className="flex-1">{n.name}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {/* Kept clean (owner, 23 Nov): Sync, the theme and Sign out are top right; only a storage problem shows here. */}
          {storageWarn && <div className="mt-auto border-t border-line pt-3"><StorageStatus /></div>}
        </aside>

        <div className="min-w-0 flex-1">
          {/* Top bar (mobile / tablet) */}
          <header className="glass sticky top-9 z-30 flex h-14 items-center gap-3 border-b border-line/70 px-4 lg:hidden">
            <Link href="/" className="flex items-center gap-3" aria-label="All apps" title="All apps">
              <span className="grid size-7 place-items-center rounded-[9px] bg-brand text-[12px] font-bold text-brand-ink">TH</span>
              <span className="text-[14px] font-semibold">ThinkHealth</span>
            </Link>
          </header>
          {/* Every page uses the whole window (owner, 28 Oct: "if i zoom out, the website should get wide with it") —
              was capped at 1680 px except the boards, so zooming out only added empty margins. */}
          <main key={path} className="rise px-4 pb-28 pt-6 sm:px-8 lg:pb-14 lg:pt-10">{children}</main>
        </div>
      </div>

      {/* Bottom tabs (mobile / tablet) */}
      <nav className={`glass fixed inset-x-0 bottom-0 z-30 grid ${tabs.length === 5 ? "grid-cols-5" : tabs.length === 4 || tabs.length >= 7 ? "grid-cols-4" : "grid-cols-3"} border-t border-line/70 pb-[env(safe-area-inset-bottom)] lg:hidden`}>
        {tabs.map((n) => (
          <Link key={n.href} href={n.href} className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isOnPage(n) ? "text-ink" : "text-muted"}`}>
            <Icon>{APP_ICONS[n.icon]}</Icon>
            {n.name}
            {n.id === "reports" && progress.needs > 0 && <span className="absolute right-[calc(50%-16px)] top-1.5 size-2.5 rounded-full bg-high ring-2 ring-surface" aria-hidden />}
          </Link>
        ))}
      </nav>

      {logOpen && <SyncLogWindow open onClose={() => setLogOpen(false)} />}
      {themeOpen && <ThemePicker me={me.id} onClose={closeTheme} />}
      {analyticsOpen && <AnalyticsConnect onClose={closeAnalytics} />}
      <RevertConfirm />
      <DayReminders />
      <ProgressToasts notices={progress.notices} markRead={progress.markRead} />

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
    </ShellCtx.Provider>
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

export function PageHeader({ title, sub, actions, titleAside }: { title: string; sub?: string; actions?: React.ReactNode; titleAside?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-[30px] font-semibold leading-tight tracking-[-0.03em]">{title}{titleAside}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <HeaderTools />
        <MemberPill />
      </div>
    </div>
  );
}
