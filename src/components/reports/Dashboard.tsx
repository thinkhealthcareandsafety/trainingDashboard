"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { type Grain, datasetOf, fieldOf, measureOf } from "@/lib/analytics/model";
import { DASHBOARDS, type DashboardDef, type DashFilter, type Tile, titleOf } from "@/lib/analytics/dashboards";
import type { Compare, Filter, Spec } from "@/lib/analytics/query";
import { Chart, Kpi, downloadCsv, labelOf, resolveKind } from "./Chart";
import { type Answer, MultiSelect, PeriodSelect, type Rule, isError, rangeOfKey, ruleSummary, runSpecs, useFieldList, useFieldValues, withPeriod } from "./shared";

/*
 * A dashboard: period, comparison, a Filters panel and saved views over the tiles. Every filter reaches every tile
 * whose data has that field. Clicking a bar / slice / month filters all the OTHER tiles to it (that tile just
 * highlights it). What's active shows as chips (× removes one; Esc clears the picked bar). Layout (owner, 27 Oct: "it
 * feels too congested"): KPIs side by side share one band, the other tiles sit under section headings, each tile's
 * tools are in a ⋯ menu — incl. "Change this chart" (measure, split, top N, grouping: Power BI's field parameters).
 */

type Pick = { tileId: string; field: string; value: string; label: string; grain?: Spec["grain"] };
/** One filter's state: ticked values (is / is not), or text it contains, or a min–max (ranges). */
export type FState = Rule & { values: string[]; min?: number; max?: number };
/** Compared with: the same days last year (default), the period before, nothing, or another group. */
export type CompareMode = "lastYear" | "previous" | "none" | { field: string; a: string[]; b: string[] };
/** "Change this chart" on one tile (kept in this browser). */
type Tweak = { measure?: string; by?: string; limit?: number; grain?: Grain };
/** What a saved view keeps. */
type ViewState = { period: string; filters: Record<string, FState>; compare: CompareMode; grain?: Grain };
type View = { name: string; state: ViewState };

const fActive = (f?: FState) => Boolean(f && (f.values.length || f.contains?.trim() || f.min !== undefined || f.max !== undefined));

export function tweaked(tile: Tile, tweak?: Tweak): Spec {
  if (!tweak) return tile.spec;
  const s = { ...tile.spec };
  if (tweak.measure) s.measures = [tweak.measure];
  if (tweak.by && s.by?.length === 1 && tweak.by !== s.by[0]) {
    const d = datasetOf(s.dataset)!;
    s.by = [tweak.by];
    if (!s.analysis) s.chart = tweak.by === d.dateField ? "column" : "bar";
    if (tweak.by !== d.dateField) s.sort = undefined;
  }
  if (tweak.limit !== undefined) s.limit = tweak.limit || undefined;
  if (tweak.grain) s.grain = tweak.grain;
  return s;
}

export function compose(tile: Tile, today: string, periodKey: string, filters: Record<string, FState>, pick: Pick | null, compare: CompareMode = "previous", tweak?: Tweak, grain?: Grain): Spec {
  let base = tweaked(tile, tweak);
  const d = datasetOf(base.dataset)!;
  // Show-by (owner, 29 Oct) reaches every time chart but the goal ones (the goal is monthly) — and the title follows it.
  if (grain && !tile.fixedGrain && !tile.goalLine && base.by?.[0] === d.dateField && grain !== base.grain) {
    const word = { day: "day", week: "week", month: "month", quarter: "quarter", fy: "year" }[grain];
    base = { ...base, grain, title: base.title?.includes("{grain}") ? base.title : base.title?.replace(/\b(month|quarter)\b/, word) };
  }
  if (base.title?.includes("{grain}")) base = { ...base, title: titleOf(base) };
  const has = (f: string) => Boolean(fieldOf(d, f));
  const isRange = (f: string) => Boolean(d.ranges?.some((r) => r.key === f));
  const list: Filter[] = [...(base.filters ?? [])];
  for (const [field, f] of Object.entries(filters)) {
    if (!fActive(f)) continue;
    if (isRange(field) && (f.min !== undefined || f.max !== undefined)) list.push({ field, values: [], min: f.min, max: f.max });
    else if (has(field)) list.push({ field, values: f.contains?.trim() ? [] : f.values, exclude: f.exclude || undefined, contains: f.contains?.trim() || undefined });
  }
  let spec: Spec = tile.fixedPeriod ? withPeriod(base, today) : withPeriod(base, today, periodKey);
  if (pick && pick.tileId !== tile.id) {
    if (pick.field === "date") {
      const r = rangeOfKey(pick.value, pick.grain);
      if (r && !tile.fixedPeriod) spec = { ...spec, from: r.from, to: r.to };
    } else if (has(pick.field)) list.push({ field: pick.field, values: [pick.value] });
  }
  const cmp: Compare | undefined = compare === "none" || tile.noCompare ? undefined : typeof compare === "object" ? (has(compare.field) ? compare : undefined) : compare;
  return { ...spec, filters: list, compare: cmp };
}

const readTweaks = (id: string): Record<string, Tweak> => { try { return JSON.parse(localStorage.getItem(`th.reports.tweaks.${id}`) || "{}"); } catch { return {}; } };

/**
 * Pages (owner, 27 Oct: "add pagination in the reports, only fetch data when clicked"): one per section, in order of
 * first appearance (tiles before the first section: "Key numbers"). A dashboard without sections (My dashboard) is cut
 * into pages of about six charts — a band of numbers counts as one.
 */
