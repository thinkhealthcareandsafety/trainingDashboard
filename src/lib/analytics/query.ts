import { type Dataset, type Format, type Grain, type Measure, type Row, datasetOf, fieldOf, formatValue, grainKey, grainLabel, measureOf } from "./model";
import { resolveFilter, setParamValues } from "./params";
import { type TableCalc, applyTableCalcs, isTableCalc } from "./tablecalc";

/*
 * Runs a report spec over a dataset's rows (pure — the server calls it; scripts test it). A spec names only fields and
 * measures from model.ts; anything unknown is refused, so a report can't invent a number.
 */

/** matrix: two splits as a pivot table (with the comparison in each cell); waterfall: steps up and down (bridge);
 * diverging: rises right in green, falls left in red (what changed). */
export type ChartKind = "auto" | "kpi" | "column" | "bar" | "line" | "area" | "stacked" | "stacked100" | "donut" | "table" | "matrix" | "heatmap" | "waterfall" | "diverging" | "map";
export type Analysis = "bridge" | "pareto" | "winback" | "drivers" | "funnel" | "pvm" | "reorder" | "crosssell" | "followup" | "renewals" | "dueMonths" | "priceAlerts" | "customerValue" | "vsTarget";
/**
 * A filter (owner, 27 Oct: "custom filters"): keep rows whose field is one of `values` — or, with `exclude`, none of
 * them; or whose field `contains` a piece of text; or, on a dataset's `ranges`, whose number is within `min`–`max`.
 */
/** `param` (params.ts): the filter follows a parameter — is it / at least / at most (`cmp`) — resolved per run into
 *  values, min / max, or for dates `after` / `before` ("YYYY-MM-DD", inclusive). */
export type Filter = { field: string; values: string[]; exclude?: boolean; contains?: string; min?: number; max?: number; param?: string; cmp?: "is" | "min" | "max"; after?: string; before?: string };
/**
 * What a report is compared with: the period before (true, the old setting), the same dates a year earlier, or
 * another group in the same dates (`field` in `b` against `field` in `a` — e.g. Aviation vs IT).
 */
export type Compare = boolean | "previous" | "lastYear" | { field: string; a: string[]; b: string[] };
export type Spec = {
  dataset: string;
  measures: string[];
  /** Up to two: the first is the axis / rows, the second splits it into series. */
  by?: string[];
  /** How the date field is grouped when it's in `by`. */
  grain?: Grain;
  from?: string;
  to?: string;
  filters?: Filter[];
  /** "value" = biggest first (default for text), "label" = by name / date. */
  sort?: "value" | "label";
  /** Top N rows (and series) — the rest folds into "Others". */
  limit?: number;
  /** Also compute the totals to compare with (KPIs), and with one split the value of each bar / month (charts). */
  compare?: Compare;
  chart?: ChartKind;
  /** A ready-made analysis on top of the query (see `analyse`). */
  analysis?: Analysis;
  /** An analysis's option — crosssell: "training" (AED buyers with no training, default) or "aed" (the other way). */
  variant?: string;
  /** Matrix: each cell also as a share of its row's first column (cohort retention). */
  relative?: "first";
  title?: string;
  /** Saved reports keep a relative period ("fy", "3m"…, model.ts periods) — the browser turns it into from / to. */
  period?: string;
  /** The team's monthly revenue goal (set by the server for "vsTarget" — kv reports_goal; months = one-off months). */
  goal?: { monthly: number; months: Record<string, number> };
  /** The second split shown as Columns (a crosstab: Rows down, Columns across) instead of Colour (owner's plan of 30 Oct,
   *  step d). The engine is the same — two splits — only the drawing differs. */
  split?: "colour" | "columns";
  /** Numbers written on the marks (the first value). */
  labels?: boolean;
  /** The report's own words (labels.ts): a subtitle and axis names (templates, like the title), and new names for its
   *  columns and numbers (key → name). */
  text?: { subtitle?: string; axisX?: string; axisY?: string; names?: Record<string, string> };
  /** Up to 3 more numbers shown only on hover, per Rows value — computed, not drawn. */
  tooltip?: string[];
  /** A value shown as a quick table calculation (tablecalc.ts) — measure key → running total, % of total … */
  calcs?: Record<string, TableCalc>;
  /** The parameter values chosen for this run (params.ts); a parameter not here takes its own value. */
  params?: Record<string, string | number>;
  /** Which date column the period (from / to) applies to — Zoho tables have several (owner's plan, 30 Oct, point 5);
   *  none = the dataset's own date. */
  dateField?: string;
  /** Today (set by the server): a period still running is compared like for like — up to the same day of the one before. */
  asOf?: string;
};
/** `prev`: the same row in the comparison (one split only). */
export type ResultRow = { keys: string[]; values: (number | null)[]; prev?: (number | null)[] };
export type Result = {
  by: { key: string; label: string; date: boolean; order?: string[] }[];
  measures: { key: string; label: string; format: Format; better?: "down" }[];
  rows: ResultRow[];
  totals: (number | null)[];
  previous?: (number | null)[];
  prevFrom?: string;
  prevTo?: string;
  /** A period still running: totals up to today, to set against `previous` (the same days of the period before). */
  toDate?: (number | null)[];
  /** Names for the two sides on charts / tables: "This period" vs "Last year", or the two groups. */
  /** A sentence under the chart (analyses: "52 of 225 customers make 80% of it"). */
  note?: string;
  nowLabel?: string;
  prevLabel?: string;
  /** Number of source rows that matched the filters. */
  matched: number;
  /** The hover-only numbers (Spec.tooltip): per Rows value (its key), and over everything. */
  tips?: { measures: { key: string; label: string; format: Format }[]; byKey: Record<string, (number | null)[]>; total: (number | null)[] };
};

export const OTHERS = "Others";
export const BLANK = "(blank)";
const MAX_SERIES = 8; // categorical palette size — a 9th series folds into Others (dataviz rule)

export class SpecError extends Error {}

