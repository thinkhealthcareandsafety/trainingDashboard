// In-memory stand-in for @/lib/db in tests (tests/register.mjs always maps it) — find / findOne / replaceOne /
// updateOne ($set / $unset) / deleteOne / countDocuments, enough for the routes under test. Nothing here touches MongoDB.
type Doc = { _id: string; [k: string]: unknown };
const store: Record<string, Map<string, Doc>> = {};
const coll = (name: string) => {
  const m = (store[name] ??= new Map());
  return {
    find: () => {
      const toArray = async () => [...m.values()].map((d) => structuredClone(d));
      return { toArray, limit: () => ({ toArray }) };
    },
    // readAll's fingerprint: no answer → it reads the collection, as with a real failure.
    aggregate: () => ({ toArray: async () => [] }),
    findOne: async (q: { _id: string }) => (m.has(q._id) ? structuredClone(m.get(q._id)!) : null),
    // Like Mongo: the filter's _id stays on the document (a replacement may leave it out).
    replaceOne: async (q: { _id: string }, doc: Omit<Doc, "_id">) => { m.set(q._id, structuredClone({ ...doc, _id: q._id })); },
    // $set / $unset with dotted paths ("views.sales"), like Mongo.
    updateOne: async (q: { _id: string }, u: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
      const d: Doc = structuredClone(m.get(q._id) ?? { _id: q._id });
      const at = (path: string) => { const ks = path.split("."); let o = d as Record<string, unknown>; for (const k of ks.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>; return [o, ks.at(-1)!] as const; };
      for (const [k, v] of Object.entries(u.$set ?? {})) { const [o, last] = at(k); o[last] = v; }
      for (const k of Object.keys(u.$unset ?? {})) { const [o, last] = at(k); delete o[last]; }
      m.set(q._id, d);
    },
    // Enough for a lock: matches the doc by _id (other conditions ignored), $set, upsert, the new doc back.
    findOneAndUpdate: async (q: { _id: string }, u: { $set?: Record<string, unknown> }) => {
      const d: Doc = { ...(m.get(q._id) ?? { _id: q._id }), ...(u.$set ?? {}) };
      m.set(q._id, structuredClone(d));
      return structuredClone(d);
    },
    deleteOne: async (q: { _id: string }) => { m.delete(q._id); },
    countDocuments: async () => m.size,
  };
};
export const db = async () => ({ collection: coll });
export const mongoConfigured = () => true;
export const COLLECTIONS = ["entries", "followUps", "removedTriggers", "announcements", "members", "cardEvents"] as const;
export const resetFakeDb = () => { for (const k of Object.keys(store)) delete store[k]; };
