import { fieldOf, datasetOf, formatValue, grainLabel, periods } from "./model";
import type { Result, Spec } from "./query";
import { allParams, valueOf } from "./params";

/*
 * Editable and dynamic labels (owner, 30 Oct: "why can't I edit labels and stuff … add some label text plus dynamic
 * labeling" — the Tableau plan). A report's title, subtitle and axis names are templates: plain words, with values
 * dropped in — "{total}", "{period}", "{top}", a parameter "{Target}" … (TOKENS). Column and number names can be
 * renamed (Spec.text.names). Pure — the builder, dashboards and downloads render the same words.
 */

/** What can be dropped into a label — offered by the builder's "Insert value" list, never typed blind. */
export const TOKENS: [string, string][] = [
  ["{total}", "The total (first number)"], ["{period}", "The period"], ["{top}", "The biggest row's name"], ["{max}", "The biggest value"],
  ["{rows}", "How many rows (bars, lines)"], ["{filters}", "The filters in force"], ["{today}", "Today's date"],
];

type Ctx = { spec: Spec; result?: Result; today?: string };

function periodText(spec: Spec, today: string): string {
  const p = spec.period ?? "";
  if (p.startsWith("range:")) { const [, a, b] = p.split(":"); return `${grainLabel(a, "day", true)} – ${grainLabel(b, "day", true)}`; }
  if (p) return periods(today).find((x) => x.key === p)?.label ?? p;
  if (spec.from || spec.to) return `${spec.from ? grainLabel(spec.from, "day", true) : "the start"} – ${spec.to ? grainLabel(spec.to, "day", true) : "today"}`;
  return "All time";
}

function filtersText(spec: Spec): string {
  const d = datasetOf(spec.dataset);
  const parts = (spec.filters ?? []).flatMap((f) => {
    const l = (d && fieldOf(d, f.field)?.label) ?? f.field;
    if (f.values.length) return [`${l} ${f.exclude ? "not " : ""}${f.values.length > 2 ? `${f.values.length} values` : f.values.join(", ")}`];
    if (f.contains?.trim()) return [`${l} contains “${f.contains.trim()}”`];
    return [];
  });
  return parts.join(" · ") || "no filters";
}

/** A label template with its values dropped in. Unknown "{…}" stay as typed (so a typo shows). */
export function renderLabel(template: string, { spec, result, today = new Date().toISOString().slice(0, 10) }: Ctx): string {
  if (!template.includes("{")) return template;
  const m0 = result?.measures[0];
  const rows = result?.rows.filter((r) => r.keys.length) ?? [];
  const best = rows.reduce<(typeof rows)[number] | undefined>((a, r) => ((r.values[0] ?? -Infinity) > (a?.values[0] ?? -Infinity) ? r : a), undefined);
  const fmt = (v: number | null | undefined) => (m0 && v !== null && v !== undefined ? formatValue(v, m0.format) : "—");
  const params = new Map(allParams().map((p) => [p.name.toLowerCase(), p]));
  return template.replace(/\{([^{}]{1,40})\}/g, (whole, name: string) => {
    switch (name.trim().toLowerCase()) {
      case "total": return result ? fmt(result.totals[0]) : "…";
      case "max": return result ? fmt(best?.values[0]) : "…";
      case "top": return result ? best?.keys[0] ?? "—" : "…";
      case "rows": return result ? String(new Set(rows.map((r) => r.keys[0])).size) : "…";
      case "period": return periodText(spec, today);
      case "today": return grainLabel(today, "day", true);
      case "filters": return filtersText(spec);
    }
    const p = params.get(name.trim().toLowerCase());
    if (p) { const v = valueOf(p, spec.params); return typeof v === "number" ? v.toLocaleString("en-IN") : String(v); }
    return whole;
  });
}

/** The result with the report's own names for its columns and numbers (tables, legends, tooltips, downloads). */
export function relabel(result: Result, names?: Record<string, string>): Result {
  if (!names || !Object.keys(names).length) return result;
  const n = (key: string, label: string) => names[key]?.trim() || label;
  return { ...result, by: result.by.map((b) => ({ ...b, label: n(b.key, b.label) })), measures: result.measures.map((m) => ({ ...m, label: n(m.key, m.label) })) };
}
