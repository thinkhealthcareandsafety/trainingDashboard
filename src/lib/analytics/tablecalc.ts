import type { Format } from "./model";
import type { Result, ResultRow } from "./query";

/*
 * Quick table calculations (owner's Tableau plan, 31 Oct: "running total, % of total, difference / % change, rank") —
 * a value pill can show its numbers as something worked out from the other rows, after they're added up. Pure:
 * tests/tablecalc.test.ts.
 * - It goes down the rows in the order they're shown (dates in time order); with a Colour / Columns split, inside
 *   each series.
 * - % of total is of the grand total (Others included); rank 1 = the biggest, ties share a rank, Others has none;
 *   the first row has no difference.
 * - The comparison column gets the same calculation; totals keep what still means something (a running total's
 *   total is the total, % of total is 100%, the rest have none).
 * - A report with no Rows (one number) is left as it is.
 */

export type TableCalc = "running" | "pct" | "diff" | "pctChange" | "rank";
export const TABLE_CALCS: [TableCalc, string][] = [
  ["running", "Running total"], ["pct", "% of total"], ["diff", "Difference from previous"], ["pctChange", "% change from previous"], ["rank", "Rank"],
];
const SUFFIX: Record<TableCalc, string> = { running: "running total", pct: "% of total", diff: "difference", pctChange: "% change", rank: "rank" };
export const isTableCalc = (x: unknown): x is TableCalc => TABLE_CALCS.some(([k]) => k === x);

/** The unit a number shows in once calculated. */
export const calcFormat = (f: Format, c?: TableCalc): Format => (c === "pct" || c === "pctChange" ? "pct" : c === "rank" ? "count" : f);
export const calcLabel = (label: string, c?: TableCalc) => (c ? `${label} (${SUFFIX[c]})` : label);

const OTHERS = "Others";

function calcColumn(c: TableCalc, vals: (number | null)[], total: number | null, others: boolean[]): (number | null)[] {
  if (c === "pct") return vals.map((v) => (v === null || !total ? null : (v / total) * 100));
  if (c === "running") { let s = 0; return vals.map((v) => (s += v ?? 0)); }
  if (c === "diff") return vals.map((v, i) => (i === 0 || v === null || vals[i - 1] === null ? null : v - vals[i - 1]!));
  if (c === "pctChange") return vals.map((v, i) => { const p = vals[i - 1]; return i === 0 || v === null || p === null || p === undefined || p === 0 ? null : ((v - p) / Math.abs(p)) * 100; });
  // rank: 1 + how many are bigger (ties share a rank)
  const ranked = vals.filter((v, i) => v !== null && !others[i]) as number[];
  return vals.map((v, i) => (v === null || others[i] ? null : 1 + ranked.filter((x) => x > v).length));
}

export function applyTableCalcs(result: Result, calcs: Record<string, TableCalc> | undefined, splits: number): Result {
  if (!calcs || !splits) return result;
  const used = result.measures.map((m) => (isTableCalc(calcs[m.key]) ? calcs[m.key] : undefined));
  if (!used.some(Boolean)) return result;
  const rows: ResultRow[] = result.rows.map((r) => ({ ...r, values: [...r.values], ...(r.prev ? { prev: [...r.prev] } : {}) }));
  // Series (one per second-split value, or one for all), each in the order its Rows values first appear.
  const series = new Map<string, ResultRow[]>();
  for (const r of rows) { const k = splits === 2 ? r.keys[1] : ""; series.set(k, [...(series.get(k) ?? []), r]); }
  const at = new Map<string, number>();
  rows.forEach((r, i) => { if (!at.has(r.keys[0])) at.set(r.keys[0], i); });
  for (const rs of series.values()) {
    rs.sort((a, b) => at.get(a.keys[0])! - at.get(b.keys[0])!);
    const others = rs.map((r) => r.keys.includes(OTHERS));
    used.forEach((c, i) => {
      if (!c) return;
      calcColumn(c, rs.map((r) => r.values[i]), result.totals[i], others).forEach((v, j) => { rs[j].values[i] = v; });
      if (rs.some((r) => r.prev)) calcColumn(c, rs.map((r) => r.prev?.[i] ?? null), result.previous?.[i] ?? null, others).forEach((v, j) => { if (rs[j].prev) rs[j].prev![i] = v; });
    });
  }
  const total = (xs: (number | null)[] | undefined) => xs?.map((v, i) => (!used[i] || used[i] === "running" ? v : used[i] === "pct" && v ? 100 : null));
  return {
    ...result,
    rows,
    measures: result.measures.map((m, i) => (used[i] ? { ...m, label: calcLabel(m.label, used[i]), format: calcFormat(m.format, used[i]), ...(used[i] === "rank" ? { better: "down" as const } : {}) } : m)),
    totals: total(result.totals)!,
    ...(result.previous ? { previous: total(result.previous) } : {}),
    ...(result.toDate ? { toDate: total(result.toDate) } : {}),
  };
}
