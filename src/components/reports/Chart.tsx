"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Format, type Grain, formatValue, grainLabel } from "@/lib/analytics/model";
import { BLANK, type ChartKind, OTHERS, type Result, type ResultRow, type Spec } from "@/lib/analytics/query";
import { geoName, loadIndia } from "./indiaMap";

/*
 * One report drawn with Apache ECharts (loaded only on the Reports page). Dataviz rules: a colour belongs to the name,
 * not its rank; one axis; thin marks with 4 px rounded ends, 2 px lines; recessive grid; hover tooltips; a table view
 * for every chart. Colours follow the theme picked in Change theme (owner, 22 Oct: bars that clash with the theme
 * "look really weird"): Plain / Black use the validated mixed set (CVD-checked on #ffffff / #1c1c1e with the dataviz
 * validator; pink swapped for mint at the owner's ask, aqua dropped — too close to mint); every other theme has its own
 * family of shades, spread in lightness. Bars are named on their axis and every chart has a table, so a family of close
 * shades never carries identity alone.
 */

const MINT_LIGHT = "#45cf9c";
const MINT_DARK = "#40a985";
const PLAIN_LIGHT = ["#2a78d6", "#eb6834", "#45cf9c", "#eda100", "#6250d6", "#008300", "#e34948"];
const PLAIN_DARK = ["#3987e5", "#d95926", "#40a985", "#c98500", "#9085e9", "#008300", "#e66767"];
/** Chart colours per background theme (globals.css [data-bg] / AppShell THEMES). */
const THEME_PALETTES: Record<string, string[]> = {
  blush: ["#d9577a", "#ef8a6a", "#b8466f", "#e9a07f", "#a33d63", "#f0b29a", "#c9708f"],
  peach: ["#e8754a", "#f0a05c", "#d65d4a", "#e8b46a", "#c4683c", "#f08f70", "#b8553a"],
  lemon: ["#c99a00", "#9fb83a", "#d9a92e", "#7d9e2f", "#b8862a", "#c7c04a", "#8a8a2a"],
  mint: ["#2fb58a", "#45cf9c", "#1f9e7a", "#6fcfae", "#178a6a", "#5ab89a", "#0f7a5c"],
  aqua: ["#1ba8a0", "#3cc0b8", "#13858f", "#5fcfc6", "#0f6f7a", "#2a9fb5", "#48b3a8"],
  sky: ["#2f7fd6", "#5aa2ea", "#1f62b8", "#7ab3ee", "#184f95", "#4590d9", "#2a6fc4"],
  lavender: ["#7b6ad8", "#9c8ae8", "#5f4fc4", "#b3a3ee", "#4b3da8", "#8c7ae0", "#6a5acd"],
  smoky: ["#d8789a", "#8f7fe0", "#5598e0", "#3fbf95", "#e0a83a", "#ea8a64", "#b07cc8"],
  xcoastal: ["#1f6f8b", "#3f9bb0", "#5fae9c", "#c79a5c", "#2a86a0", "#8ab4c0", "#8a6f4a"],
  "dark-midnight": ["#5b8def", "#8fb0ff", "#4a6fd8", "#a8b8ff", "#6c7fe8", "#3f5fc4", "#7f9cf5"],
  "dark-ocean": ["#2fa8d8", "#5fc8ea", "#1f8fc0", "#7fd4f0", "#2b7fb8", "#3fb6c9", "#4f9fe0"],
  "dark-aurora": ["#2fc2a8", "#8a7cf0", "#3fb0d8", "#a98af5", "#23a58e", "#6fd4c0", "#6a8ae8"],
  "dark-forest": ["#3fbf7a", "#7fd49e", "#2fa36a", "#a3dcb0", "#4fae5f", "#8cc96f", "#2f8f5a"],
  "dark-plum": ["#d77fc8", "#b78af0", "#c25fae", "#e6a6dc", "#9a6ad8", "#e090c0", "#a855a0"],
  "dark-ember": ["#f0844f", "#f5b05a", "#e2604a", "#f6c47a", "#d9773a", "#ef9a80", "#c8502f"],
  "dark-xplum": ["#e29ad6", "#b78af0", "#d06fbe", "#f0b8e6", "#9a6ad8", "#e888b8", "#b062a8"],
  "dark-xocean": ["#5cc8e6", "#7fa8ff", "#3fb0c9", "#9fe0f0", "#4a86d8", "#6fd6c4", "#8fc0ff"],
  "dark-xespresso": ["#e6a65c", "#d98a6a", "#c9b07a", "#f0c890", "#b8784a", "#e8b4a0", "#a8905a"],
  "dark-xemerald": ["#5fd4a0", "#8fd46f", "#3fb8a0", "#a8e6c4", "#4fae7f", "#c4d47a", "#6fc8c0"],
  xsakura: ["#b83d68", "#d9708f", "#9a4fa8", "#e89a6a", "#c45a8a", "#7a6ad0", "#d4a04a"],
  xsand: ["#a8552f", "#c98a3a", "#6f8a4a", "#d06a50", "#8a6a4a", "#b89a5a", "#5f7f8a"],
  xnordic: ["#3f56a6", "#5a8ac8", "#6a6aa8", "#4aa0a8", "#8a7ab8", "#7a9ab8", "#a8708a"],
};

/** The colour a one-colour chart on this theme gets (slot 0) — also the goal meter's fill (owner, 27 Oct: "the color
 * should change with the theme"). Re-reads when the theme changes. */
export function useThemeColour(slot = 0): string {
  const tick = useThemeTick();
  const [c, setC] = useState("var(--brand)");
  useEffect(() => { const t = readTheme(); setC(t.mono ?? t.palette[slot % t.palette.length]); }, [tick, slot]);
  return c;
}
const OTHERS_LIGHT = "#a1a1a6";
const OTHERS_DARK = "#636366";

export const labelOf = (key: string, date: boolean, grain: Grain, long = false) => (key === BLANK ? "(not set)" : date ? grainLabel(key, grain, long) : key);

/** `mono`: Plain and Black (owner, 22 Oct) — every bar and line in mint; only donuts / stacks / several series get the mixed set. */
type Theme = { dark: boolean; ink: string; ink2: string; muted: string; line: string; surface: string; brand: string; low: string; high: string; palette: string[]; mono?: string; font: string };
function readTheme(): Theme {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  // A theme's own colours only while it's showing (a light theme under dark mode shows plain black, globals.css).
  const bg = root.dataset.bg ?? "";
  const showing = bg && (bg.startsWith("dark-") === dark);
  const own = showing ? THEME_PALETTES[bg] : undefined;
  const palette = own ?? (dark ? PLAIN_DARK : PLAIN_LIGHT);
  const mono = own ? undefined : dark ? MINT_DARK : MINT_LIGHT;
  // The page's own font, by name: a canvas can't "inherit" (28 Oct: with "inherit" every chart label fell back to
  // the canvas default, 10 px sans-serif — whatever fontSize said).
  return { dark, ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"), line: v("--line"), surface: v("--surface"), brand: v("--brand"), low: v("--low"), high: v("--high"), palette, mono, font: getComputedStyle(document.body).fontFamily };
}

/** Re-renders when the theme or the background theme changes (Change theme, OS setting). */
export function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-bg"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => { mo.disconnect(); mq.removeEventListener("change", bump); };
  }, []);
  return tick;
}

