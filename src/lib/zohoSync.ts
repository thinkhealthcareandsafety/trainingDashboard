import "server-only";
import { after } from "next/server";
import type { AedInvoice, PipelineDoc, Training, ZohoInvoice, ZohoLead, ZohoPayment, ZohoPI, ZohoQuote } from "./types";
import { fiscalYearStart, syncWindowStart, ymd } from "./dates";
import { db, mongoConfigured } from "./db";
import {
  type ItemSets, type Kind, type ZDoc, type ZItem, KINDS, OPEN_ORDER, OPEN_QUOTE, docIdOf, fetchAllLeads, fetchDetail, fetchInvoicePaymentRows,
  fetchItems, fetchRecentLeads, fetchTeam, itemSets, listByItem, listChangedSince, lmtOf, newestChange, pool, takeZohoCalls, toAedInvoice,
  toInvoice, toPI, toPayments, toPipeline, toQuote, toTrainings, zohoConfigured,
} from "./zoho";

/*
 * Zoho Books data lives in MongoDB, not in server memory, so any number of server instances (or a serverless host
 * that restarts often) serve the same copy and page loads never call Zoho. One sync runs at a time (a lock in
 * MongoDB) and only asks Zoho for what changed since the last one:
 *   - documents: each kind listed newest-change-first, stopping at the last change already seen (usually 1 call);
 *   - customers: the 200 most recently changed (1 call); payments: only for paid invoices that changed;
 *   - the 9 am and 2 pm syncs are full checks: every tracked document by item (catches deletions), the full
 *     customer list, items and team.
 * Schedule: automatically on the hour, 9 am–7 pm IST, Monday–Saturday (none on Sunday); "Sync now" any time.
 * MongoDB is updated as part of each sync, so pages show the new data as soon as it finishes.
 * Zoho calls are counted per day; automatic syncing pauses at 95% of ZOHO_DAILY_LIMIT.
 */

/** AedSmartx board start date (see HANDOFF #48). */
export const AED_SINCE = "2026-09-01";
const DAILY_LIMIT = Number(process.env.ZOHO_DAILY_LIMIT) || 2500;
const LOCK_MS = 5 * 60_000;
const FORCE_GAP_MS = 60_000; // "Sync now" at most once a minute, for everyone together
const RETRY_MS = 5 * 60_000; // after a failed automatic sync, wait before trying again
const IST_MS = 330 * 60_000;
/** Automatic syncs: on the hour, 9 am–7 pm IST, Mon–Sat. The 9 am and 2 pm ones are full checks. */
const SYNC_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const FULL_HOURS = [9, 14];

const trainingSince = () => ymd(syncWindowStart(new Date())); // Follow-ups: current + previous fiscal year
const overviewSince = () => ymd(fiscalYearStart(new Date())); // Overview: current fiscal year

/** UTC time of an IST wall-clock hour, `dayOffset` days from today (IST). */
function istAt(dayOffset: number, hour: number, now: number): number {
  const ist = new Date(now + IST_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + dayOffset, hour) - IST_MS;
}
/** The most recent scheduled time (one of `hours`, Mon–Sat IST) at or before now — 0 if none in the last week. */
export function lastSlot(hours: number[], now = Date.now()): number {
  const desc = [...hours].sort((a, b) => b - a);
  for (let d = 0; d >= -8; d--) {
    for (const h of desc) {
      const t = istAt(d, h, now);
      if (t <= now && new Date(t + IST_MS).getUTCDay() !== 0) return t;
    }
  }
  return 0;
}
/** An automatic sync is due when a scheduled hour has passed since the last successful sync. */
export const scheduledSyncDue = (syncedAt?: string, now = Date.now()) => lastSlot(SYNC_HOURS, now) > (syncedAt ? new Date(syncedAt).getTime() : 0);
/** Blank fields are left out (not stored as null), so customers look exactly as Zoho sent them. */
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;
const istDay = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/* ---------------- MongoDB ---------------- */

