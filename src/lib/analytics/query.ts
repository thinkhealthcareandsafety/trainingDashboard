import { type Dataset, type Format, type Grain, type Measure, type Row, datasetOf, fieldOf, grainKey, measureOf } from "./model";

/*
 * Runs a report spec over a dataset's rows (pure — the server calls it; scripts test it). A spec names only fields and
 * measures from model.ts; anything unknown is refused, so a report can't invent a number.
 */

export type ChartKind = "auto" | "kpi" | "column" | "bar" | "line" | "area" | "stacked" | "donut" | "table";
export type Filter = { field: string; values: string[] };
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
  /** Also compute the totals of the period before (same length) — KPI tiles. */
  compare?: boolean;
  chart?: ChartKind;
  title?: string;
  /** Saved reports keep a relative period ("fy", "3m"…, model.ts periods) — the browser turns it into from / to. */
  period?: string;
  /** Today (set by the server): a period still running is compared like for like — up to the same day of the one before. */
  asOf?: string;
};
export type ResultRow = { keys: string[]; values: (number | null)[] };
export type Result = {
  by: { key: string; label: string; date: boolean }[];
  measures: { key: string; label: string; format: Format }[];
  rows: ResultRow[];
  totals: (number | null)[];
  previous?: (number | null)[];
  prevFrom?: string;
  prevTo?: string;
  /** A period still running: totals up to today, to set against `previous` (the same days of the period before). */
  toDate?: (number | null)[];
  /** Number of source rows that matched the filters. */
  matched: number;
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
  for (const b of spec.by ?? []) if (!fieldOf(d, b)) throw new SpecError(`"${b}" isn't a field of ${d.label}`);
  for (const f of spec.filters ?? []) if (!fieldOf(d, f.field)) throw new SpecError(`"${f.field}" isn't a field of ${d.label}`);
  return d;
}

const asList = (v: Row[string]): string[] => (Array.isArray(v) ? (v.length ? v : [BLANK]) : v === null || v === undefined || v === "" ? [BLANK] : [String(v)]);

/** The rows a spec's date range and filters keep. */
function keep(d: Dataset, rows: Row[], spec: Pick<Spec, "from" | "to" | "filters">): Row[] {
  const filters = (spec.filters ?? []).filter((f) => f.values.length);
  return rows.filter((r) => {
    const date = r[d.dateField];
    if (spec.from || spec.to) {
      if (typeof date !== "string" || !date) return false;
      if (spec.from && date < spec.from) return false;
      if (spec.to && date > spec.to) return false;
    }
    return filters.every((f) => {
      const vals = asList(r[f.field]);
      return vals.some((v) => f.values.includes(v));
    });
  });
}

/** Per-measure accumulator over a set of rows. */
function evaluate(d: Dataset, keys: string[], rows: Row[]): (number | null)[] {
  const cache = new Map<string, number | null>();
  const one = (m: Measure): number | null => {
    if (cache.has(m.key)) return cache.get(m.key)!;
    let v: number | null = null;
    if (m.agg === "count") v = rows.length;
    else if (m.agg === "sum") v = rows.reduce((s, r) => s + (typeof r[m.field] === "number" ? (r[m.field] as number) : 0), 0);
    else if (m.agg === "avg") {
      const xs = rows.map((r) => r[m.field]).filter((x): x is number => typeof x === "number");
      v = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
    } else if (m.agg === "distinct") v = new Set(rows.flatMap((r) => asList(r[m.field])).filter((x) => x !== BLANK)).size;
    else if (m.agg === "ratio") {
      const num = one(measureOf(d, m.num)!);
      const den = one(measureOf(d, m.den)!);
      v = num !== null && den ? (num / den) * (m.scale ?? 1) : null;
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
  const d = checkSpec(spec);
  const grain: Grain = spec.grain ?? "month";
  const by = spec.by ?? [];
  const kept = keep(d, rows, spec);
  const keyOf = (r: Row, field: string): string[] => {
    if (field === d.dateField) { const v = r[field]; return typeof v === "string" && v ? [grainKey(v, grain)] : [BLANK]; }
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

  const isDate = (f?: string) => f === d.dateField;
  const lead = spec.measures[0];
  const value = (rs: Row[]) => evaluate(d, [lead], rs)[0] ?? 0;
  const limit = spec.limit && spec.limit > 0 ? spec.limit : 0;

  // Second split: keep the top series (by the lead measure), fold the rest into Others.
  let seriesKeep: Set<string> | null = null;
  if (by.length === 2 && !isDate(by[1])) {
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
    by: by.map((k) => ({ key: k, label: fieldOf(d, k)!.label, date: isDate(k) })),
    measures: spec.measures.map((k) => { const m = measureOf(d, k)!; return { key: k, label: m.label, format: m.format }; }),
    rows: out,
    totals: evaluate(d, spec.measures, kept),
    matched: kept.length,
  };
  if (spec.compare && spec.from && spec.to) {
    const p = previousPeriod(spec.from, spec.to);
    // Still running (e.g. this FY): today's position against the same number of days into the period before — never
    // a part period against a whole one (the Overview's rule too).
    const running = spec.asOf && spec.asOf >= spec.from && spec.asOf < spec.to;
    const prevTo = running ? addDays(p.from, daysBetween(spec.from, spec.asOf!)) : p.to;
    if (running) result.toDate = evaluate(d, spec.measures, keep(d, rows, { ...spec, to: spec.asOf }));
    result.previous = evaluate(d, spec.measures, keep(d, rows, { ...spec, from: p.from, to: prevTo }));
    result.prevFrom = p.from;
    result.prevTo = prevTo;
  }
  return result;
}