/**
 * The Reports chart colours as CSS variables (--chart-1 main series, --chart-2 second) for the Overview's own bars and
 * lines (owner, 28 Oct: the first page's charts didn't have the Reports colours). Follows Change theme.
 */
export function useChartColors(): void {
  const tick = useThemeTick();
  useEffect(() => {
    const t = readTheme();
    const root = document.documentElement.style;
    root.setProperty("--chart-1", t.mono ?? t.palette[0]);
    root.setProperty("--chart-2", t.mono ? t.palette[1] : t.palette[1] ?? t.palette[0]);
  }, [tick]);
}

type Echarts = typeof import("echarts/core");
let loading: Promise<Echarts> | null = null;
function loadEcharts(): Promise<Echarts> {
  return (loading ??= (async () => {
    const core = await import("echarts/core");
    const [charts, components, renderers] = await Promise.all([import("echarts/charts"), import("echarts/components"), import("echarts/renderers")]);
    core.use([charts.BarChart, charts.LineChart, charts.PieChart, components.GridComponent, components.TooltipComponent, components.LegendComponent, components.MarkLineComponent, renderers.CanvasRenderer]);
    return core;
  })());
}

/** The chart a report gets when it says "auto". */
export function resolveKind(kind: ChartKind | undefined, r: Pick<Result, "by" | "measures">): Exclude<ChartKind, "auto"> {
  if (kind && kind !== "auto") return kind;
  if (!r.by.length) return "kpi";
  // ₹, counts and % can't share one axis (one axis, ever) — a chart would drop all but the first unit; a table shows all.
  if (r.by.length === 1 && new Set(r.measures.map((m) => m.format)).size > 1) return "table";
  // Two splits: stacked colours — but a stack draws one number, so with several the table shows them all.
  if (r.by.length === 2) return r.measures.length > 1 ? "table" : "stacked";
  return r.by[0].date ? "column" : "bar";
}

/** The chart a spec asks for: Rows + Columns (owner's plan, step d) is a crosstab unless another chart is picked. */
export const chartKindOf = (spec: Pick<Spec, "chart" | "split" | "by">): ChartKind | undefined =>
  spec.split === "columns" && (spec.by ?? []).length === 2 && (!spec.chart || spec.chart === "auto") ? "matrix" : spec.chart;

/** One measure of a result, as if it had been asked alone (a card per number). */
const oneMeasure = (r: Result, i: number): Result => ({
  ...r, measures: [r.measures[i]], totals: [r.totals[i]],
  previous: r.previous ? [r.previous[i]] : undefined, toDate: r.toDate ? [r.toDate[i]] : undefined,
  rows: r.rows.map((row) => ({ ...row, values: [row.values[i]], prev: row.prev ? [row.prev[i]] : undefined })),
});

/** A name's own palette slot (FNV-1a) — the same name gets the same colour on every chart and after any filter. */
const slotOf = (name: string, size: number) => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return (h >>> 0) % size;
};

/**
 * Colours by name: each takes its own slot; two names on one chart that land on the same slot — the second (A–Z) takes
 * the next free one, so a chart never shows one colour twice (up to 8 names). "Others" / "(not set)" are grey.
 */
function colourMap(names: string[], dark: boolean, pal: string[]): Map<string, string> {
  const m = new Map<string, string>();
  const taken = new Set<number>();
  const real = [...new Set(names)].filter((n) => n !== OTHERS && n !== BLANK).sort((a, b) => a.localeCompare(b));
  for (const n of real) {
    let s = slotOf(n, pal.length);
    for (let i = 0; i < pal.length && taken.has(s) && taken.size < pal.length; i++) s = (s + 1) % pal.length;
    taken.add(s);
    m.set(n, pal[s]);
  }
  m.set(OTHERS, dark ? OTHERS_DARK : OTHERS_LIGHT);
  m.set(BLANK, dark ? OTHERS_DARK : OTHERS_LIGHT);
  return m;
}

/** Lines and colours added to one chart ("Change this chart" — owner, 29 Oct, phase 4); kept with that chart's tweak. */
export type Lines = { avg?: boolean; min?: boolean; max?: boolean; target?: number; trend?: boolean; forecast?: boolean; above?: number; below?: number };

