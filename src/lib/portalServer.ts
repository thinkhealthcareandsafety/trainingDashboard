import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { itemSets, type ZItem } from "./zoho";
import { toTrainingQuote } from "./trainingManager";
import { DEFAULT_CONTENT, PHOTO_ID, type PortalContent, cleanContent, photosIn } from "./portalContent";

/*
 * The portal's dashboard data (docs/TRAINING_MANAGER_PLAN.md step 4): the signed-in coordinator's trainings, and the
 * programme / social content staff edit on Templates → Portal content. Read from our copy of Zoho (zohoDocs), so a
 * coordinator's visit never calls Zoho.
 */

type Kv = { _id: string; content?: PortalContent; by?: string; at?: string };
type Photo = { _id: string; data: string; type: string; at: string };
const kv = async () => (await db()).collection<Kv>("kv");
const photos = async () => (await db()).collection<Photo>("portalPhotos");

/** What the portal shows: the saved content, or the built-in one. */
export async function readContent(): Promise<PortalContent & { by?: string; at?: string }> {
  const saved = await (await kv()).findOne({ _id: "portal_content" });
  return saved?.content ? { ...saved.content, by: saved.by, at: saved.at } : DEFAULT_CONTENT;
}

/** Staff's save: checked, kept, and photos nobody uses any more (older than an hour, so an upload mid-edit stays) removed. */
export async function saveContent(raw: unknown, by: string): Promise<{ ok: true } | { error: string }> {
  const c = cleanContent(raw);
  if ("error" in c) return c;
  const col = await photos();
  const have = new Set((await col.find({}, { projection: { _id: 1 } }).toArray()).map((p) => p._id));
  const missing = photosIn(c).find((id) => !have.has(id));
  if (missing) return { error: "A photo didn't finish uploading. Upload it again." };
  await (await kv()).replaceOne({ _id: "portal_content" }, { content: c, by, at: new Date().toISOString() }, { upsert: true });
  const used = new Set(photosIn(c));
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  for (const p of await col.find({}, { projection: { _id: 1, at: 1 } }).toArray()) if (!used.has(p._id) && p.at < hourAgo) await col.deleteOne({ _id: p._id });
  return { ok: true };
}

export const MAX_PHOTO_BYTES = 700_000;

/** A programme photo (already made small in the browser): a JPEG/PNG/WebP data URL → its id. */
export async function savePhoto(dataUrl: unknown): Promise<{ id: string } | { error: string }> {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m) return { error: "That isn't a photo we can use (JPEG, PNG or WebP)" };
  if (Math.floor((m[2].length * 3) / 4) > MAX_PHOTO_BYTES) return { error: "That photo is too big. Try a smaller one." };
  const id = randomBytes(12).toString("hex");
  await (await photos()).insertOne({ _id: id, data: m[2], type: m[1], at: new Date().toISOString() });
  return { id };
}

export async function readPhoto(id: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (!PHOTO_ID.test(id)) return null;
  const p = await (await photos()).findOne({ _id: id });
  return p ? { bytes: Buffer.from(p.data, "base64"), type: p.type } : null;
}

/* ---------------- The coordinator's trainings ---------------- */

export type PortalTraining = {
  id: string;
  number: string;
  customer: string;
  date: string;
  lines: { name: string; description: string; qty: number }[];
  expected: number;
  stamp: "Awaiting date";
};

/**
 * The trainings this coordinator was named on (the quote email's coordinator, step 2), newest first. Only training-only
 * quotes get a coordinator, so each one here is a training. Declined quotes are left out. Prices are never sent.
 */
export async function trainingsFor(email: string): Promise<PortalTraining[]> {
  const d = await db();
  const mine = (await d.collection<{ _id: string; coordinator?: { email?: string } }>("portalTrainings")
    .find({ "coordinator.email": email }, { projection: { coordinator: 1 } }).toArray())
    .filter((p) => (p.coordinator?.email ?? "").toLowerCase() === email);
  if (!mine.length) return [];
  const ids = new Set(mine.map((p) => p._id));
  const items = ((await d.collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? [];
  const training = itemSets(items).training;
  const docs = (await d.collection<{ _id: string; kind?: string; doc: Record<string, unknown> }>("zohoDocs")
    .find({ kind: "estimates", "doc.estimate_id": { $in: [...ids] } }, { projection: { doc: 1, kind: 1 } }).toArray())
    .filter((x) => ids.has(String(x.doc?.estimate_id ?? "")) && String(x.doc?.status ?? "") !== "declined");
  return docs.map((x) => toTrainingQuote(x.doc, training))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
    .map((q) => ({
      id: q.id, number: q.number, customer: q.customer, date: q.date,
      lines: q.lines.map((l) => ({ name: l.name, description: l.description, qty: l.qty })),
      expected: q.expected, stamp: "Awaiting date" as const,
    }));
}
