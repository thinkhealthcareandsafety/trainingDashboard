// In-memory stand-in for @/lib/db in tests (tests/register.mjs always maps it) — find / findOne / replaceOne /
// updateOne ($set / $unset) / deleteOne / countDocuments, enough for the routes under test. Nothing here touches MongoDB.
type Doc = { _id: string; [k: string]: unknown };
/** A filter's conditions on top-level fields: equality, { $exists }, { $lt }, and $or of those. */
function matches(d: Doc, q: Record<string, unknown>): boolean {
  return Object.entries(q).every(([k, c]) => {
    if (k === "$or") return (c as Record<string, unknown>[]).some((x) => matches(d, x));
    const v = d[k];
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as { $exists?: boolean; $lt?: string | number };
      if ("$exists" in o && (v !== undefined) !== o.$exists) return false;
      if ("$lt" in o && !(v !== undefined && (v as string | number) < o.$lt!)) return false;
      return true;
    }
    return v === c;
  });
}
const store: Record<string, Map<string, Doc>> = {};
const coll = (name: string) => {
  const m = (store[name] ??= new Map());
  return {
    find: () => {
      const toArray = async () => [...m.values()].map((d) => structuredClone(d));
      // sort ignores the order (insertion order is kept); enough for listing.
      const chain = { toArray, limit: () => chain, sort: () => chain };
      return chain;
    },
    // readAll's fingerprint: no answer → it reads the collection, as with a real failure.
    aggregate: () => ({ toArray: async () => [] }),
    findOne: async (q: { _id: string }) => (m.has(q._id) ? structuredClone(m.get(q._id)!) : null),
    // Like Mongo: the filter's _id stays on the document (a replacement may leave it out).
    replaceOne: async (q: { _id: string }, doc: Omit<Doc, "_id">) => { m.set(q._id, structuredClone({ ...doc, _id: q._id })); },
    // $set / $unset with dotted paths ("views.sales"), like Mongo. Other filter fields (a claim: $exists / $lt / $or) must
    // match an existing document, else nothing changes; modifiedCount says which.
    updateOne: async (q: { _id: string; [k: string]: unknown }, u: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
      const guarded = Object.keys(q).some((k) => k !== "_id");
      if (guarded && (!m.has(q._id) || !matches(m.get(q._id)!, q))) return { matchedCount: 0, modifiedCount: 0 };
      const d: Doc = structuredClone(m.get(q._id) ?? { _id: q._id });
      const at = (path: string) => { const ks = path.split("."); let o = d as Record<string, unknown>; for (const k of ks.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>; return [o, ks.at(-1)!] as const; };
      for (const [k, v] of Object.entries(u.$set ?? {})) { const [o, last] = at(k); o[last] = v; }
      for (const k of Object.keys(u.$unset ?? {})) { const [o, last] = at(k); delete o[last]; }
      m.set(q._id, d);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    // Enough for a lock and a counter: matches the doc by _id (other conditions ignored), $set / $inc, upsert, the new doc back.
    findOneAndUpdate: async (q: { _id: string }, u: { $set?: Record<string, unknown>; $inc?: Record<string, number> }) => {
      const d: Doc = { ...(m.get(q._id) ?? { _id: q._id }), ...(u.$set ?? {}) };
      for (const [k, v] of Object.entries(u.$inc ?? {})) d[k] = (Number(d[k]) || 0) + v;
      m.set(q._id, structuredClone(d));
      return structuredClone(d);
    },
    deleteOne: async (q: { _id: string }) => { m.delete(q._id); },
    insertOne: async (doc: Partial<Doc>) => { const _id = doc._id ?? `id${m.size + 1}`; m.set(_id, structuredClone({ ...doc, _id })); return { insertedId: _id }; },
    // /api/store's writes: replaceOne (upsert) and deleteOne by _id; updateOne ($set, upsert) for the BOQ memory.
    bulkWrite: async (ops: ({ replaceOne?: { filter: { _id: string }; replacement: Doc }; deleteOne?: { filter: { _id: string } }; updateOne?: { filter: { _id: string }; update: { $set?: Record<string, unknown> } } })[]) => {
      for (const o of ops) {
        if (o.updateOne) m.set(o.updateOne.filter._id, structuredClone({ ...(m.get(o.updateOne.filter._id) ?? {}), ...(o.updateOne.update.$set ?? {}), _id: o.updateOne.filter._id }));
        if (o.replaceOne) m.set(o.replaceOne.filter._id, structuredClone({ ...o.replaceOne.replacement, _id: o.replaceOne.filter._id }));
        if (o.deleteOne) m.delete(o.deleteOne.filter._id);
      }
    },
    countDocuments: async () => m.size,
  };
};
export const db = async () => ({ collection: coll });
export const mongoConfigured = () => true;
export const COLLECTIONS = ["entries", "announcements", "members", "cardEvents"] as const;
export const resetFakeDb = () => { for (const k of Object.keys(store)) delete store[k]; };
