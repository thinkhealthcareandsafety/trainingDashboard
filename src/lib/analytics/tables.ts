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
export const isId = (c: CatalogColumn) => /(^|\s)ID$/i.test(c.name) || /_id$/i.test(c.name);
export const NUMERIC: ColumnType[] = ["number", "money", "pct"];
export const FORMAT: Record<string, Format> = { number: "count", money: "inr", pct: "pct" };
/** A linked table's column, carried on this table's row: "Customer ID→Customer Name"; two levels deep (owner, 30 Oct:
 *  "join two tables … all are interconnected"): "Invoice ID→Customer ID→Customer Name" (Invoice Items → Invoices → Customers). */
export const linkKey = (...path: string[]) => path.join("→");
/** The words and dates of a linked table that come along (no IDs, no numbers, no contact details). */
export const carried = (t: CatalogTable) => t.columns.filter((x) => offered(x) && !isId(x) && !NUMERIC.includes(x.type));
const linkable = (byName: Map<string, CatalogTable>, c: CatalogColumn) => {
  const l = c.link && byName.get(c.link.table);
  return l && !HIDDEN_TABLES.has(l.name) ? l : undefined;
};
/** The tables a table reaches through its links: one level, and through each of those one more (each table once, the
 *  nearest way). Pure — the dataset's fields and the server's row building walk the same paths. */
export function linkPaths(t: CatalogTable, catalog: Catalog): { path: string[]; table: CatalogTable }[] {
  const byName = new Map(catalog.tables.map((x) => [x.name, x]));
  const out: { path: string[]; table: CatalogTable }[] = [];
  const seen = new Set([t.name]);
  for (const c of t.columns.filter(offered)) { const l = linkable(byName, c); if (l && !seen.has(l.name)) { seen.add(l.name); out.push({ path: [c.name], table: l }); } }
  for (const first of [...out]) for (const lc of first.table.columns.filter(offered)) {
    const m = linkable(byName, lc);
    if (m && !seen.has(m.name)) { seen.add(m.name); out.push({ path: [...first.path, lc.name], table: m }); }
  }
  return out;
}

/** The table's main date — what "When" filters on (another date column can be picked): "<Table> Date", else "Date",
 *  else the first date that isn't bookkeeping. */
export function mainDate(t: CatalogTable): string {
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
    // The link itself is an ID nobody reads; its table's words and dates come instead (below, linkPaths).
    if (linkable(byName, c)) continue;
    if (NUMERIC.includes(c.type)) { if (!isId(c)) nums.push({ key: c.name, label: c.name, format: FORMAT[c.type] }); continue; }
    if (isId(c)) continue;
    fields.push({ key: c.name, label: c.name, kind: c.type === "date" ? "date" : "text", hint: `Zoho column “${c.name}” (${t.name})` });
  }
  // Linked tables' words and dates, one and two levels deep.
  for (const { path, table } of linkPaths(t, catalog))
    for (const lc of carried(table))
      fields.push({ key: linkKey(...path, lc.name), label: `${lc.name} (${table.name})`, kind: lc.type === "date" ? "date" : "text", table: table.name, hint: `${table.name} → ${lc.name}, through ${path.join(" → ")}` });
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

/** The table list last registered — joined datasets ("zt:1+7", joins.ts) are built from it when first asked for. */
let current: Catalog = { tables: [] };
export const currentCatalog = () => current;
/** Puts the tables on the dataset list (server: before a query; browser: when the builder opens). Safe to repeat. */
export function registerTables(catalog: Catalog) {
  current = catalog;
  // Joined datasets built from an older list are rebuilt on the next ask.
  for (let i = DATASETS.length - 1; i >= 0; i--) if (DATASETS[i].key.startsWith("zt:") && DATASETS[i].key.includes("+")) DATASETS.splice(i, 1);
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
export const value = (c: CatalogColumn, s: string | undefined) =>
  NUMERIC.includes(c.type) ? parseNumber(s) : c.type === "date" ? parseDate(s) : (s ?? "").trim() || null;

/** Rows of a linked table, by the column links point at (its ID). */
export type Linked = Map<string, { table: CatalogTable; rows: Map<string, Record<string, string>> }>;
/**
 * A table's rows as report rows: its own columns, plus the words and dates of each linked table that's loaded (one or
 * two levels deep — `linked` holds the ones a report uses). Own columns keep their raw ID values too (joins use them).
 */
export function tableRows(t: CatalogTable, raw: Record<string, string>[], linked: Linked, catalog?: Catalog): Row[] {
  const own = t.columns.filter(offered);
  const paths = (catalog ? linkPaths(t, catalog) : own.filter((c) => c.link && linked.has(c.link.table)).map((c) => ({ path: [c.name], table: linked.get(c.link!.table)!.table })))
    .filter((p) => linked.has(p.table.name));
  return raw.map((r) => {
    const row: Row = {};
    for (const c of own) if (!(c.link && linked.has(c.link.table))) row[c.name] = value(c, r[c.name]);
    for (const { path, table } of paths) {
      // Walk the path: this row's ID → the first table's row → (its ID →) the second's.
      let at: Record<string, string> | undefined = r;
      let from = t;
      for (const step of path) {
        const col = from.columns.find((x) => x.name === step);
        const l = col?.link && linked.get(col.link.table);
        at = at && l ? l.rows.get((at[step] ?? "").trim()) : undefined;
        if (l) from = l.table;
      }
      for (const lc of carried(table)) row[linkKey(...path, lc.name)] = at ? value(lc, at[lc.name]) : null;
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
  if (!isTableKey(d.key) || d.key.includes("+")) return undefined; // a joined dataset has its own (joins.ts)
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
