import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { DEFAULT_CONTENT, PHOTO_ID, SOCIAL_KEYS, type PortalContent, cleanContent, photosIn } from "./portalContent";

/*
 * The portal's content (docs/TRAINING_MANAGER_PLAN.md step 4): the programmes and social links staff edit on
 * Templates → Portal content, and the programme photos. The trainings themselves: portalTrainings.ts.
 */

type Kv = { _id: string; content?: PortalContent; by?: string; at?: string };
type Photo = { _id: string; data: string; type: string; at: string };
const kv = async () => (await db()).collection<Kv>("kv");
const photos = async () => (await db()).collection<Photo>("portalPhotos");

/** What the portal shows: the saved content, or the built-in one. */
export async function readContent(): Promise<PortalContent & { by?: string; at?: string }> {
  const saved = await (await kv()).findOne({ _id: "portal_content" });
  if (!saved?.content) return DEFAULT_CONTENT;
  // A card added since it was saved (WhatsApp, 12 Nov) comes in with its built-in link, in its place.
  const have = new Map(saved.content.social.map((s) => [s.key, s]));
  const social = SOCIAL_KEYS.map((k) => have.get(k) ?? DEFAULT_CONTENT.social.find((s) => s.key === k)!);
  return { ...saved.content, social, by: saved.by, at: saved.at };
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
