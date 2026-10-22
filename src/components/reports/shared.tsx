"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Period, fieldOf, datasetOf, grainKey, periods } from "@/lib/analytics/model";
import { BLANK, type Result, type Spec } from "@/lib/analytics/query";

/* The Reports page's shared pieces: the API calls, period helpers and the multi-select filter. */

export type Meta = { datasets: string[]; today: string; admin: boolean; state: DataState };
export type DataState = { refreshedAt?: string; refreshedBy?: string; error?: string; running?: boolean; tables?: Record<string, number> };
export type Answer = Result | { error: string };
export const isError = (a: Answer | undefined): a is { error: string } => Boolean(a && "error" in a);

export async function runSpecs(specs: Spec[]): Promise<{ results: Answer[]; state?: DataState }> {
  if (!specs.length) return { results: [] };
  const r = await fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specs }) }).catch(() => null);
  if (!r?.ok) return { results: specs.map(() => ({ error: "Couldn't reach the server" })) };
  return r.json();
}

/** A spec with its relative period turned into dates (saved reports store "fy", "3m"…). */
export function withPeriod(spec: Spec, today: string, periodKey?: string): Spec {
  const key = periodKey ?? spec.period;
  if (!key) return spec;
  const p = periods(today).find((x) => x.key === key);
  return { ...spec, from: p?.from, to: p?.to };
}

/** The date range a clicked date key stands for (month / FY / quarter / day / week). */
export function rangeOfKey(key: string, grain: Spec["grain"] = "month"): { from: string; to: string } | null {
  const end = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (grain === "month" && /^\d{4}-\d{2}$/.test(key)) return { from: `${key}-01`, to: end(Number(key.slice(0, 4)), Number(key.slice(5, 7))) };
  if (grain === "fy" && /^\d{4}$/.test(key)) return { from: `${key}-04-01`, to: `${Number(key) + 1}-03-31` };
  if (grain === "day" && /^\d{4}-\d{2}-\d{2}$/.test(key)) return { from: key, to: key };
  if (grain === "week" && /^\d{4}-\d{2}-\d{2}$/.test(key)) { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return { from: key, to: d.toISOString().slice(0, 10) }; }
  if (grain === "quarter") {
    const m = key.match(/^(\d{4})-Q([1-4])$/);
    if (!m) return null;
    const fy = Number(m[1]);
    const q = Number(m[2]);
    const startMonth = [4, 7, 10, 1][q - 1];
    const y = q === 4 ? fy + 1 : fy;
    return { from: `${y}-${String(startMonth).padStart(2, "0")}-01`, to: end(y, startMonth + 2) };
  }
  return null;
}
export { grainKey };

/** Distinct values of one field (most frequent first) — for a filter's list. */
export function useFieldValues(dataset: string | undefined, field: string, enabled = true): string[] {
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled || !dataset) return;
    const d = datasetOf(dataset);
    if (!d || !fieldOf(d, field) || field === d.dateField) return;
    let live = true;
    runSpecs([{ dataset, measures: [d.measures.find((m) => m.agg === "count")?.key ?? d.measures[0].key], by: [field] }]).then((j) => {
      const r = j.results[0];
      if (live && r && !isError(r)) setValues(r.rows.map((row) => row.keys[0]).filter((v) => v !== BLANK));
    });
    return () => { live = false; };
  }, [dataset, field, enabled]);
  return values;
}

/** "Sector: All ▾" → a searchable checkbox list. */
export function MultiSelect({ label, values, selected, onChange, loading }: { label: string; values: string[]; selected: string[]; onChange: (v: string[]) => void; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const shown = useMemo(() => values.filter((v) => v.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 200), [values, q]);
  const summary = selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} chosen`;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex h-9 max-w-[240px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition ${selected.length ? "border-brand/50 bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}
      >
        <span className="text-muted">{label}:</span>
        <span className="truncate font-medium">{summary}</span>
        <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-[280px] rounded-xl border border-line bg-surface p-2 shadow-pop">
          <input autoFocus className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint focus:border-brand focus:outline-none" placeholder={`Search ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="no-scrollbar mt-1.5 max-h-[260px] overflow-y-auto">
            {loading && !values.length && <p className="px-2 py-2 text-[12.5px] text-muted">Loading…</p>}
            {!loading && !shown.length && <p className="px-2 py-2 text-[12.5px] text-muted">Nothing matches.</p>}
            {shown.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2">
                <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={selected.includes(v)} onChange={() => toggle(v)} />
                <span className="truncate">{v}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && <button type="button" className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[12.5px] font-semibold text-brand hover:bg-surface-2" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}

export function PeriodSelect({ today, value, onChange }: { today: string; value: string; onChange: (v: string) => void }) {
  const list: Period[] = periods(today);
  return (
    // Our own arrow (the browser's can't be moved): `right-4` sets where it sits, `pr-10` keeps the text clear of it.
    <label className="relative inline-flex items-center">
      <span className="sr-only">Period</span>
      <select className="h-9 appearance-none rounded-full border border-line bg-surface pl-5 pr-10 text-[13px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-4 size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
    </label>
  );
}

export const stamp = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");
