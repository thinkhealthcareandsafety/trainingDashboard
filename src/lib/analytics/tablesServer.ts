import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { Binary } from "mongodb";
import { db } from "../db";
import { exportTable, viewDetails, workspaceViews } from "../zohoAnalytics";
import type { Row } from "./model";
import type { Spec } from "./query";
import { type Catalog, type CatalogColumn, type CatalogTable, HIDDEN_TABLES, type Linked, columnType, isTableKey, tableRows } from "./tables";
import { joinedRows, parseJoinKey } from "./joins";

/*
 * The Zoho Analytics tables behind "Pick a Zoho table" (owner's plan of 30 Oct, steps a–b). Read-only on Zoho's side.
 * - The catalog (kv `za_catalog`): every table, its row count and columns, from Zoho's metadata. A full read is ~110
 *   paced calls (~5 min), more than one request may run (120 s) — so each pass reads the oldest tables for 85 s and
 *   saves; the next visit continues while `partial`. Read again only when Admin presses Refresh from Zoho (owner, 30 Oct:
 *   "i dont want to overuse the zoho tokens … i can refresh when i want for new tables and columns") — no daily re-read.
 * - A table's rows are copied the first time a report uses it (`za_tables`, `_id` "zt:<view id>", gzipped JSON) and
 *   again after STALE_MS — the 42k-row transaction tables only load if someone uses them (point 8 of the plan).
 *   Linked tables (Customer ID → Customers) load only when a report uses one of their columns.
 */

const KEY = "za_catalog";
const COL = "za_tables";
const STALE_MS = 6 * 3600_000;
const PACE_MS = 2500; // Zoho Analytics refuses bursts
const BUDGET_MS = 85_000;

/** `error`: why the last reading pass stopped (shown in the table picker), cleared by the next pass that reads. */
type CatalogDoc = Catalog & { _id: string; readOn?: Record<string, string>; running?: number; error?: string; errorAt?: string };
type CopyDoc = { _id: string; gz: Binary; count: number; at: string };
const kv = async () => (await db()).collection<CatalogDoc>("kv");

let lastCall = 0;
const paced = async () => { const wait = lastCall + PACE_MS - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastCall = Date.now(); };

let catalogMemo: { at: number; value: Catalog & { readOn?: Record<string, string>; error?: string; reading?: boolean } } | null = null;
export async function readCatalog(): Promise<Catalog & { error?: string; reading?: boolean }> {
  // Kept 20 s on this server (the picker's "Check again" should see a pass that just finished).
  if (catalogMemo && Date.now() - catalogMemo.at < 20_000) return catalogMemo.value;
  const d = await (await kv()).findOne({ _id: KEY });
  const value = { tables: d?.tables ?? [], readAt: d?.readAt, partial: d?.partial ?? !d, readOn: d?.readOn, error: d?.error, reading: Boolean(d?.running && d.running > Date.now()) };
  catalogMemo = { at: Date.now(), value };
  return value;
}
/** Still to read: nothing yet, or a first read (or an Admin refresh) not finished. A finished list stays until Refresh. */
export const catalogStale = (c: Catalog) => !c.tables.length || Boolean(c.partial) || !c.readAt;

/**
 * Zoho's view details → our columns. The shape is `{ views: { columns: [...] } }` (an array in some answers). Hidden
 * columns and the ones Zoho marks personal (isPIIColumn) never reach the catalog.
 */
export function columnsOf(details: Record<string, unknown>): { columns: CatalogColumn[]; rows: number } {
  const v = (Array.isArray(details.views) ? details.views[0] : details.views ?? details) as { columns?: Record<string, unknown>[]; rowCount?: number | string };
  const columns: CatalogColumn[] = [];
  for (const c of v?.columns ?? []) {
    if (c.isHidden || c.isPIIColumn) continue;
    const link = c.pkTableName ? { table: String(c.pkTableName), column: String(c.pkColumnName ?? "") } : undefined;
    columns.push({ name: String(c.columnName), type: columnType(String(c.dataTypeName ?? "")), ...(link ? { link } : {}) });
  }
  return { columns, rows: Number(v?.rowCount ?? 0) || 0 };
}

