"use client";

import { useLayoutEffect, useRef, useState } from "react";

/*
 * The leaderboard, grand and live (owner, 21 Nov: "a little more grand … very live, refresh on any and every entry"): the
 * top three on a podium (1st in the middle, tallest; gold, silver, bronze), everyone else ranked below. When the list
 * changes, rows glide to their new place and new finishers slide in (FLIP with transforms; none with reduced motion).
 * One component for the coordinator's board, the participant's page and the quiz's result screen.
 */
export type BoardRow = { rank: number; th: string; name: string; pct: number; seconds: number; passed?: boolean; badge?: boolean };
type Waiting = { th: string; name: string; started: boolean };

const clock = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const MEDAL = [
  { tone: "var(--gold)", bg: "var(--gold-bg)", h: "h-28 sm:h-32", label: "1st" },
  { tone: "var(--silver)", bg: "var(--silver-bg)", h: "h-20 sm:h-24", label: "2nd" },
  { tone: "var(--bronze)", bg: "var(--bronze-bg)", h: "h-16 sm:h-20", label: "3rd" },
];

/** Rows that move glide to their new place; new ones slide in. Keyed by `data-key`. */
function useFlip(deps: unknown) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const now = new Map<string, number>();
    const quiet = reduced();
    root.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      const key = el.dataset.key!;
      const top = el.getBoundingClientRect().top;
      now.set(key, top);
      if (quiet || !last.current.size) return;
      const was = last.current.get(key);
      if (was === undefined) el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
      else if (Math.abs(was - top) > 1) el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    last.current = now;
  }, [deps]);
  return box;
}

export function Leaderboard({ list, me, live = false, waiting = [], quizOpen = false, limit = 10, title = "Leaderboard", action }: { list: BoardRow[]; me?: string; live?: boolean; waiting?: Waiting[]; quizOpen?: boolean; limit?: number; title?: string; action?: React.ReactNode }) {
  const [all, setAll] = useState(false);
  const podium = list.slice(0, 3);
  const rest = list.slice(3);
  const shownRest = all ? rest : rest.slice(0, Math.max(0, limit - 3));
  const more = rest.length - shownRest.length + (all ? 0 : waiting.length);
  const box = useFlip(list.map((b) => `${b.th}:${b.rank}`).join("|") + (all ? "+" : ""));
  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h4 className="text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-ink">{title}</h4>
          {live && <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.08em] text-danger"><span className="live-dot size-2 rounded-full bg-danger" aria-hidden />Live</span>}
        </div>
        {action}
      </div>
      {list.length === 0 ? (
        <p className="mt-3 rounded-xl bg-ground px-4 py-5 text-center text-[15px] text-muted">{quizOpen ? "No one has finished yet. The first finishers appear here the moment they send their answers." : "No results yet."}</p>
      ) : (
        <div ref={box} aria-live="polite">
          {/* The podium: 2nd · 1st · 3rd */}
          <ol className="mt-4 grid grid-cols-3 items-end gap-2 sm:gap-4">
            {[1, 0, 2].map((i) => {
              const b = podium[i];
              const m = MEDAL[i];
              if (!b) return <li key={i} aria-hidden />;
              const mine = b.th === me;
              return (
                <li key={b.th} data-key={b.th} className="flex min-w-0 flex-col items-center text-center">
                  <span className="grid size-11 place-items-center rounded-full text-[15px] font-extrabold text-white shadow-[0_4px_12px_rgb(2_40_60/0.18)] sm:size-12" style={{ background: m.tone }}>{b.rank}</span>
                  <p className={`mt-2 w-full truncate text-[15px] font-extrabold sm:text-[16px] ${mine ? "text-action" : "text-ink"}`}>{b.name}{mine ? " (you)" : ""}</p>
                  <p className="num text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">{b.pct}%</p>
                  <p className="num text-[12.5px] text-muted">{clock(b.seconds)}{b.badge ? " · Badge" : ""}</p>
                  <div className={`mt-2 w-full rounded-t-xl ${m.h} ${mine ? "ring-2 ring-inset ring-action" : ""}`} style={{ background: m.bg }}>
                    <p className="pt-2 text-[13px] font-extrabold uppercase tracking-[0.1em]" style={{ color: m.tone }}>{m.label}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {(shownRest.length > 0 || (all && waiting.length > 0)) && (
            <ol className="mt-3 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
              {shownRest.map((b) => {
                const mine = b.th === me;
                return (
                  <li key={b.th} data-key={b.th} className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 ${mine ? "bg-action/[0.07]" : "bg-surface"}`}>
                    <span className="num text-center text-[15px] font-extrabold text-muted">{b.rank}</span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2"><span className="truncate text-[15px] font-semibold text-ink">{b.name}</span>{mine && <span className="shrink-0 rounded-full bg-action px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">You</span>}</span>
                      <span className="block text-[12.5px] text-muted">{b.badge ? "First Aid Badge" : b.passed === undefined ? "" : b.passed ? "Passed" : "Not passed"}</span>
                    </span>
                    <span className="text-right">
                      <span className="num block text-[16px] font-extrabold leading-tight text-ink">{b.pct}%</span>
                      <span className="num block text-[12.5px] text-muted">{clock(b.seconds)}</span>
                    </span>
                  </li>
                );
              })}
              {all && waiting.map((w) => (
                <li key={w.th} data-key={w.th} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 bg-surface px-3.5 py-2.5">
                  <span className="text-center text-[15px] font-extrabold text-line-strong" aria-hidden>–</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink-2">{w.name}</span>
                    <span className="block text-[12.5px] text-muted">{!w.started ? "Hasn't started the quiz" : quizOpen ? "Taking the quiz now" : "Didn't finish"}</span>
                  </span>
                  <span />
                </li>
              ))}
            </ol>
          )}
          {more > 0 && !all && <button type="button" onClick={() => setAll(true)} className="mt-3 text-[14px] font-semibold text-action hover:underline">Show everyone ({list.length + waiting.length})</button>}
        </div>
      )}
    </section>
  );
}
