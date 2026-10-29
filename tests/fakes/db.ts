// In-memory stand-in for @/lib/db in tests (tests/register.mjs always maps it) — find / findOne / replaceOne /
// updateOne / deleteOne / countDocuments, enough for the routes under test. Nothing here touches MongoDB.
type Doc = { _id: string; [k: string]: unknown };
const store: Record<string, Map<string, Doc>> = {};
const coll = (name: string) => {
  const m = (store[name] ??= new Map());
  return {
    find: () => ({ limit: () => ({ toArray: async () => [...m.values()].map((d) => structuredClone(d)) }) }),
    findOne: async (q: { _id: string }) => (m.has(q._id) ? structuredClone(m.get(q._id)!) : null),
    replaceOne: async (q: { _id: string }, doc: Doc) => { m.set(q._id, structuredClone(doc)); },
    updateOne: async (q: { _id: string }, u: { $set?: Record<string, unknown> }) => { m.set(q._id, { ...(m.get(q._id) ?? {}), _id: q._id, ...(u.$set ?? {}) }); },
    deleteOne: async (q: { _id: string }) => { m.delete(q._id); },
    countDocuments: async () => m.size,
  };
};
export const db = async () => ({ collection: coll });
export const resetFakeDb = () => { for (const k of Object.keys(store)) delete store[k]; };
