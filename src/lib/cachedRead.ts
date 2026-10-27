import "server-only";
import { db } from "./db";

/*
 * Whole-collection reads that only download when something changed (27 Oct). The free Atlas cluster allows 10 GB out
 * a week, then slows to ~100 KB/s: every open tab pulled the whole change log every 15 s (~0.25 MB, ~60 MB an hour per
 * tab), so the team went over it and Reports took two minutes to load. Mongo works out a fingerprint of the collection
 * on its side (count, total size, XOR of each document's hash — any change to any document changes it) and sends back
 * one tiny document; this server instance keeps the last copy and reads it again only when the fingerprint moved.
 */

type Entry = { fp: string; docs: unknown[] };
const cache = new Map<string, Entry>();

/** The collection's fingerprint, worked out by Mongo (a few bytes over the wire, ~20 ms). */
export async function fingerprint(name: string): Promise<string> {
  const [r] = await (await db()).collection(name).aggregate<{ n: number; size: number; h: unknown }>([
    { $group: { _id: null, n: { $sum: 1 }, size: { $sum: { $bsonSize: "$$ROOT" } }, hs: { $push: { $toHashedIndexKey: "$$ROOT" } } } },
    { $project: { _id: 0, n: 1, size: 1, h: { $reduce: { input: "$hs", initialValue: { $toLong: 0 }, in: { $bitXor: ["$$value", "$$this"] } } } } },
  ]).toArray();
  return r ? `${r.n}.${r.size}.${String(r.h)}` : "0";
}

/**
 * Every document of a collection (without `_id`), from this instance's copy unless the collection changed since.
 * `fp` is the version, for callers that pass it on (the browser's "nothing new" check). If the fingerprint can't be
 * worked out, it simply reads the collection, as before.
 */
export async function readAll<T = Record<string, unknown>>(name: string): Promise<{ docs: T[]; fp: string }> {
  const fp = await fingerprint(name).catch(() => "");
  const hit = cache.get(name);
  if (fp && hit?.fp === fp) return { docs: hit.docs as T[], fp };
  const docs = await (await db()).collection(name).find({}, { projection: { _id: 0 } }).toArray();
  if (fp) cache.set(name, { fp, docs });
  return { docs: docs as T[], fp };
}