export function Chart({ result, kind, grain = "month", height = 280, picked, onPick, accent = 0, target, relative, lines, labels, axisNames }: {
  /** The report's own axis names (Spec.text): the categories' axis and the values' axis. */
  axisNames?: { x?: string; y?: string };
  result: Result; kind: ChartKind | undefined; grain?: Grain; height?: number;
  lines?: Lines;
  /** Numbers written on the bars / points / slices (Spec.labels). Hover-only numbers come in the result (`tips`). */
  labels?: boolean;
  /** A goal line across a column / line chart (₹50 L a month — owner, 27 Oct); heatmap: cells at or over it ringed. */
  target?: number;
  /** Matrix: each cell also as a share of its row's first column (cohort retention). */
  relative?: boolean;
  /** Palette slot for a one-colour chart — each chart on a page takes its own hue. */
  accent?: number;
  /** The value clicked on this chart's first field (others fade). */
  picked?: string | null;
  onPick?: (value: string) => void;
}) {
  const k = resolveKind(kind, result);
  const tick = useThemeTick();
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<import("echarts/core").ECharts | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const model = useMemo(() => buildModel(result, k, grain), [result, k, grain]);

  useEffect(() => {
    // No chart box (table view, a number, no data): let the old drawing go — its box is gone.
    if (k === "kpi" || k === "table" || k === "matrix" || k === "heatmap" || !el.current) {
      chart.current?.dispose();
      chart.current = null;
      return;
    }
    let disposed = false;
    let ro: ResizeObserver | null = null;
    loadEcharts().then(async (ec) => {
      if (k === "map") await loadIndia(ec);
      if (disposed || !el.current) return;
      // Back from the table: a new box — draw into it, not into the one that was removed.
      if (chart.current && chart.current.getDom() !== el.current) {
        chart.current.dispose();
        chart.current = null;
      }
      const c = chart.current ?? ec.init(el.current, undefined, { renderer: "canvas" });
      chart.current = c;
      c.setOption(withAxisNames(option(model, (k === "stacked100" ? "stacked" : k) as Drawn, readTheme(), picked ?? null, accent, target, lines, grain, { labels, tips: result.tips }), axisNames), { notMerge: true });
      c.off("click");
      c.on("click", (p: { dataIndex?: number; name?: string }) => {
        const key = model.keyByLabel.get(String(p.name ?? "")) ?? (p.dataIndex !== undefined ? model.x[p.dataIndex] : undefined);
        if (key !== undefined) pickRef.current?.(key);
      });
      ro = new ResizeObserver(() => c.resize());
      ro.observe(el.current);
    }).catch(() => {});
    return () => { disposed = true; ro?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, k, tick, picked, accent, target, JSON.stringify(lines ?? null), grain, labels, result.tips]);
  useEffect(() => () => { chart.current?.dispose(); chart.current = null; }, []);

  // Several numbers and no split (owner, 30 Oct: three picked showed only the first): one card each, with its name.
  if (k === "kpi" && result.measures.length > 1) return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
      {result.measures.map((m, i) => (
        <div key={m.key} className="min-w-0">
          <div className="truncate text-[15.5px] font-medium text-ink-2" title={m.label}>{m.label}</div>
          <Kpi result={oneMeasure(result, i)} />
        </div>
      ))}
    </div>
  );
  if (k === "kpi") return <Kpi result={result} />;
  if (k === "table") return <><ResultTable result={result} grain={grain} />{result.note && <Note text={result.note} />}</>;
  // A crosstab needs both splits — while a new answer is on its way (Columns just added) the old one shows as a table.
  if (k === "matrix") return result.by.length === 2 ? <Matrix result={result} relative={relative} grain={grain} /> : <ResultTable result={result} grain={grain} />;
  if (k === "heatmap") return <Heatmap result={result} target={target} />;
  if (!result.rows.length) return <><Empty height={height} />{result.note && <Note text={result.note} />}</>;
  // The map: what has no place on it (Out of India, blank…) is listed underneath, so the totals still add up.
  const offMap = k === "map" ? model.x.map((key, i) => ({ key, v: model.series.find((s) => s.key !== PREV)?.values[i] ?? null })).filter((x) => !geoName(x.key) && x.v) : [];
  return (
    <>
      <div ref={el} style={{ height: model.others ? height - 20 : height }} className="w-full" role="img" aria-label={model.summary} />
      {model.others ? (
        <p className="mt-1 text-[15.5px] text-muted">
          Everything else together: <span className="num font-medium text-ink-2">{formatValue(model.others, model.format)}</span>
          {model.twin && model.othersPrev !== undefined && <> ({model.twin === "time" ? model.prevLabel?.toLowerCase() : model.prevLabel}: {formatValue(model.othersPrev ?? null, model.format)})</>} · the table shows it all
        </p>
      ) : null}
      {offMap.length > 0 && <Note text={`Not on the map: ${offMap.map((x) => `${labelOf(x.key, false, grain)} ${formatValue(x.v, model.format)}`).join(" · ")}`} />}
      {k === "map" && <p className="mt-1 text-[14px] text-faint">Map: <a className="hover:underline" href="https://github.com/datameet/maps" target="_blank" rel="noreferrer">DataMeet India</a>, CC BY 4.0</p>}
      {result.note && <Note text={result.note} />}
    </>
  );
}

const Note = ({ text }: { text: string }) => <p className="mt-1 text-[15.5px] text-muted">{text}</p>;

function Empty({ height }: { height: number }) {
  return <div style={{ height }} className="grid place-items-center text-[16px] text-muted">No data for these filters.</div>;
}

type Model = {
  x: string[]; // first-field keys, in order
  xLabels: string[];
  keyByLabel: Map<string, string>;
  series: { name: string; key: string; values: (number | null)[] }[];
  format: Format;
  measureLabel: string;
  summary: string;
  stackedBy?: string;
  /** The first field is a date (months…) — one colour; named categories may take a colour each. */
  dateX: boolean;
  /** Bars: "Others" is a line under the chart, not a bar — it would dwarf the top N it summarises. */
  others?: number | null;
  othersPrev?: number | null;
  /** A comparison series (key PREV) beside the bars: last year / the period before (grey), or a second group (a colour). */
  twin?: "time" | "group";
  prevLabel?: string;
};
const PREV = "__prev";
/** The period after a date key (month "2026-10", FY quarter "2026-Q3", FY "2026", day / week "2026-10-29"). */
function nextKey(key: string, grain: Grain): string {
  if (grain === "month") { const y = Number(key.slice(0, 4)), mo = Number(key.slice(5, 7)); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; }
  if (grain === "quarter") { const [fy, q] = key.split("-Q").map(Number); return q === 4 ? `${fy + 1}-Q1` : `${fy}-Q${q + 1}`; }
  if (grain === "fy") return String(Number(key) + 1);
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (grain === "week" ? 7 : 1));
  return d.toISOString().slice(0, 10);
}
const twinOf = (r: Result): Model["twin"] => (!r.prevLabel ? undefined : r.prevLabel === "Last year" || r.prevLabel === "Period before" ? "time" : "group");

function buildModel(r: Result, k: Exclude<ChartKind, "auto">, grain: Grain): Model {
  const date0 = Boolean(r.by[0]?.date);
  const othersRow = k === "bar" && r.by.length === 1 ? r.rows.find((row) => row.keys[0] === OTHERS) : undefined;
  if (othersRow) r = { ...r, rows: r.rows.filter((row) => row !== othersRow) };
  const x = [...new Set(r.rows.map((row) => row.keys[0] ?? ""))];
  // A map's areas go by the outline's names (a click comes back with that name).
  const xLabels = x.map((key) => (k === "map" && geoName(key)) || labelOf(key, date0, grain));
  const keyByLabel = new Map(x.map((key, i) => [xLabels[i], key]));
  let format = r.measures[0]?.format ?? "count";
  let series: Model["series"];
  if (r.by.length === 2) {
    const names = [...new Set(r.rows.map((row) => row.keys[1]))];
    series = names.map((n) => ({ name: labelOf(n, Boolean(r.by[1]?.date), grain), key: n, values: x.map((xk) => r.rows.find((row) => row.keys[0] === xk && row.keys[1] === n)?.values[0] ?? null) }));
    // 100% stacked (product mix): each column as shares of its own total.
    if (k === "stacked100") {
      const totals = x.map((_, i) => series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0));
      series = series.map((sr) => ({ ...sr, values: sr.values.map((v, i) => (totals[i] ? ((v ?? 0) / totals[i]) * 100 : null)) }));
      format = "pct";
    }
  } else {
    // One split: one series per measure (same unit only — no second axis, ever).
    const same = r.measures.filter((m) => m.format === format);
    series = same.map((m) => { const i = r.measures.indexOf(m); return { name: m.label, key: m.key, values: x.map((xk) => r.rows.find((row) => row.keys[0] === xk)?.values[i] ?? null) }; });
  }
  // Compared with something: the first measure and its comparison side by side (time: comparison first, in grey).
  const twin = r.by.length === 1 && !["donut", "stacked", "stacked100", "waterfall", "diverging"].includes(k) && r.rows.some((row) => row.prev) ? twinOf(r) : undefined;
  if (twin) {
    const now = { ...series[0], name: r.nowLabel ?? series[0].name };
    const prev = { name: r.prevLabel ?? "Before", key: PREV, values: x.map((xk) => r.rows.find((row) => row.keys[0] === xk)?.prev?.[0] ?? null) };
    series = twin === "time" ? [prev, now] : [now, prev];
  }
  const top = r.rows[0];
  const summary = `${r.measures[0]?.label ?? ""}${r.by[0] ? ` by ${r.by[0].label.toLowerCase()}` : ""}: ${top ? `largest ${labelOf(top.keys[0] ?? "", date0, grain, true)} ${formatValue(top.values[0], format)}` : "no data"} (table view available)`;
  return {
    x, xLabels, keyByLabel, series, format, measureLabel: r.measures[0]?.label ?? "", summary, dateX: date0, stackedBy: k === "stacked" ? r.by[1]?.label : undefined,
    others: othersRow ? othersRow.values[0] : undefined, othersPrev: othersRow?.prev?.[0], twin, prevLabel: r.prevLabel,
  };
}

