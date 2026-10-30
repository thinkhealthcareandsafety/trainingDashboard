import { type Dataset, type Field, type Measure, type Row, addDatasetResolver, addMeasureResolver } from "./model";
import {
  type Catalog, type CatalogTable, type Linked, FORMAT, HIDDEN_TABLES, NUMERIC, ADMIN_TABLES, TABLE_AGGS, type TableAgg,
  currentCatalog, isId, mainDate, offered, tableDataset, tableRows, value,
} from "./tables";

/*
 * Joining Zoho tables (owner, 30 Oct: "i would need to join two tables together … they have primary ids in one or
 * another table. all are interconnected" — and "yeah go ahead" to the plan). Pure; the server and the browser share it.
 *
 * Tables a table *points to* (Invoices → Customers) already come along as columns, two levels deep (tables.ts). This
 * adds the other kinds, chosen with "+ Add a related table":
 *   child   — a table that points to the main one (Customers ← Invoices): one customer, many invoices;
 *   sibling — a table that points to the same customer / sales person / item / vendor / project as the main one
 *             (Invoices and Customer Payments both → Customers): invoiced vs received, side by side.
 * Rather than multiplying rows (which counts a customer's total once per invoice), the joined data is the main
 * table's rows and each related table's rows one after the other, each tagged with its table (`⟂table`). A related
 * row carries the main table's words and dates through the shared ID, so "by Sector" groups both; each number counts
 * only its own table's rows. A customer with no invoices keeps its row (its invoice numbers are 0). Every row's date
 * is its own table's main date (`⟂date`); with a child table the main rows (customers) aren't dated, so the period
 * picks the invoices without dropping customers.
 * Dataset key: "zt:<main id>+<related id>[+<related id>]".
 */

export const SOURCE = "⟂table";
export const DATE = "⟂date";
export const ALWAYS = "⟂always";
export const MAX_RELATED = 2;
/** The shared tables a sibling may be joined through (not Users, Accounts, Taxes… — everything points at those). */
const SHARED = new Set(["Customers", "Salespersons", "Items", "Vendors", "Projects"]);

export type Relation = {
  table: CatalogTable;
  kind: "child" | "sibling";
  /** The related table's column holding the ID (child: the main table's; sibling: the shared table's). */
  col: string;
  /** Child: the main table's column that ID is (its key). Sibling: the main table's column pointing at the shared table. */
  mainCol: string;
  /** Sibling: the shared table. */
  via?: string;
};

const usable = (t: CatalogTable) => t.rows > 0 && !HIDDEN_TABLES.has(t.name);

/** Every table that can join `main`: the ones pointing to it, then the ones sharing a customer / sales person / item… */
export function relatedTables(main: CatalogTable, catalog: Catalog): Relation[] {
  const out: Relation[] = [];
  const seen = new Set([main.id]);
  for (const t of catalog.tables) {
    if (seen.has(t.id) || !usable(t)) continue;
    const c = t.columns.find((x) => x.link?.table === main.name && offered(x));
    if (c) { seen.add(t.id); out.push({ table: t, kind: "child", col: c.name, mainCol: c.link!.column }); }
  }
  for (const mc of main.columns.filter((x) => x.link && SHARED.has(x.link.table) && offered(x))) {
    for (const t of catalog.tables) {
      if (seen.has(t.id) || !usable(t)) continue;
      const c = t.columns.find((x) => x.link?.table === mc.link!.table && offered(x));
      if (c) { seen.add(t.id); out.push({ table: t, kind: "sibling", col: c.name, mainCol: mc.name, via: mc.link!.table }); }
    }
  }
  return out;
}

