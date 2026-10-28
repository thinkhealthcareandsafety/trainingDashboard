import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { Binary } from "mongodb";
import { db } from "../db";
import { exportTable, workspaceViews } from "../zohoAnalytics";
import { getSnapshot } from "../zohoSync";
import { boardTrainings } from "../fulfilServer";
import { type Raw, type RawTables, type TableKey, STOCK_TABLES, TABLES, buildRows } from "./build";
import type { Row } from "./model";

/*
 * The Reports page's data. Zoho Analytics tables (the whole of Zoho Books, synced by Zoho) are copied into Mongo
 * `za_tables` — one doc per table, only the columns build.ts uses — by `refreshAnalyticsData` (Admin's "Refresh", and
 * on its own when older than STALE_MS). The Training board's trainings come live from the boards. Built rows are kept
 * in memory per data version.
 */

const COL = "za_tables";
const STATE_KEY = "za_state";
const LOCK = "za_refresh_lock";
export const STALE_MS = 6 * 3600_000;
const PACE_MS = 2500; // Zoho Analytics refuses bursts ("exceeded the allowed limits")
const BUDGET_MS = 85_000; // start no table after this — the route's maxDuration is 120 s

// `gz` (27 Oct): the rows as gzipped JSON — 6.2 MB → 0.55 MB for all tables, so a new server reads the copy in seconds
// even when the free Atlas cluster is slowed to ~90 KB/s. Copies made before that still have plain `rows`.
type TableDoc = { _id: TableKey; rows?: Raw[]; gz?: Binary; count: number; at: string };
const unpack = (d: TableDoc): Raw[] => (d.gz ? JSON.parse(gunzipSync(d.gz.buffer).toString("utf8")) : d.rows ?? []);
/** `partial`: the last refresh ran out of time — the remaining tables are copied by the next one. */
export type DataState = { _id?: string; refreshedAt?: string; refreshedBy?: string; error?: string; tables?: Partial<Record<TableKey, number>>; running?: boolean; partial?: boolean };

const kv = async () => (await db()).collection<DataState & { _id: string; until?: number; owner?: string }>("kv");

export async function dataState(): Promise<DataState> {
  const s = await (await kv()).findOne({ _id: STATE_KEY });
  const lock = await (await kv()).findOne({ _id: LOCK });
  return { refreshedAt: s?.refreshedAt, refreshedBy: s?.refreshedBy, error: s?.error, tables: s?.tables, running: Boolean(lock?.until && lock.until > Date.now()), partial: s?.partial };
}

async function lock(): Promise<string | null> {
  const owner = Math.random().toString(36).slice(2);
  const now = Date.now();
  try {
    const r = await (await kv()).findOneAndUpdate(
      { _id: LOCK, $or: [{ until: { $lt: now } }, { until: { $exists: false } }] },
      { $set: { until: now + 5 * 60_000, owner } },
      { upsert: true, returnDocument: "after" },
    );
    return r?.owner === owner ? owner : null;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null;
    throw e;
  }
}

/** Copies the tables from Zoho Analytics (read-only there). Returns false if a refresh is already running. */
export async function refreshAnalyticsData(by: string): Promise<boolean> {
  const owner = await lock();
  if (!owner) return false;
  const col = (await db()).collection<TableDoc>(COL);
  const counts: Record<string, number> = {};
  let error: string | undefined;
  let partial = false;
  const started = Date.now();
  try {
    const views = await workspaceViews();
    // From Vercel each table takes ~8 s (export + pace): 16 tables ran past the 120 s limit and were cut off (28 Oct).
    // So: oldest copies first, no new table after BUDGET_MS — the rest follow on the next call (the route asks again
    // within 10 minutes while `partial`).
    const at = new Map((await col.find({}, { projection: { at: 1 } }).toArray()).map((d) => [d._id, d.at]));
    const keys = (Object.keys(TABLES) as TableKey[]).sort((a, b) => (at.get(a) ?? "").localeCompare(at.get(b) ?? ""));
    for (const key of keys) {
      if (Date.now() - started > BUDGET_MS) { partial = true; break; }
      const def = TABLES[key];
      const view = views.find((v) => v.name === def.name && /^table$/i.test(v.type));
      if (!view) { error = `No “${def.name}” table in the workspace`; continue; }
      await new Promise((r) => setTimeout(r, PACE_MS));
      const rows = (await exportTable(view.id)).map((r) => Object.fromEntries(def.columns.map((c) => [c, r[c] ?? ""])));
      await col.replaceOne({ _id: key }, { gz: new Binary(gzipSync(Buffer.from(JSON.stringify(rows)))), count: rows.length, at: new Date().toISOString() }, { upsert: true });
      counts[`tables.${key}`] = rows.length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[analytics] refresh failed: ${error}`);
  } finally {
    await (await kv()).updateOne({ _id: STATE_KEY }, { $set: { refreshedAt: new Date().toISOString(), refreshedBy: by, error, partial, ...counts } }, { upsert: true });
    await (await kv()).updateOne({ _id: LOCK, owner }, { $set: { until: 0 } });
    memo = null;
    copy = null;
  }
  return true;
}

let memo: { key: string; at: number; rows: Record<string, Row[]> } | null = null;
// The copy itself (~6 MB) changes only when it's refreshed (every 6 h): read it once per refresh, not per minute — on
// the free Atlas cluster a minute-by-minute re-read helped use up the weekly 10 GB, and then took ~70 s (27 Oct).
let copy: { refreshedAt: string; tables: RawTables } | null = null;

/**
 * Every dataset's rows (Zoho Analytics copy + the board's trainings), rebuilt when either changes (trainings: 60 s).
 * `withTrainings` false: no board needed (Sales, Growth, Collections… — the goal meter too), so a new server doesn't
 * load the whole Zoho copy (3.3 MB) just to answer them. `withStock`: the stock tables are read only when a stock
 * report asks (28 Oct — keep Reports lazy).
 */
export async function datasetRows(today: string, withTrainings = true, withStock = false): Promise<{ rows: Record<string, Row[]>; state: DataState }> {
  const state = await dataState();
  const snap = withTrainings ? await getSnapshot() : null;
  const col = (await db()).collection<TableDoc>(COL);
  if (!copy || copy.refreshedAt !== (state.refreshedAt ?? "")) {
    const docs = await col.find({ _id: { $nin: STOCK_TABLES } }).toArray();
    copy = { refreshedAt: state.refreshedAt ?? "", tables: Object.fromEntries(docs.map((d) => [d._id, unpack(d)])) };
  }
  // Once read, they stay with the copy (until the next refresh), so stock and other reports share one set of rows.
  if (withStock && STOCK_TABLES.some((k) => !copy!.tables[k])) {
    for (const d of await col.find({ _id: { $in: STOCK_TABLES } }).toArray()) copy.tables[d._id] = unpack(d);
  }
  const tables = copy.tables;
  const hasStock = STOCK_TABLES.every((k) => tables[k]);
  const key = `${state.refreshedAt ?? ""}|${withTrainings ? snap?.version ?? 0 : "-"}|${hasStock ? "stock" : "-"}|${today}`;
  if (memo && memo.key === key && Date.now() - memo.at < 60_000) return { rows: memo.rows, state };
  const trainings = snap ? (await boardTrainings(snap)).board : [];
  const rows = buildRows(tables, trainings, today);
  memo = { key, at: Date.now(), rows };
  return { rows, state };
}