type Drawn = Exclude<ChartKind, "auto" | "kpi" | "table" | "matrix">;
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** The report's axis names on a drawn chart: the category axis gets `x`, the value axis `y` (whichever way it lies). */
function withAxisNames<T>(o: T, names?: { x?: string; y?: string }): T {
  if (!names?.x?.trim() && !names?.y?.trim()) return o;
  const opt = o as { xAxis?: unknown; yAxis?: unknown };
  // Along the bottom: under the axis. Up the side: rotated beside the numbers — but beside bar names (horizontal bars)
  // it would sit on them, so there it goes above the axis.
  const name = (side: "x" | "y") => (axis: unknown): unknown => {
    if (Array.isArray(axis)) return axis.map(name(side));
    if (!axis || typeof axis !== "object") return axis;
    const a = axis as { type?: string };
    const n = (a.type === "category" ? names.x : names.y)?.trim();
    if (!n) return a;
    const place = side === "x" ? { nameLocation: "middle", nameGap: 34 } : a.type === "category" ? { nameLocation: "end", nameGap: 12 } : { nameLocation: "middle", nameGap: 56 };
    return { ...a, name: n, ...place, nameTextStyle: { fontSize: 14 } };
  };
  return { ...opt, ...(opt.xAxis ? { xAxis: name("x")(opt.xAxis) } : {}), ...(opt.yAxis ? { yAxis: name("y")(opt.yAxis) } : {}) } as T;
}

