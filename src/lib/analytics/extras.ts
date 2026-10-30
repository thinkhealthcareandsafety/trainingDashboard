import type { Raw, TableKey } from "./build";
import { type Dataset, type Field, type Format, type Measure, DATASETS, addMeasureResolver } from "./model";

/*
 * Every other Zoho column (owner, 30 Oct: "read all the columns first … rows, columns, colour, labels, tooltips,
 * filters, aggregated columns" — REPORT-BUILDER-PLAN step 1). The copy keeps each table's non-empty columns besides the
 * ones build.ts reads (IDs, foreign-currency twins, bookkeeping and personal contact columns left out); each report row
 * carries them as `x.<table>.<column>`. Words and dates become attributes; numbers become measures any way they add up
 * (Sum / Average / Lowest / Highest) — but only on the dataset's own row table: a header's number repeated on every
 * invoice line would be counted once per line, so those stay on the dataset whose row they are. Pure — the server
 * (source.ts, build.ts) and the browser (Reports) share it.
 */

export type ColumnKind = "text" | "date" | "number";
export type ExtraCol = { name: string; kind: ColumnKind };

/** The tables whose other columns are copied, and what one of their rows is called. */
export const EXTRA_TABLES: Partial<Record<TableKey, string>> = {
  invoiceItems: "Invoice line", invoices: "Invoice", customers: "Customer", items: "Item", quotes: "Quote", quoteItems: "Quote line",
  salesOrders: "PI", payments: "Payment", bills: "Bill", billItems: "Bill line",
};
/** Each dataset's tables: its own row first (numbers add up), then the ones joined to it (words and dates). */
export const EXTRA_SOURCES: Record<string, TableKey[]> = {
  sales: ["invoiceItems", "invoices", "customers", "items"],
  invoices: ["invoices", "customers"],
  quotes: ["quotes", "customers"],
  orders: ["salesOrders", "customers"],
  payments: ["payments", "customers"],
  purchases: ["billItems", "bills", "items"],
  quoteItems: ["quoteItems", "quotes", "items"],
};

const SKIP = /(\bID$|\bIDs?\b|\(FCY\)|^Created By$|^Modified By$|^Last Modified Time$|^Currency Code$|^Exchange Rate$|Email|Phone|Mobile|Fax|Website|Template|Twitter|Facebook|Skype)/i;
const NUM = /^\s*-?(INR|Rs\.?|₹)?\s*-?[\d,]+(\.\d+)?\s*$/i;
const ABBREVIATED = /^\s*-?(INR|Rs\.?|₹)?\s*-?[\d,.]+\s*(K|M|L|Cr)\s*$/i;
const DATE = /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/;

/** Which of a table's other columns to keep, and their kind — from the rows themselves (an export carries no types).
 *  Left out: columns that are empty everywhere, Zoho's abbreviated amounts ("INR 954.24K" — lossy), and long free text
 *  with almost every value different (notes, terms) — nothing to group or filter by. */
export function inferColumns(rows: Raw[], used: string[]): ExtraCol[] {
  if (!rows.length) return [];
  const out: ExtraCol[] = [];
  for (const name of Object.keys(rows[0])) {
    if (used.includes(name) || SKIP.test(name)) continue;
    const vals = rows.map((r) => (r[name] ?? "").trim()).filter(Boolean);
    if (!vals.length || vals.some((v) => ABBREVIATED.test(v))) continue;
    if (vals.every((v) => NUM.test(v))) { out.push({ name, kind: "number" }); continue; }
    if (vals.every((v) => DATE.test(v))) { out.push({ name, kind: "date" }); continue; }
    const distinct = new Set(vals).size;
    const long = vals.reduce((s, v) => s + v.length, 0) / vals.length > 60;
    if (long && distinct > vals.length / 2) continue;
    out.push({ name, kind: "text" });
  }
  return out;
}

export const extraKey = (table: TableKey, name: string) => `x.${table}.${name}`;
const clean = (name: string) => name.replace(/\s*\(BCY\)\s*/g, " ").replace(/\s+/g, " ").trim();
const MONEY = /amount|total|price|rate|charge|balance|cost|adjustment|discount|tax|limit|value|\(BCY\)/i;

/** A number column as a measure: `sum:` / `avg:` / `min:` / `max:` + its key (REPORT-BUILDER-PLAN steps 1–2). */
export const AGGS = [["sum", "Sum"], ["avg", "Average"], ["min", "Lowest"], ["max", "Highest"]] as const;
export type AggKey = (typeof AGGS)[number][0];
type NumberCol = { key: string; label: string; name: string; table: string; format: Format };
const numbers = new Map<string, NumberCol[]>();

/** Puts the copied columns on the datasets (fields) and into the measure lookup (numbers). Safe to call again. */
export function registerExtras(columns: Partial<Record<TableKey, ExtraCol[]>>) {
  for (const d of DATASETS) {
    const sources = EXTRA_SOURCES[d.key];
    if (!sources) continue;
    const fields: Field[] = [];
    const nums: NumberCol[] = [];
    for (const [i, table] of sources.entries()) {
      const label = EXTRA_TABLES[table] ?? table;
      for (const c of columns[table] ?? []) {
        const key = extraKey(table, c.name);
        const name = `${clean(c.name)} (${label})`;
        if (c.kind === "number") { if (i === 0) nums.push({ key, label: name, name: c.name, table: label, format: MONEY.test(c.name) ? "inr" : "count" }); }
        else fields.push({ key, label: name, kind: "text", table: label, hint: `Zoho column “${c.name}” of the ${label.toLowerCase()}${c.kind === "date" ? " (a date, as YYYY-MM-DD)" : ""}` });
      }
    }
    d.fields = [...d.fields.filter((f) => !f.table), ...fields];
    numbers.set(d.key, nums);
  }
}

export const extraNumbers = (d: Dataset) => numbers.get(d.key) ?? [];

/** `sum:x.invoiceItems.Discount` → Sum of Discount (Invoice line). Undefined for anything else. */
export function dynamicMeasure(d: Dataset, key: string): Measure | undefined {
  const m = key.match(/^(sum|avg|min|max):(.+)$/);
  if (!m) return undefined;
  const col = numbers.get(d.key)?.find((c) => c.key === m[2]);
  if (!col) return undefined;
  const word = AGGS.find(([k]) => k === m[1])![1];
  return { key, label: `${word} of ${col.label}`, format: col.format, agg: m[1] as AggKey, field: col.key,
    def: `${word} of the Zoho column “${col.name}” over the ${col.table.toLowerCase()}s chosen (empty ones left out of an average).` };
}

addMeasureResolver(dynamicMeasure);
