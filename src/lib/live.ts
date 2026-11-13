"use client";

import { useEffect, useRef } from "react";

/** The same event as store.ZOHO_SYNCED (kept here as a string so store.tsx can import this file without a cycle). */
const ZOHO_SYNCED = "th:zoho-synced";

/*
 * Live refresh (owner, 13 Nov: "whatever I do it should show up immediately without me having to refresh"). One watcher per
 * tab asks /api/changes every few seconds while the tab is visible (and at once when it comes back), and tells the page
 * what changed:
 *  - TEAM_CHANGED: the team's shared data (the store pulls it);
 *  - ZOHO_SYNCED:  our Zoho copies (a sync brought something, or the dashboard just changed a document) — the boards,
 *                  Quotations and the story reload their Zoho data on it;
 *  - WORK_CHANGED: quotations, Trainings, the coordinators' portal — those pages reload.
 * Pages subscribe with useLive(); nothing reloads the whole page, and an open form isn't touched.
 */
export const TEAM_CHANGED = "th:team-changed";
export const WORK_CHANGED = "th:work-changed";
const EVERY_MS = 5000;

type Versions = { team: number; work: number; zoho: string };

/** Starts the tab's watcher; returns its stop. */
export function watchChanges(): () => void {
  let last: Versions | null = null;
  let stopped = false;
  let busy = false;
  const check = async () => {
    if (busy || stopped || document.visibilityState !== "visible") return;
    busy = true;
    try {
      const r = await fetch("/api/changes", { cache: "no-store" });
      if (!r.ok) return;
      const v = (await r.json()) as Versions;
      if (last) {
        if (v.team !== last.team) window.dispatchEvent(new Event(TEAM_CHANGED));
        if (v.zoho !== last.zoho) window.dispatchEvent(new Event(ZOHO_SYNCED));
        if (v.work !== last.work) window.dispatchEvent(new Event(WORK_CHANGED));
      }
      last = v;
    } catch {
      // offline for a moment: the next check catches up
    } finally {
      busy = false;
    }
  };
  check();
  const t = setInterval(check, EVERY_MS);
  const onShow = () => { if (document.visibilityState === "visible") check(); };
  document.addEventListener("visibilitychange", onShow);
  window.addEventListener("focus", onShow);
  return () => {
    stopped = true;
    clearInterval(t);
    document.removeEventListener("visibilitychange", onShow);
    window.removeEventListener("focus", onShow);
  };
}

/**
 * Reload when one of these changes ("work": quotations / Trainings / portal; "zoho": our Zoho copies; "team": shared
 * data). `load` is read fresh each time, so it can see the latest state (e.g. skip while a form has unsaved edits).
 */
export function useLive(load: () => void, topics: ("work" | "zoho" | "team")[], enabled = true) {
  const ref = useRef(load);
  useEffect(() => { ref.current = load; });
  const key = topics.join(",");
  useEffect(() => {
    if (!enabled) return;
    const names = key.split(",").map((t) => (t === "work" ? WORK_CHANGED : t === "zoho" ? ZOHO_SYNCED : TEAM_CHANGED));
    const run = () => ref.current();
    for (const n of names) window.addEventListener(n, run);
    return () => { for (const n of names) window.removeEventListener(n, run); };
  }, [key, enabled]);
}