export function checkSpec(spec: Spec): Dataset {
  const d = datasetOf(spec.dataset);
  if (!d) throw new SpecError(`Unknown data "${spec.dataset}"`);
  if (!spec.measures?.length) throw new SpecError("Pick at least one measure");
  for (const m of spec.measures) if (!measureOf(d, m)) throw new SpecError(`"${m}" isn't a measure of ${d.label}`);
  if ((spec.by ?? []).length > 2) throw new SpecError("At most two “split by”");
  if ((spec.tooltip ?? []).length > 3) throw new SpecError("At most 3 tooltip numbers");
  for (const m of spec.tooltip ?? []) if (!measureOf(d, m)) throw new SpecError(`"${m}" isn't a measure of ${d.label}`);
  for (const c of Object.values(spec.calcs ?? {})) if (!isTableCalc(c)) throw new SpecError(`"${c}" isn't a table calculation`);
  for (const b of spec.by ?? []) if (!fieldOf(d, b)) throw new SpecError(`"${b}" isn't a field of ${d.label}`);
  const isRange = (f: string) => Boolean(d.ranges?.some((x) => x.key === f));
  for (const f of spec.filters ?? []) if (!fieldOf(d, f.field) && !isRange(f.field)) throw new SpecError(`"${f.field}" isn't a field of ${d.label}`);
  if (spec.analysis && spec.analysis !== "funnel" && spec.analysis !== "drivers" && spec.analysis !== "priceAlerts" && !fieldOf(d, "customer")) throw new SpecError(`${d.label} has no customers to analyse`);
  if ((spec.analysis === "pvm" || spec.analysis === "reorder" || spec.analysis === "crosssell" || spec.analysis === "renewals" || spec.analysis === "dueMonths" || spec.analysis === "customerValue" || spec.analysis === "vsTarget") && d.key !== "sales") throw new SpecError("This analysis works on Sales");
  if (spec.analysis === "followup" && d.key !== "quotes") throw new SpecError("This analysis works on Quotes");
  if (spec.analysis === "priceAlerts" && d.key !== "purchases") throw new SpecError("This analysis works on Purchases");
  const c = spec.compare;
  if (c && typeof c === "object" && !fieldOf(d, c.field)) throw new SpecError(`"${c.field}" isn't a field of ${d.label}`);
  return d;
}

const asList = (v: Row[string]): string[] => (Array.isArray(v) ? (v.length ? v : [BLANK]) : v === null || v === undefined || v === "" ? [BLANK] : [String(v)]);

const active = (f: Filter) => f.values.length > 0 || Boolean(f.contains?.trim()) || f.min !== undefined || f.max !== undefined || Boolean(f.after || f.before);
function passes(f: Filter, r: Row): boolean {
  if (f.after || f.before) {
    const s = r[f.field];
    const hit = typeof s === "string" && Boolean(s) && (!f.after || s >= f.after) && (!f.before || s <= f.before);
    return f.exclude ? !hit : hit;
  }
  if (f.min !== undefined || f.max !== undefined) {
    const n = r[f.field];
    return typeof n === "number" && (f.min === undefined || n >= f.min) && (f.max === undefined || n <= f.max);
  }
  const vals = asList(r[f.field]);
  const q = f.contains?.trim().toLowerCase();
  const hit = q ? vals.some((v) => v !== BLANK && v.toLowerCase().includes(q)) : vals.some((v) => f.values.includes(v));
  return f.exclude ? !hit : hit;
}

/** The rows a spec's date range and filters keep. */
function keep(d: Dataset, rows: Row[], spec: Pick<Spec, "from" | "to" | "filters" | "dateField">): Row[] {
  const filters = (spec.filters ?? []).filter(active);
  const df = spec.dateField || d.dateField;
  return rows.filter((r) => {
    const date = r[df];
    // A table with no date at all ignores the period; so do joined rows marked "always" (joins.ts: the customers
    // beside their invoices — the period picks the invoices, it doesn't drop customers).
    if (df && (spec.from || spec.to) && r["⟂always"] !== "1") {
      if (typeof date !== "string" || !date) return false;
      if (spec.from && date < spec.from) return false;
      if (spec.to && date > spec.to) return false;
    }
    return filters.every((f) => passes(f, r));
  });
}

