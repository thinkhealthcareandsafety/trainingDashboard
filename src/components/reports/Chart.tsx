"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Format, type Grain, formatValue, grainLabel } from "@/lib/analytics/model";
import { BLANK, type ChartKind, OTHERS, type Result } from "@/lib/analytics/query";

/*
 * One report drawn with Apache ECharts (loaded only on the Reports page). Follows the dataviz rules: categorical hues
 * in a fixed order, validated for colour-blind separation on our light (#ffffff) and dark (#1c1c1e) surfaces; a colour
 * belongs to the series' name, not its rank; one axis; thin marks with 4 px rounded ends, 2 px lines; recessive grid;
 * hover tooltips; a table view for every chart (three light hues are under 3:1 — the table is the required relief).
 */

const PALETTE_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const PALETTE_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const OTHERS_LIGHT = "#a1a1a6";
const OTHERS_DARK = "#636366";

export const labelOf = (key: string, date: boolean, grain: Grain, long = false) => (key === BLANK ? "(not set)" : date ? grainLabel(key, grain, long) : key);

type Theme = { dark: boolean; ink: string; ink2: string; muted: string; line: string; surface: string; brand: string };
function readTheme(): Theme {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  return { dark, ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"), line: v("--line"), surface: v("--surface"), brand: v("--brand") };
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

type Echarts = typeof import("echarts/core");
let loading: Promise<Echarts> | null = null;
function loadEcharts(): Promise<Echarts> {
  return (loading ??= (async () => {
    const core = await import("echarts/core");
    const [charts, components, renderers] = await Promise.all([import("echarts/charts"), import("echarts/components"), import("echarts/renderers")]);
    core.use([charts.BarChart, charts.LineChart, charts.PieChart, components.GridComponent, components.TooltipComponent, components.LegendComponent, renderers.CanvasRenderer]);
    return core;
  })());
}

/** The chart a report gets when it says "auto". */
export function resolveKind(kind: ChartKind | undefined, r: Pick<Result, "by" | "measures">): Exclude<ChartKind, "auto"> {
  if (kind && kind !== "auto") return kind;
  if (!r.by.length) return "kpi";
  if (r.by.length === 2) return "stacked";
  return r.by[0].date ? "column" : "bar";
}

/** Series colours by name: sorted names take the palette in order; "Others" / "(not set)" are grey. */
function colourMap(names: string[], dark: boolean): Map<string, string> {
  const pal = dark ? PALETTE_DARK : PALETTE_LIGHT;
  const m = new Map<string, string>();
  const real = [...new Set(names)].filter((n) => n !== OTHERS && n !== BLANK).sort((a, b) => a.localeCompare(b));
  real.forEach((n, i) => m.set(n, pal[i % pal.length]));
  m.set(OTHERS, dark ? OTHERS_DARK : OTHERS_LIGHT);
  m.set(BLANK, dark ? OTHERS_DARK : OTHERS_LIGHT);
  return m;
}

export function Chart({ result, kind, grain = "month", height = 280, picked, onPick }: {
  result: Result; kind: ChartKind | undefined; grain?: Grain; height?: number;
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
    if (k === "kpi" || k === "table" || !el.current) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    loadEcharts().then((ec) => {
      if (disposed || !el.current) return;
      const c = chart.current ?? ec.init(el.current, undefined, { renderer: "canvas" });
      chart.current = c;
      c.setOption(option(model, k, readTheme(), picked ?? null), { notMerge: true });
      c.off("click");
      c.on("click", (p: { dataIndex?: number; name?: string }) => {
        const key = model.keyByLabel.get(String(p.name ?? "")) ?? (p.dataIndex !== undefined ? model.x[p.dataIndex] : undefined);
        if (key !== undefined) pickRef.current?.(key);
      });
      ro = new ResizeObserver(() => c.resize());
      ro.observe(el.current);
    });
    return () => { disposed = true; ro?.disconnect(); };
  }, [model, k, tick, picked]);
  useEffect(() => () => { chart.current?.dispose(); chart.current = null; }, []);

  if (k === "kpi") return <Kpi result={result} />;
  if (k === "table") return <ResultTable result={result} grain={grain} />;
  if (!result.rows.length) return <Empty height={height} />;
  return (
    <>
      <div ref={el} style={{ height: model.others ? height - 20 : height }} className="w-full" role="img" aria-label={model.summary} />
      {model.others && (
        <p className="mt-1 text-[12px] text-muted">
          Everything else together: <span className="num font-medium text-ink-2">{formatValue(model.others, model.format)}</span> · the table shows it all
        </p>
      )}
    </>
  );
}

function Empty({ height }: { height: number }) {
  return <div style={{ height }} className="grid place-items-center text-[13px] text-muted">No data for these filters.</div>;
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
  /** Bars: "Others" is a line under the chart, not a bar — it would dwarf the top N it summarises. */
  others?: number | null;
};

function buildModel(r: Result, k: Exclude<ChartKind, "auto">, grain: Grain): Model {
  const date0 = Boolean(r.by[0]?.date);
  const othersRow = k === "bar" && r.by.length === 1 ? r.rows.find((row) => row.keys[0] === OTHERS) : undefined;
  if (othersRow) r = { ...r, rows: r.rows.filter((row) => row !== othersRow) };
  const x = [...new Set(r.rows.map((row) => row.keys[0] ?? ""))];
  const xLabels = x.map((key) => labelOf(key, date0, grain));
  const keyByLabel = new Map(x.map((key, i) => [xLabels[i], key]));
  const format = r.measures[0]?.format ?? "count";
  let series: Model["series"];
  if (r.by.length === 2) {
    const names = [...new Set(r.rows.map((row) => row.keys[1]))];
    series = names.map((n) => ({ name: labelOf(n, Boolean(r.by[1]?.date), grain), key: n, values: x.map((xk) => r.rows.find((row) => row.keys[0] === xk && row.keys[1] === n)?.values[0] ?? null) }));
  } else {
    // One split: one series per measure (same unit only — no second axis, ever).
    const same = r.measures.filter((m) => m.format === format);
    series = same.map((m) => { const i = r.measures.indexOf(m); return { name: m.label, key: m.key, values: x.map((xk) => r.rows.find((row) => row.keys[0] === xk)?.values[i] ?? null) }; });
  }
  const top = r.rows[0];
  const summary = `${r.measures[0]?.label ?? ""}${r.by[0] ? ` by ${r.by[0].label.toLowerCase()}` : ""}: ${top ? `largest ${labelOf(top.keys[0] ?? "", date0, grain, true)} ${formatValue(top.values[0], format)}` : "no data"} (table view available)`;
  return { x, xLabels, keyByLabel, series, format, measureLabel: r.measures[0]?.label ?? "", summary, stackedBy: k === "stacked" ? r.by[1]?.label : undefined, others: othersRow ? othersRow.values[0] : undefined };
}

function option(m: Model, k: Exclude<ChartKind, "auto" | "kpi" | "table">, t: Theme, picked: string | null) {
  const colours = colourMap(m.series.map((s) => s.key), t.dark);
  const single = m.series.length === 1;
  const colourOf = (key: string) => (single ? t.brand : colours.get(key) ?? t.brand);
  const fade = (xKey: string) => (picked && xKey !== picked ? 0.3 : 1);
  const fmt = (v: number | null) => formatValue(v, m.format);
  const axisText = { color: t.muted, fontSize: 11 };
  const base = {
    animationDuration: 250,
    textStyle: { fontFamily: "inherit", color: t.ink2 },
    tooltip: {
      trigger: k === "bar" || k === "donut" ? "item" : "axis",
      axisPointer: { type: k === "line" || k === "area" ? "line" : "shadow", lineStyle: { color: t.line }, shadowStyle: { color: t.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" } },
      backgroundColor: t.surface, borderColor: t.line, textStyle: { color: t.ink, fontSize: 12 },
      valueFormatter: (v: unknown) => fmt(typeof v === "number" ? v : null),
    },
    legend: m.series.length > 1 ? { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2, fontSize: 12 } } : undefined,
  };

  if (k === "donut") {
    const s = m.series[0];
    const pieColours = colourMap(m.x, t.dark);
    return {
      ...base,
      legend: { orient: "vertical", right: 0, top: "middle", icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2, fontSize: 12 } },
      series: [{
        type: "pie", radius: ["52%", "76%"], center: ["32%", "50%"], avoidLabelOverlap: true,
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
        label: { show: false },
        data: m.x.map((key, i) => ({ name: m.xLabels[i], value: s.values[i] ?? 0, itemStyle: { color: pieColours.get(key), opacity: fade(key) } })),
      }],
    };
  }

  const horizontal = k === "bar";
  const catAxis = { type: "category", data: m.xLabels, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false }, axisLabel: { ...axisText, ...(horizontal ? { width: 150, overflow: "truncate" } : { hideOverlap: true }) }, inverse: horizontal };
  const valAxis = { type: "value", splitLine: { lineStyle: { color: t.line, width: 1 } }, axisLabel: { ...axisText, formatter: (v: number) => fmt(v) } };
  const radius = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  const series = m.series.map((s, si) => {
    const colour = colourOf(s.key);
    if (k === "line" || k === "area") {
      return { type: "line", name: s.name, data: s.values, color: colour, showSymbol: false, symbolSize: 8, lineStyle: { width: 2, color: colour }, itemStyle: { color: colour }, areaStyle: k === "area" ? { color: colour, opacity: 0.12 } : undefined };
    }
    const last = si === m.series.length - 1;
    return {
      // Series colour too, so the legend matches the bars.
      type: "bar", name: s.name, color: colour, itemStyle: { color: colour }, stack: k === "stacked" ? "total" : undefined,
      barMaxWidth: horizontal ? 18 : 36, barGap: "20%",
      // Stacks: only the top segment is rounded; segments are parted by a 2 px surface gap.
      data: s.values.map((v, i) => ({ value: v, itemStyle: { color: colour, opacity: fade(m.x[i]), borderRadius: k === "stacked" && !last ? 0 : radius, borderColor: k === "stacked" ? t.surface : undefined, borderWidth: k === "stacked" ? 1 : 0 } })),
      label: horizontal && single ? { show: true, position: "right", color: t.ink2, fontSize: 11, formatter: (p: { value: number }) => fmt(p.value) } : undefined,
      emphasis: { focus: k === "stacked" ? "series" : "none" },
    };
  });
  return {
    ...base,
    grid: { left: 8, right: horizontal ? 56 : 12, top: m.series.length > 1 ? 32 : 12, bottom: 8, containLabel: true },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series,
  };
}

