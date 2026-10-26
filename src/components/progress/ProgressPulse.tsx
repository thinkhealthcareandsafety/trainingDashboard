"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Notice } from "@/lib/progress/model";
import { PROGRESS_CHANGED } from "./useProgress";

/*
 * On every page (AppShell): while the tab is visible, tells the server every 30 s that the member is here — that's
 * "last seen" on the Progress tracker (one timestamp, no history; a hidden tab sends nothing) — and gets back the
 * sidebar badge (requests waiting on them [S15]) and their unread notices, shown one at a time at the top right:
 * a new request, a ping [S16], "you can resume" [S17], a reply. Urgent / Critical ones stay until closed.
 */

const BEAT_MS = 30_000;
const SHOW_MS = 12_000;
type Pulse = { incoming: number; severe: boolean; needs: number; notices: Notice[] };

export function useProgressPulse(active: boolean) {
  const [pulse, setPulse] = useState<Pulse>({ incoming: 0, severe: false, needs: 0, notices: [] });
  const inFlight = useRef(false);
  const beat = useCallback(async () => {
    if (inFlight.current || document.visibilityState !== "visible") return;
    inFlight.current = true;
    try {
      const r = await fetch("/api/progress/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ beat: true }), cache: "no-store" });
      if (r.ok) setPulse(await r.json());
    } catch {} finally {
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    beat();
    const t = setInterval(beat, BEAT_MS);
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PROGRESS_CHANGED, beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(PROGRESS_CHANGED, beat); };
  }, [active, beat]);
  const markRead = useCallback((ids: string[]) => {
    setPulse((p) => ({ ...p, notices: p.notices.filter((n) => !ids.includes(n.id)) }));
    fetch("/api/progress/presence", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
  }, []);
  return { ...pulse, markRead };
}

const KIND: Record<Notice["kind"], string> = { request: "Waiting on you", ping: "Gentle reminder", resolved: "You can resume", reopened: "Reopened", comment: "New reply", mention: "Mentioned you" };

export function ProgressToasts({ notices, markRead }: { notices: Notice[]; markRead: (ids: string[]) => void }) {
  const router = useRouter();
  const path = usePathname();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const check = () => setBlocked(Boolean(document.querySelector('[role="dialog"],[role="alertdialog"]')));
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, []);
  const n = blocked ? undefined : notices[0];
  useEffect(() => {
    if (!n || n.urgent) return;
    const t = setTimeout(() => markRead([n.id]), SHOW_MS);
    return () => clearTimeout(t);
  }, [n, markRead]);
  if (!n) return null;
  const go = () => {
    markRead([n.id]);
    if (path.startsWith("/reports/progress-tracker")) window.dispatchEvent(new CustomEvent("th:progress-open", { detail: n.requestId }));
    else router.push(n.requestId ? `/reports/progress-tracker?request=${encodeURIComponent(n.requestId)}` : "/reports/progress-tracker");
  };
  const tone = n.kind === "resolved" ? "var(--low)" : n.urgent ? "var(--high)" : "var(--brand)";
  return (
    <div role="status" aria-live="polite" className="modal-in fixed right-4 top-12 z-[66] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop lg:right-6">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: tone }} aria-hidden />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={go} title="Open it on the Progress tracker">
          <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">{KIND[n.kind]}{n.urgent ? " · Urgent" : ""}{notices.length > 1 ? ` · 1 of ${notices.length}` : ""}</span>
          <span className="mt-0.5 line-clamp-3 block text-[14px] font-medium leading-snug text-ink">{n.text}</span>
        </button>
        <button type="button" onClick={() => markRead([n.id])} aria-label="Close" title="Close" className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
          <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
      </div>
      {!n.urgent && <div className="h-[3px] bg-surface-2"><div key={n.id} className="progress-toast-bar h-full" style={{ background: tone }} /></div>}
    </div>
  );
}
