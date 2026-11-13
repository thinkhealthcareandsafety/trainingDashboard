"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildBoard, buildFulfillmentBoard, fulfilCardId, kindOfId, quoteCardId } from "@/lib/pipeline";
import { logiCardId } from "@/lib/logistics";
import { type HistoryLine, type Phase, type SentEmail, storyPhases } from "@/lib/quoteStory";
import { useStore } from "@/lib/store";
import { usePipeline, useSalesData } from "./followups/useBoards";

/*
 * The story of a quotation as a snake (owner, 11 Nov, with a drawing): one box per phase, left to right, a curve down at
 * the end of the row, then right to left — start to finish. Phases not reached yet are greyed. On a phone, one column.
 */
const TONE: Record<NonNullable<Phase["tone"]>, string> = {
  good: "border-low/50 bg-low-bg",
  bad: "border-high/50 bg-high-bg",
  warn: "border-medium/50 bg-medium-bg",
  info: "border-brand/45 bg-brand-soft",
};
const CHIP: Record<NonNullable<Phase["tone"]>, string> = { good: "text-low", bad: "text-high", warn: "text-medium", info: "text-brand" };
const BOX_H = 150; // every box the same height, so the curves meet the rows' middles
const ROW_GAP = 36;
const SIDE = 26; // room for the curve at each end
const GAP = 20; // between boxes in a row (the joining line)

function Box({ p, n, action }: { p: Phase; n: number; action?: React.ReactNode }) {
  const ahead = p.state === "ahead";
  // A phase that's next and can be done from here (Trainings: Convert to PI) isn't greyed: its action shows instead of "Not yet".
  const act = ahead && action;
  return (
    <div className={`flex min-w-0 flex-1 flex-col rounded-2xl border px-3.5 py-3 ${act ? "border-dashed border-brand/60 bg-transparent" : ahead ? "border-dashed border-line bg-transparent opacity-55" : TONE[p.tone ?? "info"]}`} style={{ height: BOX_H }}>
      <p className="truncate text-[11.5px] font-bold uppercase tracking-wide text-muted" title={p.title}>{n}. {p.title}</p>
      {p.status && <p className={`mt-0.5 truncate text-[13px] font-semibold ${CHIP[p.tone ?? "info"]}`}>{p.status}</p>}
      <div className="mt-1.5 min-h-0 space-y-0.5 overflow-hidden">
        {act ? action
          : ahead && !p.lines.length ? <p className="text-[13px] text-faint">Not yet</p>
          : p.lines.map((l, i) => <p key={i} className={`truncate text-[13px] leading-snug ${i === 0 ? "font-semibold text-ink" : "text-ink-2"}`} title={l}>{l}</p>)}
      </div>
    </div>
  );
}

type Quote = { id: string; number: string; date: string; status: string; total: number; history: HistoryLine[]; emails: SentEmail[]; rejection?: { at: string; reason: string } | null };

