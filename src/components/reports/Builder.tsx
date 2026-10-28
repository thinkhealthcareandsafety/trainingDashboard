"use client";

import { useEffect, useMemo, useState } from "react";
import { DATASETS, type Grain, datasetOf, fieldOf, measureOf, periods } from "@/lib/analytics/model";
import type { ChartKind, Filter, Spec } from "@/lib/analytics/query";
import { btn, inputCls } from "../ui";
import { Chart, resolveKind } from "./Chart";
import { type Answer, MultiSelect, isError, runSpecs, useFieldValues, withPeriod } from "./shared";

/*
 * Make a report in three questions — what data, what to measure, split by what — then the chart, period and filters.
 * The preview runs live. Builders (Admin, Ashish, Shikha, Sumit) save it for the whole team; everyone else can still
 * explore and download.
 */

const CHARTS: { value: ChartKind; label: string }[] = [
  { value: "auto", label: "Suggested" }, { value: "column", label: "Columns" }, { value: "bar", label: "Bars" }, { value: "line", label: "Line" },
  { value: "area", label: "Area" }, { value: "stacked", label: "Stacked" }, { value: "donut", label: "Donut" }, { value: "table", label: "Table" }, { value: "kpi", label: "Number" },
];
const GRAINS: { value: Grain; label: string }[] = [{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "fy", label: "Financial year" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }];

export function autoTitle(s: Spec): string {
  const d = datasetOf(s.dataset);
  if (!d) return "Report";
  const m = s.measures.map((k) => measureOf(d, k)?.label).filter(Boolean).join(" & ");
  const by = (s.by ?? []).map((k) => (k === d.dateField ? (GRAINS.find((g) => g.value === (s.grain ?? "month"))?.label ?? "month").toLowerCase() : fieldOf(d, k)?.label.toLowerCase())).filter(Boolean);
  return `${m}${by.length ? ` by ${by.join(" and ")}` : ""}`;
}

