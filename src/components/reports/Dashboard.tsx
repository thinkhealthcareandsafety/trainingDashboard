"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { type Grain, datasetOf, fieldOf, formatValue, measureOf } from "@/lib/analytics/model";
import { DASHBOARDS, type DashboardDef, type DashFilter, type Tile, titleOf } from "@/lib/analytics/dashboards";
import { type CustomDash, type Ref, SIZE, type SavedRef, addItem, addPage, arrange, deletePage, fullness, movePage, moveToPage, refKey, removeItem, renamePage, tileOf } from "@/lib/analytics/custom";
import { Canvas, heightOf } from "./Canvas";
import { Library } from "./Editor";
import { btn } from "../ui";
import { BLANK, type Compare, type Filter, type Spec } from "@/lib/analytics/query";
import { Chart, Kpi, type Lines, downloadCsv, labelOf, resolveKind } from "./Chart";
import { type Answer, MultiSelect, PeriodSelect, type Rule, isError, rangeOfKey, ruleSummary, runSpecs, useFieldList, useFieldValues, withPeriod } from "./shared";

/*
 * A dashboard: period, comparison, a Filters panel and saved views over the tiles. Every filter reaches every tile
 * whose data has that field. Clicking a bar / slice / month filters all the OTHER tiles to it (that tile just
 * highlights it). What's active shows as chips (× removes one; Esc clears the picked bar). Layout (owner, 27 Oct: "it
 * feels too congested"): KPIs side by side share one band, the other tiles sit under section headings, each tile's
 * tools are in a ⋯ menu — incl. "Change this chart" (measure, split, top N, grouping: Power BI's field parameters).
 * Owner, 30 Oct: "whenever I apply a filter … there should be a save option … if it is on a view then saving on the
 * view" — once the filters differ from what's saved, Save / Discard show; on a dashboard they're my own saved filters
 * (it opens with them), on a view they update that view.
 */

type Pick = { tileId: string; field: string; value: string; label: string; grain?: Spec["grain"] };
/** One filter's state: ticked values (is / is not), or text it contains, or a min–max (ranges). */
export type FState = Rule & { values: string[]; min?: number; max?: number };
/** Compared with: the same days last year (default), the period before, nothing, or another group. */
export type CompareMode = "lastYear" | "previous" | "none" | { field: string; a: string[]; b: string[] };
/** "Change this chart" on one tile (kept in this browser). */
type Drill = { grain: Grain; from: string; to: string; label: string };
type Tweak = { measure?: string; by?: string; limit?: number; grain?: Grain; lines?: Lines };
/** A tweak that changes what the chart shows (not just lines on it) — then its title is made from the new shape. */
const reshapes = (t?: Tweak) => Boolean(t && (t.measure || t.by || t.limit !== undefined || t.grain));
/** What a saved view keeps. */
type ViewState = { period: string; filters: Record<string, FState>; compare: CompareMode; grain?: Grain };
type View = { name: string; state: ViewState };

const fActive = (f?: FState) => Boolean(f && (f.values.length || f.contains?.trim() || f.min !== undefined || f.max !== undefined));
/** The same filters, whatever order keys were written in and whatever empty filters are left over. */
const sorted = (x: unknown): unknown => Array.isArray(x) ? x.map(sorted)
  : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)])) : x;