type StoredDoc = { _id: string; kind: Kind; id: string; lmt: string; date: string; status: string; training: boolean; aed: boolean; doc: ZDoc };
type StoredPayments = { _id: string; lmt: string; rows: ZDoc[] };
type SyncState = {
  _id: "zoho_state";
  version: number;
  syncedAt?: string;
  error?: string;
  cursors: Partial<Record<Kind, string>>;
  customersAt?: number;
  reconcileAt?: number;
  itemsAt?: number;
  usersAt?: number;
  attemptAt?: number; // last sync attempt (successful or not)
};

const col = async <T extends { _id: string }>(name: string) => (await db()).collection<T>(name);
const kv = async () => (await db()).collection<{ _id: string } & Record<string, unknown>>("kv");

async function loadState(): Promise<SyncState> {
  const s = (await (await kv()).findOne({ _id: "zoho_state" })) as SyncState | null;
  return s ?? { _id: "zoho_state", version: 0, cursors: {} };
}

async function acquireLock(): Promise<string | null> {
  const owner = Math.random().toString(36).slice(2);
  const now = Date.now();
  try {
    const r = await (await kv()).findOneAndUpdate(
      { _id: "zoho_sync_lock", $or: [{ until: { $lt: now } }, { until: { $exists: false } }] },
      { $set: { until: now + LOCK_MS, owner } },
      { upsert: true, returnDocument: "after" },
    );
    return r?.owner === owner ? owner : null;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null; // someone else holds it
    throw e;
  }
}
const releaseLock = async (owner: string) => (await kv()).updateOne({ _id: "zoho_sync_lock", owner }, { $set: { until: 0 } });

export async function zohoCallsToday(): Promise<number> {
  const d = await (await kv()).findOne({ _id: `zoho_calls:${istDay()}` });
  return Number(d?.n ?? 0);
}
async function countCalls() {
  const n = takeZohoCalls();
  if (n) await (await kv()).updateOne({ _id: `zoho_calls:${istDay()}` }, { $inc: { n } } as never, { upsert: true });
}

/* ---------------- Sync ---------------- */

function classify(kind: Kind, d: ZDoc, sets: ItemSets) {
  const ids = ((d.line_items as ZDoc[]) ?? []).map((li) => String(li.item_id));
  return { training: ids.some((i) => sets.training.has(i)), aed: kind === "invoices" && ids.some((i) => sets.aed.has(i)) };
}

/** Download, classify and store changed documents; returns how many tracked documents changed. */
async function storeDocs(kind: Kind, rows: ZDoc[], sets: ItemSets): Promise<number> {
  const docs = await col<StoredDoc>("zohoDocs");
  const existing = new Map((await docs.find({ _id: { $in: rows.map((r) => `${kind}:${docIdOf(kind, r)}`) } }, { projection: { doc: 0 } }).toArray()).map((d) => [d._id, d]));
  let changed = 0;
  await pool(rows, 5, async (r) => {
    const id = docIdOf(kind, r);
    const key = `${kind}:${id}`;
    const lmt = lmtOf(r);
    const had = existing.get(key);
    if (had && had.lmt === lmt) return;
    if (String(r.status) === "void") {
      if (had) (await docs.deleteOne({ _id: key }), changed++);
      return;
    }
    const d = await fetchDetail(kind, id);
    const { training, aed } = classify(kind, d, sets);
    if (!training && !aed) {
      if (had) (await docs.deleteOne({ _id: key }), changed++); // no longer has a tracked item
      return;
    }
    await docs.replaceOne({ _id: key }, { kind, id, lmt, date: String(d.date), status: String(d.status), training, aed, doc: d }, { upsert: true });
    changed++;
  });
  return changed;
}

/** Full check (first sync, then every 6 h): every tracked document, by item; removes what Zoho no longer has. */
async function reconcile(state: SyncState, sets: ItemSets): Promise<number> {
  const docs = await col<StoredDoc>("zohoDocs");
  const since = trainingSince();
  let changed = 0;
  for (const kind of KINDS) {
    const lists = [
      ...[...sets.training].map((item) => ({ item, since })),
      ...(kind === "invoices" ? [...sets.aed].map((item) => ({ item, since: AED_SINCE })) : []),
    ];
    const listed = new Map<string, ZDoc>();
    for (const rows of await pool(lists, 4, ({ item, since }) => listByItem(kind, item, since))) {
      for (const r of rows) if (String(r.status) !== "void") listed.set(docIdOf(kind, r), r);
    }
    const cursor = await newestChange(kind, since); // incremental syncing continues from here
    changed += await storeDocs(kind, [...listed.values()], sets);
    const gone = (await docs.find({ kind }, { projection: { id: 1 } }).toArray()).filter((d) => !listed.has(d.id)).map((d) => d._id);
    if (gone.length) (await docs.deleteMany({ _id: { $in: gone } }), (changed += gone.length));
    if (cursor) state.cursors[kind] = cursor;
  }
  state.reconcileAt = Date.now();
  return changed;
}