type Page = { name: string; tiles: Tile[]; half?: Set<string> };
function pagesOf(def: DashboardDef): Page[] {
  const tiles = def.tiles;
  // Pages set by hand (the team's dashboards): as they were arranged, nothing added.
  if (def.pages) return def.pages.map((p) => ({ name: p.name, tiles: p.tiles.map((id) => tiles.find((t) => t.id === id)).filter((t): t is Tile => Boolean(t)) }));
  if (tiles.some((t) => t.section)) {
    const pages: Page[] = [];
    for (const t of tiles) {
      const name = t.section ?? pages.at(-1)?.name ?? "Key numbers";
      const p = pages.find((x) => x.name === name);
      if (p) p.tiles.push(t);
      else pages.push({ name, tiles: [t] });
    }
    // Owner, 28 Oct: "some reports should be shown along with the kpis". A numbers-only first page also shows the next
    // sections' first two charts, half width side by side (they stay on their own page too; one answer serves both).
    const [first, ...rest] = pages;
    if (first && rest.length && first.tiles.every((t) => t.spec.chart === "kpi")) {
      const two = rest.flatMap((p) => p.tiles).filter((t) => t.spec.chart !== "kpi").slice(0, 2);
      first.tiles.push(...two);
      first.half = new Set(two.map((t) => t.id));
    }
    return pages;
  }
  const pages: Page[] = [];
  let room = 0;
  for (const t of tiles) {
    const weight = t.spec.chart === "kpi" ? 0.25 : 1;
    if (!pages.length || room < weight) { pages.push({ name: `Page ${pages.length + 1}`, tiles: [] }); room = 6; }
    pages.at(-1)!.tiles.push(t);
    room -= weight;
  }
  return pages;
}
const readPage = (id: string) => { try { return Number(localStorage.getItem(`th.reports.page.${id}`)) || 0; } catch { return 0; } };

/*
 * Owner, 29 Oct: "the filters remain the same in all dashboards" — period, compare, Show-by and filters are one set for
 * every tab (this browser). A dashboard's own starting filters (Defibtech: Brand = Defibtech) stay with that dashboard
 * — its "scope", so they never reach Sales.
 */
const GLOBAL = "th.reports.state";
const scopeKey = (id: string) => `th.reports.scope.${id}`;
const readJson = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const readScope = (def: DashboardDef): Record<string, FState> => readJson<Record<string, FState>>(scopeKey(def.id)) ?? { ...def.start };
const readState = (def: DashboardDef): ViewState => {
  const g = readJson<Partial<ViewState>>(GLOBAL) ?? {};
  return { period: g.period ?? def.period, compare: g.compare ?? "lastYear", grain: g.grain, filters: { ...(g.filters ?? {}), ...readScope(def) } };
};
const writeState = (def: DashboardDef, st: ViewState) => {
  // The dashboard's scope fields (its starting ones, and any it still has) stay its own; the rest is everyone's.
  const scoped = new Set([...Object.keys(def.start ?? {}), ...Object.keys(readJson<Record<string, FState>>(scopeKey(def.id)) ?? {})]);
  const mine = Object.fromEntries(Object.entries(st.filters).filter(([k]) => scoped.has(k)));
  const rest = Object.fromEntries(Object.entries(st.filters).filter(([k]) => !scoped.has(k)));
  try {
    localStorage.setItem(GLOBAL, JSON.stringify({ ...st, filters: rest }));
    if (scoped.size) localStorage.setItem(scopeKey(def.id), JSON.stringify(Object.fromEntries([...scoped].map((k) => [k, mine[k] ?? { values: [] }]))));
  } catch {}
};
/** A filter's name wherever it was set (a filter set on another tab shows here as a chip too). */
const filterLabel = (def: DashboardDef, field: string) => def.filters.find((f) => f.field === field)?.label ?? DASHBOARDS.flatMap((d) => d.filters).find((f) => f.field === field)?.label ?? field;