/** One pass of reading the catalog from Zoho (oldest tables first, ~85 s). Returns false when another pass runs. */
export async function refreshCatalog(force = false): Promise<boolean> {
  const col = await kv();
  const now = Date.now();
  const got = await col.findOneAndUpdate({ _id: KEY, $or: [{ running: { $lt: now } }, { running: { $exists: false } }] },
    { $set: { running: now + 2 * 60_000 } }, { upsert: true, returnDocument: "after" }).catch(() => null);
  if (!got || got.running !== now + 2 * 60_000) return false;
  try {
    const started = Date.now();
    const views = (await workspaceViews()).filter((v) => /^table$/i.test(v.type) && !HIDDEN_TABLES.has(v.name));
    const old = new Map((got.tables ?? []).map((t) => [t.id, t]));
    const readOn = { ...(got.readOn ?? {}) };
    if (force) for (const k of Object.keys(readOn)) delete readOn[k];
    // Only the tables not read yet (all of them after an Admin refresh, which clears readOn; new ones Zoho lists).
    const todo = views.filter((v) => !readOn[v.id]);
    const tables = new Map<string, CatalogTable>();
    for (const v of views) { const o = old.get(v.id); if (o) tables.set(v.id, { ...o, name: v.name }); }
    let partial = false;
    for (const v of todo) {
      if (Date.now() - started > BUDGET_MS) { partial = true; break; }
      await paced();
      const { columns, rows } = columnsOf(await viewDetails(v.id));
      tables.set(v.id, { id: v.id, name: v.name, rows, columns });
      readOn[v.id] = new Date().toISOString();
    }
    const list = views.map((v) => tables.get(v.id)).filter((t): t is CatalogTable => Boolean(t));
    await col.updateOne({ _id: KEY }, { $set: { tables: list, readOn, partial, readAt: new Date().toISOString(), running: 0 }, $unset: { error: "", errorAt: "" } });
    catalogMemo = null;
    return true;
  } catch (e) {
    console.error("[tables] catalog read failed:", e);
    await col.updateOne({ _id: KEY }, { $set: { running: 0, error: e instanceof Error ? e.message : String(e), errorAt: new Date().toISOString() } });
    catalogMemo = null;
    return true;
  }
}

/* ---------------- Rows ---------------- */

const copying = new Map<string, Promise<Record<string, string>[]>>();
const rawMemo = new Map<string, { at: string; rows: Record<string, string>[] }>();
/** A table's rows: from the copy, or from Zoho when there's none yet or it's older than STALE_MS. */
async function rawRows(t: CatalogTable): Promise<Record<string, string>[]> {
  const id = `zt:${t.id}`;
  const coll = (await db()).collection<CopyDoc>(COL);
  const doc = await coll.findOne({ _id: id }, { projection: { at: 1 } });
  const fresh = doc && Date.now() - Date.parse(doc.at) < STALE_MS;
  if (fresh) {
    const m = rawMemo.get(id);
    if (m && m.at === doc!.at) return m.rows;
    const full = await coll.findOne({ _id: id });
    const rows = JSON.parse(gunzipSync(full!.gz.buffer).toString("utf8")) as Record<string, string>[];
    rawMemo.set(id, { at: full!.at, rows });
    return rows;
  }
  // One copy at a time per table on this server (two reports asking at once share it).
  const running = copying.get(id);
  if (running) return running;
  const p = (async () => {
    await paced();
    const keep = t.columns.map((c) => c.name);
    const rows = (await exportTable(t.id)).map((r) => Object.fromEntries(keep.map((c) => [c, r[c] ?? ""])));
    const at = new Date().toISOString();
    await coll.replaceOne({ _id: id }, { gz: new Binary(gzipSync(Buffer.from(JSON.stringify(rows)))), count: rows.length, at }, { upsert: true });
    rawMemo.set(id, { at, rows });
    return rows;
  })().finally(() => copying.delete(id));
  copying.set(id, p);
  return p;
}

