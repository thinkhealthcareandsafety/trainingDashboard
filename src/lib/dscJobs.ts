import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";

/*
 * Signing with the DSC token from anyone's login (owner, 28 Nov: "if someone else wants to stamp it and the pendrive is
 * connected to my pc, they should still be able to do it"; PIN saved on that PC; every Invoice Converter user may sign).
 * "Sign with DSC" queues a job here with the merged PDF; the DSC signer on the owner's PC (dsc-signer, paired once with a
 * key) asks for the next job every few seconds, signs it with the token and sends it back; the signed PDF is put on the
 * invoice in Zoho. Nothing reaches into the owner's PC: it only asks out.
 */

export type Spot = { page: number; x: number; y: number; w: number; h: number };
type JobStatus = "waiting" | "signing" | "done" | "failed";
type JobDoc = {
  _id: string; invoiceId: string; number: string; title: string; spot: Spot; reason: string; by: string; at: string;
  status: JobStatus; pdf?: Uint8Array | { buffer: Uint8Array }; claimedAt?: string; doneAt?: string; error?: string; signedName?: string;
};
type SignerDoc = { _id: string; keyHash: string; pairedBy: string; pairedAt: string; seenAt?: string; certificate?: string };

const jobs = async () => (await db()).collection<JobDoc>("dscJobs");
const signers = async () => (await db()).collection<SignerDoc>("dscSigner");
const ONE = "signer";
/** The signer asks every 10 s (60 s at night): seen in the last 45 s = on. */
const ONLINE_MS = 45_000;
const WAIT_MS = 30 * 60_000, SIGNING_MS = 5 * 60_000;
const MAX_PDF = 12 * 1024 * 1024; // a MongoDB document holds 16 MB
const hash = (key: string) => createHash("sha256").update(`dsc-signer:${key}`).digest("hex");

/** A new key for the signer PC (the old one stops working). Shown once, handed straight to the PC's signer. */
export async function pairSigner(by: string): Promise<{ key: string }> {
  const key = randomBytes(32).toString("base64url");
  await (await signers()).replaceOne({ _id: ONE }, { keyHash: hash(key), pairedBy: by, pairedAt: new Date().toISOString() }, { upsert: true });
  return { key };
}

