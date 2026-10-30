import { type Dataset, type Measure, addMeasureResolver } from "./model";
import type { Filter, Spec } from "./query";

/*
 * Parameters (owner, 30 Oct — the Tableau plan, step e): a named number, word, date or list value the team defines
 * once (Mongo `reportParams`, route /api/analytics/params) and each viewer sets for themselves (saved with their own
 * view of a dashboard). A report uses one in a filter ("Invoice Date on or after {Start}", "Sales person is {Person}")
 * or as a number in a calculated field ("Sum of Total (BCY) − {Target}", calc.ts). A report run carries the values
 * chosen (Spec.params); anything not chosen takes the parameter's own value. Pure — server and browser.
 */

export type ParamType = "number" | "text" | "date" | "list";
export type Param = { id: string; name: string; type: ParamType; value: string | number; options?: string[]; createdBy?: string; at?: string };
/** How a filter follows a parameter: the value itself, or (numbers and dates) at least / at most it. */
export type ParamCmp = "is" | "min" | "max";

const params = new Map<string, Param>();
export function registerParams(list: Param[]) { params.clear(); for (const p of list) params.set(p.id, p); }
export const paramById = (id: string) => params.get(id);
export const allParams = () => [...params.values()].sort((a, b) => a.name.localeCompare(b.name));
export const paramKey = (p: Pick<Param, "id">) => `param:${p.id}`;

/** The values in force for one run (set by runQuery, so "param:<id>" numbers read them). */
let current: Record<string, string | number> = {};
export const setParamValues = (v: Record<string, string | number> | undefined) => { current = v ?? {}; };
export const valueOf = (p: Param, values: Record<string, string | number> = current) => values[p.id] ?? p.value;

/** The parameters a report uses (its filters', and the "param:" numbers of its fields — `inputs` lists those). */
export function paramsUsed(spec: Spec, inputs: (measure: string) => string[] = () => []): string[] {
  const ids = (spec.filters ?? []).map((f) => f.param).filter((x): x is string => Boolean(x));
  for (const m of [...spec.measures, ...(spec.tooltip ?? [])]) for (const k of [m, ...inputs(m)]) if (k.startsWith("param:")) ids.push(k.slice(6));
  return [...new Set(ids)].filter((id) => params.has(id));
}

/** A filter that follows a parameter, as a plain filter for this run. Missing parameter → no filter (shown as gone). */
export function resolveFilter(f: Filter, values?: Record<string, string | number>): Filter {
  if (!f.param) return f;
  const p = params.get(f.param);
  const base = { field: f.field, values: [] as string[], ...(f.exclude ? { exclude: true } : {}) };
  if (!p) return base;
  const v = valueOf(p, values);
  const cmp = f.cmp ?? "is";
  if (p.type === "number") { const n = Number(v); return Number.isFinite(n) ? { ...base, ...(cmp !== "max" ? { min: n } : {}), ...(cmp !== "min" ? { max: n } : {}) } : base; }
  if (p.type === "date") { const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { ...base, ...(cmp !== "max" ? { after: s } : {}), ...(cmp !== "min" ? { before: s } : {}) } : base; }
  return String(v).trim() ? { ...base, values: [String(v)] } : base;
}

const CMP_WORD: Record<ParamCmp, string> = { is: "is", min: "is at least", max: "is at most" };
export const paramFilterText = (label: string, f: Filter) => {
  const p = f.param ? params.get(f.param) : undefined;
  return p ? `${label} ${f.exclude ? "is not" : CMP_WORD[f.cmp ?? "is"]} {${p.name}}` : `${label} (a parameter that's gone)`;
};

/** "param:<id>" as a number (a calculated field's part): the value in force, or nothing for words / dates. */
export function paramMeasure(_d: Dataset, key: string): Measure | undefined {
  if (!key.startsWith("param:")) return undefined;
  const p = params.get(key.slice(6));
  if (!p || p.type !== "number") return undefined;
  const n = Number(valueOf(p));
  return { key, label: `{${p.name}}`, format: "count", agg: "const", value: Number.isFinite(n) ? n : 0, def: `The parameter “${p.name}” — its value is chosen on the report.` };
}
addMeasureResolver(paramMeasure);

/** A parameter's value as typed in a box (numbers as numbers; a list value must be one of its options). */
export function cleanValue(p: Pick<Param, "type" | "options">, raw: unknown): string | number | null {
  if (p.type === "number") { const n = Number(String(raw ?? "").replace(/[,₹\s]/g, "")); return Number.isFinite(n) ? n : null; }
  const s = String(raw ?? "").trim();
  if (p.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (p.type === "list") return p.options?.includes(s) ? s : null;
  return s.slice(0, 100);
}
