"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/*
 * Owner, 26 Nov: "a loader on every screen — a bar that fills, with the seconds counting — so nobody thinks it's stuck".
 * Watches the page's own requests: anything asked for just after a click, a key, a page change or the first load. The
 * background checks (live updates each few seconds, the sync heartbeat, polls) start on their own timers, so they never
 * show it. Appears only if something takes longer than a moment.
 */

const SHOW_AFTER_MS = 350;
const USER_WINDOW_MS = 2500; // a request this soon after a click / key / page change counts as the person's
const QUIET = [/\/api\/changes/, /\/api\/portal\/changes/, /\/api\/zoho\/sync$/, /\/api\/progress\/presence/];

type W = Window & { __thLoad?: { pending: number; since: number; acted: number; subs: Set<() => void> } };

function tracker() {
  const w = window as W;
  if (w.__thLoad) return w.__thLoad;
  const t = { pending: 0, since: 0, acted: performance.now(), subs: new Set<() => void>() };
  w.__thLoad = t;
  const tell = () => t.subs.forEach((f) => f());
  const act = () => { t.acted = performance.now(); };
  window.addEventListener("pointerdown", act, true);
  window.addEventListener("keydown", act, true);
  window.addEventListener("popstate", act);
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.split("?")[0];
    const quiet = QUIET.some((r) => r.test(path)) && !(method === "POST" && /\/api\/zoho\/sync$/.test(path)); // "Sync now" shows it
    if (quiet || performance.now() - t.acted > USER_WINDOW_MS) return real(input, init);
    if (t.pending++ === 0) t.since = performance.now();
    tell();
    return real(input, init).finally(() => { t.pending--; tell(); });
  };
  return t;
}

export function LoadBar() {
  const path = usePathname();
  const [state, setState] = useState<{ on: boolean; secs: number; fill: number; done: boolean }>({ on: false, secs: 0, fill: 0, done: false });
  const shown = useRef(false);

  useEffect(() => { const t = tracker(); t.acted = performance.now(); }, [path]);

  useEffect(() => {
    const t = tracker();
    let hide: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (t.pending > 0) {
        const ms = performance.now() - t.since;
        if (ms < SHOW_AFTER_MS && !shown.current) return;
        shown.current = true;
        clearTimeout(hide);
        // Fills fast at first, then slower, never quite full until it's done.
        setState({ on: true, secs: Math.floor(ms / 1000), fill: 95 * (1 - Math.exp(-ms / 6000)), done: false });
      } else if (shown.current) {
        shown.current = false;
        setState((s) => ({ ...s, fill: 100, done: true }));
        hide = setTimeout(() => setState({ on: false, secs: 0, fill: 0, done: false }), 450);
      }
    };
    t.subs.add(tick);
    const iv = setInterval(tick, 200);
    return () => { t.subs.delete(tick); clearInterval(iv); clearTimeout(hide); };
  }, []);

  if (!state.on) return null;
  const color = "var(--brand, #034f72)";
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", inset: "0 0 auto 0", zIndex: 9999, pointerEvents: "none", opacity: state.done ? 0 : 1, transition: "opacity .4s ease .1s" }}>
      <div style={{ height: 3, width: "100%", transformOrigin: "left", transform: `scaleX(${state.fill / 100})`, background: color, transition: "transform .25s ease-out", boxShadow: `0 0 8px ${color}` }} />
      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--surface, #fff) 92%, transparent)", color: "var(--ink, #0f172a)", font: "500 12.5px/1 system-ui, sans-serif", boxShadow: "0 6px 20px -8px rgba(0,0,0,.35)", backdropFilter: "blur(6px)" }}>
        <span style={{ position: "relative", width: 90, height: 6, borderRadius: 99, background: "color-mix(in srgb, var(--ink, #0f172a) 12%, transparent)", overflow: "hidden" }}>
          <span style={{ position: "absolute", inset: 0, transformOrigin: "left", transform: `scaleX(${state.fill / 100})`, background: color, transition: "transform .25s ease-out" }} />
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{state.done ? "Done" : `Loading… ${state.secs}s`}</span>
      </div>
    </div>
  );
}