/** Per-measure accumulator over a set of rows. */
function evaluate(d: Dataset, keys: string[], rows: Row[]): (number | null)[] {
  const cache = new Map<string, number | null>();
  const num = (r: Row, f: string) => (typeof r[f] === "number" ? (r[f] as number) : 0);
  const one = (m: Measure): number | null => {
    if (cache.has(m.key)) return cache.get(m.key)!;
    let v: number | null = null;
    const w = "where" in m ? m.where : undefined;
    const rs = w ? rows.filter((r) => asList(r[w.field]).some((x) => w.values.includes(x))) : rows;
    if (m.agg === "count") { const f = m.field; v = f ? rs.filter((r) => asList(r[f])[0] !== BLANK).length : rs.length; }
    else if (m.agg === "sum") v = rs.reduce((s, r) => s + num(r, m.field), 0);
    else if (m.agg === "avg") {
      const xs = rs.map((r) => r[m.field]).filter((x): x is number => typeof x === "number");
      v = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
    } else if (m.agg === "min" || m.agg === "max") {
      const xs = rs.map((r) => r[m.field]).filter((x): x is number => typeof x === "number");
      v = xs.length ? (m.agg === "min" ? Math.min(...xs) : Math.max(...xs)) : null;
    } else if (m.agg === "distinct") v = new Set(rs.flatMap((r) => asList(r[m.field])).filter((x) => x !== BLANK)).size;
    else if (m.agg === "topShare") {
      const by = new Map<string, number>();
      for (const r of rs) for (const k of asList(r[m.field])) if (k !== BLANK) by.set(k, (by.get(k) ?? 0) + num(r, m.sum));
      const all = rs.reduce((s, r) => s + num(r, m.sum), 0);
      const top = [...by.values()].sort((a, b) => b - a).slice(0, m.n).reduce((s, x) => s + x, 0);
      v = all > 0 ? (top / all) * 100 : null;
    } else if (m.agg === "ratio") {
      const num = one(measureOf(d, m.num)!);
      const den = one(measureOf(d, m.den)!);
      v = num !== null && den ? (num / den) * (m.scale ?? 1) : null;
    } else if (m.agg === "filtered") {
      // A calculated field with conditions (calc.ts): its measure over the matching rows only.
      const base = measureOf(d, m.base);
      const fs = m.filters.map((f) => resolveFilter(f as Filter)).filter(active);
      v = base ? evaluate(d, [m.base], rs.filter((r) => fs.every((f) => passes(f, r))))[0] : null;
    } else if (m.agg === "const") {
      v = m.value;
    } else if (m.agg === "combine") {
      const a = measureOf(d, m.a), b = measureOf(d, m.b);
      const x = a ? one(a) : null, y = b ? one(b) : null;
      v = x === null || y === null ? null : m.op === "add" ? x + y : m.op === "sub" ? x - y : m.op === "mul" ? x * y : !y ? null : m.op === "pct" ? (x / y) * 100 : x / y;
    }
    cache.set(m.key, v);
    return v;
  };
  return keys.map((k) => one(measureOf(d, k)!));
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (a: string, n: number) => { const d = new Date(`${a}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** The period just before [from, to]: whole months shift by months (a FY → the FY before), else by days. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const next = new Date(t);
  next.setUTCDate(next.getUTCDate() + 1);
  if (f.getUTCDate() === 1 && next.getUTCDate() === 1) {
    const months = (next.getUTCFullYear() - f.getUTCFullYear()) * 12 + next.getUTCMonth() - f.getUTCMonth();
    const pf = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - months, 1));
    const pt = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 0));
    return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) };
  }
  const days = Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1;
  const pt = new Date(f);
  pt.setUTCDate(pt.getUTCDate() - 1);
  const pf = new Date(pt);
  pf.setUTCDate(pf.getUTCDate() - days + 1);
  return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) };
}

export function runQuery(spec: Spec, rows: Row[]): Result {
  // Parameters (params.ts): this run's values, and the filters that follow one become plain filters.
  setParamValues(spec.params);
  if (spec.filters?.some((f) => f.param)) spec = { ...spec, filters: spec.filters.map((f) => resolveFilter(f, spec.params)) };
  const d = checkSpec(spec);
  const grain: Grain = spec.grain ?? "month";
  const by = spec.by ?? [];
  const mode = spec.compare === true ? "previous" : spec.compare || null;
  const group = mode && typeof mode === "object" ? mode : null;
  // Comparing two groups: the report itself is group A.
  const withGroup = (values: string[]) => ({ ...spec, filters: [...(spec.filters ?? []), { field: group!.field, values }] });
  const kept = keep(d, rows, group ? withGroup(group.a) : spec);
  const keyOf = (r: Row, field: string): string[] => {
    // Any date column groups by the grain (owner's plan, point 5), not only the dataset's own date.
    if (field === d.dateField || fieldOf(d, field)?.kind === "date") { const v = r[field]; return typeof v === "string" && v ? [grainKey(v, grain)] : [BLANK]; }
    return asList(r[field]);
  };

  // Group (a multi-valued field puts the row in each of its values).
  const groups = new Map<string, { keys: string[]; rows: Row[] }>();
  for (const r of kept) {
    const a = by[0] ? keyOf(r, by[0]) : [""];
    const b = by[1] ? keyOf(r, by[1]) : [""];
    for (const x of a) for (const y of b) {
      const keys = by.length === 2 ? [x, y] : by.length === 1 ? [x] : [];
      const id = keys.join("\u0000");
      const g = groups.get(id) ?? { keys, rows: [] };
      g.rows.push(r);
      groups.set(id, g);
    }
  }

  const isDate = (f?: string) => Boolean(f) && (f === d.dateField || fieldOf(d, f!)?.kind === "date");
  const lead = spec.measures[0];
  const value = (rs: Row[]) => evaluate(d, [lead], rs)[0] ?? 0;
  const limit = spec.limit && spec.limit > 0 ? spec.limit : 0;

  // Second split: keep the top series (by the lead measure), fold the rest into Others. Not on a heatmap / matrix —
  // their cells are shaded, not one colour per series, and 12 months must stay 12 columns.
  let seriesKeep: Set<string> | null = null;
  if (by.length === 2 && !isDate(by[1]) && spec.chart !== "heatmap" && spec.chart !== "matrix") {
    const bySeries = new Map<string, Row[]>();
    for (const g of groups.values()) bySeries.set(g.keys[1], [...(bySeries.get(g.keys[1]) ?? []), ...g.rows]);
    const ranked = [...bySeries.entries()].map(([k, rs]) => ({ k, v: value([...new Set(rs)]) })).sort((p, q) => q.v - p.v);
    const cap = Math.min(limit || MAX_SERIES - 1, MAX_SERIES - 1);
    if (ranked.length > cap + 1) seriesKeep = new Set(ranked.slice(0, cap).map((x) => x.k));
  }
  if (seriesKeep) {
    const merged = new Map<string, { keys: string[]; rows: Row[] }>();
    for (const g of groups.values()) {
      const s = seriesKeep.has(g.keys[1]) ? g.keys[1] : OTHERS;
      const keys = [g.keys[0], s];
      const id = keys.join("\u0000");
      const m = merged.get(id) ?? { keys, rows: [] };
      m.rows.push(...g.rows);
      merged.set(id, m);
    }
    groups.clear();
    for (const [id, g] of merged) groups.set(id, { keys: g.keys, rows: [...new Set(g.rows)] });
  }

  let out: ResultRow[] = [...groups.values()].map((g) => ({ keys: g.keys, values: evaluate(d, spec.measures, g.rows) }));

  // Order: dates in time order; text biggest first (or by name).
  const sortByLabel = spec.sort === "label" || isDate(by[0]);
  const firstTotals = new Map<string, number>();
  for (const r of out) firstTotals.set(r.keys[0], (firstTotals.get(r.keys[0]) ?? 0) + (r.values[0] ?? 0));
  const order = by[0] ? fieldOf(d, by[0])?.order : undefined;
  const rank = (k: string) => (order ? (order.indexOf(k) + 1 || order.length + 1) : 0);
  out.sort((p, q) => {
    if (sortByLabel) return p.keys[0] === BLANK ? 1 : q.keys[0] === BLANK ? -1 : rank(p.keys[0]) - rank(q.keys[0]) || p.keys[0].localeCompare(q.keys[0]) || (p.keys[1] ?? "").localeCompare(q.keys[1] ?? "");
    return (firstTotals.get(q.keys[0]) ?? 0) - (firstTotals.get(p.keys[0]) ?? 0) || p.keys[0].localeCompare(q.keys[0]);
  });

  // Top N on the first split (text only): the rest becomes one "Others" row, computed from its own rows.
  if (limit && by.length === 1 && !isDate(by[0]) && out.length > limit + 1) {
    const top = out.slice(0, limit);
    const restKeys = new Set(out.slice(limit).map((r) => r.keys[0]));
    const restRows = [...new Set([...groups.values()].filter((g) => restKeys.has(g.keys[0])).flatMap((g) => g.rows))];
    out = [...top, { keys: [OTHERS], values: evaluate(d, spec.measures, restRows) }];
  }

  const result: Result = {
    by: by.map((k) => ({ key: k, label: fieldOf(d, k)!.label, date: isDate(k), ...(fieldOf(d, k)!.order ? { order: fieldOf(d, k)!.order } : {}) })),
    measures: spec.measures.map((k) => { const m = measureOf(d, k)!; return { key: k, label: m.label, format: m.format, ...(m.better ? { better: m.better } : {}) }; }),
    rows: out,
    totals: evaluate(d, spec.measures, kept),
    matched: kept.length,
  };
  // Hover-only numbers, per Rows value (with a Colour split, for the whole bar / point).
  if (spec.tooltip?.length) {
    const byKey: Record<string, (number | null)[]> = {};
    if (by[0]) {
      const first = new Map<string, Row[]>();
      for (const r of kept) for (const k of keyOf(r, by[0])) first.set(k, [...(first.get(k) ?? []), r]);
      for (const [k, rs] of first) byKey[k] = evaluate(d, spec.tooltip, rs);
      // "Others" (the top N folded the rest): everything not shown on its own.
      if (out.some((r) => r.keys[0] === OTHERS)) {
        const shown = new Set(out.map((r) => r.keys[0]));
        byKey[OTHERS] = evaluate(d, spec.tooltip, kept.filter((r) => keyOf(r, by[0]).every((k) => !shown.has(k))));
      }
    }
    result.tips = { measures: spec.tooltip.map((k) => { const m = measureOf(d, k)!; return { key: k, label: m.label, format: m.format }; }), byKey, total: evaluate(d, spec.tooltip, kept) };
  }
  // The comparison: its rows, and how to move their dates onto this period's axis (a year on, or a period on).
  let prevRows: Row[] | null = null;
  let curRows: Row[] = kept; // this period up to today when it's still running (like for like with prevRows)
  let shift: ((ymd: string) => string) | null = null;
  if (group) {
    prevRows = keep(d, rows, withGroup(group.b));
    result.previous = evaluate(d, spec.measures, prevRows);
    result.nowLabel = groupName(group.a);
    result.prevLabel = groupName(group.b);
  } else if (mode && spec.from && spec.to) {
    const p = mode === "lastYear" ? { from: addMonths(spec.from, -12), to: addMonths(spec.to, -12) } : previousPeriod(spec.from, spec.to);
    // Still running (e.g. this FY): today's position against the same number of days into the period before — never
    // a part period against a whole one (the Overview's rule too).
    const running = spec.asOf && spec.asOf >= spec.from && spec.asOf < spec.to;
    const prevTo = running ? addDays(p.from, daysBetween(spec.from, spec.asOf!)) : p.to;
    if (running) { curRows = keep(d, rows, { ...spec, to: spec.asOf }); result.toDate = evaluate(d, spec.measures, curRows); }
    prevRows = keep(d, rows, { ...spec, from: p.from, to: prevTo });
    result.previous = evaluate(d, spec.measures, prevRows);
    result.prevFrom = p.from;
    result.prevTo = prevTo;
    const months = monthsBetween(p.from, spec.from);
    shift = months !== null ? (x) => addMonths(x, months) : (x) => addDays(x, daysBetween(p.from, spec.from!));
    result.nowLabel = mode === "lastYear" ? "This year" : "This period";
    result.prevLabel = mode === "lastYear" ? "Last year" : "Period before";
  }

  // One split: each bar / month's value in the comparison too (charts draw it beside, tables add a column).
  if (prevRows && by.length === 1) {
    const field = by[0];
    const keysOf = (r: Row): string[] => {
      if (!isDate(field) || !shift) return keyOf(r, field);
      const v = r[field];
      return typeof v === "string" && v ? [grainKey(shift(v), grain)] : [BLANK];
    };
    const prevBy = new Map<string, Row[]>();
    for (const r of prevRows) for (const k of keysOf(r)) prevBy.set(k, [...(prevBy.get(k) ?? []), r]);
    const shown = new Set(out.map((r) => r.keys[0]));
    for (const row of out) {
      const rs = row.keys[0] === OTHERS ? [...new Set(prevRows.filter((r) => !keysOf(r).some((k) => shown.has(k) && k !== OTHERS)))] : prevBy.get(row.keys[0]) ?? [];
      row.prev = evaluate(d, spec.measures, rs);
    }
    // A field with a fixed set of values (segment, age band…): a value only in the comparison keeps its bar, at 0 now —
    // "Revenue by segment" vs last year must show what now sits in At risk / Lost (27 Oct: ₹93 L was missing).
    if (order && !isDate(field)) {
      for (const [k, rs] of prevBy) if (!shown.has(k) && k !== BLANK) out.push({ keys: [k], values: evaluate(d, spec.measures, []), prev: evaluate(d, spec.measures, rs) });
      if (sortByLabel) out.sort((p, q) => (p.keys[0] === OTHERS ? 1 : q.keys[0] === OTHERS ? -1 : rank(p.keys[0]) - rank(q.keys[0])));
    }
  }
  // Two text splits (the matrix): each cell in the comparison too — and cells that only had sales then, so row and
  // column totals add up.
  if (prevRows && by.length === 2 && !isDate(by[0]) && !isDate(by[1])) {
    const id = (a: string, b: string) => `${a}\u0000${b}`;
    const prevBy = new Map<string, { keys: string[]; rows: Row[] }>();
    for (const r of prevRows) for (const x of keyOf(r, by[0])) for (const y0 of keyOf(r, by[1])) {
      const y = seriesKeep && !seriesKeep.has(y0) ? OTHERS : y0;
      const g = prevBy.get(id(x, y)) ?? { keys: [x, y], rows: [] };
      g.rows.push(r);
      prevBy.set(id(x, y), g);
    }
    const have = new Set(result.rows.map((r) => id(r.keys[0], r.keys[1])));
    for (const row of result.rows) row.prev = evaluate(d, spec.measures, prevBy.get(id(row.keys[0], row.keys[1]))?.rows ?? []);
    for (const [k, g] of prevBy) if (!have.has(k)) result.rows.push({ keys: g.keys, values: evaluate(d, spec.measures, []), prev: evaluate(d, spec.measures, g.rows) });
  }
  if (spec.analysis) return analyse(d, spec, rows, curRows, prevRows, result);
  return applyTableCalcs(result, spec.calcs, by.length);
}

/*
 * Ready-made analyses (owner, 27 Oct: "advanced reports top businesses use") — each reshapes one measure into rows a
 * chart or table can show. They work on the first measure, which must add up (revenue, units…).
 * - bridge:   last year → this year by customer: new, bought more, bought less, didn't buy again (needs a time compare)
 * - pareto:   how revenue is spread over customers: top 10, 11–20, 21–50, 51–100, the rest
 * - winback:  customers who bought in the comparison period and not in this one, biggest first (needs a time compare)
 * - drivers:  what changed: each value of the split's change against the comparison, biggest rises and falls
 * - funnel:   each measure as a step (quotes → accepted → invoiced), with its share of the first
 * - followup: quotes with no answer yet, oldest first — who to chase (owner, 30 Oct — phase 5)
 * - renewals: customers whose last training's certificates (valid 2 years) run out within 90 days either side of today
 * - dueMonths: next 12 months — customers due certificates, AED pads (every 2 years) and batteries (every 4 years)
 * - priceAlerts: items whose latest purchase price (last 12 months) moved 5%+ from the bill before
 * - customerValue: each customer's revenue since Jul 2021, invoices, first / last bought, days between orders
 *   (variant "bands": customers and revenue per value band)
 * - vsTarget: each sales person's revenue and share of the team's revenue goal, pro-rated to the days so far
 */
function analyse(d: Dataset, spec: Spec, all: Row[], cur: Row[], prev: Row[] | null, base: Result): Result {
  const m = spec.measures[0];
  const sum = (rs: Row[]) => evaluate(d, [m], rs)[0] ?? 0;
  const fmt = base.measures[0];
  // blanks: "what changed" keeps rows with no value as "(not set)", so its rises and falls add up to the change.
  const byKey = (rs: Row[], field: string, blanks = false) => {
    const g = new Map<string, Row[]>();
    for (const r of rs) for (const k of asList(r[field])) if (blanks || k !== BLANK) g.set(k, [...(g.get(k) ?? []), r]);
    return g;
  };
  const out = (rows: ResultRow[], by: Result["by"], extra: Partial<Result> = {}): Result => ({ ...base, by, rows, measures: [fmt], ...extra });
  const n = (x: number) => x.toLocaleString("en-IN");

  if (spec.analysis === "funnel") {
    const vals = base.toDate ?? base.totals;
    const first = vals[0] ?? 0;
    return out(base.measures.map((mm, i) => ({ keys: [i && first ? `${mm.label} · ${Math.round(((vals[i] ?? 0) / first) * 100)}%` : mm.label], values: [vals[i]] })), [{ key: "step", label: "Step", date: false }], { totals: [first] });
  }
  if (spec.analysis === "pareto") {
    const per = [...byKey(cur, "customer").values()].map(sum).sort((a, b) => b - a);
    const total = per.reduce((s, x) => s + x, 0);
    let acc = 0, n80 = 0;
    for (const v of per) { if (acc >= total * 0.8) break; acc += v; n80++; }
    const bands: [string, number, number][] = [["Top 10", 0, 10], ["11–20", 10, 20], ["21–50", 20, 50], ["51–100", 50, 100], ["The rest", 100, Infinity]];
    const rows = bands.filter(([, a]) => a < per.length).map(([label, a, b]) => {
      const v = per.slice(a, b).reduce((s, x) => s + x, 0);
      return { keys: [`${label} · ${total ? Math.round((v / total) * 100) : 0}%`], values: [v] as (number | null)[] };
    });
    return out(rows, [{ key: "band", label: "Customers", date: false }], { note: `${n(n80)} of ${n(per.length)} customers make 80% of it.` });
  }
  // Purchase-price alerts (owner, 30 Oct — phase 5): per Zoho item, the price per unit on its latest bill day against
  // the bill day before; 5% or more either way (up to 3×), latest bill within 12 months, catalogue goods only. Filters
  // apply, the period doesn't.
  if (spec.analysis === "priceAlerts") {
    const today = spec.asOf ?? new Date().toISOString().slice(0, 10);
    const per = new Map<string, Map<string, { qty: number; amount: number }>>();
    const brand = new Map<string, string>();
    for (const r of keep(d, all, { filters: spec.filters })) {
      const k = typeof r.zohoItem === "string" ? r.zohoItem : null; const dt = typeof r.date === "string" ? r.date : null;
      const qty = Number(r.qty) || 0;
      if (!k || !dt || qty <= 0 || typeof r.itemGroup !== "string" || !r.itemGroup) continue; // goods in the catalogue — not services or expenses
      const days = per.get(k) ?? per.set(k, new Map()).get(k)!;
      const x = days.get(dt) ?? { qty: 0, amount: 0 };
      x.qty += qty; x.amount += Number(r.amount) || 0; days.set(dt, x);
      if (typeof r.brand === "string") brand.set(k, r.brand);
    }
    const since = addMonths(today, -12);
    const day = (x: string) => grainLabel(x, "day", true);
    const moves = [...per].flatMap(([k, days]) => {
      const [last, before] = [...days].sort((a, b) => b[0].localeCompare(a[0]));
      if (!last || !before || last[0] < since) return [];
      const p1 = last[1].amount / last[1].qty, p0 = before[1].amount / before[1].qty;
      const ch = p0 > 0 ? ((p1 - p0) / p0) * 100 : null;
      // Over 3× either way is nearly always a different pack size on the bill (300 swabs, then 1 box), not a price move.
      return ch !== null && Math.abs(ch) >= 5 && p1 <= p0 * 3 && p1 >= p0 / 3 ? [{ k, p0, p1, ch, d0: before[0], d1: last[0] }] : [];
    }).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch));
    const lim = spec.limit || 25;
    return out(moves.slice(0, lim).map((m) => ({ keys: [m.k, brand.get(m.k) ?? "—", day(m.d0), day(m.d1)], values: [m.p0, m.p1, m.ch] })),
      [{ key: "item", label: "Item", date: false }, { key: "brand", label: "Brand", date: false }, { key: "before", label: "Bill before", date: false }, { key: "latest", label: "Latest bill", date: false }],
      { measures: [{ key: "p0", label: "Price before", format: "inr" }, { key: "p1", label: "Latest price", format: "inr" }, { key: "ch", label: "Change %", format: "pct", better: "down" }], totals: [null, null, null],
        note: `${n(moves.filter((m) => m.ch > 0).length)} items cost more on their latest bill, ${n(moves.filter((m) => m.ch < 0).length)} less (5% or more, latest bill in the last 12 months; moves over 3× left out — usually a different pack size)${moves.length > lim ? ` — the ${lim} biggest moves shown` : ""}.` });
  }
  // Customer value (owner, 30 Oct — phase 5): all of history (Zoho Books from Jul 2021); filters apply, the period doesn't.
  if (spec.analysis === "customerValue") {
    const per = new Map<string, { value: number; invoices: Set<string>; days: Set<string>; first: string; last: string; info: Row }>();
    for (const r of keep(d, all, { filters: spec.filters })) for (const k of asList(r.customer)) {
      if (k === BLANK || typeof r.date !== "string") continue;
      const c = per.get(k) ?? { value: 0, invoices: new Set<string>(), days: new Set<string>(), first: r.date, last: r.date, info: r };
      c.value += sum([r]); c.invoices.add(String(r.invoice ?? "")); c.days.add(r.date);
      if (r.date < c.first) c.first = r.date;
      if (r.date >= c.last) { c.last = r.date; c.info = r; }
      per.set(k, c);
    }
    const list = [...per].sort((a, b) => b[1].value - a[1].value);
    const total = list.reduce((s, [, c]) => s + c.value, 0);
    if (spec.variant === "bands") {
      const BANDS: [string, number][] = [["₹10 L and more", 10_00_000], ["₹5–10 L", 5_00_000], ["₹1–5 L", 1_00_000], ["₹25 K–1 L", 25_000], ["Under ₹25 K", -Infinity]];
      const rowsOut = BANDS.map(([label, min], i) => {
        const inBand = list.filter(([, c]) => c.value >= min && (i === 0 || c.value < BANDS[i - 1][1]));
        return { keys: [label], values: [inBand.length, inBand.reduce((s, [, c]) => s + c.value, 0)] };
      });
      return out(rowsOut, [{ key: "band", label: "Revenue since Jul 2021", date: false }],
        { measures: [{ key: "customers", label: "Customers", format: "count" }, { ...fmt, label: `${fmt.label} (all time)` }], totals: [list.length, total] });
    }
    const day = (x: string) => grainLabel(x, "day", true);
    const text = (v: Row[string] | undefined) => (typeof v === "string" && v ? v : "—");
    const lim = spec.limit || 25;
    return out(list.slice(0, lim).map(([k, c]) => {
      const gap = c.days.size > 1 ? Math.round(daysBetween(c.first, c.last) / (c.days.size - 1)) : null;
      return { keys: [k, day(c.first), day(c.last), String(c.invoices.size), gap === null ? "—" : `${gap} days`, text(c.info.sector)], values: [c.value] };
    }), [{ key: "customer", label: "Customer", date: false }, { key: "first", label: "First bought", date: false }, { key: "last", label: "Last bought", date: false }, { key: "invoices", label: "Invoices", date: false }, { key: "gap", label: "Days between orders", date: false }, { key: "sector", label: "Sector", date: false }],
      { measures: [{ ...fmt, label: `${fmt.label} (all time)` }], totals: [total], note: `The top ${Math.min(lim, list.length)} of ${n(list.length)} customers make ${total ? Math.round((list.slice(0, lim).reduce((s, [, c]) => s + c.value, 0) / total) * 100) : 0}% of all revenue since Jul 2021.` });
  }
  // Sales against target (owner, 30 Oct — phase 5: "sales target is 50 lakh per month" — one team target): each sales
  // person's revenue in the period and their share of the team goal × months so far (a month part-way counts its share
  // of days, so mid-month reads fairly).
  if (spec.analysis === "vsTarget") {
    const goal = spec.goal ?? { monthly: 0, months: {} };
    const today = spec.asOf ?? new Date().toISOString().slice(0, 10);
    const from = spec.from ?? today.slice(0, 8) + "01";
    const to = !spec.to || spec.to > today ? today : spec.to;
    let months = 0, target = 0;
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m + "-01", 1).slice(0, 7)) {
      const len = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
      const a = m === from.slice(0, 7) ? Number(from.slice(8, 10)) : 1, b = m === to.slice(0, 7) ? Number(to.slice(8, 10)) : len;
      const part = Math.max(0, b - a + 1) / len;
      months += part; target += part * (goal.months[m] ?? goal.monthly);
    }
    const got = new Map<string, number>();
    for (const r of cur) for (const k of asList(r.salesperson)) got.set(k, (got.get(k) ?? 0) + sum([r]));
    const list = [...got].filter(([k]) => k !== BLANK).sort((a, b) => b[1] - a[1]);
    const total = [...got.values()].reduce((s, v) => s + v, 0);
    const pct = (v: number) => (target ? (v / target) * 100 : null);
    const money = (v: number) => formatValue(v, "inr");
    return out(list.map(([k, v]) => ({ keys: [k], values: [v, pct(v)] })),
      [{ key: "salesperson", label: "Sales person", date: false }],
      { measures: [{ ...fmt, label: "Revenue" }, { key: "pct", label: "Share of team target", format: "pct" }], totals: [total, pct(total)],
        note: `Team target so far ${money(target)} (${months.toFixed(1)} months, ${grainLabel(from, "day", true)} to ${grainLabel(to, "day", true)}); together ${Math.round(pct(total) ?? 0)}% of it${got.has(BLANK) ? " — incl. invoices with no sales person" : ""}.` });
  }
  // Quotes to chase: no answer yet (filters apply, the period doesn't), oldest first.
  if (spec.analysis === "followup") {
    const rows = keep(d, all, { filters: spec.filters }).filter((r) => r.outcome === "Waiting").sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const lim = spec.limit || 25;
    const text = (v: Row[string] | undefined) => (typeof v === "string" && v ? v : "—");
    return out(rows.slice(0, lim).map((r) => ({ keys: [text(r.quote), text(r.customer), typeof r.date === "string" ? grainLabel(r.date, "day", true) : "—", `${r.daysWaiting ?? "—"} days`, text(r.salesperson)], values: [sum([r])] })),
      [{ key: "quote", label: "Quote", date: false }, { key: "customer", label: "Customer", date: false }, { key: "sent", label: "Sent", date: false }, { key: "waiting", label: "Waiting", date: false }, { key: "salesperson", label: "Sales person", date: false }],
      { totals: [sum(rows)], note: `${n(rows.length)} quotes have no answer yet${rows.length > lim ? ` — the oldest ${lim} shown` : ""}.` });
  }
  // Renewals (owner, 30 Oct — phase 5). Over all of history; filters apply, the period doesn't. A training's date is its
  // invoice's (Zoho's "Training Date" is on 20 invoices only); certificates are valid 2 years. Pads last 2 years and
  // batteries 4, counted from the AED or from the last pads / battery bought, whichever is later.
  if (spec.analysis === "renewals" || spec.analysis === "dueMonths") {
    const today = spec.asOf ?? new Date().toISOString().slice(0, 10);
    const rows = keep(d, all, { filters: spec.filters });
    type Last = { date: string; people: number; value: number; invoice: string };
    const per = new Map<string, { training?: Last; aed?: string; pads?: string; battery?: string; info: Row }>();
    for (const r of rows) for (const k of asList(r.customer)) {
      if (k === BLANK || typeof r.date !== "string") continue;
      const c = per.get(k) ?? { info: r };
      const dt = r.date;
      // Training lines: item group Training Services, or (half of them) a line typed with no Zoho item — "CPR AED
      // Training (M)", "Fast Response BLS Course" — but not training pads, manikins, masks or kits.
      const g = typeof r.itemGroup === "string" ? r.itemGroup : "";
      if (/training services/i.test(g) || (!g && /training|course|\bbls\b/i.test(String(r.item ?? "")) && !/pads|manikin|mask|kit/i.test(String(r.item ?? "")))) {
        if (!c.training || dt > c.training.date) c.training = { date: dt, people: 0, value: 0, invoice: String(r.invoice ?? "") };
        if (c.training.date === dt && c.training.invoice === String(r.invoice ?? "")) { c.training.people += Number(r.qty) || 0; c.training.value += Number(r.amount) || 0; }
      }
      if (r.kind === "AED" && dt > (c.aed ?? "")) c.aed = dt;
      if (r.kind === "Pads" && dt > (c.pads ?? "")) c.pads = dt;
      if (r.kind === "Battery" && dt > (c.battery ?? "")) c.battery = dt;
      if (dt >= String(c.info.date ?? "")) c.info = r;
      per.set(k, c);
    }
    const later = (a?: string, b?: string) => (a && b ? (a > b ? a : b) : a ?? b);
    const due = (c: { training?: Last; aed?: string; pads?: string; battery?: string }) => ({
      certs: c.training ? addMonths(c.training.date, 24) : undefined,
      pads: c.aed ? addMonths(later(c.aed, c.pads)!, 24) : undefined,
      battery: c.aed ? addMonths(later(c.aed, c.battery)!, 48) : undefined,
    });
    const text = (v: Row[string] | undefined) => (typeof v === "string" && v ? v : "—");
    const day = (x: string) => grainLabel(x, "day", true);
    if (spec.analysis === "renewals") {
      const from = addMonths(today, -3), to = addMonths(today, 3);
      const list = [...per].map(([k, c]) => ({ k, c, exp: due(c).certs })).filter((x) => x.exp && x.exp >= from && x.exp <= to).sort((a, b) => a.exp!.localeCompare(b.exp!));
      const lim = spec.limit || 25;
      return out(list.slice(0, lim).map(({ k, c, exp }) => ({ keys: [k, day(c.training!.date), `${day(exp!)}${exp! < today ? " (ran out)" : ""}`, String(c.training!.people || "—"), text(c.info.sector), text(c.info.salesperson)], values: [c.training!.value] })),
        [{ key: "customer", label: "Customer", date: false }, { key: "trained", label: "Last trained", date: false }, { key: "expires", label: "Certificates run out", date: false }, { key: "people", label: "People (invoice qty)", date: false }, { key: "sector", label: "Sector", date: false }, { key: "salesperson", label: "Sales person", date: false }],
        { measures: [{ ...fmt, label: "Last training (₹)" }], totals: [list.reduce((s, x) => s + x.c.training!.value, 0)],
          note: `${n(list.length)} customers' certificates run out between ${day(from)} and ${day(to)}${list.length > lim ? ` — the first ${lim} shown` : ""}.` });
    }
    // dueMonths: "Already due" (pads / batteries only — certificates already out are in the renewals list) + 12 months.
    const months = Array.from({ length: 12 }, (_, i) => addMonths(today.slice(0, 7) + "-01", i).slice(0, 7));
    const end = addMonths(today.slice(0, 7) + "-01", 12);
    const KINDS = [["certs", "Certificates"], ["pads", "AED pads"], ["battery", "AED batteries"]] as const;
    const count = new Map<string, number>();
    for (const [, c] of per) {
      const x = due(c);
      for (const [key, label] of KINDS) {
        const at = x[key];
        if (!at || at >= end) continue;
        const bucket = at < today.slice(0, 7) + "-01" ? (key === "certs" ? null : "Already due") : grainLabel(at.slice(0, 7), "month");
        if (bucket) count.set(`${bucket}|${label}`, (count.get(`${bucket}|${label}`) ?? 0) + 1);
      }
    }
    const buckets = ["Already due", ...months.map((m) => grainLabel(m, "month"))];
    const rowsOut: ResultRow[] = buckets.flatMap((b) => KINDS.map(([, label]) => ({ keys: [b, label], values: [count.get(`${b}|${label}`) ?? 0] })));
    return out(rowsOut, [{ key: "month", label: "Due", date: false, order: buckets }, { key: "what", label: "What", date: false }],
      { measures: [{ key: "customers", label: "Customers due", format: "count" }], totals: [[...count.values()].reduce((s, v) => s + v, 0)] });
  }
  // Lists over the whole history (filters apply, the period doesn't): who to call about pads / batteries, and who
  // bought one thing but not the other.
  if (spec.analysis === "reorder" || spec.analysis === "crosssell") {
    const rows = keep(d, all, { filters: spec.filters });
    const per = new Map<string, { aed?: string; aedValue: number; aedUnits: number; consumable?: string; training?: string; trainingValue: number; info: Row }>();
    for (const r of rows) for (const k of asList(r.customer)) {
      if (k === BLANK) continue;
      const g = String(r.itemGroup ?? "");
      const dt = typeof r[d.dateField] === "string" ? (r[d.dateField] as string) : "";
      const c = per.get(k) ?? { aedValue: 0, aedUnits: 0, trainingValue: 0, info: r };
      if (g === "All AEDs") { if (dt > (c.aed ?? "")) c.aed = dt; c.aedValue += Number(r.amount) || 0; c.aedUnits += Number(r.qty) || 0; }
      if (g === "AED Pads" || g === "AED Batteries") { if (dt > (c.consumable ?? "")) c.consumable = dt; }
      if (/training services/i.test(g)) { if (dt > (c.training ?? "")) c.training = dt; c.trainingValue += Number(r.amount) || 0; }
      if (dt >= String(c.info[d.dateField] ?? "")) c.info = r;
      per.set(k, c);
    }
    const day = (x?: string) => (x ? grainLabel(x, "day", true) : "never");
    const text = (v: Row[string] | undefined) => (typeof v === "string" && v ? v : "—");
    const cols = (more: Result["by"]) => [{ key: "customer", label: "Customer", date: false }, ...more, { key: "sector", label: "Sector", date: false }, { key: "salesperson", label: "Sales person", date: false }];
    const lim = spec.limit || 25;
    if (spec.analysis === "reorder") {
      // Pads last about 2 years: AEDs bought 18+ months ago with no pads / batteries bought since.
      const cutoff = addMonths(spec.asOf ?? new Date().toISOString().slice(0, 10), -18);
      const due = [...per].filter(([, c]) => c.aed && c.aed <= cutoff && (!c.consumable || c.consumable < c.aed)).sort((a, b) => b[1].aedUnits - a[1].aedUnits || a[1].aed!.localeCompare(b[1].aed!));
      return out(due.slice(0, lim).map(([k, c]) => ({ keys: [k, day(c.aed), day(c.consumable), text(c.info.sector), text(c.info.salesperson)], values: [c.aedUnits] })),
        cols([{ key: "aed", label: "Last AED bought", date: false }, { key: "pads", label: "Last pads / battery", date: false }]),
        { measures: [{ key: "units", label: "AEDs bought", format: "count" }], totals: [due.reduce((s, [, c]) => s + c.aedUnits, 0)], note: `${n(due.length)} customers bought AEDs 18+ months ago and no pads or batteries since${due.length > lim ? ` — the ${lim} with the most AEDs shown` : ""}.` });
    }
    const wantTraining = spec.variant !== "aed";
    const gap = [...per].filter(([, c]) => (wantTraining ? c.aed && !c.training : c.training && !c.aed)).sort((a, b) => (wantTraining ? b[1].aedValue - a[1].aedValue : b[1].trainingValue - a[1].trainingValue));
    return out(gap.slice(0, lim).map(([k, c]) => ({ keys: [k, day(wantTraining ? c.aed : c.training), text(c.info.sector), text(c.info.salesperson)], values: [wantTraining ? c.aedValue : c.trainingValue] })),
      cols([{ key: "last", label: wantTraining ? "Last AED bought" : "Last training bought", date: false }]),
      { measures: [{ ...fmt, label: wantTraining ? "AEDs bought (₹)" : "Trainings bought (₹)" }], totals: [gap.reduce((s, [, c]) => s + (wantTraining ? c.aedValue : c.trainingValue), 0)],
        note: `${n(gap.length)} customers ${wantTraining ? "bought AEDs but never a training" : "took a training but never bought an AED"}${gap.length > lim ? ` — the biggest ${lim} shown` : ""}.` });
  }
  const overTime = base.prevLabel === "Last year" || base.prevLabel === "Period before";
  if (!prev || (spec.analysis !== "drivers" && !overTime)) return { ...base, rows: [], note: "Pick “vs last year” or “vs period before” to see this." };
  // Price · volume · mix (by item): did revenue change because more units were sold, at other prices, or a different
  // mix of items? Items sold in both periods split into price + volume + mix; the rest is new / dropped items.
  if (spec.analysis === "pvm") {
    const agg = (rs: Row[]) => { const g = new Map<string, { r: number; q: number }>(); for (const r of rs) { const k = String(r.zohoItem ?? r.item ?? BLANK); const x = g.get(k) ?? { r: 0, q: 0 }; x.r += Number(r.amount) || 0; x.q += Number(r.qty) || 0; g.set(k, x); } return g; };
    const a = agg(cur), b = agg(prev);
    let price = 0, volMix = 0, other = 0, q1 = 0, q0 = 0, r0both = 0;
    for (const [k, x] of a) {
      const y = b.get(k);
      if (y && x.q > 0 && y.q > 0) { const p1 = x.r / x.q, p0 = y.r / y.q; price += (p1 - p0) * x.q; volMix += (x.q - y.q) * p0; q1 += x.q; q0 += y.q; r0both += y.r; }
      else other += x.r - (y?.r ?? 0);
    }
    for (const [k, y] of b) if (!a.has(k)) other -= y.r;
    const volume = q0 ? (q1 - q0) * (r0both / q0) : 0;
    const before = [...b.values()].reduce((s, y) => s + y.r, 0), after = [...a.values()].reduce((s, x) => s + x.r, 0);
    return out([
      { keys: [`${base.prevLabel === "Last year" ? "Last year" : "Before"} (same days)`], values: [before] },
      { keys: ["More / fewer units"], values: [volume] },
      { keys: ["Higher / lower prices"], values: [price] },
      { keys: ["Different mix"], values: [volMix - volume] },
      { keys: ["New / dropped items"], values: [other] },
      { keys: [base.nowLabel ?? "Now"], values: [after] },
    ], [{ key: "step", label: "Step", date: false }], { note: "Units: what was sold more or less, at last year's average price · prices: the same items at new prices · mix: more of the dearer or cheaper items." });
  }
  const now = byKey(cur, "customer");
  const then = byKey(prev, "customer");
  if (spec.analysis === "bridge") {
    let fresh = 0, more = 0, less = 0, lost = 0;
    const c = { fresh: 0, more: 0, less: 0, lost: 0 };
    for (const [k, rs] of now) {
      const a = sum(rs);
      const b = then.has(k) ? sum(then.get(k)!) : 0;
      if (!b) { fresh += a; c.fresh++; } else if (a >= b) { more += a - b; c.more++; } else { less += a - b; c.less++; }
    }
    for (const [k, rs] of then) if (!now.has(k)) { lost -= sum(rs); c.lost++; }
    const before = sum(prev);
    const label = base.prevLabel === "Last year" ? "Last year" : base.prevLabel ?? "Before";
    return out([
      { keys: [`${label} (same days)`], values: [before] },
      { keys: [`New customers (${n(c.fresh)})`], values: [fresh] },
      { keys: [`Bought more (${n(c.more)})`], values: [more] },
      { keys: [`Bought less (${n(c.less)})`], values: [less] },
      { keys: [`Didn't buy again (${n(c.lost)})`], values: [lost] },
      { keys: [base.nowLabel ?? "Now"], values: [sum(cur)] },
    ], [{ key: "step", label: "Step", date: false }]);
  }
  if (spec.analysis === "winback") {
    const last = new Map<string, string>();
    const info = new Map<string, Row>();
    for (const r of all) for (const k of asList(r.customer)) {
      const dt = r[d.dateField];
      if (typeof dt === "string" && dt > (last.get(k) ?? "")) { last.set(k, dt); info.set(k, r); }
    }
    const rows = [...then].filter(([k]) => !now.has(k)).map(([k, rs]) => ({ k, v: sum(rs) })).sort((a, b) => b.v - a.v);
    const total = rows.reduce((s, x) => s + x.v, 0);
    const shown = rows.slice(0, spec.limit || 25);
    const text = (v: Row[string] | undefined) => (typeof v === "string" && v ? v : "—");
    return out(shown.map(({ k, v }) => ({ keys: [k, last.has(k) ? grainLabel(last.get(k)!, "day", true) : "—", text(info.get(k)?.sector), text(info.get(k)?.salesperson)], values: [v] })), [
      { key: "customer", label: "Customer", date: false }, { key: "last", label: "Last bought", date: false }, { key: "sector", label: "Sector", date: false }, { key: "salesperson", label: "Sales person", date: false },
    ], { measures: [{ ...fmt, label: `${fmt.label} then` }], totals: [total], note: `${n(rows.length)} customers bought in the comparison period and not since${rows.length > shown.length ? ` — the biggest ${shown.length} shown` : ""}.` });
  }
  if (spec.analysis === "drivers") {
    const field = spec.by?.[0] ?? "customer";
    const a = byKey(cur, field, true);
    const b = byKey(prev, field, true);
    const keys = new Set([...a.keys(), ...b.keys()]);
    const all2 = [...keys].map((k) => { const x = a.has(k) ? sum(a.get(k)!) : 0; const y = b.has(k) ? sum(b.get(k)!) : 0; return { k, delta: x - y, x, y }; }).filter((r) => Math.abs(r.delta) >= 0.5);
    const lim = spec.limit || 6;
    const up = all2.filter((r) => r.delta > 0).sort((p, q) => q.delta - p.delta).slice(0, lim);
    const down = all2.filter((r) => r.delta < 0).sort((p, q) => p.delta - q.delta).slice(0, lim).reverse();
    const change = sum(cur) - sum(prev);
    return out([...up, ...down].map((r) => ({ keys: [r.k], values: [r.delta], prev: [r.y] })), [{ key: field, label: fieldOf(d, field)?.label ?? field, date: false }], {
      measures: [{ ...fmt, label: "Change" }], totals: [change], note: `In all: ${change >= 0 ? "up" : "down"} by ${fmt.format === "inr" ? `₹${Math.round(Math.abs(change)).toLocaleString("en-IN")}` : n(Math.round(Math.abs(change)))} — the biggest rises and falls.`,
    });
  }
  return base;
}

const groupName = (values: string[]) => (values.length <= 2 ? values.join(" + ") : `${values[0]} + ${values.length - 1} more`);

/** Same day n months on (or back), kept inside the month: 31 Mar − 1 month → 28 / 29 Feb. */
function addMonths(ymd: string, n: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7)) - 1 + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(Number(ymd.slice(8, 10)), last))).toISOString().slice(0, 10);
}
/** Whole months from a to b when both are the 1st of a month (else null). */
function monthsBetween(a: string, b: string): number | null {
  if (a.slice(8, 10) !== "01" || b.slice(8, 10) !== "01") return null;
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}
