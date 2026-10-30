import { type Dataset, type Field, type Format, type Measure, type Row, DATASETS, addMeasureResolver } from "./model";

/*
 * Reports straight from the Zoho Analytics tables (owner, 30 Oct: "these are all the tables in my Zoho Analytics …
 * I want to see them when I create reports … read from Zoho Analytics directly" — the plan of 30 Oct, steps a–c).
 * The catalog (every table, its columns, their types and links) is read from Zoho's metadata (tablesServer.ts); each
 * table becomes a report dataset `zt:<view id>`: its words and dates are fields, its numbers add up any way
 * (Sum / Average / Min / Max), "Number of rows" counts it, and the tables it links to (Customer ID → Customers) bring
 * their words and dates along, one level deep. Pure — the server and the browser share it.
 */

export type ColumnType = "text" | "date" | "number" | "money" | "pct";
/** One Zoho column. `link`: Zoho's lookup (pkTableName / pkColumnName) — a row of that table belongs to this one. */
export type CatalogColumn = { name: string; type: ColumnType; link?: { table: string; column: string } };
export type CatalogTable = { id: string; name: string; rows: number; columns: CatalogColumn[] };
export type Catalog = { tables: CatalogTable[]; readAt?: string; partial?: boolean };

/** Money-out and bookkeeping (owner's plan, point 7): Admin only — like the cost and margin reports. */
export const ADMIN_TABLES = new Set([
  "Bills", "Bill Item", "Vendors", "Vendor Addresses", "Vendor Contact Persons", "Vendor Credits", "Vendor Credit Items", "Vendor Credits Bill",
  "Vendor Credit Refunds", "Vendor Payments", "Vendor Payment Refund", "Payments Made", "Purchase Orders", "Purchase Order Items", "Purchase Order Bill",
  "Purchase Receive", "Purchase Receive Items", "Expenses", "Expense Item", "Recurring Expenses", "Recurring Bills", "Recurring Bill Items",
  "Accounts", "Accrual Transactions", "Cash Transactions", "Bank Statements", "Manual Journals", "Manual Journal Items", "Manual Journal Credits",
  "Budgets", "Budget Details", "FIFO Mapping Table", "Bill Of Entry", "Bill Of Entry Item", "Purchase Order Sales Order Mapping",
]);
/** Never offered: people's logins and messages. */
export const HIDDEN_TABLES = new Set(["Users", "User Details", "SMS Notifications", "System Mails"]);
/** Contact details stay out of reports (and anything Zoho marks personal). */
const PERSONAL = /e-?mail|phone|mobile|fax|whatsapp/i;

export const tableKey = (t: Pick<CatalogTable, "id">) => `zt:${t.id}`;
export const isTableKey = (key: string) => key.startsWith("zt:");
/**
 * Documents that open with a visible, removable "Status is not Void / Draft" filter (owner's plan, point 6: raw tables
 * keep every document; nothing is filtered silently). The column holding each table's status.
 */
export const STATUS_COLUMN: Record<string, string> = { Invoices: "Invoice Status", Quotes: "Status", "Sales Orders": "Status", Bills: "Bill Status" };
export const VOID_OR_DRAFT = /void|draft/i;
/** The tables a member may build on: not empty, not hidden, Admin's only for Admin. */
export const visibleTables = (c: Catalog, admin: boolean) =>
  c.tables.filter((t) => t.rows > 0 && !HIDDEN_TABLES.has(t.name) && (admin || !ADMIN_TABLES.has(t.name))).sort((a, b) => a.name.localeCompare(b.name));

/** Zoho's type names → ours. Unknown ones are words. */
export function columnType(dataTypeName: string): ColumnType {
  const n = dataTypeName.toLowerCase();
  if (n.includes("currency")) return "money";
  if (n.includes("percent")) return "pct";
  if (n.includes("date")) return "date";
  if (/number|decimal|integer/.test(n)) return "number";
  return "text";
}
export const offered = (c: CatalogColumn) => !PERSONAL.test(c.name);
const isId = (c: CatalogColumn) => /(^|\s)ID$/i.test(c.name) || /_id$/i.test(c.name);
const NUMERIC: ColumnType[] = ["number", "money", "pct"];
const FORMAT: Record<string, Format> = { number: "count", money: "inr", pct: "pct" };
/** A linked table's column, carried on this table's row: "Customer ID→Customer Name". */
export const linkKey = (via: string, column: string) => `${via}→${column}`;

/** The table's main date — what "When" filters on (another date column can be picked): "<Table> Date", else "Date",
 *  else the first date that isn't bookkeeping. */
function mainDate(t: CatalogTable): string {
  const dates = t.columns.filter((c) => c.type === "date" && offered(c));
  const single = t.name.replace(/ (Items?|Table)$/, "").replace(/s$/, "");
  return (dates.find((c) => c.name.toLowerCase() === `${single} date`.toLowerCase())
    ?? dates.find((c) => /^(\w+ )?date$/i.test(c.name))
    ?? dates.find((c) => !/created|modified/i.test(c.name))
    ?? dates[0])?.name ?? "";
}

type NumberCol = { key: string; label: string; format: Format };
const numbers = new Map<string, NumberCol[]>();