export const joinKey = (main: Pick<CatalogTable, "id">, related: Pick<CatalogTable, "id">[]) => `zt:${[main.id, ...related.map((r) => r.id)].join("+")}`;
export const isJoinKey = (key: string) => key.startsWith("zt:") && key.includes("+");
/** "zt:1+7" → the main table and its relations, or null if any of them can't join any more. */
export function parseJoinKey(key: string, catalog: Catalog): { main: CatalogTable; related: Relation[] } | null {
  if (!isJoinKey(key)) return null;
  const [mainId, ...ids] = key.slice(3).split("+");
  const main = catalog.tables.find((t) => t.id === mainId);
  if (!main || !ids.length || ids.length > MAX_RELATED) return null;
  const all = relatedTables(main, catalog);
  const related = ids.map((id) => all.find((r) => r.table.id === id));
  return related.every(Boolean) ? { main, related: related as Relation[] } : null;
}

/** A related table's own column, as a field / number of the joined data: "rel:<table id>:<column>". */
export const relKey = (r: Pick<CatalogTable, "id">, col: string) => `rel:${r.id}:${col}`;
const relNumbers = (t: CatalogTable) => t.columns.filter((c) => offered(c) && NUMERIC.includes(c.type) && !isId(c));
const relWords = (t: CatalogTable) => t.columns.filter((c) => offered(c) && !NUMERIC.includes(c.type) && !isId(c));

/** The joined data as a dataset: the main table's fields, "Table", one date, and each related table's own columns. */
export function joinDataset(key: string, catalog: Catalog): Dataset | undefined {
  const j = parseJoinKey(key, catalog);
  if (!j) return undefined;
  const base = tableDataset(j.main, catalog);
  const fields: Field[] = [
    ...base.fields,
    { key: SOURCE, label: "Table", kind: "text", hint: `Which table a row comes from — ${[j.main, ...j.related.map((r) => r.table)].map((t) => t.name).join(", ")}` },
    { key: DATE, label: "Date (each table's own)", kind: "date", hint: `${[j.main, ...j.related.map((r) => r.table)].map((t) => `${t.name}: ${mainDate(t) || "no date"}`).join(" · ")}` },
  ];
  const measures: Measure[] = [{ key: "rows", label: `Number of ${j.main.name}`, format: "count", agg: "count", where: { field: SOURCE, values: [j.main.name] }, def: `How many ${j.main.name} rows (after the filters).` }];
  const ranges = [...(base.ranges ?? [])];
  for (const r of j.related) {
    for (const c of relWords(r.table)) fields.push({ key: relKey(r.table, c.name), label: `${c.name} (${r.table.name})`, kind: c.type === "date" ? "date" : "text", table: r.table.name, hint: `Zoho column “${c.name}” of ${r.table.name} (its rows only)` });
    measures.push({ key: `rel:${r.table.id}:rows`, label: `Number of ${r.table.name}`, format: "count", agg: "count", where: { field: SOURCE, values: [r.table.name] }, def: `How many ${r.table.name} rows (after the filters).` });
    for (const c of relNumbers(r.table)) ranges.push({ key: relKey(r.table, c.name), label: `${c.name} (${r.table.name})` });
  }
  const names = j.related.map((r) => r.table.name);
  return {
    key, label: `${j.main.name} + ${names.join(" + ")}`, source: `Zoho Analytics: ${j.main.name}, ${names.join(", ")}`,
    desc: `${j.main.name} with ${j.related.map((r) => (r.kind === "child" ? `its ${r.table.name}` : `${r.table.name} (same ${r.via?.replace(/s$/, "").toLowerCase()})`)).join(" and ")} — each number counts its own table's rows.`,
    dateField: DATE, fields, measures, ranges, board: "training",
    admin: ADMIN_TABLES.has(j.main.name) || j.related.some((r) => ADMIN_TABLES.has(r.table.name)),
  };
}

/** The numbers a joined dataset offers per table (the builder's Data pane lists them). */
export function joinNumbers(key: string, catalog = currentCatalog()) {
  const j = parseJoinKey(key, catalog);
  if (!j) return [];
  return [
    { table: j.main, prefix: "", cols: relNumbers(j.main) },
    ...j.related.map((r) => ({ table: r.table, prefix: `rel:${r.table.id}:`, cols: relNumbers(r.table) })),
  ];
}