function option(m: Model, k: Drawn, t: Theme, picked: string | null, accent: number, target?: number, lines?: Lines, grain?: Grain, marks: { labels?: boolean; tips?: Result["tips"] } = {}) {
  const pal = t.palette;
  const colours = colourMap(m.series.map((s) => s.key), t.dark, pal);
  const single = m.series.length === 1;
  const own = t.mono ?? pal[((accent % pal.length) + pal.length) % pal.length];
  // The comparison: grey for last year / the period before; another hue for a second group (blue next to mint).
  const twinColour = m.twin === "group" ? (t.mono ? (t.dark ? PLAIN_DARK : PLAIN_LIGHT)[0] : pal[(((accent + 3) % pal.length) + pal.length) % pal.length]) : t.dark ? OTHERS_DARK : OTHERS_LIGHT;
  const colourOf = (key: string) => (key === PREV ? twinColour : single || m.twin ? own : colours.get(key) ?? own);
  // One series of up to 8 named categories (sectors, lead sources…): a colour per bar, from its name (colourMap).
  // More than 8, or months: the chart's own colour — a 9th hue would repeat.
  const named = m.x.filter((x) => x !== OTHERS && x !== BLANK);
  const perBar = !t.mono && single && !m.dateX && (k === "bar" || k === "column") && named.length > 1 && named.length <= pal.length;
  const barColours = perBar ? colourMap(m.x, t.dark, pal) : null;
  const fade = (xKey: string) => (picked && xKey !== picked ? 0.3 : 1);
  const fmt = (v: number | null) => formatValue(v, m.format);
  const axisText = { color: t.muted, fontSize: 15 };
  const base = {
    animationDuration: 250,
    textStyle: { fontFamily: t.font, color: t.ink2 },
    tooltip: {
      trigger: k === "bar" || k === "donut" ? "item" : "axis",
      axisPointer: { type: k === "line" || k === "area" ? "line" : "shadow", lineStyle: { color: t.line }, shadowStyle: { color: t.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" } },
      backgroundColor: t.surface, borderColor: t.line, textStyle: { color: t.ink, fontSize: 16 },
      valueFormatter: (v: unknown) => fmt(typeof v === "number" ? v : null),
      // Tooltip shelf (step d): the hover-only numbers under the drawn ones, for that Rows value.
      ...(marks.tips ? { formatter: (ps: unknown) => {
        type P = { dataIndex: number; name?: string; axisValueLabel?: string; seriesName?: string; marker?: string; value?: unknown };
        const arr = (Array.isArray(ps) ? ps : [ps]) as P[];
        const i = arr[0]?.dataIndex ?? 0;
        const row = (l: string, v: string, marker = "") => `<div style="display:flex;justify-content:space-between;gap:18px"><span>${marker}${esc(l)}</span><b>${v}</b></div>`;
        const drawn = arr.map((p) => row(p.seriesName ?? "", fmt(typeof p.value === "number" ? p.value : null), p.marker ?? "")).join("");
        const extra = marks.tips!.measures.map((mm, j) => row(mm.label, formatValue(marks.tips!.byKey[m.x[i]]?.[j] ?? null, mm.format))).join("");
        return `<div style="font-weight:600;margin-bottom:4px">${esc(arr[0]?.axisValueLabel ?? arr[0]?.name ?? "")}</div>${drawn}<div style="margin-top:4px;padding-top:4px;border-top:1px solid ${t.line};color:${t.ink2}">${extra}</div>`;
      } } : {}),
    },
    // One line, with ◀ ▶ when it doesn't fit (phones: a wrapped legend sat on top of the bars).
    legend: m.series.length > 1 ? { type: "scroll", top: 0, left: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { color: t.ink2, fontSize: 15 } } : undefined,
  };

  if (k === "donut") {
    const s = m.series[0];
    const pieColours = colourMap(m.x, t.dark, pal);
    return {
      ...base,
      legend: { orient: "vertical", right: 0, top: "middle", icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { color: t.ink2, fontSize: 15 } },
      series: [{
        type: "pie", radius: ["52%", "76%"], center: ["32%", "50%"], avoidLabelOverlap: true,
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
        label: marks.labels ? { show: true, color: t.ink2, fontSize: 14, formatter: (p: { name: string; value: number }) => `${p.name}: ${fmt(p.value)}` } : { show: false },
        data: m.x.map((key, i) => ({ name: m.xLabels[i], value: s.values[i] ?? 0, itemStyle: { color: pieColours.get(key), opacity: fade(key) } })),
      }],
    };
  }

  if (k === "waterfall") return waterfall(m, t, own, base, fmt, axisText);
  if (k === "map") return indiaMap(m, t, own, base, fmt, picked);
  const horizontal = k === "bar" || k === "diverging";
  const catAxis = { type: "category", data: m.xLabels, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false }, axisLabel: { ...axisText, ...(horizontal ? { width: 180, overflow: "truncate" } : { hideOverlap: true }) }, inverse: horizontal };
  // Counts step in whole numbers (29 Oct: "0.3 AEDs in stock").
  const valAxis = { type: "value", splitNumber: 4, ...(m.format === "count" ? { minInterval: 1 } : {}), splitLine: { lineStyle: { color: t.line, width: 1 } }, axisLabel: { ...axisText, hideOverlap: true, formatter: (v: number) => fmt(v) } };
  const radius = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  const series = m.series.map((s, si) => {
    const colour = colourOf(s.key);
    // The goal across the first series (column / line over months).
    const goal = target && si === m.series.length - 1 && m.dateX && !horizontal ? { markLine: { silent: true, symbol: "none", data: [{ yAxis: target }], lineStyle: { type: "dashed", color: t.ink2, width: 1.5 }, label: { formatter: `Goal ${fmt(target)}`, color: t.ink2, fontSize: 14, position: "insideEndTop" } } } : {};
    if (k === "line" || k === "area") {
      const dashed = s.key === PREV && m.twin === "time"; // last year as a dashed line, no fill
      return { ...goal, type: "line", name: s.name, data: s.values, color: colour, showSymbol: Boolean(marks.labels && !dashed),
        label: marks.labels && !dashed ? { show: true, position: "top", color: t.ink2, fontSize: 14, formatter: (p: { value: number }) => fmt(p.value) } : undefined, symbolSize: 8, lineStyle: { width: 2, color: colour, type: dashed ? "dashed" : "solid" }, itemStyle: { color: colour }, areaStyle: k === "area" && !dashed ? { color: colour, opacity: 0.12 } : undefined };
    }
    const last = si === m.series.length - 1;
    // What changed: rises in green to the right, falls in red to the left, each with its signed amount.
    if (k === "diverging") {
      return {
        type: "bar", name: s.name, barMaxWidth: 18,
        data: s.values.map((v, i) => ({ value: v, itemStyle: { color: (v ?? 0) >= 0 ? t.low : t.high, opacity: fade(m.x[i]), borderRadius: (v ?? 0) >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] }, label: { show: true, position: "right", color: t.ink2, // falls too: just right of zero, clear of the names
           fontSize: 15, formatter: () => `${(v ?? 0) >= 0 ? "+" : "−"}${fmt(Math.abs(v ?? 0))}` } })),
      };
    }
    return {
      // Series colour too, so the legend matches the bars.
      ...goal, type: "bar", name: s.name, color: colour, itemStyle: { color: colour }, stack: k === "stacked" ? "total" : undefined,
      barMaxWidth: horizontal ? 18 : 36, barGap: "20%",
      // Stacks: only the top segment is rounded; segments are parted by a 2 px surface gap.
      data: s.values.map((v, i) => ({ value: v, itemStyle: { color: barColours?.get(m.x[i]) ?? colour, opacity: fade(m.x[i]), borderRadius: k === "stacked" && !last ? 0 : radius, borderColor: k === "stacked" ? t.surface : undefined, borderWidth: k === "stacked" ? 1 : 0 } })),
      label: horizontal && single ? { show: true, position: "right", color: t.ink2, fontSize: 15, formatter: (p: { value: number }) => fmt(p.value) }
        // Label shelf (step d): the numbers on the bars — inside a stack's segments, else at the end; not on the comparison.
        : marks.labels && s.key !== PREV ? { show: true, position: k === "stacked" ? "inside" : horizontal ? "right" : "top", color: k === "stacked" ? "#fff" : t.ink2, fontSize: 14, formatter: (p: { value: number }) => (p.value ? fmt(p.value) : "") }
        : undefined,
      emphasis: { focus: k === "stacked" ? "series" : "none" },
    };
  });
  // Lines and colours someone added to this chart (owner, 29 Oct — phase 4): average / min / max / a target across
  // the main series, bars coloured by a rule, and over dates a trend (least squares) and a straight-line forecast.
  const main = series.findIndex((_, si) => m.series[si].key !== PREV);
  let cats = m.xLabels;
  if (lines && main >= 0 && k !== "stacked") {
    const s = series[main] as Record<string, unknown>;
    const dim = horizontal ? "x" : "y";
    const at = (type: string, name: string) => ({ type, name, valueDim: dim });
    const marks: object[] = [
      ...(lines.avg ? [at("average", "Average")] : []),
      ...(lines.min ? [at("min", "Lowest")] : []),
      ...(lines.max ? [at("max", "Highest")] : []),
      ...(lines.target !== undefined ? [{ [horizontal ? "xAxis" : "yAxis"]: lines.target, name: "Target" }] : []),
    ];
    if (marks.length) {
      const old = (s.markLine as { data?: object[] } | undefined)?.data ?? [];
      s.markLine = {
        silent: true, symbol: "none", data: [...old.map((o) => ({ name: "Goal", ...o })), ...marks],
        lineStyle: { type: "dashed", color: t.ink2, width: 1.5 },
        label: { color: t.ink2, fontSize: 14, position: horizontal ? "end" : "insideEndTop", formatter: (p: { name?: string; value?: number }) => `${p.name ?? ""} ${fmt(p.value ?? null)}` },
      };
    }
    // Over / under a value: green / red bars (the others keep their colour).
    if ((lines.above !== undefined || lines.below !== undefined) && Array.isArray(s.data) && s.type === "bar") {
      s.data = (s.data as { value: number | null; itemStyle: object }[]).map((d) => ({ ...d, itemStyle: { ...d.itemStyle, color: lines.above !== undefined && (d.value ?? -Infinity) >= lines.above ? t.low : lines.below !== undefined && (d.value ?? Infinity) <= lines.below ? t.high : (d.itemStyle as { color?: string }).color } }));
    }
    // Trend and forecast: over dates only, from at least 3 values.
    const vals = m.series[main].values;
    const pts = vals.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
    if (m.dateX && !horizontal && (lines.trend || lines.forecast) && pts.length >= 3) {
      const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
      const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0), sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), icpt = (sy - slope * sx) / n;
      const fit = (i: number) => Math.max(0, icpt + slope * i);
      const dashedLine = (name: string, data: (number | null)[], colour: string) => ({ type: "line", name, data, showSymbol: false, connectNulls: false, lineStyle: { type: "dashed", width: 2, color: colour }, itemStyle: { color: colour }, tooltip: { valueFormatter: (v: unknown) => fmt(typeof v === "number" ? v : null) } });
      if (lines.trend) series.push(dashedLine("Trend", vals.map((_, i) => fit(i)), t.ink2) as never);
      if (lines.forecast && grain) {
        const ahead: string[] = [];
        let key = m.x[m.x.length - 1];
        for (let i = 0; i < 3; i++) { key = nextKey(key, grain); ahead.push(key); }
        cats = [...m.xLabels, ...ahead.map((x) => labelOf(x, true, grain))];
        const last = vals.length - 1;
        series.push(dashedLine("Forecast", [...vals.map((v, i) => (i === last ? v ?? fit(i) : null)), ...ahead.map((_, i) => fit(last + 1 + i))], t.brand) as never);
      }
    }
  }
  return {
    ...base,
    ...(series.length > m.series.length && !base.legend ? { legend: { type: "scroll", top: 0, left: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { color: t.ink2, fontSize: 15 } } } : {}),
    grid: { left: 8, right: horizontal ? 68 : 12, top: series.length > 1 ? 32 : 12, bottom: 8, containLabel: true },
    xAxis: horizontal ? valAxis : { ...catAxis, data: cats },
    yAxis: horizontal ? { ...catAxis, data: cats } : valAxis,
    series,
  };
}