/** A table as a report dataset (fields from its own and its linked tables' words and dates). */
export function tableDataset(t: CatalogTable, catalog: Catalog): Dataset {
  const byName = new Map(catalog.tables.map((x) => [x.name, x]));
  const fields: Field[] = [];
  const nums: NumberCol[] = [];
  for (const c of t.columns.filter(offered)) {
    const linked = c.link && byName.get(c.link.table);
    if (linked && !HIDDEN_TABLES.has(linked.name)) {
      // The link itself is an ID nobody reads; its table's words and dates come instead.
      for (const lc of linked.columns.filter((x) => offered(x) && !isId(x) && !NUMERIC.includes(x.type)))
        fields.push({ key: linkKey(c.name, lc.name), label: `${lc.name} (${linked.name})`, kind: "text", table: linked.name, hint: `${linked.name} → ${lc.name}, through ${c.name}` });
      continue;
    }
    if (NUMERIC.includes(c.type)) { if (!isId(c)) nums.push({ key: c.name, label: c.name, format: FORMAT[c.type] }); continue; }
    if (isId(c)) continue;
    fields.push({ key: c.name, label: c.name, kind: c.type === "date" ? "date" : "text", hint: `Zoho column “${c.name}” (${t.name})` });
  }
  numbers.set(tableKey(t), nums);
  const date = mainDate(t);
  const measures: Measure[] = [{ key: "rows", label: "Number of rows", format: "count", agg: "count", def: `How many ${t.name} rows (after the filters).` }];
  return {
    key: tableKey(t), label: t.name, desc: `Zoho Analytics table “${t.name}” — ${t.rows.toLocaleString("en-IN")} rows.`, source: `Zoho Analytics: ${t.name}`,
    dateField: date, fields, measures, board: "training", admin: ADMIN_TABLES.has(t.name),
    // Every number can be filtered by a range ("Total (BCY) at least 1 L").
    ranges: nums.map((n) => ({ key: n.key, label: n.label })),
  };
}

/** Puts the tables on the dataset list (server: before a query; browser: when the builder opens). Safe to repeat. */
export function registerTables(catalog: Catalog) {
  for (const t of catalog.tables) {
    if (HIDDEN_TABLES.has(t.name)) continue;
    const d = tableDataset(t, catalog);
    const at = DATASETS.findIndex((x) => x.key === d.key);
    if (at >= 0) DATASETS[at] = d; else DATASETS.push(d);
  }
}
export const tableNumbers = (key: string) => numbers.get(key) ?? [];

const parseNumber = (s: string | undefined): number | null => {
  if (!s) return null;
  const t = s.replace(/INR|Rs\.?|₹|,|%|\s/gi, "");
  const m = t.match(/^(-?\d+(?:\.\d+)?)(K|M|L|Cr)?$/i);
  if (!m) return null;
  return Number(m[1]) * ({ k: 1e3, m: 1e6, l: 1e5, cr: 1e7 }[(m[2] ?? "").toLowerCase() as "k"] ?? 1);
};
/** "20/07/2021" / "2024-07-15 17:10:46" / "20 Jul, 2021" → "2021-07-20". */
const MON: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
export function parseDate(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*,?[ -](\d{4})/);
  return m && MON[m[2].toLowerCase()] ? `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}` : null;
}
const value = (c: CatalogColumn, s: string | undefined) =>
  NUMERIC.includes(c.type) ? parseNumber(s) : c.type === "date" ? parseDate(s) : (s ?? "").trim() || null;

/** A table's rows as report rows: its own columns, plus each linked table's words and dates. */
export function tableRows(t: CatalogTable, raw: Record<string, string>[], linked: Map<string, { table: CatalogTable; rows: Map<string, Record<string, string>> }>): Row[] {
  const own = t.columns.filter(offered);
  return raw.map((r) => {
    const row: Row = {};
    for (const c of own) {
      const l = c.link && linked.get(c.link.table);
      if (l) {
        const target = l.rows.get((r[c.name] ?? "").trim());
        for (const lc of l.table.columns) if (offered(lc) && !isId(lc) && !NUMERIC.includes(lc.type)) row[linkKey(c.name, lc.name)] = target ? value(lc, target[lc.name]) : null;
      } else row[c.name] = value(c, r[c.name]);
    }
    return row;
  });
}

/**
 * `sum:Sub Total (BCY)` on a Zoho table → "Sum of Sub Total (BCY)" (owner's plan, point 4: Sum / Average / Min / Max /
 * Count / Count distinct on every number; Count / Count distinct on words and dates too).
 */
export const TABLE_AGGS = [["sum", "Sum"], ["avg", "Average"], ["min", "Min"], ["max", "Max"], ["count", "Count"], ["distinct", "Count distinct"]] as const;
export type TableAgg = (typeof TABLE_AGGS)[number][0];
export function tableMeasure(d: Dataset, key: string): Measure | undefined {
  if (!isTableKey(d.key)) return undefined;
  const m = key.match(/^(sum|avg|min|max|count|distinct):(.+)$/);
  if (!m) return undefined;
  const agg = m[1] as TableAgg;
  const col = numbers.get(d.key)?.find((c) => c.key === m[2]);
  const field = col ? undefined : d.fields.find((x) => x.key === m[2]);
  const name = col?.label ?? field?.label;
  if (!name) return undefined;
  if (agg === "count") return { key, label: `Count of ${name}`, format: "count", agg: "count", field: m[2], def: `How many ${d.label} rows have a “${name}” (after the filters).` };
  if (agg === "distinct") return { key, label: `Count distinct of ${name}`, format: "count", agg: "distinct", field: m[2], def: `How many different values of “${name}”.` };
  if (!col) return undefined; // adding up words or dates means nothing
  const word = TABLE_AGGS.find(([k]) => k === agg)![1];
  return { key, label: `${word} of ${col.label}`, format: col.format, agg, field: col.key, def: `${word} of the Zoho column “${col.label}” (${d.label}).` };
}

addMeasureResolver(tableMeasure);