export function Builder({ initial, datasets, today, canSave, savedId, onClose, onSaved }: {
  initial?: Spec; datasets: string[]; today: string; canSave: boolean; savedId?: string; onClose: () => void; onSaved: () => void;
}) {
  const allowed = DATASETS.filter((d) => datasets.includes(d.key));
  const [spec, setSpec] = useState<Spec>(() => initial ?? { dataset: allowed[0]?.key ?? "sales", measures: [allowed[0]?.measures[0].key ?? "revenue"], by: [], period: "fy", chart: "auto", limit: 10 });
  const [title, setTitle] = useState(initial?.title ?? "");
  const [answer, setAnswer] = useState<Answer | undefined>();
  const [saving, setSaving] = useState<{ busy?: boolean; error?: string }>({});
  const d = datasetOf(spec.dataset)!;
  const set = (patch: Partial<Spec>) => setSpec((s) => ({ ...s, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[aria-expanded=true]")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Live preview (debounced).
  const query = useMemo(() => withPeriod({ ...spec, title: title || autoTitle(spec) }, today), [spec, title, today]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => runSpecs([query]).then((j) => { if (live) setAnswer(j.results[0]); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  const changeDataset = (key: string) => {
    const nd = datasetOf(key)!;
    setSpec((s) => ({ ...s, dataset: key, measures: [nd.measures[0].key], by: (s.by ?? []).filter((b) => fieldOf(nd, b)), filters: (s.filters ?? []).filter((f) => fieldOf(nd, f.field)) }));
  };
  const toggleMeasure = (key: string) => {
    const has = spec.measures.includes(key);
    const next = has ? spec.measures.filter((m) => m !== key) : [...spec.measures, key].slice(-3);
    if (next.length) set({ measures: next });
  };
  const by0 = spec.by?.[0] ?? "";
  const by1 = spec.by?.[1] ?? "";
  const setBy = (i: 0 | 1, v: string) => {
    const by = [i === 0 ? v : by0, i === 1 ? v : by1].filter(Boolean);
    set({ by: [...new Set(by)] });
  };
  const usesDate = (spec.by ?? []).includes(d.dateField);

  const save = async () => {
    setSaving({ busy: true });
    const body = { id: savedId, spec: { ...spec, from: undefined, to: undefined, title: title.trim() || autoTitle(spec) } };
    const r = await fetch("/api/analytics/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    if (j.ok) { onSaved(); onClose(); } else setSaving({ error: j.error ?? "Couldn't save" });
  };

  const field = (label: string, children: React.ReactNode, hint?: string) => (
    <div>
      <div className="text-[15px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[15px] leading-snug text-muted">{hint}</p>}
    </div>
  );
  const selectCls = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[16px] text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";
  const kind = answer && !isError(answer) ? resolveKind(spec.chart, answer) : undefined;

  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Report builder" className="modal-in flex max-h-[94vh] w-full max-w-[1180px] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[19px] font-bold tracking-tight text-ink">{savedId ? "Edit report" : "New report"}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* The questions */}
          <div className="no-scrollbar space-y-4 overflow-y-auto border-b border-line p-5 lg:border-b-0 lg:border-r">
            {field("1 · What data", (
              <select className={selectCls} value={spec.dataset} onChange={(e) => changeDataset(e.target.value)}>
                {allowed.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            ), `${d.desc} Source: ${d.source}.`)}
            {field("2 · What to measure", (
              <div className="flex flex-wrap gap-1.5">
                {d.measures.map((m) => (
                  <button key={m.key} type="button" title={m.def} aria-pressed={spec.measures.includes(m.key)} onClick={() => toggleMeasure(m.key)}
                    className={`rounded-full border px-3 py-1 text-[15.5px] font-medium transition ${spec.measures.includes(m.key) ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-2 hover:border-line-strong"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            ), measureOf(d, spec.measures[0])?.def)}
            {field("3 · Split by", (
              <div className="space-y-2">
                <select className={selectCls} value={by0} onChange={(e) => setBy(0, e.target.value)}>
                  <option value="">Nothing — one number</option>
                  {d.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                {by0 && (
                  <select className={selectCls} value={by1} onChange={(e) => setBy(1, e.target.value)}>
                    <option value="">…and nothing else</option>
                    {d.fields.filter((f) => f.key !== by0).map((f) => <option key={f.key} value={f.key}>and by {f.label.toLowerCase()}</option>)}
                  </select>
                )}
                {usesDate && (
                  <div className="flex flex-wrap gap-1">
                    {GRAINS.map((g) => (
                      <button key={g.value} type="button" aria-pressed={(spec.grain ?? "month") === g.value} onClick={() => set({ grain: g.value })}
                        className={`rounded-full px-2.5 py-1 text-[15px] font-medium ${(spec.grain ?? "month") === g.value ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>{g.label}</button>
                    ))}
                  </div>
                )}
              </div>
            ), by0 && fieldOf(d, by0)?.hint)}
            {field("Chart", (
              <div className="flex flex-wrap gap-1">
                {CHARTS.map((c) => (
                  <button key={c.value} type="button" aria-pressed={(spec.chart ?? "auto") === c.value} onClick={() => set({ chart: c.value })}
                    className={`rounded-full px-2.5 py-1 text-[15px] font-medium ${(spec.chart ?? "auto") === c.value ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>{c.label}</button>
                ))}
              </div>
            ))}
            {field("Period", (
              <select className={selectCls} value={spec.period ?? "fy"} onChange={(e) => set({ period: e.target.value })}>
                {periods(today).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            ), "Saved reports keep this as a moving period — “This FY” is always the current one.")}
            {by0 && by0 !== d.dateField && field("Show", (
              <select className={selectCls} value={spec.limit ?? 0} onChange={(e) => set({ limit: Number(e.target.value) || undefined })}>
                {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>Top {n} (+ Others)</option>)}
                <option value={0}>All</option>
              </select>
            ))}
            {field("Filters", <Filters dataset={spec.dataset} filters={spec.filters ?? []} onChange={(filters) => set({ filters })} />)}
            {field("Title", <input className={inputCls} placeholder={autoTitle(spec)} value={title} onChange={(e) => setTitle(e.target.value)} />)}
          </div>
          {/* The preview */}
          <div className="flex min-h-[360px] min-w-0 flex-col p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 truncate text-[18.5px] font-semibold text-ink">{title || autoTitle(spec)}</h3>
              {answer && !isError(answer) && <span className="shrink-0 text-[15px] text-muted">{answer.matched.toLocaleString("en-IN")} rows</span>}
            </div>
            <div className="mt-3 min-h-0 flex-1">
              {!answer ? <div className="h-[520px] animate-pulse rounded-lg bg-surface-2" />
                : isError(answer) ? <p className="text-[16px] text-high">{answer.error}</p>
                : <Chart result={answer} kind={spec.chart} grain={spec.grain} height={kind === "kpi" ? 120 : 520} />}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          {saving.error && <span className="mr-auto text-[16px] font-medium text-high">{saving.error}</span>}
          {!canSave && <span className="mr-auto text-[15.5px] text-muted">Admin, Ashish, Shikha and Sumit can save reports for the team.</span>}
          <button className={btn.ghost} onClick={onClose}>Close</button>
          {canSave && <button className={btn.primary} disabled={saving.busy || !answer || isError(answer)} onClick={save}>{saving.busy ? "Saving…" : savedId ? "Save changes" : "Save report"}</button>}
        </div>
      </div>
    </div>
  );
}

function Filters({ dataset, filters, onChange }: { dataset: string; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const d = datasetOf(dataset)!;
  const [adding, setAdding] = useState("");
  const free = d.fields.filter((f) => f.key !== d.dateField && !filters.some((x) => x.field === f.key));
  return (
    <div className="space-y-2">
      {filters.map((f, i) => (
        <div key={f.field} className="flex items-center gap-1.5">
          <FilterValues dataset={dataset} field={f.field} selected={f.values} onChange={(values) => onChange(filters.map((x, j) => (j === i ? { ...x, values } : x)))} />
          <button type="button" aria-label={`Remove the ${fieldOf(d, f.field)?.label} filter`} className="rounded-full px-2 text-muted hover:text-ink" onClick={() => onChange(filters.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {free.length > 0 && (
        <select className="h-8 w-full rounded-lg border border-dashed border-line bg-surface px-2.5 text-[15.5px] text-muted focus:border-brand focus:outline-none" value={adding}
          onChange={(e) => { if (e.target.value) onChange([...filters, { field: e.target.value, values: [] }]); setAdding(""); }}>
          <option value="">+ Add a filter…</option>
          {free.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      )}
    </div>
  );
}

function FilterValues({ dataset, field, selected, onChange }: { dataset: string; field: string; selected: string[]; onChange: (v: string[]) => void }) {
  const values = useFieldValues(dataset, field);
  const label = fieldOf(datasetOf(dataset)!, field)?.label ?? field;
  return <MultiSelect label={label} values={values} selected={selected} onChange={onChange} loading={!values.length} />;
}
