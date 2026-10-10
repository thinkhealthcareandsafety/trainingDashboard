import { Binary } from "mongodb";
import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { boardsFor, isAdmin } from "@/lib/roles";
import { DESIGNS, isDesignId } from "@/lib/certificates";

export const dynamic = "force-dynamic";

// The two certificate designs (blank backgrounds, one-page PDF, A5 landscape — they carry the trainer's signature and
// the company seal). Uploaded once by Admin into MongoDB `certDesigns`, never committed (the repo is public).
// GET — which are uploaded; GET ?id= — the PDF (Fulfillment board only); POST form { id, file } — Admin uploads one.

type Design = { _id: string; pdf: Binary; size: number; uploadedAt: string; uploadedBy: string };
const MAX_BYTES = 8 * 1024 * 1024;
const col = async () => (await db()).collection<Design>("certDesigns");

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("fulfil")) return Response.json({ error: "Only the Fulfillment board uses the designs" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      if (!isDesignId(id)) return Response.json({ error: "Unknown design" }, { status: 400 });
      const d = await (await col()).findOne({ _id: id });
      if (!d) return Response.json({ error: "That design isn't uploaded yet — Admin uploads it once" }, { status: 404 });
      return new Response(new Uint8Array(d.pdf.buffer), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
    }
    const have = new Map((await (await col()).find({}, { projection: { pdf: 0 } }).toArray()).map((d) => [d._id, d]));
    return Response.json({ designs: DESIGNS.map((x) => ({ ...x, uploaded: have.has(x.id) ? { at: have.get(x.id)!.uploadedAt, by: have.get(x.id)!.uploadedBy } : null })) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Only Admin uploads the designs" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const id = form?.get("id");
  const file = form?.get("file");
  if (!isDesignId(id) || !(file instanceof Blob)) return Response.json({ error: "Pick a design and a PDF" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That PDF is too big (8 MB at most)" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return Response.json({ error: "That isn't a PDF" }, { status: 400 });
  try {
    const doc: Design = { _id: id, pdf: new Binary(bytes), size: bytes.length, uploadedAt: new Date().toISOString(), uploadedBy: me.name };
    await (await col()).replaceOne({ _id: id }, doc, { upsert: true });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't save it" }, { status: 502 });
  }
}