/** Between full checks: only documents changed since the last sync (newest change first). */
async function incremental(state: SyncState, sets: ItemSets): Promise<number> {
  let changed = 0;
  for (const kind of KINDS) {
    const rows = await listChangedSince(kind, trainingSince(), state.cursors[kind]);
    if (!rows.length) continue;
    changed += await storeDocs(kind, rows, sets);
    state.cursors[kind] = rows.map(lmtOf).reduce((a, b) => (b > a ? b : a), state.cursors[kind] ?? "");
  }
  return changed;
}

/** Payments, only for paid / part-paid training invoices that changed since their payments were read. */
async function syncPayments(sets: ItemSets): Promise<number> {
  const docs = await col<StoredDoc>("zohoDocs");
  const pays = await col<StoredPayments>("zohoPayments");
  const paid = await docs.find({ kind: "invoices", training: true, status: { $in: ["paid", "partially_paid"] } }, { projection: { id: 1, doc: 1 } }).toArray();
  const have = new Map((await pays.find({}, { projection: { rows: 0 } }).toArray()).map((p) => [p._id, p.lmt]));
  const stale = paid.filter((d) => have.get(d.id) !== String(d.doc.last_modified_time ?? ""));
  await pool(stale, 4, async (d) => {
    const rows = await fetchInvoicePaymentRows(d.id);
    await pays.replaceOne({ _id: d.id }, { lmt: String(d.doc.last_modified_time ?? ""), rows }, { upsert: true });
  });
  void sets;
  return stale.length;
}

/**
 * One sync. Returns "busy" if another instance is syncing, "skipped" when the daily budget is nearly used.
 * `force` = someone pressed "Sync now": it runs even when the budget has paused automatic syncing.
 */
export async function runSync({ force = false }: { force?: boolean } = {}): Promise<"done" | "busy" | "skipped"> {
  if (!zohoConfigured() || !mongoConfigured()) return "skipped";
  const owner = await acquireLock();
  if (!owner) return "busy";
  const state = await loadState();
  let changed = 0;
  let error: string | undefined;
  try {
    if ((await zohoCallsToday()) >= DAILY_LIMIT * 0.95 && !force) {
      error = "Zoho's daily API allowance is nearly used — automatic syncing paused until tomorrow (Sync now still works).";
      return "skipped";
    }
    const now = Date.now();
    const store = await kv();
    // Items decide which documents are tracked (Training Services / the four Follow-ups items / All AEDs).
    // Full check at the 9 am / 2 pm slots (or whenever one was missed, or on an empty database).
    const fullDue = !state.reconcileAt || state.reconcileAt < lastSlot(FULL_HOURS, now) || KINDS.some((k) => !state.cursors[k]);
    let items = ((await store.findOne({ _id: "zoho_items" }))?.items as ZItem[] | undefined) ?? undefined;
    if (!items?.length || fullDue) {
      items = await fetchItems();
      await store.replaceOne({ _id: "zoho_items" }, { items }, { upsert: true });
      state.itemsAt = now;
      changed++;
    }
    const sets = itemSets(items);
    // Customers.
    const customers = await col<ZohoLead & { _id: string }>("zohoCustomers");
    if (!state.customersAt || fullDue) {
      const all = await fetchAllLeads();
      if (all.length) {
        await customers.bulkWrite(all.map((l) => ({ replaceOne: { filter: { _id: l.contactId }, replacement: clean(l), upsert: true } })), { ordered: false });
        await customers.deleteMany({ _id: { $nin: all.map((l) => l.contactId) } });
      }
      state.customersAt = now;
      changed++;
    } else {
      const recent = await fetchRecentLeads();
      const have = new Map((await customers.find({ _id: { $in: recent.map((l) => l.contactId) } }).toArray()).map((l) => [l._id, l.lastModified]));
      const fresh = recent.filter((l) => have.get(l.contactId) !== l.lastModified);
      if (fresh.length) {
        await customers.bulkWrite(fresh.map((l) => ({ replaceOne: { filter: { _id: l.contactId }, replacement: clean(l), upsert: true } })), { ordered: false });
        changed++;
      }
    }
    // Team (Zoho users).
    if (!state.usersAt || fullDue) {
      await store.replaceOne({ _id: "zoho_users" }, { team: await fetchTeam() }, { upsert: true });
      state.usersAt = now;
      changed++;
    }
    // Documents and payments.
    changed += fullDue ? await reconcile(state, sets) : await incremental(state, sets);
    changed += await syncPayments(sets);
    return "done";
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    return "done";
  } finally {
    state.attemptAt = Date.now();
    if (changed) state.version = (state.version ?? 0) + 1;
    if (!error) state.syncedAt = new Date().toISOString();
    state.error = error;
    await (await kv()).replaceOne({ _id: "zoho_state" }, state as unknown as Record<string, unknown>, { upsert: true });
    await countCalls();
    await releaseLock(owner);
  }
}

