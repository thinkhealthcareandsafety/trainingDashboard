import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { type Comment, type Notice, type Presence, type PtRequest, type Who, needsReply } from "./model";

/*
 * Progress tracker storage (PROGRESS-TRACKER-PLAN.md §3.2). All of it is real team data — never write test documents
 * here (HANDOFF §11 #4). Mongo `_id` = the record's `id`; the browser only ever sees the `id`.
 */

type Doc<T extends { id: string }> = Omit<T, "id"> & { _id: string };
export const requestsCol = async () => (await db()).collection<Doc<PtRequest>>("ptRequests");
export const presenceCol = async () => (await db()).collection<Doc<Presence>>("ptPresence");
export const commentsCol = async () => (await db()).collection<Doc<Comment>>("ptComments");
const NOTICE_DAYS = 30; // read or not, a notice is gone after a month (the request keeps its own log)
const G = globalThis as unknown as { __ptNoticeIndex?: Promise<unknown> };
export const noticesCol = async () => {
  const c = (await db()).collection<Doc<Notice> & { expiresAt: Date }>("ptNotifications");
  G.__ptNoticeIndex ??= Promise.all([c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), c.createIndex({ to: 1, at: -1 })]).catch(() => (G.__ptNoticeIndex = undefined));
  return c;
};

export const fromDoc = <T extends { id: string }>({ _id, ...rest }: Doc<T>) => ({ id: _id, ...rest }) as unknown as T;
export const newId = () => randomUUID().replace(/-/g, "");

/** Everyone who can sign in: the members, plus Admin (the owner — people ask them for things too). */
export async function team(): Promise<Who[]> {
  const rows = await (await db()).collection<{ _id: string; id?: string; name?: string }>("members").find({}, { projection: { _id: 1, id: 1, name: 1 } }).toArray();
  const list = rows.filter((m) => m.name).map((m) => ({ id: m.id ?? m._id, name: m.name! }));
  return [...list.sort((a, b) => a.name.localeCompare(b.name)), { id: "admin", name: "Admin" }];
}

/** Requests this member is tagged in and hasn't answered (replied / resolved) — the red count on Progress tracker. */
export async function needsReplyIds(me: Who): Promise<string[]> {
  const comments = await commentsCol();
  const mentioned = (await comments.distinct("parent", { mentions: me.id, deletedAt: { $exists: false } })).filter((p) => p.startsWith("request:")).map((p) => p.slice("request:".length));
  const reqs = (await (await requestsCol()).find({ $or: [{ waitingOnId: me.id, status: "open" }, { _id: { $in: mentioned } }] }).toArray()).map((r) => fromDoc<PtRequest>(r));
  if (!reqs.length) return [];
  const cs = (await comments.find({ parent: { $in: reqs.map((r) => `request:${r.id}`) } }, { projection: { text: 0 } }).toArray()).map((c) => fromDoc<Comment>(c));
  return reqs.filter((r) => needsReply(me.id, me.name, r, cs)).map((r) => r.id);
}

/** The next readable reference: R-0001, R-0002, … (one counter for the whole team). */
export async function nextRef(): Promise<string> {
  const kv = (await db()).collection<{ _id: string; n?: number }>("kv");
  const doc = await kv.findOneAndUpdate({ _id: "pt_request_seq" }, { $inc: { n: 1 } }, { upsert: true, returnDocument: "after" });
  return `R-${String(doc?.n ?? 1).padStart(4, "0")}`;
}

export async function notify(list: Omit<Notice, "id">[]): Promise<void> {
  if (!list.length) return;
  const expiresAt = new Date(Date.now() + NOTICE_DAYS * 86_400_000);
  await (await noticesCol()).insertMany(list.map((n) => ({ ...n, _id: newId(), expiresAt })));
}

/**
 * "Last seen" moves on whenever the member does something here or has the dashboard open in a visible tab — one
 * timestamp, overwritten, no history (privacy stance, plan §5.5). Written at most once a minute per member.
 */
export async function touch(me: Who, now = new Date()): Promise<void> {
  const c = await presenceCol();
  const cutoff = new Date(now.getTime() - 60_000).toISOString();
  try {
    await c.updateOne({ _id: me.id, $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: { $exists: false } }] }, { $set: { name: me.name, lastSeenAt: now.toISOString() } }, { upsert: true });
  } catch (e) {
    // Seen less than a minute ago: the filter didn't match the existing document and the upsert collided with it.
    if ((e as { code?: number }).code !== 11000) throw e;
  }
}
