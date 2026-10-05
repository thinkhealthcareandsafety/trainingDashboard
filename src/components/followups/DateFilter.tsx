"use client";

import { useState } from "react";
import type { CardView } from "@/lib/pipeline";
import { fmtDate } from "@/lib/dates";
import { Modal, Segmented, btn, inputCls } from "../ui";

/** Board filter: whole months (one or several, e.g. Sept + Oct), or a from–to date range. */
export type DateFilterValue = { kind: "months"; months: string[] } | { kind: "range"; from: string; to: string };

// Month names as the rest of the board writes them ("Sept").
const MONTHS = Array.from({ length: 12 }, (_, i) => fmtDate(`2026-${String(i + 1).padStart(2, "0")}-01`, { month: "short" }));
const dayLong = (d: string) => fmtDate(d, { day: "numeric", month: "short", year: "numeric" });
const monthName = (ym: string, year = true) => fmtDate(`${ym}-01`, year ? { month: "short", year: "numeric" } : { month: "short" });

/**
 * The date each card is filtered on — the one it shows: training days once a training is scheduled, otherwise the
 * quotation / PI / invoice / payment date, the expected date on Potential training, the created date on Leads.
 * Each entry is a day span, so a month-only expected date ("2026-11") counts for the whole month.
 */
function spans(c: CardView): [string, string][] {
  if (c.schedule?.dates.length) return c.schedule.dates.map((d) => [d.slice(0, 10), d.slice(0, 10)]);
  const v = c.kind === "potential" ? c.potential?.expected ?? c.potential?.addedAt.slice(0, 10) : c.docDate ?? c.customerSince?.slice(0, 10);
  if (!v) return [];
  return [v.length === 7 ? [`${v}-01`, `${v}-31`] : [v.slice(0, 10), v.slice(0, 10)]];
}

export function matchesDateFilter(c: CardView, f: DateFilterValue | null): boolean {
  if (!f) return true;
  const s = spans(c);
  if (f.kind === "months") return s.some(([a, b]) => f.months.some((m) => a.slice(0, 7) <= m && m <= b.slice(0, 7)));
  return s.some(([a, b]) => (!f.to || a <= f.to) && (!f.from || b >= f.from));
}

/** "Sep 2026" · "Sep, Oct 2026" · "Dec 2025, Jan 2026" · "5 Sep – 20 Oct 2026" · "From 5 Sep 2026". */
export function describeDateFilter(f: DateFilterValue): string {
  if (f.kind === "range") return f.from && f.to ? `${dayLong(f.from)} – ${dayLong(f.to)}` : f.from ? `From ${dayLong(f.from)}` : `Until ${dayLong(f.to)}`;
  const ms = [...f.months].sort();
  const oneYear = ms.every((m) => m.slice(0, 4) === ms[0].slice(0, 4));
  if (ms.length > 4) return `${ms.length} months`;
  return ms.map((m, i) => monthName(m, !oneYear || i === ms.length - 1)).join(", ");
}

/** The Filter button next to "Show deleted"; opens the date filter. Shows what's applied, with × to clear it. */
export function DateFilterButton({ value, onChange }: { value: DateFilterValue | null; onChange: (f: DateFilterValue | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className={`inline-flex h-8 items-center rounded-full border text-[13px] ${value ? "border-brand bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}>
        <button type="button" className="inline-flex h-full items-center gap-1.5 rounded-full pl-3 pr-3 font-medium" onClick={() => setOpen(true)} title="Filter the board by date">
          <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M3.5 4.5h13l-5 6v5l-3-1.5v-3.5z" /></svg>
          {value ? describeDateFilter(value) : "Filter"}
        </button>
        {value && (
          <button type="button" className="-ml-1.5 mr-1 grid size-6 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" onClick={() => onChange(null)} aria-label="Clear the date filter" title="Clear the filter">
            <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        )}
      </span>
      {open && <FilterModal value={value} onApply={(f) => { onChange(f); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

function FilterModal({ value, onApply, onClose }: { value: DateFilterValue | null; onApply: (f: DateFilterValue | null) => void; onClose: () => void }) {
  const thisYear = new Date().getFullYear();
  const [kind, setKind] = useState<DateFilterValue["kind"]>(value?.kind ?? "months");
  const [months, setMonths] = useState<string[]>(value?.kind === "months" ? value.months : []);
  const [year, setYear] = useState(value?.kind === "months" && value.months[0] ? Number(value.months[0].slice(0, 4)) : thisYear);
  const [from, setFrom] = useState(value?.kind === "range" ? value.from : "");
  const [to, setTo] = useState(value?.kind === "range" ? value.to : "");
  const thisMonth = new Date().toLocaleDateString("en-CA").slice(0, 7);
  const toggle = (m: string) => setMonths((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m].sort()));
  const swapped = Boolean(from && to && from > to);
  const next: DateFilterValue | null = kind === "months" ? (months.length ? { kind, months } : null) : from || to ? { kind, from, to } : null;
  const canApply = !swapped && (next !== null || value !== null);

  return (
    <Modal open onClose={onClose} title="Filter by date">
      <Segmented value={kind} onChange={setKind} options={[{ value: "months", label: "Months" }, { value: "range", label: "Date range" }]} />
      {kind === "months" ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor" aria-hidden><path d="M7.5 1 2 5l5.5 4z" /></svg>
            </button>
            <span className="num text-[14px] font-semibold text-ink">{year}</span>
            <button type="button" className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor" aria-hidden><path d="M2.5 1 8 5 2.5 9z" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((label, i) => {
              const m = `${year}-${String(i + 1).padStart(2, "0")}`;
              const on = months.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(m)}
                  className={`h-9 rounded-lg border text-[13px] transition ${on ? "border-brand bg-brand font-semibold text-brand-ink" : `border-line bg-surface text-ink-2 hover:border-line-strong ${m === thisMonth ? "ring-1 ring-inset ring-brand" : ""}`}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 min-h-[20px] text-[13px] text-ink-2">
            {months.length ? <>Showing <b className="text-ink">{describeDateFilter({ kind: "months", months })}</b></> : <span className="text-muted">Pick one month or several — they combine.</span>}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">From</span>
            <input type="date" className={`${inputCls} !h-9 text-[13px]`} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">To</span>
            <input type="date" className={`${inputCls} !h-9 text-[13px]`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <p className={`col-span-2 min-h-[20px] text-[13px] ${swapped ? "font-medium text-high" : "text-muted"}`}>
            {swapped ? "“From” is after “To”." : "Leave one side empty for an open range."}
          </p>
        </div>
      )}
      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-muted">
        Each card is matched on the date it shows: training dates once scheduled, otherwise the quotation, PI, invoice or payment date; expected date on Potential training; created date on Leads.
      </p>
      <div className="mt-5 flex items-center justify-end gap-2">
        {value && <button type="button" className={`${btn.quiet} mr-auto`} onClick={() => onApply(null)}>Clear filter</button>}
        <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
        <button type="button" className={btn.primary} disabled={!canApply} onClick={() => onApply(next)}>Apply</button>
      </div>
    </Modal>
  );
}