/* ---------------- Reading the copy ---------------- */

type Snapshot = {
  version: number;
  syncedAt: string;
  attemptAt?: number;
  error?: string;
  customers: ZohoLead[];
  docs: StoredDoc[];
  payments: Map<string, ZDoc[]>;
  sets: ItemSets;
  team: string[];
  derived: Map<string, unknown>;
};
const G = globalThis as unknown as { __thSnap?: Snapshot | null; __thSnapLoading?: Promise<Snapshot | null> | null };
G.__thSnap = null; // a code reload (dev) rebuilds the in-memory copy

async function readSnapshot(): Promise<Snapshot | null> {
  const state = await loadState();
  if (!state.syncedAt && !state.version) return null;
  const mem = G.__thSnap;
  if (mem && mem.version === state.version) {
    mem.syncedAt = state.syncedAt ?? mem.syncedAt;
    mem.attemptAt = state.attemptAt;
    mem.error = state.error;
    return mem;
  }
  // Only reload when the copy changed (one small read otherwise).
  G.__thSnapLoading ??= (async () => {
    const [customers, docs, pays, items, users] = await Promise.all([
      (await col<ZohoLead & { _id: string }>("zohoCustomers")).find({}, { projection: { _id: 0 } }).toArray(),
      (await col<StoredDoc>("zohoDocs")).find({}).toArray(),
      (await col<StoredPayments>("zohoPayments")).find({}).toArray(),
      (await kv()).findOne({ _id: "zoho_items" }),
      (await kv()).findOne({ _id: "zoho_users" }),
    ]);
    const snap: Snapshot = {
      version: state.version,
      syncedAt: state.syncedAt ?? new Date().toISOString(),
      attemptAt: state.attemptAt,
      error: state.error,
      customers: (customers as ZohoLead[]).map(clean),
      docs,
      payments: new Map(pays.map((p) => [p._id, p.rows])),
      sets: itemSets((items?.items as ZItem[]) ?? []),
      team: (users?.team as string[]) ?? [],
      derived: new Map(),
    };
    G.__thSnap = snap;
    return snap;
  })().finally(() => (G.__thSnapLoading = null));
  return G.__thSnapLoading;
}

const memo = <T>(s: Snapshot, key: string, build: () => T): T => {
  if (!s.derived.has(key)) s.derived.set(key, build());
  return s.derived.get(key) as T;
};

/**
 * The current copy, syncing as needed: the very first time it waits for a full sync; afterwards the copy is served
 * immediately and, once a scheduled hour has passed (9 am–7 pm IST, Mon–Sat), refreshed in the background after
 * the response. "Sync now" (`force`) waits for a sync, but runs at most once a minute for everyone together.
 */
