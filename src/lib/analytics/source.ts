import "server-only";
import { db } from "../db";
import { exportTable, workspaceViews } from "../zohoAnalytics";
import { getSnapshot } from "../zohoSync";
import { boardTrainings } from "../fulfilServer";
import { type Raw, type RawTables, type TableKey, TABLES, buildRows } from "./build";
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

type TableDoc = { _id: TableKey; rows: Raw[]; count: number; at: string };
export type DataState = { _id?: string; refreshedAt?: string; refreshedBy?: string; error?: string; tables?: Partial<Record<TableKey, number>>; running?: boolean };

const kv = async () => (await db()).collection<DataState & { _id: string; until?: number; owner?: string }>("kv");

export async function dataState(): Promise<DataState> {
  const s = await (await kv()).findOne({ _id: STATE_KEY });
  const lock = await (await kv()).findOne({ _id: LOCK });
  return { refreshedAt: s?.refreshedAt, refreshedBy: s?.refreshedBy, error: s?.error, tables: s?.tables, running: Boolean(lock?.until && lock.until > Date.now()) };
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
  const counts: Partial<Record<TableKey, number>> = {};
  let error: string | undefined;
  try {
    const views = await workspaceViews();
    for (const key of Object.keys(TABLES) as TableKey[]) {
      const def = TABLES[key];
      const view = views.find((v) => v.name === def.name && /^table$/i.test(v.type));
      if (!view) { error = `No “${def.name}” table in the workspace`; continue; }
      await new Promise((r) => setTimeout(r, PACE_MS));
      const rows = (await exportTable(view.id)).map((r) => Object.fromEntries(def.columns.map((c) => [c, r[c] ?? ""])));
      await col.replaceOne({ _id: key }, { rows, count: rows.length, at: new Date().toISOString() }, { upsert: true });
      counts[key] = rows.length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[analytics] refresh failed: ${error}`);
  } finally {
    await (await kv()).updateOne({ _id: STATE_KEY }, { $set: { refreshedAt: new Date().toISOString(), refreshedBy: by, error, tables: counts } }, { upsert: true });
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

/** Every dataset's rows (Zoho Analytics copy + the board's trainings), rebuilt when either changes (trainings: 60 s). */
export async function datasetRows(today: string): Promise<{ rows: Record<string, Row[]>; state: DataState }> {
  const state = await dataState();
  const snap = await getSnapshot();
  const key = `${state.refreshedAt ?? ""}|${snap?.version ?? 0}|${today}`;
  if (memo && memo.key === key && Date.now() - memo.at < 60_000) return { rows: memo.rows, state };
  if (!copy || copy.refreshedAt !== (state.refreshedAt ?? "")) {
    const docs = await (await db()).collection<TableDoc>(COL).find({}).toArray();
    copy = { refreshedAt: state.refreshedAt ?? "", tables: Object.fromEntries(docs.map((d) => [d._id, d.rows])) };
  }
  const tables = copy.tables;
  const trainings = snap ? (await boardTrainings(snap)).board : [];
  const rows = buildRows(tables, trainings, today);
  memo = { key, at: Date.now(), rows };
  return { rows, state };
}