/** `tools`: extra buttons at the right end of the toolbar (My dashboard: Customise). */
export function DashboardView({ def, today, tools }: { def: DashboardDef; today: string; tools?: React.ReactNode }) {
  const [period, setPeriod] = useState(() => readState(def).period);
  const [filters, setFilters] = useState<Record<string, FState>>(() => readState(def).filters);
  const [compare, setCompare] = useState<CompareMode>(() => readState(def).compare);
  const [grain, setGrain] = useState<Grain | undefined>(() => readState(def).grain);
  const [pick, setPick] = useState<Pick | null>(null);
  const [tweaks, setTweaks] = useState<Record<string, Tweak>>(() => readTweaks(def.id));
  // Each tile's last answer and the exact query it answers — kept when you change page, so going back costs nothing.
  const [got, setGot] = useState<Record<string, { key: string; a: Answer }>>({});
  const asking = useRef(new Set<string>());
  const [busy, setBusy] = useState(0);
  const pages = useMemo(() => pagesOf(def), [def]);
  const [page, setPageRaw] = useState(() => readPage(def.id));
  const at = Math.min(page, pages.length - 1);
  const setPage = (i: number) => { setPageRaw(i); try { localStorage.setItem(`th.reports.page.${def.id}`, String(i)); } catch {} };
  const [goal, setGoal] = useState<number | undefined>();
  useEffect(() => { if (def.tiles.some((t) => t.goalLine)) fetch("/api/analytics/goal").then((r) => r.json()).then((g) => setGoal(typeof g.monthly === "number" ? g.monthly : undefined)).catch(() => {}); }, [def]);
  useEffect(() => { const st = readState(def); setPeriod(st.period); setFilters(st.filters); setCompare(st.compare); setGrain(st.grain); setPick(null); setGot({}); setPageRaw(readPage(def.id)); setTweaks(readTweaks(def.id)); }, [def]);
  useEffect(() => { try { localStorage.setItem(`th.reports.tweaks.${def.id}`, JSON.stringify(tweaks)); } catch {} }, [tweaks, def.id]);

  // "All time" has no period before it — comparing would quietly do nothing, so it's off (and the menu hidden).
  const cmpMode: CompareMode = period === "all" ? "none" : compare;
  const specs = useMemo(() => def.tiles.map((t) => compose(t, today, period, filters, pick, cmpMode, tweaks[t.id], grain)), [def, today, period, filters, pick, cmpMode, tweaks, grain]);
  const keys = useMemo(() => specs.map((s) => JSON.stringify(s)), [specs]);
  // Only the open page asks the server, and only for tiles whose query changed (period, filters, a picked bar…).
  useEffect(() => {
    const want = (pages[at]?.tiles ?? []).map((t) => ({ t, i: def.tiles.indexOf(t) }))
      .filter(({ t, i }) => got[t.id]?.key !== keys[i] && !asking.current.has(`${t.id}|${keys[i]}`));
    if (!want.length) return;
    for (const { t, i } of want) asking.current.add(`${t.id}|${keys[i]}`);
    setBusy((b) => b + 1);
    runSpecs(want.map(({ i }) => specs[i])).then((j) => {
      setGot((g) => ({ ...g, ...Object.fromEntries(want.map(({ t, i }, n) => [t.id, { key: keys[i], a: j.results[n] }])) }));
    }).finally(() => {
      for (const { t, i } of want) asking.current.delete(`${t.id}|${keys[i]}`);
      setBusy((b) => b - 1);
    });
  }, [pages, at, def, specs, keys, got]);
  const loading = busy > 0;
  const pageTop = useRef<HTMLDivElement>(null);
  // Opening a page asks for its tiles; clicking it again retries any that failed. From the bottom buttons, back to its top.
  const goTo = (i: number, scroll = false) => {
    const failed = (pages[i]?.tiles ?? []).filter((t) => isError(got[t.id]?.a)).map((t) => t.id);
    if (failed.length) setGot((g) => Object.fromEntries(Object.entries(g).filter(([id]) => !failed.includes(id))));
    setPage(i);
    setPick(null);
    if (scroll) requestAnimationFrame(() => pageTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  // A tile shows its last answer while a new one is on its way ("Updating…").
  const answers: Record<string, Answer> = Object.fromEntries(Object.entries(got).map(([id, v]) => [id, v.a]));
  useEffect(() => {
    if (!pick) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setPick(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pick]);

  const firstDatasetWith = (field: string) => def.tiles.map((t) => t.spec.dataset).find((k) => fieldOf(datasetOf(k)!, field));
  const chosen: DashFilter[] = Object.keys(filters).filter((k) => fActive(filters[k])).map((k) => def.filters.find((f) => f.field === k) ?? { field: k, label: filterLabel(def, k) });
  // The other active filters a field's list can take (its own data must have them).
  const othersFor = (field: string): Filter[] => {
    const d = datasetOf(firstDatasetWith(field) ?? "");
    if (!d) return [];
    return Object.entries(filters).filter(([k, f]) => k !== field && fActive(f) && fieldOf(d, k) && f.values.length + (f.contains?.trim() ? 1 : 0) > 0)
      .map(([k, f]) => ({ field: k, values: f.contains?.trim() ? [] : f.values, exclude: f.exclude || undefined, contains: f.contains?.trim() || undefined }));
  };
  const specOf = (t: Tile) => specs[def.tiles.indexOf(t)];
  const setF = (field: string, patch: Partial<FState>) => setFilters((s) => ({ ...s, [field]: { ...(s[field] ?? { values: [] }), ...patch } }));

  // The open page's tiles, in runs: KPIs next to each other share one band and the charts go in the grid. (The page
  // pill names the section, so no heading above it.)
  const groups: { section?: string; runs: { kpi: boolean; tiles: Tile[] }[] }[] = [];
  for (const t of pages[at]?.tiles ?? []) {
    const kpi = t.spec.chart === "kpi";
    let g = groups.at(-1);
    const section = pages[at]?.half?.has(t.id) ? "with the numbers" : t.section; // the two charts on Key numbers share a row
    if (!g || g.section !== section) groups.push((g = { section, runs: [] }));
    const run = g.runs.at(-1);
    if (run && run.kpi === kpi) run.tiles.push(t);
    else g.runs.push({ kpi, tiles: [t] });
  }
  const pickFrom = (t: Tile) => (value: string) => {
    const s = specOf(t);
    const field = s.by?.[0];
    if (!field) return;
    if (pick && pick.tileId === t.id && pick.value === value) return setPick(null);
    const a = answers[t.id];
    const date = !isError(a) && a?.by[0]?.date;
    setPick({ tileId: t.id, field, value, grain: s.grain, label: labelOf(value, Boolean(date), s.grain ?? "month", true) });
  };
  const footnote = cmpMode === "none" ? null
    : typeof cmpMode === "object" ? `▲ ▼ ${groupLabel(cmpMode.a)} against ${groupLabel(cmpMode.b)} — same dates; charts show both.`
    : `▲ ▼ against the same days ${cmpMode === "lastYear" ? "last year" : "of the period before"} (grey on the charts) — hover a number for the dates.`;
  // Filters this tile's data doesn't have (owner, 28 Oct: "if I use the filters I don't think the reports are
  // changing" — they skipped such tiles silently). Named on the tile instead.
  const skippedOf = (t: Tile) => {
    const d = datasetOf(t.spec.dataset)!;
    const out = chosen.filter((f) => !fieldOf(d, f.field) && !(f.range && d.ranges?.some((r) => r.key === f.field))).map((f) => f.label);
    if (pick && pick.tileId !== t.id && pick.field !== "date" && !fieldOf(d, pick.field)) out.push(`“${pick.label}”`);
    return out;
  };
  const viewState: ViewState = { period, filters, compare, grain };
  // Not on the first render of a tab: its state was just read, and writing it back before the reset effect ran would
  // copy the last tab's filters into this one's scope.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current !== def.id) { shown.current = def.id; return; }
    writeState(def, { period, filters, compare, grain });
  }, [def, period, filters, compare, grain]);

  return (
    <div>
      <div className="relative flex flex-wrap items-center gap-2">
        <PeriodSelect today={today} value={period} onChange={setPeriod} />
        {/* A dashboard that never compares (Defibtech) doesn't offer it. */}
        {def.tiles.some((t) => !t.noCompare) && period !== "all" && <CompareControl def={def} value={compare} onChange={setCompare} datasetOf={firstDatasetWith} />}
        {def.tiles.some((t) => t.spec.by?.[0] === datasetOf(t.spec.dataset)?.dateField && !t.fixedGrain && !t.goalLine) && <GrainSwitch value={grain} onChange={(g) => { setGrain(g); setPick(null); }} />}
        <FiltersButton count={chosen.length}>
          {def.filters.map((f) => f.range
            ? <RangeControl key={f.field} label={f.label} value={filters[f.field]} onChange={(min, max) => setF(f.field, { min, max })} />
            : <FilterControl key={f.field} dataset={firstDatasetWith(f.field)} field={f.field} label={f.label} state={filters[f.field]} others={othersFor(f.field)} onChange={(patch) => setF(f.field, patch)} />)}
        </FiltersButton>
        <ViewsButton dash={def.id} current={viewState} onApply={(v) => { setPeriod(v.period); setFilters(v.filters ?? {}); setCompare(v.compare ?? "lastYear"); setGrain(v.grain ?? def.grains); setPick(null); }} />
        {/* What's active, one chip each — × removes it. */}
        {chosen.map((f) => (
          <Chip key={f.field} onClear={() => setFilters((s) => { const n = { ...s }; delete n[f.field]; return n; })} title={filters[f.field].values.join(", ")}>
            <span className="text-muted">{f.label}:</span> <b className="font-semibold">{chipText(f, filters[f.field])}</b>
          </Chip>
        ))}
        {pick && (
          <Chip onClear={() => setPick(null)} title="Click it again, × or Esc to clear">
            <span className="text-muted">Showing</span> <b className="font-semibold">{pick.label}</b>
          </Chip>
        )}
        {chosen.length + (pick ? 1 : 0) > 1 && <button type="button" className="h-9 rounded-full px-3 text-[15.5px] font-semibold text-brand hover:bg-brand-soft" onClick={() => { setFilters({}); setPick(null); }}>Clear all</button>}
        {loading && <span className="text-[15.5px] text-muted" aria-live="polite">Updating…</span>}
        {tools && <div className="ml-auto flex items-center gap-2">{tools}</div>}
      </div>

      {pages.length > 1 && (
        <nav className="mt-4 flex flex-wrap items-center gap-1" aria-label="Pages of this dashboard">
          {pages.map((p, i) => (
            <button key={`${i}-${p.name}`} type="button" aria-current={i === at ? "page" : undefined} onClick={() => goTo(i)}
              className={`rounded-full px-3.5 py-1.5 text-[15.5px] font-medium transition ${i === at ? "bg-brand-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>{p.name}</button>
          ))}
        </nav>
      )}

      <div ref={pageTop} className="scroll-mt-4">
      {groups.map((g, gi) => (
        <Fragment key={`${g.section ?? ""}-${gi}`}>
          {g.runs.map((run, ri) => {
            const top = gi === 0 && ri === 0;
            if (run.kpi) return (
              <Fragment key={ri}>
                <KpiBand tiles={run.tiles} specOf={specOf} answers={answers} skippedOf={skippedOf} className={top ? "mt-5" : "mt-4"} />
                {/* Not under numbers that are never compared (stock: today's). */}
                {gi === 0 && ri === 0 && footnote && run.tiles.some((t) => !t.noCompare) && <p className="mt-2 text-[14.5px] text-faint">{footnote}</p>}
              </Fragment>
            );
            return (
              <div key={ri} className={`grid grid-cols-12 gap-4 ${top ? "mt-5" : "mt-4"}`}>
                {run.tiles.map((t) => (
                  <TileCard key={t.id} tile={pages[at]?.half?.has(t.id) ? { ...t, w: 6, tall: false } : t} spec={specOf(t)} answer={answers[t.id]} accent={def.tiles.indexOf(t)}
                    picked={pick?.tileId === t.id ? pick.value : null} onPick={pickFrom(t)}
                    target={t.goalLine && (specOf(t).grain ?? "month") === "month" ? goal : undefined}
                    skipped={skippedOf(t)} tweak={tweaks[t.id]} onTweak={(tw) => { setPick(null); setTweaks((s) => { const n = { ...s }; if (tw) n[t.id] = tw; else delete n[t.id]; return n; }); }} />
                ))}
              </div>
            );
          })}
        </Fragment>
      ))}
      </div>

      {pages.length > 1 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          {at > 0 ? <button type="button" className="rounded-full px-4 py-2 text-[16px] font-medium text-ink-2 hover:bg-surface-2" onClick={() => goTo(at - 1, true)}>← {pages[at - 1].name}</button> : <span />}
          <span className="text-[15px] text-faint">Page {at + 1} of {pages.length}</span>
          {at < pages.length - 1 ? <button type="button" className="rounded-full bg-surface px-4 py-2 text-[16px] font-semibold text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)] hover:bg-surface-2" onClick={() => goTo(at + 1, true)}>{pages[at + 1].name} →</button> : <span />}
        </div>
      )}
    </div>
  );
}

const groupLabel = (values: string[]) => (values.length <= 2 ? values.join(" + ") : `${values[0]} + ${values.length - 1} more`);
const lakh = (n: number) => `₹${(Math.round((n / 1e5) * 100) / 100).toLocaleString("en-IN")}L`;
function chipText(f: DashFilter, s: FState): string {
  if (f.range) return s.min !== undefined && s.max !== undefined ? `${lakh(s.min)} – ${lakh(s.max)}` : s.min !== undefined ? `${lakh(s.min)} or more` : `up to ${lakh(s.max!)}`;
  return ruleSummary(s.values, s);
}

/** "Show by Week | Month | Quarter | Year" (owner, 29 Oct) — regroups every time chart on the dashboard. */
function GrainSwitch({ value, onChange }: { value?: Grain; onChange: (g: Grain | undefined) => void }) {
  const opts: [Grain | undefined, string][] = [[undefined, "As set"], ["week", "Week"], ["month", "Month"], ["quarter", "Quarter"], ["fy", "Year"]];
  return (
    <div className="inline-flex h-10 items-center rounded-full border border-line bg-surface p-0.5" role="group" aria-label="Show by">
      <span className="px-3 text-[15px] text-muted">Show by</span>
      {opts.map(([g, label]) => (
        <button key={g ?? "auto"} type="button" aria-pressed={value === g} hidden={g === undefined && value === undefined} onClick={() => onChange(g)} title={g === "fy" ? "Financial year (April–March)" : g === undefined ? "Each chart as the dashboard has it" : undefined}
          className={`h-full rounded-full px-3.5 text-[15.5px] font-medium transition ${value === g ? "bg-brand-soft text-ink" : "text-muted hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

/** "Compare: Last year ▾" — or two groups of one field (e.g. Aviation vs IT), picked in a small panel. */
function CompareControl({ def, value, onChange, datasetOf: dsOf }: { def: DashboardDef; value: CompareMode; onChange: (v: CompareMode) => void; datasetOf: (field: string) => string | undefined }) {
  const fields = def.filters.filter((f) => !f.range);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ field: string; a: string[]; b: string[] }>(() => (typeof value === "object" ? value : { field: fields[0]?.field ?? "", a: [], b: [] }));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const sel = typeof value === "object" ? "groups" : value;
  const a = useFieldValues(dsOf(draft.field), draft.field, open);
  return (
    <div ref={box}>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Compare with</span>
        <select className="h-10 appearance-none rounded-full border border-line bg-surface pl-5 pr-10 text-[16px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          value={sel} onChange={(e) => { const v = e.target.value; if (v === "groups") setOpen(true); else { setOpen(false); onChange(v as CompareMode); } }}>
          <option value="lastYear">vs last year</option>
          <option value="previous">vs period before</option>
          <option value="groups">{typeof value === "object" ? `${groupLabel(value.a)} vs ${groupLabel(value.b)}` : "Two groups…"}</option>
          <option value="none">No comparison</option>
        </select>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-4 size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
      </label>
      {typeof value === "object" && !open && <button type="button" className="ml-1 text-[15.5px] font-semibold text-brand hover:underline" onClick={() => setOpen(true)}>Change</button>}
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-full max-w-[620px] rounded-2xl border border-line bg-surface p-4 shadow-pop" role="group" aria-label="Compare two groups">
          <p className="text-[16px] font-semibold text-ink">Compare two groups</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <label className="relative inline-flex items-center">
              <span className="sr-only">Field</span>
              <select className="h-10 w-full appearance-none rounded-full border border-line bg-surface pl-4 pr-9 text-[16px] text-ink focus:border-brand focus:outline-none" value={draft.field} onChange={(e) => setDraft({ field: e.target.value, a: [], b: [] })}>
                {fields.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
              </select>
              <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3.5 size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
            </label>
            <MultiSelect wide label="A" values={a} loading={!a.length} selected={draft.a} onChange={(v) => setDraft((d) => ({ ...d, a: v }))} />
            <MultiSelect wide label="B" values={a} loading={!a.length} selected={draft.b} onChange={(v) => setDraft((d) => ({ ...d, b: v }))} />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" className="h-9 rounded-full px-4 text-[15.5px] font-medium text-muted hover:bg-surface-2" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" disabled={!draft.a.length || !draft.b.length} className="h-9 rounded-full bg-brand px-4 text-[15.5px] font-semibold text-brand-ink disabled:opacity-40"
              onClick={() => { onChange({ ...draft }); setOpen(false); }}>Compare</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Invoice value: from ₹ … to ₹ … lakh". */
function RangeControl({ label, value, onChange }: { label: string; value?: FState; onChange: (min?: number, max?: number) => void }) {
  const toL = (n?: number) => (n === undefined ? "" : String(Math.round((n / 1e5) * 100) / 100));
  const [lo, setLo] = useState(toL(value?.min));
  const [hi, setHi] = useState(toL(value?.max));
  useEffect(() => { setLo(toL(value?.min)); setHi(toL(value?.max)); }, [value?.min, value?.max]);
  const commit = (l: string, h: string) => {
    const n = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) || Number(s) < 0 ? undefined : Number(s) * 1e5);
    onChange(n(l), n(h));
  };
  const box = "h-10 w-full min-w-0 rounded-full border border-line bg-surface px-3.5 text-[16px] text-ink placeholder:text-faint focus:border-brand focus:outline-none";
  return (
    <div className="flex items-center gap-2 sm:col-span-2">
      <span className="shrink-0 pl-1 text-[16px] text-muted">{label} (₹ lakh):</span>
      <input className={box} inputMode="decimal" placeholder="from" aria-label={`${label} from, in lakh`} value={lo} onChange={(e) => setLo(e.target.value)} onBlur={() => commit(lo, hi)} onKeyDown={(e) => e.key === "Enter" && commit(lo, hi)} />
      <span className="text-muted">–</span>
      <input className={box} inputMode="decimal" placeholder="to" aria-label={`${label} to, in lakh`} value={hi} onChange={(e) => setHi(e.target.value)} onBlur={() => commit(lo, hi)} onKeyDown={(e) => e.key === "Enter" && commit(lo, hi)} />
    </div>
  );
}

/** "Views": save the period + filters + comparison under a name (per person, on the server) and bring them back. */
function ViewsButton({ dash, current, onApply }: { dash: string; current: ViewState; onApply: (v: ViewState) => void }) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<View[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch("/api/analytics/prefs").then((r) => r.json()).then((j) => setViews(j.views?.[dash] ?? [])).catch(() => setViews([])); }, [dash]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const save = async (list: View[]) => {
    setError("");
    const r = await fetch("/api/analytics/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dash, views: list }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    if (!r?.ok || j.error) return setError(j.error ?? "Couldn't save"), false;
    setViews(j.views);
    return true;
  };
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (await save([...(views ?? []).filter((v) => v.name !== n), { name: n, state: current }])) setName("");
  };
  return (
    <div ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[16px] font-medium text-ink-2 transition hover:border-line-strong">
        <svg viewBox="0 0 20 20" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M5.5 3.5h9v13l-4.5-3-4.5 3z" strokeLinejoin="round" /></svg>
        Views{views?.length ? <span className="text-muted">· {views.length}</span> : null}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-full max-w-[400px] rounded-2xl border border-line bg-surface p-3 shadow-pop" role="group" aria-label="Saved views">
          <p className="px-1 text-[15px] text-muted">Your saved views of this dashboard — only you see them.</p>
          <div className="mt-2 grid gap-0.5">
            {!views?.length && <p className="px-1 py-1.5 text-[15.5px] text-faint">None yet.</p>}
            {views?.map((v) => (
              <div key={v.name} className="flex items-center gap-1 rounded-lg hover:bg-surface-2">
                <button type="button" className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-[16px] text-ink" onClick={() => { onApply(v.state); setOpen(false); }}>{v.name}</button>
                <button type="button" aria-label={`Delete ${v.name}`} className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-high" onClick={() => save(views.filter((x) => x.name !== v.name))}>×</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 border-t border-line pt-3">
            <input className="h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-[16px] text-ink placeholder:text-faint focus:border-brand focus:outline-none" placeholder="Name this view, e.g. Hotels vs last year" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button type="button" disabled={!name.trim()} className="h-9 shrink-0 rounded-full bg-brand px-4 text-[15.5px] font-semibold text-brand-ink disabled:opacity-40" onClick={add}>Save</button>
          </div>
          {error && <p className="mt-2 px-1 text-[15px] text-high">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Columns that leave no half-empty row: 4 → 4 / 2, 6 → 3 / 2, 8 → 4 / 2 (phones always 2).
const BAND_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4", 6: "grid-cols-2 xl:grid-cols-3", 8: "grid-cols-2 xl:grid-cols-4" };

/** Numbers side by side in one card, parted by hairlines (the grid's 1 px gaps over the line colour). */
function KpiBand({ tiles, specOf, answers, skippedOf, className = "" }: { tiles: Tile[]; specOf: (t: Tile) => Spec; answers: Record<string, Answer>; skippedOf?: (t: Tile) => string[]; className?: string }) {
  return (
    <section className={`card overflow-hidden ${className}`} aria-label="Key numbers">
      <div className={`grid gap-px bg-line ${BAND_COLS[tiles.length] ?? "grid-cols-2 xl:grid-cols-4"}`}>
        {tiles.map((t) => {
          const a = answers[t.id];
          const def = measureOf(datasetOf(t.spec.dataset)!, t.spec.measures[0])?.def;
          return (
            <div key={t.id} className="min-w-0 bg-surface px-5 py-4">
              <h3 className="truncate text-[16px] font-medium text-ink-2" title={def ? `${specOf(t).title} — ${def}` : specOf(t).title}>{specOf(t).title}</h3>
              <div className="mt-1.5">
                {!a ? <div className="h-[62px] animate-pulse rounded-lg bg-surface-2" />
                  : isError(a) ? <p className="text-[15px] text-high">{a.error}</p>
                  : <Kpi result={a} compact />}
              </div>
              <Skipped labels={skippedOf?.(t)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** "Not filtered by Sector" — a filter that can't reach this tile's data. */
function Skipped({ labels }: { labels?: string[] }) {
  if (!labels?.length) return null;
  const list = labels.join(", ");
  return <p className="mt-1 truncate text-[14px] text-faint" title={`This report's data has no ${list} — it shows everything for that.`}>Not filtered by {list}</p>;
}

function Chip({ children, onClear, title }: { children: React.ReactNode; onClear: () => void; title?: string }) {
  return (
    <span className="inline-flex h-9 max-w-[280px] items-center gap-1 rounded-full bg-brand-soft pl-3.5 pr-1.5 text-[15.5px] text-ink" title={title}>
      <span className="truncate">{children}</span>
      <button type="button" aria-label="Remove" className="grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" onClick={onClear}>×</button>
    </span>
  );
}

/**
 * "Filters" → a panel with every filter of this dashboard. Its lists load the first time it's opened (owner, 27 Oct:
 * "only fetch data when clicked"), then stay mounted, so each list loads once.
 */
function FiltersButton({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  useEffect(() => { if (open) setOpened(true); }, [open]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    // Esc inside a filter's own list closes that list first.
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !box.current?.querySelector("input:focus")) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    // The panel hangs from the toolbar row, not the button: anchored to the button it ran off narrow screens.
    <div ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[16px] font-medium transition ${count ? "border-brand/50 bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}>
        <svg viewBox="0 0 20 20" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 5h14M6 10h8M8.5 15h3" strokeLinecap="round" /></svg>
        Filters
        {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[14px] font-semibold text-brand-ink">{count}</span>}
      </button>
      <div className={`absolute left-0 top-full z-40 mt-2 w-full max-w-[620px] rounded-2xl border border-line bg-surface p-4 shadow-pop ${open ? "" : "hidden"}`} role="group" aria-label="Filters">
        <div className="grid gap-2.5 sm:grid-cols-2">{opened && children}</div>
        <p className="mt-3 text-[14.5px] text-faint">Pick several values at once — each filter reaches every chart that has that field.</p>
      </div>
    </div>
  );
}

function FilterControl({ dataset, field, label, state, others, onChange }: { dataset?: string; field: string; label: string; state?: FState; others: Filter[]; onChange: (patch: Partial<FState>) => void }) {
  const list = useFieldList(dataset, field, others);
  // What's ticked stays in the list even when the other filters leave it out (so it can be unticked).
  const values = [...(state?.values ?? []).filter((v) => !list.values.includes(v)), ...list.values];
  return <MultiSelect wide label={label} values={values} selected={state?.values ?? []} onChange={(v) => onChange({ values: v })} loading={!list.loaded}
    rule={{ exclude: state?.exclude, contains: state?.contains }} onRule={(r) => onChange({ exclude: r.exclude, contains: r.contains })} />;
}

const SPAN: Record<Tile["w"], string> = { 3: "col-span-12 sm:col-span-6 xl:col-span-3", 4: "col-span-12 sm:col-span-6 xl:col-span-4", 6: "col-span-12 xl:col-span-6", 12: "col-span-12" };

export type MenuItem = { label: string; onClick: () => void; danger?: boolean };

export function TileCard({ tile, spec, answer, picked, onPick, menu = [], meta, accent, tweak, onTweak, target, skipped }: {
  tile: Tile; spec: Spec; answer?: Answer; picked?: string | null; onPick?: (value: string) => void;
  /** "Change this chart" (dashboards): what's changed on this tile, and how to change / reset it. */
  tweak?: Tweak; onTweak?: (t: Tweak | null) => void;
  /** Goal line (months against the goal). */
  target?: number;
  /** Active filters this tile's data can't take. */
  skipped?: string[];
  /** Extra ⋯ menu items (Edit / Delete on saved reports) — on every kind of tile, single numbers and failed ones too. */
  menu?: MenuItem[];
  /** A quiet line under the title (who saved it). */
  meta?: string;
  /** This chart's colour (a palette slot) — charts on a page take different hues. */
  accent?: number;
}) {
  const [table, setTable] = useState(false);
  const [editing, setEditing] = useState(false);
  const kind = answer && !isError(answer) ? resolveKind(spec.chart, answer) : spec.chart;
  const isKpi = kind === "kpi";
  const ok = answer && !isError(answer);
  // Analyses have a fixed shape; "what changed" can still switch its split.
  const canTweak = Boolean(onTweak) && !isKpi && tile.spec.by?.length === 1 && (!tile.spec.analysis || tile.spec.analysis === "drivers");
  // Changed here: the title says what it now shows.
  const title = tweak ? autoTitle(spec) : spec.title ?? "";
  const items: MenuItem[] = [
    ...(canTweak ? [{ label: "Change this chart…", onClick: () => setEditing(true) }] : []),
    ...(!isKpi && ok ? [
      { label: table ? "Show as chart" : "Show as table", onClick: () => setTable((x) => !x) },
      { label: "Download CSV (Excel)", onClick: () => downloadCsv(answer, title || "report", spec.grain) },
    ] : []),
    ...menu,
  ];
  const sub = meta ?? (tweak ? `Changed from “${titleOf(tile.spec)}”` : !isKpi ? tile.note : undefined);
  return (
    <section className={`card flex min-w-0 flex-col p-5 ${SPAN[tile.w]}`} aria-label={spec.title}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`truncate font-semibold tracking-tight text-ink ${isKpi ? "text-[16.5px] text-ink-2" : "text-[18.5px]"}`} title={title}>{title}</h3>
          <Skipped labels={skipped} />
          {sub && <p className="truncate text-[15px] text-muted">{sub}{tweak && onTweak && <> · <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onTweak(null)}>Reset</button></>}</p>}
        </div>
        {items.length > 0 && <TileMenu items={items} label={`${title || "Report"} options`} />}
      </div>
      {editing && canTweak && <TileSettings tile={tile} spec={spec} tweak={tweak} onChange={(t) => onTweak!(t)} onClose={() => setEditing(false)} />}
      <div className={isKpi ? "mt-2" : "mt-4 min-h-0 flex-1"}>
        {!answer ? <div className={`animate-pulse rounded-lg bg-surface-2 ${isKpi ? "h-14" : "h-[260px]"}`} />
          : isError(answer) ? <p className="text-[15px] text-high">{answer.error}</p>
          // Nothing to draw: say so, not empty axes at ₹0 (29 Oct).
          : !isKpi && answer.rows.every((r) => r.values.every((v) => !v) && !r.prev?.some((v) => v)) ? <p className="grid h-[200px] place-items-center rounded-lg bg-surface-2/60 px-4 text-center text-[15.5px] text-muted">Nothing here for these dates and filters</p>
          : <Chart result={answer} kind={table ? "table" : spec.chart} grain={spec.grain} height={tile.tall ? 470 : tile.w === 12 ? 300 : 280} picked={picked} onPick={onPick} accent={accent} target={target} relative={spec.relative === "first"} />}
      </div>
    </section>
  );
}

function TileMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="relative -mr-1.5 -mt-1 shrink-0">
      <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}
        className={`grid size-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink ${open ? "bg-surface-2 text-ink" : ""}`}>
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden><circle cx="4.5" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="15.5" cy="10" r="1.6" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-xl border border-line bg-surface p-1 shadow-pop">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[16px] ${it.danger ? "text-high hover:bg-high-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Revenue by sector" from the spec — for a tile changed with "Change this chart". */
function autoTitle(spec: Spec): string {
  const d = datasetOf(spec.dataset)!;
  const m = measureOf(d, spec.measures[0])?.label ?? "";
  const by = spec.by?.[0];
  if (!by) return m;
  if (by === d.dateField) return `${m} by ${{ day: "day", week: "week", month: "month", quarter: "quarter", fy: "year" }[spec.grain ?? "month"]}`;
  return `${m} by ${fieldOf(d, by)?.label.toLowerCase() ?? by}`;
}

function SettingSelect({ label, value, onPick, options }: { label: string; value: string; onPick: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="grid gap-1">
      <span className="text-[14.5px] font-medium text-muted">{label}</span>
      <span className="relative inline-flex items-center">
        <select className="h-9 w-full appearance-none rounded-full border border-line bg-surface pl-3.5 pr-8 text-[16px] text-ink focus:border-brand focus:outline-none" value={value} onChange={(e) => onPick(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
      </span>
    </label>
  );
}

/** Power BI's field parameters, plainly: what to measure, split by what, how many, grouped how — for this tile only. */
function TileSettings({ tile, spec, tweak, onChange, onClose }: { tile: Tile; spec: Spec; tweak?: Tweak; onChange: (t: Tweak | null) => void; onClose: () => void }) {
  const d = datasetOf(spec.dataset)!;
  const by = spec.by?.[0] ?? d.dateField;
  const isDate = by === d.dateField;
  const set = (patch: Tweak) => onChange({ ...tweak, ...patch });
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2/60 p-3" role="group" aria-label="Change this chart">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SettingSelect label="Measure" value={spec.measures[0]} onPick={(v) => set({ measure: v })} options={d.measures.map((m) => ({ value: m.key, label: m.label }))} />
        <SettingSelect label="Split by" value={by} onPick={(v) => set({ by: v })} options={[{ value: d.dateField, label: "Date" }, ...d.fields.filter((f) => f.key !== d.dateField).map((f) => ({ value: f.key, label: f.label }))]} />
        {isDate
          ? <SettingSelect label="Group by" value={spec.grain ?? "month"} onPick={(v) => set({ grain: v as Grain })} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "fy", label: "Financial year" }]} />
          : <SettingSelect label="Show" value={String(spec.limit ?? 0)} onPick={(v) => set({ limit: Number(v) })} options={[{ value: "5", label: "Top 5" }, { value: "7", label: "Top 7" }, { value: "10", label: "Top 10" }, { value: "20", label: "Top 20" }, { value: "0", label: "All" }]} />}
        <div className="flex items-end justify-end gap-1">
          {tweak && <button type="button" className="h-9 rounded-full px-3 text-[15.5px] font-medium text-muted hover:bg-surface hover:text-ink" onClick={() => onChange(null)}>Reset</button>}
          <button type="button" className="h-9 rounded-full bg-surface px-4 text-[15.5px] font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:bg-line" onClick={onClose}>Done</button>
        </div>
      </div>
      <p className="mt-2 text-[14px] text-faint">Only this chart, only for you (kept in this browser). Reset brings back “{titleOf(tile.spec)}”.</p>
    </div>
  );
}