export async function getSnapshot(force = false): Promise<Snapshot | null> {
  let snap = await readSnapshot();
  if (!snap) {
    // First ever sync: run it, or wait for the one another request already started (up to ~4.5 min).
    if ((await runSync()) === "busy") {
      for (let i = 0; i < 90 && !snap; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        snap = await readSnapshot();
      }
      return snap;
    }
    return readSnapshot();
  }
  if (force) {
    const store = await kv();
    const last = Number((await store.findOne({ _id: "zoho_last_forced" }))?.at ?? 0);
    if (Date.now() - last > FORCE_GAP_MS) {
      await store.replaceOne({ _id: "zoho_last_forced" }, { at: Date.now() }, { upsert: true });
      await runSync({ force: true });
      snap = (await readSnapshot()) ?? snap;
    }
    return snap;
  }
  const retryOk = !snap.attemptAt || Date.now() - snap.attemptAt > RETRY_MS;
  if (scheduledSyncDue(snap.syncedAt) && retryOk) after(() => runSync().then(() => undefined, () => undefined));
  return snap;
}

const newestFirst = <T extends { date: string; createdAt: string }>(xs: T[]) => [...xs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
const tracked = (s: Snapshot, kind: Kind, since: string, test: (d: StoredDoc) => boolean) =>
  s.docs.filter((d) => d.kind === kind && d.status !== "void" && d.date >= since && test(d));
const hasItem = (d: StoredDoc, ids: Set<string>) => ((d.doc.line_items as ZDoc[]) ?? []).some((li) => ids.has(String(li.item_id)));

/** Follow-ups board: customers + training quotations, PIs, invoices and their payments. */
export function pipelineData(s: Snapshot) {
  return memo(s, "pipeline", () => {
    const since = trainingSince();
    const ids = s.sets.quoteTraining;
    const quotes: ZohoQuote[] = tracked(s, "estimates", since, (d) => hasItem(d, ids)).map((d) => toQuote(d.doc, ids));
    const pis: ZohoPI[] = tracked(s, "salesorders", since, (d) => hasItem(d, ids)).map((d) => toPI(d.doc, ids));
    const invoices: ZohoInvoice[] = tracked(s, "invoices", since, (d) => hasItem(d, ids)).map((d) => toInvoice(d.doc, ids));
    const payments: ZohoPayment[] = invoices
      .filter((i) => i.status === "paid" || i.status === "partially_paid")
      .flatMap((i) => toPayments(i, s.payments.get(i.invoiceId) ?? []));
    const leads = [...s.customers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const distinct = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b));
    return {
      windowStart: since,
      leads,
      quotes: newestFirst(quotes),
      pis: newestFirst(pis),
      invoices: newestFirst(invoices),
      payments: newestFirst(payments),
      typeOptions: distinct(leads.map((l) => l.type)),
      sectorOptions: distinct(leads.map((l) => l.sector)),
    };
  });
}

/** AedSmartx board: invoices from AED_SINCE with an AED item. */
export function aedData(s: Snapshot): { windowStart: string; invoices: AedInvoice[] } {
  return memo(s, "aed", () => ({
    windowStart: AED_SINCE,
    invoices: newestFirst(tracked(s, "invoices", AED_SINCE, (d) => d.aed && hasItem(d, s.sets.aed)).map((d) => toAedInvoice(d.doc, s.sets.aed))),
  }));
}

/** Overview: training invoices of the current fiscal year, plus open quotes and booked sales orders. */
export function trainingsData(s: Snapshot): { trainings: Training[]; pipeline: PipelineDoc[] } {
  return memo(s, "trainings", () => {
    const since = overviewSince();
    const ids = s.sets.training;
    return {
      trainings: tracked(s, "invoices", since, (d) => d.training).flatMap((d) => toTrainings(d.doc, ids)),
      pipeline: [
        ...tracked(s, "salesorders", since, (d) => d.training && OPEN_ORDER.has(d.status)).map((d) => toPipeline("salesorders", d.doc, ids)),
        ...tracked(s, "estimates", since, (d) => d.training && OPEN_QUOTE.has(d.status)).map((d) => toPipeline("estimates", d.doc, ids)),
      ].filter((x): x is PipelineDoc => x !== null),
    };
  });
}

/** Team members and customer names (pickers on follow-ups and calendar entries). */
export function metaData(s: Snapshot): { team: string[]; customers: string[] } {
  return memo(s, "meta", () => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { team: uniq(s.team), customers: uniq(s.customers.map((c) => c.name)) };
  });
}