const sameState = (def: DashboardDef, a: ViewState, b: ViewState) => {
  const key = (v: ViewState) => JSON.stringify(sorted({ period: v.period, compare: v.compare ?? "lastYear", grain: v.grain ?? def.grains ?? null, filters: Object.fromEntries(Object.entries(v.filters ?? {}).filter(([, f]) => fActive(f))) }));
  return key(a) === key(b);
};
/** A dashboard as it starts, before anyone saved filters on it. */
const startOf = (def: DashboardDef): ViewState => ({ period: def.period, compare: "lastYear", filters: { ...def.start } as Record<string, FState> });
const postPrefs = async (body: object): Promise<{ error?: string; views?: View[]; saved?: ViewState | null }> => {
  const r = await fetch("/api/analytics/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
  return !r?.ok && !j.error ? { error: "Couldn't save" } : j;
};

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
/** `extras`: false = the pages as defined (for editing — no charts repeated next to the numbers). */
export function pagesOf(def: DashboardDef, extras = true): Page[] {
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
    if (extras && first && rest.length && first.tiles.every((t) => t.spec.chart === "kpi")) {
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
/** My saved filters of a dashboard — a copy of the server's (`reportPrefs.saved`), so the tab opens with them at once. */
const savedKey = (id: string) => `th.reports.saved.${id}`;
const readJson = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const readScope = (def: DashboardDef): Record<string, FState> => readJson<Record<string, FState>>(scopeKey(def.id)) ?? { ...def.start };
const readState = (def: DashboardDef): ViewState => {
  const mine = readJson<ViewState>(savedKey(def.id));
  if (mine?.period) return { ...mine, compare: mine.compare ?? "lastYear", filters: mine.filters ?? {} };
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
/** Editing a dashboard in place: its copy, what changes it, the bar (name, Save, Cancel…) and the reports to add. */
export type EditCtl = { draft: CustomDash; onChange: (d: CustomDash) => void; bar: React.ReactNode; builtIns: DashboardDef[]; saved: SavedRef[] };

export function DashboardView({ def, today, tools, edit }: { def: DashboardDef; today: string; tools?: React.ReactNode; edit?: EditCtl }) {
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
  useEffect(() => { const st = readState(def); setPeriod(st.period); setFilters(st.filters); setCompare(st.compare); setGrain(st.grain); setPick(null); setGot({}); setPageRaw(readPage(def.id)); setTweaks(readTweaks(def.id)); setDrills({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);
  useEffect(() => { try { localStorage.setItem(`th.reports.tweaks.${def.id}`, JSON.stringify(tweaks)); } catch {} }, [tweaks, def.id]);

  // "All time" has no period before it — comparing would quietly do nothing, so it's off (and the menu hidden).
  const cmpMode: CompareMode = period === "all" ? "none" : compare;
  // Drill-down (owner, 29 Oct — phase 4): a click on a year shows its quarters on that chart, a quarter its months.
  const [drills, setDrills] = useState<Record<string, Drill[]>>({});
  const specs = useMemo(() => def.tiles.map((t) => {
    const s = compose(t, today, period, filters, pick, cmpMode, tweaks[t.id], grain);
    const dr = drills[t.id]?.at(-1);
    // The title follows the level ("Revenue by year" → "Revenue by quarter").
    return dr ? { ...s, grain: dr.grain, from: dr.from, to: dr.to, title: s.title?.replace(/\b(year|quarter|month|week)\b/, dr.grain) } : s;
  }), [def, today, period, filters, pick, cmpMode, tweaks, grain, drills]);
  const keys = useMemo(() => specs.map((s) => JSON.stringify(s)), [specs]);
  // Each number on the open page also comes month by month, for its small trend line (one more request a page).
  const sparkSpecs = useMemo(() => (pages[at]?.tiles ?? []).filter((t) => t.spec.chart === "kpi" && !t.fixedPeriod && !t.spec.analysis).map((t) => {
    const s = specs[def.tiles.indexOf(t)];
    return { id: t.id, spec: { ...s, by: [datasetOf(s.dataset)!.dateField], grain: "month" as Grain, chart: "line" as const, compare: undefined } };
  }), [pages, at, specs, def]);
  const [sparks, setSparks] = useState<{ key: string; by: Record<string, (number | null)[]> }>({ key: "", by: {} });
  const sparkKey = JSON.stringify(sparkSpecs);
  useEffect(() => {
    if (!sparkSpecs.length) return;
    let live = true;
    runSpecs(sparkSpecs.map((x) => x.spec)).then((j) => {
      if (!live) return;
      const by: Record<string, (number | null)[]> = {};
      j.results.forEach((r, i) => { if (r && !isError(r)) by[sparkSpecs[i].id] = r.rows.slice(-12).map((row) => row.values[0]); });
      setSparks({ key: sparkKey, by });
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sparkKey]);
  const sparkOf = (t: Tile) => (sparks.key === sparkKey ? sparks.by[t.id] : undefined);
  // "What changed" (owner, 29 Oct — phase 3): the tab's main number against the comparison, and the two biggest rises
  // and falls by one field — same period, filters, click and comparison as the reports below. Two small queries.
  const sumSpecs = useMemo(() => {
    const s = def.summary;
    if (!s || edit) return [];
    const tile = (extra: Partial<Spec>): Tile => ({ id: "__summary", w: 12, spec: { dataset: s.dataset, measures: [s.measure], chart: "kpi", ...extra } });
    const total = compose(tile({}), today, period, filters, pick, cmpMode, undefined, grain);
    if (cmpMode === "none" || typeof cmpMode === "object") return [total];
    return [total, compose(tile({ by: [s.by], analysis: "drivers", limit: 2, chart: "diverging" }), today, period, filters, pick, cmpMode, undefined, grain)];
  }, [def.summary, edit, today, period, filters, pick, cmpMode, grain]);
  const [summary, setSummary] = useState<{ key: string; a: Answer[] } | null>(null);
  const sumKey = JSON.stringify(sumSpecs);
  useEffect(() => {
    if (!sumSpecs.length) return;
    let live = true;
    runSpecs(sumSpecs).then((j) => { if (live) setSummary({ key: sumKey, a: j.results }); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sumKey]);
  const summaryText = (() => {
    const [k, drv] = summary?.key === sumKey ? summary.a : [];
    if (!k || isError(k) || k.totals[0] === null) return null;
    const m = k.measures[0];
    const now = k.totals[0];
    const prev = k.previous?.[0];
    const money = (v: number) => formatValue(Math.abs(v), m.format);
    let out = `${m.label}: ${formatValue(now, m.format)}`;
    if (prev !== undefined && prev !== null && prev !== 0) {
      const pct = Math.round(((now - prev) / Math.abs(prev)) * 100);
      out += ` — ${pct === 0 ? "level with" : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on`} ${cmpMode === "lastYear" ? "the same days last year" : "the period before"} (${formatValue(prev, m.format)})`;
    }
    out += ".";
    if (drv && !isError(drv) && drv.rows.length) {
      const name = (drv.by[0]?.label ?? "").toLowerCase();
      const who = (k: string) => (k === BLANK ? "not set" : k);
      const ups = drv.rows.filter((r) => (r.values[0] ?? 0) > 0).slice(0, 2).map((r) => `${who(r.keys[0])} +${money(r.values[0]!)}`);
      const downs = drv.rows.filter((r) => (r.values[0] ?? 0) < 0).sort((a, b) => a.values[0]! - b.values[0]!).slice(0, 2).map((r) => `${who(r.keys[0])} −${money(r.values[0]!)}`);
      if (ups.length) out += ` Biggest rises by ${name}: ${ups.join(", ")}.`;
      if (downs.length) out += ` Biggest falls: ${downs.join(", ")}.`;
    }
    return out;
  })();
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

  // Editing in place (owner, 29 Oct: "a big box container … place my report anywhere … increase size of that report by
  // holding on its edge"): the page is a Canvas; drags and resizes come back as boxes (custom.ts `arrange`).
  const [drag, setDrag] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  // Bumped when a move is refused, so the grid redraws from the dashboard (not from where the drag left it).
  const [rev, setRev] = useState(0);
  const apply = (r: CustomDash | { error: string }) => { if ("error" in r) setNote(r.error); else { setNote(""); edit!.onChange(r); } };
  const NEW = "new:";
  const newRef = (): Ref | null => (drag?.startsWith(NEW) ? (JSON.parse(drag.slice(NEW.length)) as Ref) : null);
  const newTile = () => { const r = newRef(); return r && edit ? tileOf(r, edit.builtIns, edit.saved) : undefined; };
  const dropSize = newTile() ? (newTile()!.spec.chart === "kpi" ? SIZE.kpi : SIZE.chart) : undefined;
  // A report from the list let go on the page (at x, y) or on a page's name (its first free place).
  const dropNew = (toPage: number, pos?: { x: number; y: number }) => {
    const r = newRef(), t = newTile();
    if (edit && r && t) apply(addItem(edit.draft, toPage, r, t, pos));
    setDrag(null);
  };
  const dropOn = (toPage: number) => dropNew(toPage);
  // In edit mode each report wears a small bar (move to another page, take off); the report itself doesn't take
  // clicks, so a drag can start anywhere on it.
  const framed = (t: Tile, child: React.ReactNode) => {
    if (!edit) return <div className="h-full">{child}</div>;
    return (
      <div className="group relative h-full cursor-grab rounded-2xl outline-1 outline-offset-2 outline-dashed outline-brand/50 active:cursor-grabbing">
        <div className="no-drag absolute right-2 top-2 z-20 flex items-center gap-1 rounded-full border border-line bg-surface px-1 py-0.5 opacity-0 shadow-pop transition group-hover:opacity-100 focus-within:opacity-100">
          {edit.draft.pages.length > 1 && (
            <select aria-label="Move to page" className="h-7 max-w-[7rem] rounded-full border border-line bg-surface px-1.5 text-[13.5px] text-muted" value=""
              onChange={(e) => { if (e.target.value !== "") apply(moveToPage(edit.draft, t.id, Number(e.target.value))); }}>
              <option value="">Move to…</option>
              {edit.draft.pages.map((p, pi) => (pi === at ? null : <option key={p.id} value={pi}>{p.name}</option>))}
            </select>
          )}
          <button type="button" className="grid h-7 min-w-7 place-items-center rounded-full text-[14px] text-muted hover:bg-surface-2 hover:text-high" aria-label="Take off this dashboard" onClick={() => apply(removeItem(edit.draft, t.id))}>×</button>
        </div>
        <div className="pointer-events-none h-full">{child}</div>
      </div>
    );
  };
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
    const down = date && (s.grain === "fy" ? "quarter" : s.grain === "quarter" ? "month" : null);
    const range = down ? rangeOfKey(value, s.grain) : null;
    if (down && range) setDrills((d) => ({ ...d, [t.id]: [...(d[t.id] ?? []), { grain: down, ...range, label: labelOf(value, true, s.grain!, true) }] }));
  };
  // "FY 2025-26 › Q2 FY25-26 · ← Back" on a drilled chart.
  const crumbsOf = (t: Tile) => {
    const ds = drills[t.id];
    if (!ds?.length) return undefined;
    return { text: ds.map((x) => x.label).join(" › "), onBack: () => { setPick(null); setDrills((d) => ({ ...d, [t.id]: ds.slice(0, -1) })); } };
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
  const applyState = (v: ViewState) => { setPeriod(v.period); setFilters(v.filters ?? {}); setCompare(v.compare ?? "lastYear"); setGrain(v.grain ?? def.grains); setPick(null); };
  // Saving (owner, 30 Oct): my saved filters of this dashboard, my views of it, and the view I'm on (none = the dashboard).
  const [views, setViews] = useState<View[] | null>(null);
  const [saved, setSaved] = useState<ViewState | null>(null);
  const [onView, setOnView] = useState<string | null>(null);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const live = useRef(viewState);
  live.current = viewState;
  useEffect(() => {
    let gone = false;
    const opened = readState(def);
    setViews(null); setOnView(null); setSaveNote(""); setSaved(readJson<ViewState>(savedKey(def.id)));
    fetch("/api/analytics/prefs").then((r) => r.json()).then((j) => {
      if (gone) return;
      setViews(j.views?.[def.id] ?? []);
      const s: ViewState | null = j.saved?.[def.id] ?? null;
      try { if (s) localStorage.setItem(savedKey(def.id), JSON.stringify(s)); else localStorage.removeItem(savedKey(def.id)); } catch {}
      setSaved(s);
      // Saved on another device: open with them — unless something was already changed here.
      if (s && sameState(def, live.current, opened) && !sameState(def, s, opened)) applyState(s);
    }).catch(() => { if (!gone) setViews([]); });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);
  const viewOf = (name: string | null) => views?.find((v) => v.name === name) ?? null;
  const baseline = viewOf(onView)?.state ?? saved ?? startOf(def);
  const dirty = !sameState(def, viewState, baseline);
  const keepSaved = (s: ViewState | null) => {
    setSaved(s);
    try { if (s) localStorage.setItem(savedKey(def.id), JSON.stringify(s)); else localStorage.removeItem(savedKey(def.id)); } catch {}
  };
  const saveViews = async (list: View[]) => {
    const j = await postPrefs({ dash: def.id, views: list });
    if (j.error) return setSaveNote(j.error), false;
    setViews(j.views ?? list);
    if (onView && !(j.views ?? list).some((v) => v.name === onView)) setOnView(null);
    return true;
  };
  const saveNow = async () => {
    setSaveNote("");
    if (onView && views) return void saveViews(views.map((v) => (v.name === onView ? { ...v, state: viewState } : v)));
    const j = await postPrefs({ dash: def.id, saved: viewState });
    if (j.error) return setSaveNote(j.error);
    keepSaved(viewState);
  };
  const resetSaved = async () => {
    setSaveNote("");
    const j = await postPrefs({ dash: def.id, saved: null });
    if (j.error) return setSaveNote(j.error);
    keepSaved(null);
    applyState(startOf(def));
  };
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
        <ViewsButton views={views} current={viewState} open={viewsOpen} setOpen={setViewsOpen} onSave={saveViews}
          onApply={(v) => { applyState(v.state); setOnView(v.name); }} onAdded={setOnView} />
        {onView && (
          <Chip onClear={() => { setOnView(null); applyState(saved ?? startOf(def)); }} title="× goes back to the dashboard">
            <span className="text-muted">View:</span> <b className="font-semibold">{onView}</b>
          </Chip>
        )}
        {!edit && dirty && (
          <span className="inline-flex flex-wrap items-center gap-1.5 [&>*]:whitespace-nowrap">
            <span className="text-[15.5px] text-muted">Unsaved changes</span>
            <button type="button" className={btn.primary} onClick={saveNow} title={onView ? `Save these filters on the view “${onView}”` : "Save these filters on this dashboard — only for you; it opens with them"}>{onView ? "Save view" : "Save"}</button>
            {onView && <button type="button" className={btn.quiet} onClick={() => setViewsOpen(true)}>Save as new view…</button>}
            <button type="button" className={btn.quiet} onClick={() => applyState(baseline)}>Discard</button>
          </span>
        )}
        {!edit && !dirty && !onView && saved && (
          <span className="inline-flex items-center gap-1">
            <span className="text-[15.5px] text-muted">Your saved filters</span>
            <button type="button" className={btn.quiet} onClick={resetSaved} title="Forget your saved filters — back to this dashboard's starting ones">Reset</button>
          </span>
        )}
        {saveNote && <span className="text-[15px] text-high" role="alert">{saveNote}</span>}
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

      {summaryText && <p className="mt-3 rounded-xl bg-surface-2/70 px-4 py-2.5 text-[15.5px] leading-relaxed text-ink-2" aria-live="polite"><span className="font-semibold text-ink">What changed · </span>{summaryText}</p>}
      {edit && (
        <div className="sticky top-0 z-30 -mx-1 mb-3 rounded-2xl border border-brand/40 bg-surface/95 px-4 py-3 shadow-pop backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {edit.bar}
            <button type="button" className={btn.primary} onClick={() => setAdding((x) => !x)}>{adding ? "Done adding" : "+ Add report"}</button>
          </div>
          <p className="mt-1.5 text-[15px] text-muted">{note || "Drag any chart or number anywhere in the page box — the others move out of its way. Pull any edge or corner to resize. Drag a report from + Add report onto the box, or onto a page's name."}</p>
          {adding && (
            <div className="mt-2">
              <Library builtIns={edit.builtIns} saved={edit.saved} on={new Set(edit.draft.pages.flatMap((p) => p.items.map((x) => refKey(x.ref))))}
                onDrag={(ref) => setDrag(NEW + JSON.stringify(ref))}
                onPick={(ref) => { const t = tileOf(ref, edit.builtIns, edit.saved); if (t) apply(addItem(edit.draft, at, ref, t)); }} />
            </div>
          )}
        </div>
      )}

      {edit ? (
        <nav className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Pages of this dashboard">
          {edit.draft.pages.map((p, i) => (
            <div key={p.id} onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); dropOn(i); }}
              className={`flex items-center rounded-full border ${i === at ? "border-brand bg-brand-soft" : "border-line"} ${drag && i !== at ? "border-dashed border-brand" : ""}`}>
              {i === at
                ? <input aria-label="Page name" value={p.name} onChange={(e) => apply(renamePage(edit.draft, i, e.target.value))} className="h-9 w-40 rounded-full bg-transparent px-3.5 text-[15.5px] font-medium text-ink focus:outline-none" />
                : <button type="button" onClick={() => goTo(i)} className="h-9 px-3.5 text-[15.5px] font-medium text-ink-2">{p.name}</button>}
              <span className="pr-2 text-[14px] text-faint">{fullness(p)}% full</span>
              {i === at && (
                <>
                  <button type="button" className="grid size-7 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} aria-label="Move page left" onClick={() => { apply(movePage(edit.draft, i, -1)); setPage(i - 1); }}>‹</button>
                  <button type="button" className="grid size-7 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30" disabled={i === edit.draft.pages.length - 1} aria-label="Move page right" onClick={() => { apply(movePage(edit.draft, i, 1)); setPage(i + 1); }}>›</button>
                  <button type="button" className="mr-1 grid size-7 place-items-center rounded-full text-muted hover:text-high" aria-label={`Delete page ${p.name}`}
                    onClick={() => { if (!p.items.length || confirm(`Delete the page “${p.name}” and take its ${p.items.length} report(s) off this dashboard?`)) { apply(deletePage(edit.draft, i)); setPage(Math.max(0, i - 1)); } }}>×</button>
                </>
              )}
            </div>
          ))}
          <button type="button" className="h-9 rounded-full px-3.5 text-[15.5px] font-medium text-brand hover:bg-brand-soft" onClick={() => { apply(addPage(edit.draft)); setPage(edit.draft.pages.length); }}>+ Page</button>
        </nav>
      ) : pages.length > 1 && (
        <nav className="mt-4 flex flex-wrap items-center gap-1" aria-label="Pages of this dashboard">
          {pages.map((p, i) => (
            <button key={`${i}-${p.name}`} type="button" aria-current={i === at ? "page" : undefined} onClick={() => goTo(i)}
              className={`rounded-full px-3.5 py-1.5 text-[15.5px] font-medium transition ${i === at ? "bg-brand-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>{p.name}</button>
          ))}
        </nav>
      )}

      <div ref={pageTop} className="scroll-mt-4">
      {def.custom ? (
        // The page as one box (Canvas.tsx): every report where it was put, at its own size.
        <>
          {footnote && (pages[at]?.tiles ?? []).some((t) => t.spec.chart === "kpi" && !t.noCompare) && <p className="mt-3 text-[14.5px] text-faint">{footnote}</p>}
          <Canvas key={`${def.id}-${at}-${rev}`} tiles={pages[at]?.tiles ?? []} boxes={def.pages?.[at]?.boxes ?? {}} edit={Boolean(edit)}
            onArrange={(b) => { const r = arrange(edit!.draft, at, b); if ("error" in r) { setNote(r.error); setRev((x) => x + 1); } else apply(r); }}
            onDropNew={(pos) => dropNew(at, pos)} dropSize={dropSize}
            render={(t, box) => framed(t, t.spec.chart === "kpi"
              ? <KpiCell title={specOf(t).title ?? ""} def={measureOf(datasetOf(t.spec.dataset)!, t.spec.measures[0])?.def} answer={answers[t.id]} skipped={skippedOf(t)} spark={sparkOf(t)} />
              : <TileCard tile={{ ...t, w: 12 }} fill={heightOf(box.h)} spec={specOf(t)} answer={answers[t.id]} accent={def.tiles.indexOf(t)}
                  picked={pick?.tileId === t.id ? pick.value : null} onPick={edit ? undefined : pickFrom(t)}
                  target={(specOf(t).grain ?? "month") !== "month" ? undefined : t.goalLine ? goal : t.target}
                  skipped={skippedOf(t)} crumbs={crumbsOf(t)} tweak={tweaks[t.id]} onTweak={(tw) => { setPick(null); setTweaks((s) => { const n = { ...s }; if (tw) n[t.id] = tw; else delete n[t.id]; return n; }); }} />)} />
          {edit && !(pages[at]?.tiles.length) && <p className="mt-2 text-center text-[15.5px] text-muted">An empty page — + Add report, then drag it anywhere in the box.</p>}
        </>
      ) : groups.map((g, gi) => (

        <Fragment key={`${g.section ?? ""}-${gi}`}>
          {g.runs.map((run, ri) => {
            const top = gi === 0 && ri === 0;
            if (run.kpi) return (
              <Fragment key={ri}>
                <KpiBand tiles={run.tiles} specOf={specOf} answers={answers} skippedOf={skippedOf} sparkOf={sparkOf} className={top ? "mt-5" : "mt-4"} />
                {/* Not under numbers that are never compared (stock: today's). */}
                {gi === 0 && ri === 0 && footnote && run.tiles.some((t) => !t.noCompare) && <p className="mt-2 text-[14.5px] text-faint">{footnote}</p>}
              </Fragment>
            );
            return (
              <div key={ri} className={`grid grid-cols-12 gap-4 ${top ? "mt-5" : "mt-4"}`}>
                {run.tiles.map((t) => (
                  <TileCard key={t.id} tile={pages[at]?.half?.has(t.id) ? { ...t, w: 6, tall: false } : t} spec={specOf(t)} answer={answers[t.id]} accent={def.tiles.indexOf(t)}
                    picked={pick?.tileId === t.id ? pick.value : null} onPick={pickFrom(t)}
                    target={(specOf(t).grain ?? "month") !== "month" ? undefined : t.goalLine ? goal : t.target}
                    skipped={skippedOf(t)} crumbs={crumbsOf(t)} tweak={tweaks[t.id]} onTweak={(tw) => { setPick(null); setTweaks((s) => { const n = { ...s }; if (tw) n[t.id] = tw; else delete n[t.id]; return n; }); }} />
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

/** "Views": save the period + filters + comparison under a name (per person, on the server) and bring them back. The
 * dashboard holds the list, whether it's open and which view is on (its Save updates that view). */
function ViewsButton({ views, current, open, setOpen, onSave, onApply, onAdded }: {
  views: View[] | null; current: ViewState; open: boolean; setOpen: (o: boolean | ((o: boolean) => boolean)) => void;
  onSave: (list: View[]) => Promise<boolean>; onApply: (v: View) => void; onAdded: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, setOpen]);
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (await onSave([...(views ?? []).filter((v) => v.name !== n), { name: n, state: current }])) { setName(""); onAdded(n); setOpen(false); }
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
                <button type="button" className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-[16px] text-ink" onClick={() => { onApply(v); setOpen(false); }}>{v.name}</button>
                <button type="button" aria-label={`Delete ${v.name}`} className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-high" onClick={() => onSave(views.filter((x) => x.name !== v.name))}>×</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 border-t border-line pt-3">
            <input className="h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-[16px] text-ink placeholder:text-faint focus:border-brand focus:outline-none" placeholder="Name this view, e.g. Hotels vs last year" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button type="button" disabled={!name.trim()} className="h-9 shrink-0 rounded-full bg-brand px-4 text-[15.5px] font-semibold text-brand-ink disabled:opacity-40" onClick={add}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Columns that leave no half-empty row: 4 → 4 / 2, 6 → 3 / 2, 8 → 4 / 2 (phones always 2).
const BAND_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4", 6: "grid-cols-2 xl:grid-cols-3", 8: "grid-cols-2 xl:grid-cols-4" };

/** Numbers side by side in one card, parted by hairlines (the grid's 1 px gaps over the line colour). */
function KpiBand({ tiles, specOf, answers, skippedOf, sparkOf, className = "" }: { tiles: Tile[]; specOf: (t: Tile) => Spec; answers: Record<string, Answer>; skippedOf?: (t: Tile) => string[]; sparkOf?: (t: Tile) => (number | null)[] | undefined; className?: string }) {
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
                  : <Kpi result={a} compact spark={sparkOf?.(t)} />}
              </div>
              <Skipped labels={skippedOf?.(t)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** One number on the canvas — it fills the box it was given. */
function KpiCell({ title, def, answer, skipped, spark }: { title: string; def?: string; answer?: Answer; skipped?: string[]; spark?: (number | null)[] }) {
  return (
    <section className="card flex h-full min-w-0 flex-col overflow-hidden px-5 py-4" aria-label={title}>
      <h3 className="truncate text-[16px] font-medium text-ink-2" title={def ? `${title} — ${def}` : title}>{title}</h3>
      <div className="mt-1.5">
        {!answer ? <div className="h-[62px] animate-pulse rounded-lg bg-surface-2" />
          : isError(answer) ? <p className="text-[15px] text-high">{answer.error}</p>
          : <Kpi result={answer} compact spark={spark} />}
      </div>
      <Skipped labels={skipped} />
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

export function TileCard({ tile, spec, answer, picked, onPick, menu = [], meta, accent, tweak, onTweak, target, skipped, fill, crumbs }: {
  tile: Tile; spec: Spec; answer?: Answer; picked?: string | null; onPick?: (value: string) => void;
  /** "Change this chart" (dashboards): what's changed on this tile, and how to change / reset it. */
  tweak?: Tweak; onTweak?: (t: Tweak | null) => void;
  /** Goal line (months against the goal). */
  target?: number;
  /** Active filters this tile's data can't take. */
  skipped?: string[];
  /** On the canvas: the box's height in px — the card fills it and the chart takes what the title leaves. */
  fill?: number;
  /** Drilled into a year / quarter: where, and the way back. */
  crumbs?: { text: string; onBack: () => void };
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
  const title = reshapes(tweak) ? autoTitle(spec) : spec.title ?? "";
  const items: MenuItem[] = [
    ...(canTweak ? [{ label: "Change this chart…", onClick: () => setEditing(true) }] : []),
    ...(!isKpi && ok ? [
      { label: table ? "Show as chart" : "Show as table", onClick: () => setTable((x) => !x) },
      { label: "Download CSV (Excel)", onClick: () => downloadCsv(answer, title || "report", spec.grain) },
    ] : []),
    ...menu,
  ];
  const sub = meta ?? (reshapes(tweak) ? `Changed from “${titleOf(tile.spec)}”` : !isKpi ? tile.note : undefined);
  return (
    <section className={`card flex min-w-0 flex-col p-5 ${fill ? "h-full overflow-hidden" : SPAN[tile.w]}`} aria-label={spec.title}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`truncate font-semibold tracking-tight text-ink ${isKpi ? "text-[16.5px] text-ink-2" : "text-[18.5px]"}`} title={title}>{title}</h3>
          <Skipped labels={skipped} />
          {crumbs && <p className="truncate text-[15px] text-ink-2"><button type="button" className="font-semibold text-brand hover:underline" onClick={crumbs.onBack}>← Back</button> · {crumbs.text}</p>}
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
          : <Chart result={answer} kind={table ? "table" : spec.chart} grain={spec.grain} height={fill ? Math.max(120, fill - (sub ? 118 : 96)) : tile.tall ? 470 : tile.w === 12 ? 300 : 280} picked={picked} onPick={onPick} accent={accent} target={target} relative={spec.relative === "first"} lines={tweak?.lines} />}
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
/** A number for a line or a rule; empty = none. ₹ amounts in full rupees (5,00,000 = ₹5 L). */
function NumberBox({ label, value, unit, onChange }: { label: string; value?: number; unit: string; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      {label}
      <span className="inline-flex h-8 items-center rounded-full border border-line bg-surface pl-2.5 pr-1 focus-within:border-brand">
        {unit && <span className="text-muted">{unit}</span>}
        <input type="number" inputMode="decimal" className="h-7 w-28 bg-transparent px-1 text-[15px] text-ink focus:outline-none" value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" || !Number.isFinite(Number(e.target.value)) ? undefined : Number(e.target.value))} />
      </span>
    </label>
  );
}

function TileSettings({ tile, spec, tweak, onChange, onClose }: { tile: Tile; spec: Spec; tweak?: Tweak; onChange: (t: Tweak | null) => void; onClose: () => void }) {
  const d = datasetOf(spec.dataset)!;
  const by = spec.by?.[0] ?? d.dateField;
  const isDate = by === d.dateField;
  const set = (patch: Tweak) => onChange({ ...tweak, ...patch });
  const lines: Lines = tweak?.lines ?? {};
  // Unticked / emptied ones go; nothing left = no lines (and no tweak at all if nothing else was changed).
  const setLines = (patch: Lines) => {
    const next = Object.fromEntries(Object.entries({ ...lines, ...patch }).filter(([, v]) => v !== undefined)) as Lines;
    const { lines: _old, ...rest } = tweak ?? {};
    const t: Tweak = { ...rest, ...(Object.keys(next).length ? { lines: next } : {}) };
    onChange(Object.keys(t).length ? t : null);
  };
  const unit = measureOf(d, spec.measures[0])?.format === "inr" ? "₹" : "";
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
      {/* Phase 4 (owner, 29 Oct): lines across the chart and colours by a rule — for this chart, in this browser. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[15px] text-ink-2">
        <span className="font-semibold text-muted">Lines</span>
        {([["avg", "Average"], ["min", "Lowest"], ["max", "Highest"], ...(isDate ? [["trend", "Trend"], ["forecast", "Forecast (next 3)"]] : [])] as [keyof Lines, string][]).map(([key, label]) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={Boolean(lines[key])} onChange={(e) => setLines({ [key]: e.target.checked || undefined })} />
            {label}
          </label>
        ))}
        <NumberBox label="Target line" value={lines.target} unit={unit} onChange={(v) => setLines({ target: v })} />
        <NumberBox label="Green at or over" value={lines.above} unit={unit} onChange={(v) => setLines({ above: v })} />
        <NumberBox label="Red at or under" value={lines.below} unit={unit} onChange={(v) => setLines({ below: v })} />
      </div>
      <p className="mt-2 text-[14px] text-faint">Only this chart, only for you (kept in this browser). Reset brings back “{titleOf(tile.spec)}”.</p>
    </div>
  );
}
