"use client";

import { useEffect, useMemo, useState } from "react";
import { datasetOf, fieldOf } from "@/lib/analytics/model";
import type { DashboardDef, Tile } from "@/lib/analytics/dashboards";
import type { Spec } from "@/lib/analytics/query";
import { Chart, downloadCsv, labelOf, resolveKind } from "./Chart";
import { type Answer, MultiSelect, PeriodSelect, isError, rangeOfKey, runSpecs, useFieldValues, withPeriod } from "./shared";

/*
 * A dashboard: a filter bar (period + fields) over a grid of tiles. Every filter reaches every tile whose data has that
 * field. Clicking a bar / slice / month filters all the OTHER tiles to it (that tile just highlights it) — the chip
 * above the grid says what's picked; Esc or × clears it. Tiles: KPI (with the period before), charts, table view, CSV.
 */

type Pick = { tileId: string; field: string; value: string; label: string; grain?: Spec["grain"] };

export function compose(tile: Tile, today: string, periodKey: string, filters: Record<string, string[]>, pick: Pick | null): Spec {
  const d = datasetOf(tile.spec.dataset)!;
  const has = (f: string) => Boolean(fieldOf(d, f));
  const list = [...(tile.spec.filters ?? [])];
  for (const [field, values] of Object.entries(filters)) if (values.length && has(field)) list.push({ field, values });
  let spec: Spec = tile.fixedPeriod ? { ...tile.spec } : withPeriod(tile.spec, today, periodKey);
  if (pick && pick.tileId !== tile.id) {
    if (pick.field === "date") {
      const r = rangeOfKey(pick.value, pick.grain);
      if (r && !tile.fixedPeriod) spec = { ...spec, from: r.from, to: r.to };
    } else if (has(pick.field)) list.push({ field: pick.field, values: [pick.value] });
  }
  return { ...spec, filters: list };
}

export function DashboardView({ def, today }: { def: DashboardDef; today: string }) {
  const [period, setPeriod] = useState(def.period);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [pick, setPick] = useState<Pick | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => { setPeriod(def.period); setFilters({}); setPick(null); setAnswers({}); }, [def]);

  const specs = useMemo(() => def.tiles.map((t) => compose(t, today, period, filters, pick)), [def, today, period, filters, pick]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    runSpecs(specs).then((j) => {
      if (!live) return;
      setAnswers(Object.fromEntries(def.tiles.map((t, i) => [t.id, j.results[i]])));
      setLoading(false);
    });
    return () => { live = false; };
  }, [specs, def]);
  useEffect(() => {
    if (!pick) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setPick(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pick]);

  const firstDatasetWith = (field: string) => def.tiles.map((t) => t.spec.dataset).find((k) => fieldOf(datasetOf(k)!, field));
  const active = Object.entries(filters).filter(([, v]) => v.length).length + (pick ? 1 : 0);

  return (
    <div>
      {/* Filters in one row above the charts. */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelect today={today} value={period} onChange={setPeriod} />
        {def.filters.map((f) => (
          <FilterControl key={f.field} dataset={firstDatasetWith(f.field)} field={f.field} label={f.label} selected={filters[f.field] ?? []} onChange={(v) => setFilters((s) => ({ ...s, [f.field]: v }))} />
        ))}
        {active > 0 && <button type="button" className="h-9 rounded-full px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft" onClick={() => { setFilters({}); setPick(null); }}>Clear all</button>}
        {loading && <span className="text-[12.5px] text-muted" aria-live="polite">Updating…</span>}
      </div>
      {pick && (
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-ink">
            Showing <b className="font-semibold">{pick.label}</b>
            <button type="button" aria-label="Clear the selection" className="ml-0.5 rounded-full px-1 text-muted hover:text-ink" onClick={() => setPick(null)}>×</button>
          </span>
          <span className="text-muted">Click it again, × or Esc to clear</span>
        </div>
      )}
      <div className="mt-4 grid grid-cols-12 gap-3">
        {def.tiles.map((t, i) => (
          <TileCard key={t.id} tile={t} spec={specs[i]} answer={answers[t.id]}
            picked={pick?.tileId === t.id ? pick.value : null}
            onPick={(value) => {
              const field = t.spec.by?.[0];
              if (!field) return;
              if (pick && pick.tileId === t.id && pick.value === value) return setPick(null);
              const a = answers[t.id];
              const date = !isError(a) && a?.by[0]?.date;
              setPick({ tileId: t.id, field, value, grain: t.spec.grain, label: labelOf(value, Boolean(date), t.spec.grain ?? "month", true) });
            }} />
        ))}
      </div>
    </div>
  );
}

function FilterControl({ dataset, field, label, selected, onChange }: { dataset?: string; field: string; label: string; selected: string[]; onChange: (v: string[]) => void }) {
  const values = useFieldValues(dataset, field);
  return <MultiSelect label={label} values={values} selected={selected} onChange={onChange} loading={!values.length} />;
}

const SPAN: Record<Tile["w"], string> = { 3: "col-span-12 sm:col-span-6 xl:col-span-3", 4: "col-span-12 sm:col-span-6 xl:col-span-4", 6: "col-span-12 xl:col-span-6", 12: "col-span-12" };

export function TileCard({ tile, spec, answer, picked, onPick, actions }: { tile: Tile; spec: Spec; answer?: Answer; picked?: string | null; onPick?: (value: string) => void; actions?: React.ReactNode }) {
  const [table, setTable] = useState(false);
  const kind = answer && !isError(answer) ? resolveKind(spec.chart, answer) : spec.chart;
  const isKpi = kind === "kpi";
  return (
    <section className={`card flex min-w-0 flex-col p-4 ${SPAN[tile.w]}`} aria-label={spec.title}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`truncate font-semibold tracking-tight text-ink ${isKpi ? "text-[13px] text-ink-2" : "text-[14.5px]"}`} title={spec.title}>{spec.title}</h3>
          {tile.note && !isKpi && <p className="truncate text-[12px] text-muted">{tile.note}</p>}
        </div>
        {!isKpi && answer && !isError(answer) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {actions}
            <button type="button" className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setTable((x) => !x)} aria-pressed={table}>{table ? "Chart" : "Table"}</button>
            <button type="button" className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink" onClick={() => downloadCsv(answer, spec.title ?? "report", spec.grain)} title="Download the numbers (opens in Excel)">CSV</button>
          </div>
        )}
      </div>
      <div className={isKpi ? "mt-2" : "mt-3 min-h-0 flex-1"}>
        {!answer ? <div className={`animate-pulse rounded-lg bg-surface-2 ${isKpi ? "h-12" : "h-[260px]"}`} />
          : isError(answer) ? <p className="text-[13px] text-high">{answer.error}</p>
          : <Chart result={answer} kind={table ? "table" : spec.chart} grain={spec.grain} height={tile.w === 12 ? 300 : 280} picked={picked} onPick={onPick} />}
      </div>
    </section>
  );
}