/** `compact`: the KPI band says "compared with …" once for all its numbers, so each one drops it (kept in the tooltip). */
/** A number's months as a small line (owner, 29 Oct — phase 4: "numbers with context"), the last one dotted. */
function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const W = 100, H = 28, x = (i: number) => (i / (values.length - 1)) * W, y = (v: number) => H - 3 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (H - 6);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-7 w-full text-brand" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={pts.map((p) => `${x(p[0])},${y(p[1])}`).join(" ")} />
      <circle cx={x(last[0])} cy={y(last[1])} r="2" fill="currentColor" />
    </svg>
  );
}

export function Kpi({ result, compact = false, spark }: { result: Result; compact?: boolean; spark?: (number | null)[] }) {
  const v = result.totals[0];
  // A running period compares today's position with the same days of the period before (query.ts), never part vs whole.
  const now = result.toDate?.[0] ?? v;
  const p = result.previous?.[0];
  const f = result.measures[0]?.format ?? "count";
  // A share (%) changes in points — "▼ 13 pts vs 73%", not "▼ 17%" (a change of a change). Others in % of before.
  const pts = f === "pct";
  const change = now === null || p === null || p === undefined ? null : pts ? now - p : p !== 0 ? ((now - p) / Math.abs(p)) * 100 : null;
  const good = change !== null && (result.measures[0]?.better === "down" ? change <= 0 : change >= 0);
  const ly = result.prevLabel === "Last year";
  const groups = Boolean(result.prevLabel) && !ly && result.prevLabel !== "Period before";
  const when = groups ? `(${result.prevLabel})` : result.toDate ? `at this point ${ly ? "last year" : "last period"}` : ly ? "last year" : "the period before";
  const range = result.prevFrom && result.prevTo ? `${result.prevFrom} → ${result.prevTo}` : undefined;
  const tail = compact ? "" : ` ${when}`;
  return (
    <div>
      <div className={`num font-semibold leading-tight tracking-tight text-ink ${compact ? "text-[32px]" : "text-[36px]"}`}>{formatValue(v, f)}</div>
      {result.previous && (
        <div className={`mt-1 text-[16px] text-muted ${compact ? "truncate" : ""}`} title={range ? `Compared with ${range}${compact ? ` (${when})` : ""}${result.toDate && now !== v ? ` — this period so far: ${formatValue(now, f)}` : ""}` : undefined}>
          {change === null ? <>vs {formatValue(p ?? null, f)}{tail}</> : (
            <><span className={`font-semibold ${groups ? "text-ink-2" : good ? "text-low" : "text-high"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}{pts ? " pts" : "%"}</span> vs {formatValue(p ?? null, f)}{tail}</>
          )}
        </div>
      )}
      {spark && <Spark values={spark} />}
    </div>
  );
}

/** The table view of any report (also the accessible version of every chart). */
/** Revenue bridge: first and last bars whole, the steps between floating up (green) or down (red). */
/** "#45cf9c" at 15% — the light end of a map's scale, over whatever card colour the theme has. */
const faint = (hex: string, a: number) => {
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  return h ? `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4), 16)},${a})` : hex;
};

/** India by state (report #18): darker = more, in the chart's own colour; hover = the value and the comparison. */
function indiaMap(m: Model, t: Theme, own: string, base: { tooltip: object }, fmt: (v: number | null) => string, picked: string | null) {
  const now = m.series.find((s) => s.key !== PREV) ?? m.series[0];
  const prev = m.series.find((s) => s.key === PREV);
  // Shaded by the square root: one state (Maharashtra, ~35%) would otherwise leave every other one nearly blank.
  const data = m.x.flatMap((key, i) => {
    const v = Math.max(0, now.values[i] ?? 0);
    return geoName(key) ? [{
      name: m.xLabels[i], value: [v, Math.sqrt(v)], prev: prev?.values[i] ?? null,
      ...(picked && key !== picked ? { itemStyle: { opacity: 0.35 } } : {}),
    }] : [];
  });
  const max = Math.max(0, ...data.map((d) => d.value[0]));
  const change = (v: number, p: number | null) => (p ? ` · ${v >= p ? "▲" : "▼"} ${Math.abs(Math.round(((v - p) / p) * 100))}%` : "");
  return {
    animationDuration: 250,
    textStyle: { fontFamily: t.font, color: t.ink2 },
    tooltip: {
      ...base.tooltip, trigger: "item",
      formatter: (p: { name: string; data?: { value: number[]; prev: number | null } }) => !p.data ? `${p.name}<br/>—`
        : `<b>${p.name}</b><br/>${fmt(p.data.value[0])}${prev ? `<br/><span style="color:${t.muted}">${m.prevLabel ?? "Before"}: ${fmt(p.data.prev)}${change(p.data.value[0], p.data.prev)}</span>` : ""}`,
    },
    // The scale sits in the Arabian Sea (bottom left), where the map has nothing.
    visualMap: {
      type: "continuous", dimension: 1, min: 0, max: Math.sqrt(max) || 1, left: 0, bottom: 4, itemWidth: 10, itemHeight: 90, calculable: false,
      text: [fmt(max), fmt(0)], textGap: 6, formatter: (v: number) => fmt(v * v), textStyle: { color: t.muted, fontSize: 14 },
      inRange: { color: [faint(own, 0.14), own] },
    },
    series: [{
      type: "map", map: "india", nameProperty: "ST_NM", roam: false, selectedMode: false,
      layoutCenter: ["55%", "50%"], layoutSize: "98%",
      itemStyle: { areaColor: t.line, borderColor: t.surface, borderWidth: 0.7 },
      emphasis: { label: { show: false }, itemStyle: { areaColor: own, borderColor: t.ink, borderWidth: 1 } },
      data,
    }],
  };
}

function waterfall(m: Model, t: Theme, own: string, base: object, fmt: (v: number | null) => string, axisText: object) {
  const vals = m.series[0]?.values.map((v) => v ?? 0) ?? [];
  let run = 0;
  const lift: number[] = [];
  const size: number[] = [];
  vals.forEach((v, i) => {
    if (i === 0 || i === vals.length - 1) { lift.push(0); size.push(v); run = v; return; }
    lift.push(v >= 0 ? run : run + v);
    size.push(Math.abs(v));
    run += v;
  });
  const colourAt = (i: number) => (i === 0 || i === vals.length - 1 ? own : vals[i] >= 0 ? t.low : t.high);
  return {
    ...base,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: t.surface, borderColor: t.line, textStyle: { color: t.ink, fontSize: 16 },
      formatter: (ps: { dataIndex: number }[]) => { const i = ps[0]?.dataIndex ?? 0; return `${m.xLabels[i]}<br/><b>${i && i < vals.length - 1 && vals[i] >= 0 ? "+" : ""}${fmt(vals[i])}</b>`; } },
    legend: undefined,
    grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: m.xLabels, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false }, axisLabel: { ...axisText, interval: 0, width: 110, overflow: "break" } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: t.line } }, axisLabel: { ...axisText, formatter: (v: number) => fmt(v) } },
    series: [
      { type: "bar", stack: "w", silent: true, itemStyle: { color: "transparent" }, data: lift, tooltip: { show: false } },
      { type: "bar", stack: "w", barMaxWidth: 56, data: size.map((v, i) => ({ value: v, itemStyle: { color: colourAt(i), borderRadius: 4 } })),
        label: { show: true, position: "top", color: t.ink2, fontSize: 15, formatter: (p: { dataIndex: number }) => { const i = p.dataIndex; const v = vals[i]; return i && i < vals.length - 1 ? `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}` : fmt(v); } } },
    ],
  };
}

/** Seasonality: years down, months across, each cell shaded by its size in the theme's colour; at or over the goal
 * ringed. */
function Heatmap({ result, target }: { result: Result; target?: number }) {
  const colour = useThemeColour();
  if (!result.rows.length) return <Empty height={160} />;
  const f = result.measures[0]?.format ?? "inr";
  const order = result.by[1]?.order;
  const cols = [...new Set(result.rows.map((r) => r.keys[1]))].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b)));
  const rowsK = [...new Set(result.rows.map((r) => r.keys[0]))].filter((k) => k !== BLANK).sort();
  const val = (rk: string, c: string) => result.rows.find((r) => r.keys[0] === rk && r.keys[1] === c)?.values[0] ?? null;
  const max = Math.max(1, ...result.rows.map((r) => r.values[0] ?? 0));
  return (
    <div>
      <div className="no-scrollbar overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-[15px]">
          <thead>
            <tr className="text-muted">
              <th className="pr-2 text-left font-medium" />
              {cols.map((c) => <th key={c} className="font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rowsK.map((rk) => (
              <tr key={rk}>
                <td className="whitespace-nowrap pr-2 text-ink-2">{rk}</td>
                {cols.map((c) => {
                  const v = val(rk, c);
                  const hit = target !== undefined && v !== null && v >= target;
                  return (
                    <td key={c} title={`${c} · ${rk}: ${formatValue(v, f, false)}${hit ? " — goal reached" : ""}`}
                      className={`num h-11 min-w-[64px] rounded-md text-center text-ink ${hit ? "font-semibold outline outline-2 -outline-offset-2 outline-[var(--ink)]" : ""}`}
                      style={{ background: v ? `color-mix(in srgb, ${colour} ${Math.round(12 + (v / max) * 68)}%, transparent)` : "var(--surface-2)" }}>
                      {v ? formatValue(v, f) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {target !== undefined && <Note text={`Ringed: months at or over the goal (${formatValue(target, f)}).`} />}
    </div>
  );
}

/** Two splits as a pivot (this year vs last year by sector × customer type): each cell its value and change. */
function Matrix({ result, relative = false, grain = "month" }: { result: Result; relative?: boolean; grain?: Grain }) {
  if (!result.rows.length) return <Empty height={160} />;
  const f = result.measures[0]?.format ?? "inr";
  const group = Boolean(result.prevLabel) && result.prevLabel !== "Last year" && result.prevLabel !== "Period before";
  const total = (rs: ResultRow[], prev = false) => rs.reduce((s, r) => s + ((prev ? r.prev?.[0] : r.values[0]) ?? 0), 0);
  // Cohorts (relative): years in time order, and no totals (a customer counts in every year they bought).
  const byName = (a: string, b: string) => a.localeCompare(b);
  const cols = [...new Set(result.rows.map((r) => r.keys[1]))].sort(relative ? byName : (a, b) => (a === OTHERS || a === BLANK ? 1 : b === OTHERS || b === BLANK ? -1 : total(result.rows.filter((r) => r.keys[1] === b)) - total(result.rows.filter((r) => r.keys[1] === a))));
  // Dates down the side in time order (Rows = a date, Columns = an attribute — step d); else the biggest first.
  const rowsK = [...new Set(result.rows.map((r) => r.keys[0]))].sort(relative || result.by[0]?.date ? byName : (a, b) => total(result.rows.filter((r) => r.keys[0] === b)) - total(result.rows.filter((r) => r.keys[0] === a)));
  const rowName = (rk: string) => labelOf(rk, Boolean(result.by[0]?.date), grain);
  const has = !relative && result.rows.some((r) => r.prev);
  const firstOf = (rk: string) => { for (const c of cols) { const v = total(result.rows.filter((r) => r.keys[0] === rk && r.keys[1] === c)); if (v) return v; } return 0; };
  const Cell = ({ rs, strong, base }: { rs: ResultRow[]; strong?: boolean; base?: number }) => {
    const now = total(rs);
    const then = total(rs, true);
    const ch = changeText(now, has ? then : undefined, f);
    const up = now >= then;
    return (
      <td className={`num py-1.5 pl-3 text-right align-top ${strong ? "font-semibold text-ink" : "text-ink"}`} title={has ? `${result.prevLabel}: ${formatValue(then, f, false)}` : undefined}>
        <div>{rs.length && now ? formatValue(now, f) : "—"}</div>
        {has && (now || then) ? <div className={`text-[14px] ${group ? "text-muted" : up ? "text-low" : "text-high"}`}>{ch === "—" ? (then ? "−100%" : "new") : ch}</div> : null}
        {relative && base && now ? <div className="text-[14px] text-muted">{Math.round((now / base) * 100)}%</div> : null}
      </td>
    );
  };
  if (relative) return (
    <div>
      <div className="no-scrollbar max-h-[520px] overflow-auto">
        <table className="w-full text-[16px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line text-left text-[15px] text-muted">
              <th className="py-1.5 pr-3 font-medium">{result.by[0]?.label} / {result.by[1]?.label}</th>
              {cols.map((c) => <th key={c} className="py-1.5 pl-3 text-right font-medium">{labelOf(c, false, "month")}</th>)}
            </tr>
          </thead>
          <tbody>
            {rowsK.map((rk) => (
              <tr key={rk} className="border-b border-line/60 last:border-0">
                <td className="max-w-[220px] truncate py-1.5 pr-3 align-top text-ink-2">{labelOf(rk, false, "month")}</td>
                {cols.map((c) => <Cell key={c} rs={result.rows.filter((r) => r.keys[0] === rk && r.keys[1] === c)} base={firstOf(rk)} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note text="Small figures: share of the row's first year that bought again." />
    </div>
  );
  return (
    <div>
      <div className="no-scrollbar max-h-[520px] overflow-auto">
        <table className="w-full text-[16px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line text-left text-[15px] text-muted">
              <th className="py-1.5 pr-3 font-medium">{result.by[0]?.label} / {result.by[1]?.label}</th>
              {cols.map((c) => <th key={c} className="py-1.5 pl-3 text-right font-medium">{labelOf(c, false, "month")}</th>)}
              <th className="py-1.5 pl-3 text-right font-semibold text-ink-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {rowsK.map((rk) => {
              const rs = result.rows.filter((r) => r.keys[0] === rk);
              return (
                <tr key={rk} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[220px] truncate py-1.5 pr-3 align-top text-ink-2">{rowName(rk)}</td>
                  {cols.map((c) => <Cell key={c} rs={rs.filter((r) => r.keys[1] === c)} />)}
                  <Cell rs={rs} strong />
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3 font-semibold text-ink">Total</td>
              {cols.map((c) => <Cell key={c} rs={result.rows.filter((r) => r.keys[1] === c)} strong />)}
              <Cell rs={result.rows} strong />
            </tr>
          </tfoot>
        </table>
      </div>
      {has && <Note text={`Small figures: change against ${result.prevLabel === "Last year" ? "the same days last year" : result.prevLabel === "Period before" ? "the same days of the period before" : result.prevLabel}. Hover a cell for the figure.`} />}
    </div>
  );
}

/** "+12%" from b to a (points for shares); "—" when there's nothing to compare with. */
function changeText(a: number | null, b: number | null | undefined, f: Format): string {
  if (a === null || b === null || b === undefined) return "—";
  if (f === "pct") { const d = a - b; return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`; }
  if (!b) return "—";
  const d = ((a - b) / Math.abs(b)) * 100;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}%`;
}

/** The table view of any report (also the accessible version of every chart). Compared: + that column and the change. */
export function ResultTable({ result, grain = "month", max = 200 }: { result: Result; grain?: Grain; max?: number }) {
  if (!result.rows.length) return <Empty height={120} />;
  const prev = result.rows.some((r) => r.prev);
  const m0 = result.measures[0];
  const totalNow = result.toDate?.[0] ?? result.totals[0];
  return (
    <div className="no-scrollbar max-h-[340px] overflow-auto">
      <table className="w-full text-[16.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-[15px] text-muted">
            {result.by.map((b) => <th key={b.key} className="py-1.5 pr-3 font-medium">{b.label}</th>)}
            {result.measures.map((m) => <th key={m.key} className="py-1.5 pl-3 text-right font-medium">{m.label}</th>)}
            {prev && <><th className="py-1.5 pl-3 text-right font-medium">{result.prevLabel}</th><th className="py-1.5 pl-3 text-right font-medium">Change</th></>}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, max).map((row, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {row.keys.map((key, j) => <td key={j} className="max-w-[260px] truncate py-1.5 pr-3 text-ink-2">{labelOf(key, Boolean(result.by[j]?.date), grain, true)}</td>)}
              {row.values.map((v, j) => <td key={j} className="num py-1.5 pl-3 text-right text-ink">{formatValue(v, result.measures[j].format, false)}</td>)}
              {prev && <>
                <td className="num py-1.5 pl-3 text-right text-ink-2">{formatValue(row.prev?.[0] ?? null, m0.format, false)}</td>
                <td className="num py-1.5 pl-3 text-right text-muted">{changeText(row.values[0], row.prev?.[0], m0.format)}</td>
              </>}
            </tr>
          ))}
        </tbody>
        {result.by.length > 0 && (
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td colSpan={result.by.length} className="py-1.5 pr-3 text-ink">Total</td>
              {result.totals.map((v, j) => <td key={j} className="num py-1.5 pl-3 text-right text-ink">{formatValue(v, result.measures[j].format, false)}</td>)}
              {prev && <>
                <td className="num py-1.5 pl-3 text-right text-ink-2">{formatValue(result.previous?.[0] ?? null, m0.format, false)}</td>
                <td className="num py-1.5 pl-3 text-right text-muted" title={result.toDate ? "This period so far against the same days of the comparison" : undefined}>{changeText(totalNow, result.previous?.[0], m0.format)}</td>
              </>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** CSV of a report's rows (opens in Excel). */
export function downloadCsv(result: Result, title: string, grain: Grain = "month") {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const prev = result.rows.some((r) => r.prev);
  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(Math.round(v * 100) / 100));
  const head = [...result.by.map((b) => b.label), ...result.measures.map((m) => m.label), ...(prev ? [`${result.measures[0].label} (${result.prevLabel})`] : [])];
  const lines = [head, ...result.rows.map((r) => [...r.keys.map((k, j) => labelOf(k, Boolean(result.by[j]?.date), grain, true)), ...r.values.map(num), ...(prev ? [num(r.prev?.[0])] : [])])];
  const blob = new Blob(["﻿" + lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "report"}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