/** "sum:Total (BCY)" (the main table) / "rel:7:avg:Amount (BCY)" (a related one) on joined data — only that table's rows. */
export function joinMeasure(d: Dataset, key: string): Measure | undefined {
  if (!isJoinKey(d.key)) return undefined;
  const j = parseJoinKey(d.key, currentCatalog());
  if (!j) return undefined;
  const m = key.match(/^(?:rel:(\d+):)?(sum|avg|min|max|count|distinct):(.+)$/);
  if (!m) return undefined;
  const table = m[1] ? j.related.find((r) => r.table.id === m[1])?.table : j.main;
  if (!table) return undefined;
  const agg = m[2] as TableAgg, colName = m[3];
  const col = table.columns.find((c) => c.name === colName && offered(c));
  if (!col) return undefined;
  const field = m[1] ? relKey(table, colName) : colName;
  const where = { field: SOURCE, values: [table.name] };
  const word = TABLE_AGGS.find(([k]) => k === agg)![1];
  const name = `${colName}${m[1] ? ` (${table.name})` : ""}`;
  if (agg === "count") return { key, label: `Count of ${name}`, format: "count", agg: "count", field, where, def: `How many ${table.name} rows have a “${colName}”.` };
  if (agg === "distinct") return { key, label: `Count distinct of ${name}`, format: "count", agg: "distinct", field, where, def: `How many different “${colName}” in ${table.name}.` };
  if (!NUMERIC.includes(col.type)) return undefined;
  return { key, label: `${word} of ${name}`, format: FORMAT[col.type], agg, field, where, def: `${word} of the Zoho column “${colName}” over ${table.name}'s rows only.` };
}

type Side = { table: CatalogTable; raw: Record<string, string>[]; linked: Linked };

/** The joined rows: the main table's (tagged), then each related table's, carrying the main table's words and dates. */
export function joinedRows(main: Side, related: (Relation & Side)[], catalog: Catalog): Row[] {
  const hasChild = related.some((r) => r.kind === "child");
  const mainDateCol = mainDate(main.table);
  const mainRows = tableRows(main.table, main.raw, main.linked, catalog);
  const out: Row[] = mainRows.map((r) => ({ ...r, [SOURCE]: main.table.name, [DATE]: hasChild ? null : r[mainDateCol] ?? null, ...(hasChild ? { [ALWAYS]: "1" } : {}) }));
  const mainFields = (row: Row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("⟂")));
  for (const r of related) {
    const own = tableRows(r.table, r.raw, r.linked, catalog);
    const date = mainDate(r.table);
    // Child: the main row with that ID (by the main table's key column, raw — IDs are too long for numbers).
    const byId = r.kind === "child" ? new Map(main.raw.map((x, i) => [(x[r.mainCol] ?? "").trim(), mainRows[i]])) : null;
    r.raw.forEach((x, i) => {
      const row: Row = { [SOURCE]: r.table.name, [DATE]: own[i][date] ?? null };
      for (const c of [...relWords(r.table), ...relNumbers(r.table)]) row[relKey(r.table, c.name)] = own[i][c.name] ?? value(c, x[c.name]);
      if (byId) {
        const parent = byId.get((x[r.col] ?? "").trim());
        if (parent) Object.assign(row, mainFields(parent));
      } else {
        // Sibling: the shared table's words and dates, under the main table's names for them.
        const from = `${r.col}→`, to = `${r.mainCol}→`;
        for (const [k, v] of Object.entries(own[i])) if (k.startsWith(from)) row[to + k.slice(from.length)] = v;
      }
      out.push(row);
    });
  }
  return out;
}

addDatasetResolver((key) => (isJoinKey(key) ? joinDataset(key, currentCatalog()) : undefined));
addMeasureResolver(joinMeasure);