/** The signer PC, if `key` is its key; notes it was seen (at most every 20 s, to keep writes down). */
export async function signerByKey(key: string | null, certificate?: string): Promise<boolean> {
  if (!key || key.length < 20 || key.length > 100) return false;
  const s = await (await signers()).findOne({ _id: ONE });
  if (!s) return false;
  const a = Buffer.from(s.keyHash, "hex"), b = Buffer.from(hash(key), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const now = Date.now();
  if (!s.seenAt || now - Date.parse(s.seenAt) > 20_000 || (certificate && certificate !== s.certificate)) {
    await (await signers()).updateOne({ _id: ONE }, { $set: { seenAt: new Date(now).toISOString(), ...(certificate ? { certificate: certificate.slice(0, 80) } : {}) } });
  }
  return true;
}

export type SignerState = { paired: boolean; online: boolean; seenAt: string | null; certificate: string | null };
export async function signerState(): Promise<SignerState> {
  const s = await (await signers()).findOne({ _id: ONE });
  const seen = s?.seenAt ?? null;
  return { paired: Boolean(s), online: Boolean(seen && Date.now() - Date.parse(seen) < ONLINE_MS), seenAt: seen, certificate: s?.certificate ?? null };
}

const bytesOf = (p: JobDoc["pdf"]): Uint8Array | null => (!p ? null : p instanceof Uint8Array ? p : p.buffer instanceof Uint8Array ? p.buffer : null);

/** Old jobs: waiting over 30 min, or picked up and not back in 5 min, fail (their PDFs dropped). */
async function expire(now = Date.now()) {
  const col = await jobs();
  for (const j of await col.find({ status: { $in: ["waiting", "signing"] } }, { projection: { pdf: 0 } }).toArray()) {
    if (j.status === "waiting" && now - Date.parse(j.at) > WAIT_MS) {
      await col.updateOne({ _id: j._id, status: "waiting" }, { $set: { status: "failed", error: "The signer PC didn't pick it up in 30 minutes. Is it on, with the token in?", doneAt: new Date(now).toISOString() }, $unset: { pdf: "" } });
    } else if (j.status === "signing" && j.claimedAt && now - Date.parse(j.claimedAt) > SIGNING_MS) {
      await col.updateOne({ _id: j._id, status: "signing" }, { $set: { status: "failed", error: "The signer PC started but didn't finish. Try again.", doneAt: new Date(now).toISOString() }, $unset: { pdf: "" } });
    }
  }
}

/** Queues one invoice's merged PDF to be signed (the same invoice already waiting = that job). */
export async function queueJob(job: { invoiceId: string; number: string; title: string; spot: Spot; bytes: Uint8Array; by: string }): Promise<{ job: string; signer: SignerState }> {
  if (job.bytes.length > MAX_PDF) throw new Error("The merged PDF is over 12 MB; it can't be sent to the signer.");
  const signer = await signerState();
  if (!signer.paired) throw new Error("No DSC signer PC is connected yet. On the PC with the token, open the Invoice Converter and click \"Make this PC the DSC signer\".");
  await expire();
  const col = await jobs();
  const open = (await col.find({ invoiceId: job.invoiceId, status: { $in: ["waiting", "signing"] } }, { projection: { pdf: 0 } }).toArray())
    .find((j) => j.invoiceId === job.invoiceId && (j.status === "waiting" || j.status === "signing"));
  if (open) return { job: open._id, signer };
  const _id = randomBytes(12).toString("hex");
  await col.insertOne({ _id, invoiceId: job.invoiceId, number: job.number, title: job.title, spot: job.spot, reason: `Invoice ${job.number}`, by: job.by, at: new Date().toISOString(), status: "waiting", pdf: Buffer.from(job.bytes) });
  return { job: _id, signer };
}

/** For the signer PC: the oldest waiting job, now marked as being signed, with its PDF; null = nothing to do. */
export async function nextJob(): Promise<{ id: string; spot: Spot; reason: string; bytes: Uint8Array } | null> {
  await expire();
  const col = await jobs();
  const waiting = (await col.find({ status: "waiting" }, { projection: { pdf: 0 } }).sort({ at: 1 }).limit(5).toArray())
    .filter((j) => j.status === "waiting").sort((a, b) => a.at.localeCompare(b.at));
  for (const j of waiting) {
    const r = await col.updateOne({ _id: j._id, status: "waiting" }, { $set: { status: "signing", claimedAt: new Date().toISOString() } });
    if (!r.modifiedCount) continue; // taken meanwhile
    const bytes = bytesOf((await col.findOne({ _id: j._id }))?.pdf);
    if (!bytes) { await failJob(j._id, "The PDF was lost. Try again."); continue; }
    return { id: j._id, spot: j.spot, reason: j.reason, bytes };
  }
  return null;
}

/** The signed PDF back from the signer PC: put on the invoice in Zoho (attachSigned) and the job done. */
export async function finishJob(id: string, file: File): Promise<{ ok: true; name: string }> {
  const col = await jobs();
  const j = await col.findOne({ _id: id });
  if (!j || j.status !== "signing") throw new Error("That job isn't being signed.");
  const { attachSigned } = await import("./invoiceConverter");
  try {
    const r = await attachSigned(j.invoiceId, file);
    await col.updateOne({ _id: id }, { $set: { status: "done", signedName: r.name, doneAt: new Date().toISOString() }, $unset: { pdf: "" } });
    return r;
  } catch (e) {
    await failJob(id, `Signed, but not put on the invoice in Zoho: ${e instanceof Error ? e.message : e}`);
    throw e;
  }
}

export async function failJob(id: string, error: string): Promise<void> {
  await (await jobs()).updateOne({ _id: id }, { $set: { status: "failed", error: error.slice(0, 300) || "Signing failed", doneAt: new Date().toISOString() }, $unset: { pdf: "" } });
}

/** How a job stands, for the page that asked. */
export async function jobStatus(id: string): Promise<{ status: JobStatus; error?: string; signedName?: string; invoiceId: string; signer: SignerState } | null> {
  await expire();
  const j = await (await jobs()).findOne({ _id: id }, { projection: { pdf: 0 } });
  if (!j) return null;
  return { status: j.status, invoiceId: j.invoiceId, ...(j.error ? { error: j.error } : {}), ...(j.signedName ? { signedName: j.signedName } : {}), signer: await signerState() };
}