/** `actions`: what can be done from a phase that's next, by phase key (Trainings: "pi" → Convert to PI). */
export function QuoteStory({ quote, training, actions, piHint }: { quote: Quote; training: boolean; actions?: Partial<Record<string, React.ReactNode>>; piHint?: { number: string; status: string; date: string } }) {
  const sales = useSalesData(true);
  const pipeline = usePipeline(training);
  const { cardEvents } = useStore();
  // Training quotes: the training board's card for this quote (its schedule), its certificates, its logistics step.
  const boards = useMemo(() => {
    const d = pipeline.data;
    if (!training || !d?.leads) return null;
    const board = buildBoard(d.leads, d.quotes, d.pis, d.invoices, d.payments, cardEvents);
    const card = [...board.cards.values()].find((c) => !c.mergedInto && !c.deleted && c.historyIds.includes(quoteCardId(quote.id)));
    const doc = card && (card.historyIds.find((id) => kindOfId(id) === "pi") ?? card.historyIds.find((id) => kindOfId(id) === "quote"));
    const fulfil = doc ? buildFulfillmentBoard(board, cardEvents).cards.get(fulfilCardId(doc))?.fulfillment : undefined;
    const logiStep = doc ? cardEvents.filter((e) => !e.revertedAt && e.kind === "set_logistics" && e.cardIds.includes(logiCardId(doc))).sort((a, b) => a.at.localeCompare(b.at)).at(-1)?.value : undefined;
    const invoices = [card?.invoice, card?.linkedInvoice, ...(card?.dealInvoices ?? [])].filter((i): i is NonNullable<typeof i> => Boolean(i));
    const payments = card?.payments ?? (card?.payment ? [card.payment] : []);
    return { schedule: card?.schedule, fulfil, logiStep, board: card ? { invoices, payments, piSkipped: card.piSkipped } : undefined };
  }, [training, pipeline.data, cardEvents, quote.id]);
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  // The Sales copy leaves out training-only documents (they live in the Training board's copy), so a training quote's
  // Performa and invoices come from both (13 Nov: a converted training quote's Performa showed "Not yet").
  const docs = useMemo(() => {
    const s = sales.data;
    if (!s?.pis) return null;
    const p = training ? pipeline.data : null;
    const uniq = <T,>(list: T[], key: (x: T) => string) => [...new Map(list.map((x) => [key(x), x])).values()];
    return {
      pis: uniq([...s.pis, ...(p?.pis ?? [])], (x) => x.salesorderId),
      invoices: uniq([...s.invoices, ...(p?.invoices ?? [])], (x) => x.invoiceId),
      payments: uniq([...s.payments, ...(p?.payments ?? [])], (x) => `${x.paymentId}:${x.invoiceId}`),
    };
  }, [sales.data, pipeline.data, training]);
  const phases = storyPhases({
    quote, training, today, piHint,
    docs,
    schedule: boards?.schedule, fulfil: boards?.fulfil, logiStep: boards?.logiStep, board: boards?.board,
  });
  const loading = !sales.data || (training && !pipeline.data);

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
  const per = width >= 1180 ? 5 : width >= 860 ? 4 : width >= 600 ? 3 : 1;
  const rows: Phase[][] = [];
  for (let i = 0; i < phases.length; i += per) rows.push(phases.slice(i, i + per));
  const line = "shrink-0 bg-line-strong";
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">The story of this quotation{loading ? " · getting the rest of the deal…" : ""}</p>
        {quote.history.length > 0 && <button className="text-[13px] font-medium text-brand hover:underline" onClick={() => setAll((x) => !x)}>{all ? "Hide Zoho's lines" : `Show all of Zoho's lines (${quote.history.length})`}</button>}
      </div>
      <div ref={ref} className="mt-3">
        {per === 1 ? (
          <div className="flex flex-col items-stretch">
            {phases.map((p, i) => (
              <div key={p.key} className="flex flex-col items-stretch">
                {i > 0 && <div className={`${line} mx-auto h-4 w-0.5`} />}
                <Box p={p} n={i + 1} action={actions?.[p.key]} />
              </div>
            ))}
          </div>
        ) : (
          <div className="relative" style={{ paddingLeft: SIDE, paddingRight: SIDE }}>
            {rows.map((row, r) => (
              // Equal columns in every row, so the boxes line up; a right-to-left row fills from the right.
              <div key={r} className="grid" style={{ gridTemplateColumns: `repeat(${per}, minmax(0, 1fr))`, columnGap: GAP, marginTop: r ? ROW_GAP : 0, direction: r % 2 ? "rtl" : "ltr" }}>
                {row.map((p, i) => (
                  <div key={p.key} className="relative flex" style={{ direction: "ltr" }}>
                    {i > 0 && <div className={`${line} absolute top-1/2 h-0.5`} style={{ width: GAP, [r % 2 ? "right" : "left"]: -GAP }} />}
                    <Box p={p} n={r * per + i + 1} action={actions?.[p.key]} />
                  </div>
                ))}
              </div>
            ))}
            {/* The curves joining a row's end to the next row's start: right after a left-to-right row, left after a right-to-left one. */}
            {rows.slice(0, -1).map((_, r) => (
              <div key={r} className={`absolute border-2 border-line-strong ${r % 2 ? "left-0 rounded-l-[30px] border-r-0" : "right-0 rounded-r-[30px] border-l-0"}`}
                style={{ top: r * (BOX_H + ROW_GAP) + BOX_H / 2 - 1, height: BOX_H + ROW_GAP, width: SIDE }} />
            ))}
          </div>
        )}
        {all && (
          <ul className="mt-4 space-y-1.5 rounded-2xl border border-line p-3">
            {quote.history.map((h, i) => <li key={i} className="text-[13px] text-ink-2"><span className="text-faint">{h.when}{h.by ? ` · ${h.by}` : ""}</span> — {h.text}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
