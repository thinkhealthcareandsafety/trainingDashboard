import { type Dataset, type Format, type Measure, addMeasureResolver, fieldOf, measureOf } from "./model";
import type { Filter } from "./query";
import { paramFilterText } from "./params";

/*
 * Calculated fields (owner, 30 Oct: "ability to add aggregated columns" — the Tableau plan, step e). Built from picks,
 * never typed formulas, so each one reads as a sentence and can't be wrong in syntax:
 *   - with conditions: a number over only some rows — "Sum of Total (BCY) where Invoice Status is Paid";
 *   - combined: two numbers — "Sum of Total (BCY) ÷ Count distinct of Customer ID", "… as % of …".
 * Shared with the team (Mongo `reportFields`, route /api/analytics/fields); used in a report as `calc:<id>`, like any
 * other number. A field belongs to the data it was made on (a Zoho table, or tables joined). Pure — server and browser.
 */

export type CalcFormula =
  | { kind: "filtered"; base: string; filters: Filter[] }
  | { kind: "combine"; a: string; op: "div" | "sub" | "add" | "mul" | "pct"; b: string };
export type CalcField = { id: string; dataset: string; name: string; formula: CalcFormula; format: Format; createdBy?: string; at?: string };

export const OPS = [["div", "÷"], ["sub", "−"], ["add", "+"], ["mul", "×"], ["pct", "as % of"]] as const;
export const calcKey = (f: Pick<CalcField, "id">) => `calc:${f.id}`;

const fields = new Map<string, CalcField>();
/** Puts fields on the measure lookup (server: before a query; browser: when the builder loads them). */
export function registerCalcFields(list: CalcField[]) { for (const f of list) fields.set(f.id, f); }
export const forgetCalcField = (id: string) => fields.delete(id);
/** The numbers and columns a field reads — so the tables they live on get loaded (tablesServer.fieldsUsed). */
export function calcInputs(key: string): string[] {
  const f = key.startsWith("calc:") ? fields.get(key.slice(5)) : undefined;
  if (!f) return [];
  return f.formula.kind === "filtered" ? [f.formula.base, ...f.formula.filters.map((x) => x.field)] : [f.formula.a, f.formula.b];
}
export const calcFieldsOf = (dataset: string) => [...fields.values()].filter((f) => f.dataset === dataset).sort((a, b) => a.name.localeCompare(b.name));
export const calcIds = (measures: string[]) => measures.filter((m) => m.startsWith("calc:")).map((m) => m.slice(5));

const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
function whereText(d: Dataset, filters: Filter[]) {
  return and(filters.flatMap((f) => {
    const l = fieldOf(d, f.field)?.label ?? f.field;
    if (f.param) return [paramFilterText(l, f)];
    if (f.contains?.trim()) return [`${l} ${f.exclude ? "doesn't contain" : "contains"} “${f.contains.trim()}”`];
    if (f.min !== undefined || f.max !== undefined) return [`${l} is ${[f.min !== undefined && `at least ${f.min}`, f.max !== undefined && `at most ${f.max}`].filter(Boolean).join(" and ")}`];
    if (!f.values.length) return [];
    return [`${l} ${f.exclude ? "is not" : "is"} ${f.values.length > 3 ? `one of ${f.values.length} values` : and(f.values.map((v) => `“${v}”`))}`];
  }));
}
/** The field as a sentence (under its name in the Data pane, in the editor while it's made). */
export function describeCalc(d: Dataset, f: Pick<CalcField, "formula">): string {
  const name = (k: string) => measureOf(d, k)?.label ?? "(a number that's gone)";
  const x = f.formula;
  if (x.kind === "filtered") {
    const w = whereText(d, x.filters);
    return `${name(x.base)}${w ? ` where ${w}` : " (no condition yet)"}`;
  }
  return `${name(x.a)} ${OPS.find(([k]) => k === x.op)?.[1] ?? "?"} ${name(x.b)}`;
}

/** The format a field shows in, by default: the base's; a ÷ b of ₹ by a count is ₹ (₹ per customer), of two ₹ a
 *  plain number; % of is a %. The maker can change it. */
export function defaultFormat(d: Dataset, formula: CalcFormula): Format {
  const f = (k: string) => measureOf(d, k)?.format ?? "count";
  if (formula.kind === "filtered") return f(formula.base);
  if (formula.op === "pct") return "pct";
  if (formula.op === "div") return f(formula.a) === "inr" && f(formula.b) !== "inr" ? "inr" : "count";
  return formula.op === "mul" ? "count" : f(formula.a);
}

/** What's wrong with a field before it's saved, in plain words (the route checks the same). */
export function calcProblem(f: Pick<CalcField, "name" | "formula" | "format">): string | null {
  if (!f.name.trim()) return "Give it a name";
  if (f.name.trim().length > 60) return "A shorter name, please (60 letters at most)";
  const refs = f.formula.kind === "filtered" ? [f.formula.base] : [f.formula.a, f.formula.b];
  if (refs.some((r) => !r)) return f.formula.kind === "filtered" ? "Pick the number to add up" : "Pick both numbers";
  if (refs.some((r) => r.startsWith("calc:"))) return "A field can't be built from another field yet";
  if (f.formula.kind === "filtered" && (f.formula.filters.length > 10 || !f.formula.filters.some((x) => x.values.length || x.contains?.trim() || x.min !== undefined || x.max !== undefined || x.param)))
    return "Add at least one condition (“only where …”)";
  if (!["inr", "count", "pct", "days"].includes(f.format)) return "Bad format";
  return null;
}

export function calcMeasure(d: Dataset, key: string): Measure | undefined {
  if (!key.startsWith("calc:")) return undefined;
  const f = fields.get(key.slice(5));
  if (!f || f.dataset !== d.key) return undefined;
  const def = `Your field: ${describeCalc(d, f)}${f.createdBy ? ` — made by ${f.createdBy}` : ""}.`;
  return f.formula.kind === "filtered"
    ? { key, label: f.name, format: f.format, agg: "filtered", base: f.formula.base, filters: f.formula.filters, def }
    : { key, label: f.name, format: f.format, agg: "combine", a: f.formula.a, b: f.formula.b, op: f.formula.op, def };
}
addMeasureResolver(calcMeasure);