/** The fields a report touches (splits, filters, numbers, tooltip, compare) — to load only the tables they need. */
export function fieldsUsed(spec: Spec): string[] {
  const keys = [...(spec.by ?? []), ...(spec.filters ?? []).map((f) => f.field), ...spec.measures, ...(spec.tooltip ?? []), spec.dateField ?? ""];
  if (typeof spec.compare === "object" && spec.compare) keys.push(spec.compare.field);
  return keys.map((k) => k.replace(/^(?:rel:\d+:)?(?:sum|avg|min|max|count|distinct):/, "")).filter(Boolean);
}
/** The link paths those fields walk: "Invoice ID→Customer ID→Sector" → ["Invoice ID", "Customer ID"]. */
const pathsOf = (keys: string[]) => [...new Map(keys.filter((k) => k.includes("→")).map((k) => { const p = k.split("→").slice(0, -1); return [p.join("→"), p] as const; })).values()];

/** Loads the linked tables a set of paths walks from `t` (one or two levels), keyed by the column the link points at. */
export async function loadLinks(t: CatalogTable, paths: string[][], catalog: Catalog, linked: Linked = new Map()): Promise<Linked> {
  const byName = new Map(catalog.tables.map((x) => [x.name, x]));
  for (const path of paths) {
    let from = t;
    for (const step of path) {
      const c = from.columns.find((x) => x.name === step);
      const lt = c?.link && byName.get(c.link.table);
      if (!c?.link || !lt || HIDDEN_TABLES.has(lt.name)) break;
      if (!linked.has(lt.name)) { const key = c.link.column; linked.set(lt.name, { table: lt, rows: new Map((await rawRows(lt)).map((r) => [(r[key] ?? "").trim(), r])) }); }
      from = lt;
    }
  }
  return linked;
}

/** A Zoho table dataset's rows for this report (with the linked tables it uses); a joined one ("zt:1+7") in joins. */
export async function tableRowsFor(spec: Spec, catalog: Catalog): Promise<Row[]> {
  if (!isTableKey(spec.dataset)) return [];
  if (spec.dataset.includes("+")) return joinedRowsFor(spec, catalog);
  const t = catalog.tables.find((x) => `zt:${x.id}` === spec.dataset);
  if (!t) throw new Error("That Zoho table isn't in the list any more");
  return tableRows(t, await rawRows(t), await loadLinks(t, pathsOf(fieldsUsed(spec)), catalog), catalog);
}

/**
 * A joined dataset's rows (joins.ts): the main table and each related table, every row tagged with its table; the
 * related rows carry the main table's words and dates through the shared ID (owner, 30 Oct: "join two tables").
 */
async function joinedRowsFor(spec: Spec, catalog: Catalog): Promise<Row[]> {
  const j = parseJoinKey(spec.dataset, catalog);
  if (!j) throw new Error("Those Zoho tables can't be put together any more");
  const used = fieldsUsed(spec);
  // The main table's links: those the report uses, plus whatever the related rows need to fill the same fields.
  const mainPaths = pathsOf(used.filter((k) => !k.startsWith("rel:") && !k.startsWith("⟂")));
  const main = { table: j.main, raw: await rawRows(j.main), linked: await loadLinks(j.main, mainPaths, catalog) };
  const related = [];
  for (const r of j.related) {
    // A sibling (both point at Customers…) fills the main table's fields from that shared table: load it from both sides.
    const viaPaths = r.kind === "sibling" ? mainPaths.filter((p) => p[0] === r.mainCol).map((p) => [r.col, ...p.slice(1)]) : [];
    const own = pathsOf(used.filter((k) => k.startsWith(`rel:${r.table.id}:`)).map((k) => k.slice(`rel:${r.table.id}:`.length)));
    related.push({ ...r, raw: await rawRows(r.table), linked: await loadLinks(r.table, [...viaPaths, ...own], catalog) });
  }
  return joinedRows(main, related, catalog);
}