function Kpi({ result }: { result: Result }) {
  const v = result.totals[0];
  // A running period compares today's position with the same days of the period before (query.ts), never part vs whole.
  const now = result.toDate?.[0] ?? v;
  const p = result.previous?.[0];
  const f = result.measures[0]?.format ?? "count";
  const change = p && now !== null && p !== null && p !== 0 ? ((now - p) / Math.abs(p)) * 100 : null;
  const when = result.toDate ? "at this point last period" : "the period before";
  const range = result.prevFrom && result.prevTo ? `${result.prevFrom} → ${result.prevTo}` : undefined;
  return (
    <div>
      <div className="num text-[30px] font-semibold leading-tight tracking-tight text-ink">{formatValue(v, f)}</div>
      {result.previous && (
        <div className="mt-1 text-[12.5px] text-muted" title={range ? `Compared with ${range}${result.toDate && now !== v ? ` (this period so far: ${formatValue(now, f)})` : ""}` : undefined}>
          {change === null ? <>vs {formatValue(p ?? null, f)} {when}</> : (
            <><span className={`font-semibold ${change >= 0 ? "text-low" : "text-high"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}%</span> vs {formatValue(p ?? null, f)} {when}</>
          )}
        </div>
      )}
    </div>
  );
}

/** The table view of any report (also the accessible version of every chart). */
export function ResultTable({ result, grain = "month", max = 200 }: { result: Result; grain?: Grain; max?: number }) {
  if (!result.rows.length) return <Empty height={120} />;
  return (
    <div className="no-scrollbar max-h-[340px] overflow-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-[12px] text-muted">
            {result.by.map((b) => <th key={b.key} className="py-1.5 pr-3 font-medium">{b.label}</th>)}
            {result.measures.map((m) => <th key={m.key} className="py-1.5 pl-3 text-right font-medium">{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, max).map((row, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {row.keys.map((key, j) => <td key={j} className="max-w-[260px] truncate py-1.5 pr-3 text-ink-2">{labelOf(key, Boolean(result.by[j]?.date), grain, true)}</td>)}
              {row.values.map((v, j) => <td key={j} className="num py-1.5 pl-3 text-right text-ink">{formatValue(v, result.measures[j].format, false)}</td>)}
            </tr>
          ))}
        </tbody>
        {result.by.length > 0 && (
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td colSpan={result.by.length} className="py-1.5 pr-3 text-ink">Total</td>
              {result.totals.map((v, j) => <td key={j} className="num py-1.5 pl-3 text-right text-ink">{formatValue(v, result.measures[j].format, false)}</td>)}
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
  const head = [...result.by.map((b) => b.label), ...result.measures.map((m) => m.label)];
  const lines = [head, ...result.rows.map((r) => [...r.keys.map((k, j) => labelOf(k, Boolean(result.by[j]?.date), grain, true)), ...r.values.map((v) => (v === null ? "" : String(Math.round(v * 100) / 100)))])];
  const blob = new Blob(["﻿" + lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "report"}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
