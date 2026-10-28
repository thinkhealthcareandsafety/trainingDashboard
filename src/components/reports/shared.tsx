"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Period, fieldOf, datasetOf, grainKey, periods } from "@/lib/analytics/model";
import { BLANK, type Result, type Spec } from "@/lib/analytics/query";

/* The Reports page's shared pieces: the API calls, period helpers and the multi-select filter. */

export type Meta = { datasets: string[]; today: string; admin: boolean; state: DataState };
export type DataState = { refreshedAt?: string; refreshedBy?: string; error?: string; running?: boolean; tables?: Record<string, number> };
export type Answer = Result | { error: string };
export const isError = (a: Answer | undefined): a is { error: string } => Boolean(a && "error" in a);

/*
 * Answers kept in this tab's memory (owner, 28 Oct: "cache memory"): the same report asked again — back to a tab or a
 * page, My dashboard after Sales — shows at once, with no request. Kept CACHE_MS (trainings, read live from the
 * board, TRAININGS_MS); all dropped when the Zoho copy changes (Refresh now, or the automatic one) or the page reloads.
 */
const CACHE_MS = 10 * 60_000;
const TRAININGS_MS = 60_000;
const answers = new Map<string, { at: number; answer: Result }>();
let copyOf = ""; // the Zoho copy (refreshedAt) the kept answers came from
export const forgetAnswers = () => answers.clear();

export async function runSpecs(specs: Spec[]): Promise<{ results: Answer[]; state?: DataState }> {
  if (!specs.length) return { results: [] };
  const keys = specs.map((s) => JSON.stringify(s));
  const kept = keys.map((k, i) => {
    const a = answers.get(k);
    return a && Date.now() - a.at < (specs[i].dataset === "trainings" ? TRAININGS_MS : CACHE_MS) ? a.answer : undefined;
  });
  const ask = specs.filter((_, i) => !kept[i]);
  if (!ask.length) return { results: kept as Answer[] };
  const r = await fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specs: ask }) }).catch(() => null);
  const failed = (error: string) => ({ results: kept.map((a) => a ?? { error }) });
  if (!r) return failed("Couldn't reach the server");
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    return failed(j.error ?? (r.status === 504 ? "The server took too long — try again in a minute" : "Couldn't reach the server"));
  }
  const j = (await r.json()) as { results: Answer[]; state?: DataState };
  if (j.state?.refreshedAt && j.state.refreshedAt !== copyOf) { answers.clear(); copyOf = j.state.refreshedAt; }
  let n = 0;
  const results = kept.map((a, i) => {
    if (a) return a;
    const got = j.results[n++];
    if (got && !isError(got)) answers.set(keys[i], { at: Date.now(), answer: got });
    return got;
  });
  return { results, state: j.state };
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

/** How a filter matches (Filters panel, owner 27 Oct: "custom filters"): is / is not the ticked values, or contains text. */
export type Rule = { exclude?: boolean; contains?: string };
export const ruleSummary = (selected: string[], rule: Rule = {}) =>
  rule.contains?.trim() ? `${rule.exclude ? "doesn't contain" : "contains"} “${rule.contains.trim()}”`
  : !selected.length ? "All" : `${rule.exclude ? "not " : ""}${selected.length === 1 ? selected[0] : `${selected.length} chosen`}`;

/** "Sector: All ▾" → a searchable checkbox list (with `rule`: Is / Is not, and "everything containing …"). */
export function MultiSelect({ label, values, selected, onChange, loading, wide, rule, onRule }: {
  label: string; values: string[]; selected: string[]; onChange: (v: string[]) => void; loading?: boolean;
  /** Fill its cell (the Filters panel). */ wide?: boolean;
  rule?: Rule; onRule?: (r: Rule) => void;
}) {
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
  const contains = rule?.contains?.trim();
  const on = selected.length > 0 || Boolean(contains);
  const toggle = (v: string) => { if (contains) onRule?.({ ...rule, contains: undefined }); onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]); };
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[16px] transition ${wide ? "w-full" : "max-w-[260px]"} ${on ? "border-brand/50 bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}
      >
        <span className="shrink-0 text-muted">{label}:</span>
        <span className={`truncate font-medium ${wide ? "flex-1 text-left" : ""}`}>{ruleSummary(selected, rule)}</span>
        <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
      </button>
      {open && (
        <div className={`absolute left-0 top-full z-40 mt-1.5 rounded-xl border border-line bg-surface p-2 shadow-pop ${wide ? "w-full min-w-[240px]" : "w-[280px]"}`}>
          {onRule && (
            <div className="mb-2 inline-flex rounded-full bg-surface-2 p-0.5 text-[15px]" role="radiogroup" aria-label="Match">
              {[{ ex: false, label: "Is" }, { ex: true, label: "Is not" }].map((o) => (
                <button key={o.label} type="button" role="radio" aria-checked={Boolean(rule?.exclude) === o.ex} onClick={() => onRule({ ...rule, exclude: o.ex })}
                  className={`rounded-full px-3 py-1 font-medium ${Boolean(rule?.exclude) === o.ex ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink"}`}>{o.label}</button>
              ))}
            </div>
          )}
          <input autoFocus className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[16px] text-ink placeholder:text-faint focus:border-brand focus:outline-none" placeholder={`Search ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="no-scrollbar mt-1.5 max-h-[260px] overflow-y-auto">
            {/* Text instead of ticks: every value containing it, now and as new ones appear. */}
            {onRule && q.trim() && (
              <button type="button" className={`mb-1 block w-full rounded-md px-2 py-1.5 text-left text-[16px] hover:bg-surface-2 ${contains === q.trim() ? "font-semibold text-brand" : "text-ink-2"}`}
                onClick={() => { onChange([]); onRule({ ...rule, contains: q.trim() }); }}>
                {rule?.exclude ? "Everything not containing" : "Everything containing"} “{q.trim()}”
              </button>
            )}
            {loading && !values.length && <p className="px-2 py-2 text-[15.5px] text-muted">Loading…</p>}
            {!loading && !shown.length && <p className="px-2 py-2 text-[15.5px] text-muted">Nothing matches.</p>}
            {shown.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[16px] text-ink-2 hover:bg-surface-2">
                <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={selected.includes(v)} onChange={() => toggle(v)} />
                <span className="truncate">{v}</span>
              </label>
            ))}
          </div>
          {on && <button type="button" className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[15.5px] font-semibold text-brand hover:bg-surface-2" onClick={() => { onChange([]); if (contains) onRule?.({ ...rule, contains: undefined }); }}>Clear</button>}
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
      <select className="h-10 appearance-none rounded-full border border-line bg-surface pl-5 pr-10 text-[16px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-4 size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
    </label>
  );
}

export const stamp = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");
