import { type Grain, datasetOf, fieldOf, grainLabel, measureOf, periods } from "./model";
import type { ChartKind, Spec } from "./query";

/*
 * "You'll get …" (owner, 30 Oct: "if I select 3 of these whatever things, what am I getting?") — one plain sentence for
 * a report, under the builder's preview, in step with every click. Pure: tests/describe.test.ts.
 */

const GRAIN_WORD: Record<Grain, string> = { day: "day", week: "week", month: "month", quarter: "quarter", fy: "financial year" };
const CHART_WORD: Partial<Record<ChartKind, string>> = {
  column: "as columns", bar: "as bars", line: "as a line", area: "as an area chart", stacked: "as stacked columns",
  stacked100: "as 100% columns", donut: "as a donut", table: "as a table", matrix: "as a grid", heatmap: "as a heat map",
  waterfall: "as a waterfall", diverging: "as rises and falls", map: "on a map of India",
};
const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** Several numbers on one chart need one unit — ₹, counts and % can't share an axis (Chart.tsx draws one axis, ever). */
export const mixedUnits = (spec: Pick<Spec, "dataset" | "measures">) => {
  const d = datasetOf(spec.dataset);
  return Boolean(d) && new Set(spec.measures.map((k) => measureOf(d!, k)?.format)).size > 1;
};

export function describeSpec(spec: Spec, today: string, kind?: Exclude<ChartKind, "auto">): string {
  const d = datasetOf(spec.dataset);
  if (!d) return "";
  const ms = spec.measures.map((k) => measureOf(d, k)?.label ?? k);
  const by = spec.by ?? [];
  const name = (k: string) => (k === d.dateField ? GRAIN_WORD[spec.grain ?? "month"] : (fieldOf(d, k)?.label ?? k).toLowerCase());

  let what: string;
  if (!by.length) what = ms.length === 1 ? `one number: ${ms[0]}` : `${ms.length} numbers side by side: ${and(ms)}`;
  else {
    what = `${and(ms)} for each ${name(by[0])}`;
    if (by[0] !== d.dateField && spec.limit) what += ` (the top ${spec.limit}, the rest added up as “Others”)`;
    if (by[1]) what += `, each split into a colour per ${name(by[1])}`;
    else if (ms.length > 1) what += mixedUnits(spec) ? " — as a table, because ₹ amounts, counts and % can't share one chart" : " — side by side";
  }
  const chart = kind && kind !== "kpi" && !(kind === "table" && what.includes("as a table")) ? ` ${CHART_WORD[kind] ?? ""}` : "";

  const p = spec.period ?? "";
  const range = p.startsWith("range:") ? p.split(":") : null;
  const when = range ? `from ${grainLabel(range[1], "day", true)} to ${grainLabel(range[2], "day", true)}`
    : p === "all" || (!p && !spec.from) ? "over all time"
    : p ? `for ${periods(today).find((x) => x.key === p)?.label ?? p}`
    : `from ${grainLabel(spec.from!, "day", true)} to ${grainLabel(spec.to ?? today, "day", true)}`;

  const only = (spec.filters ?? []).flatMap((f) => {
    const l = fieldOf(d, f.field)?.label ?? f.field;
    if (f.contains?.trim()) return [`${l} ${f.exclude ? "doesn't contain" : "contains"} “${f.contains.trim()}”`];
    if (f.min !== undefined || f.max !== undefined) return [`${l} is ${f.min !== undefined ? `at least ${f.min}` : ""}${f.min !== undefined && f.max !== undefined ? " and " : ""}${f.max !== undefined ? `at most ${f.max}` : ""}`];
    if (!f.values.length) return [];
    return [`${l} ${f.exclude ? "is not" : "is"} ${f.values.length > 3 ? `one of ${f.values.length} values` : and(f.values.map((v) => `“${v}”`))}`];
  });
  return `You'll get ${what}${chart}, ${when}${only.length ? ` — only where ${and(only)}` : ""}. From: ${d.label}.`;
}
