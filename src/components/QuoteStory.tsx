"use client";

import { useEffect, useRef, useState } from "react";
import { type HistoryLine, type StepKind, type StoryStep, quoteStory } from "@/lib/quoteStory";

/*
 * The story of a quotation as a snake (owner, 11 Nov, with a drawing): boxes left to right, a curve down at the end of
 * the row, then right to left, and so on — oldest first. On a phone, one column.
 */
const TONE: Record<StepKind, string> = {
  created: "border-line bg-surface",
  updated: "border-line bg-surface",
  emailed: "border-brand/50 bg-brand-soft",
  salesorder: "border-low/50 bg-low-bg",
  invoiced: "border-low/50 bg-low-bg",
  accepted: "border-low/50 bg-low-bg",
  declined: "border-high/50 bg-high-bg",
  expired: "border-medium/50 bg-medium-bg",
  other: "border-line bg-surface",
};
const BOX_H = 112; // every box the same height, so the curves meet the rows' middles
const ROW_GAP = 36;
const SIDE = 26; // room for the curve at each end
const GAP = 20; // between boxes in a row (the joining line)

function Box({ s, n }: { s: StoryStep; n: number }) {
  return (
    <div className={`flex min-w-0 flex-1 basis-0 flex-col justify-between rounded-2xl border px-3.5 py-3 ${TONE[s.kind]}`} style={{ height: BOX_H }}>
      <div className="min-w-0">
        <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{n}. {s.title}{s.count > 1 ? ` ×${s.count}` : ""}</p>
        {s.detail && <p className="mt-1 line-clamp-2 break-words text-[13.5px] font-medium leading-snug text-ink" title={s.detail}>{s.detail}</p>}
      </div>
      <p className="truncate text-[12px] text-faint" title={`${s.when}${s.by ? ` · ${s.by}` : ""}`}>{s.when}{s.by ? ` · ${s.by}` : ""}</p>
    </div>
  );
}

export function QuoteStory({ history }: { history: HistoryLine[] }) {
  const steps = quoteStory(history);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const per = width >= 1000 ? 5 : width >= 780 ? 4 : width >= 560 ? 3 : 1;
  const rows: StoryStep[][] = [];
  for (let i = 0; i < steps.length; i += per) rows.push(steps.slice(i, i + per));
  const line = "shrink-0 bg-line-strong";
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">The story of this quotation</p>
        {history.length > 0 && <button className="text-[13px] font-medium text-brand hover:underline" onClick={() => setAll((x) => !x)}>{all ? "Hide Zoho's lines" : `Show all of Zoho's lines (${history.length})`}</button>}
      </div>
      <div ref={ref} className="mt-3">
        {!steps.length ? <p className="text-[14px] text-muted">Zoho has no history for it yet.</p>
          : per === 1 ? (
            <div className="flex flex-col items-stretch">
              {steps.map((s, i) => (
                <div key={i} className="flex flex-col items-stretch">
                  {i > 0 && <div className={`${line} mx-auto h-4 w-0.5`} />}
                  <Box s={s} n={i + 1} />
                </div>
              ))}
            </div>
          ) : (
            <div className="relative" style={{ paddingLeft: SIDE, paddingRight: SIDE }}>
              {rows.map((row, r) => (
                // Equal columns in every row, so the boxes line up; a right-to-left row fills from the right.
                <div key={r} className="grid" style={{ gridTemplateColumns: `repeat(${per}, minmax(0, 1fr))`, columnGap: GAP, marginTop: r ? ROW_GAP : 0, direction: r % 2 ? "rtl" : "ltr" }}>
                  {row.map((s, i) => (
                    <div key={i} className="relative flex" style={{ direction: "ltr" }}>
                      {i > 0 && <div className={`${line} absolute top-1/2 h-0.5`} style={{ width: GAP, [r % 2 ? "right" : "left"]: -GAP }} />}
                      <Box s={s} n={r * per + i + 1} />
                    </div>
                  ))}
                </div>
              ))}
              {/* The curves joining a row's end to the next row's start: right side after a left-to-right row, left after a right-to-left one. */}
              {rows.slice(0, -1).map((_, r) => (
                <div key={r} className={`absolute border-2 border-line-strong ${r % 2 ? "left-0 rounded-l-[30px] border-r-0" : "right-0 rounded-r-[30px] border-l-0"}`}
                  style={{ top: r * (BOX_H + ROW_GAP) + BOX_H / 2 - 1, height: BOX_H + ROW_GAP, width: SIDE }} />
              ))}
            </div>
          )}
        {all && (
          <ul className="mt-4 space-y-1.5 rounded-2xl border border-line p-3">
            {history.map((h, i) => <li key={i} className="text-[13px] text-ink-2"><span className="text-faint">{h.when}{h.by ? ` · ${h.by}` : ""}</span> — {h.text}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
