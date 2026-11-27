import { signedInMember, unauthorized } from "@/lib/auth";
import { canConvertInvoices, isAdmin } from "@/lib/roles";
import { attachExtra, attachFoundPo, attachPdf, checkInvoiceSign, converterData, draftInvoiceSign, mergedInvoicePdf, setEway, setPoForPi, setSigner, signedInvoicePdf, signerOf, startInvoiceSign } from "@/lib/invoiceConverter";
import { connectSign, signInfo } from "@/lib/zohoSign";
import { checkAgain, isDue, poFileFor, poLog, poLogFile, savePageText, scanPoFolder } from "@/lib/poFolder";
import { goodWdId, workdriveOpen } from "@/lib/workdrive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * The Invoice Converter (owner, 17 Nov). Full access and logistics only.
 *  GET                         — every customer with their invoices (PO, e-way bill, signing), Zoho Sign's connection, your signer details
 *  GET ?signed=<invoice id>    — the signed PDF (once Zoho Sign says completed)
 *  GET ?merged=<invoice id>&with=po,others — the invoice PDF merged with what's picked (po = PO + e-way bill; others = other attachments), unsigned
 *  GET ?po=<WorkDrive file>&id=<invoice> — a PO PDF found for that invoice, to look at (only one that carries its PO number)
 *  POST { action: "scanPo" }                       — read the new PDFs in the WorkDrive PO folder; { files, left, due, … } (ask again while left > 0)
 *  GET ?poLog                                      — the log of the PO folder's PDFs
 *  GET ?poView=<WorkDrive file>                    — a PDF of the log to look at (only one that reads like an order)
 *  POST { action: "checkPo", files }               — PDFs already read, compared again (up to 40); their log lines
 *  GET ?scan=<WorkDrive file>                      — a PDF whose picture is to be read (one of `due`, nothing else)
 *  POST { action: "pageText", file, text }         — the words the browser read on it (text null = it couldn't)
 *  POST { action: "usePo", id, file }              — the found PO PDF attached to the invoice in Zoho
 *  POST { action: "po", id, value }                — the Purchase Order Number, on every invoice of the same PI
 *  POST multipart { id, which: "po" | "eway", file, value? } — a PDF attached in Zoho (a PO: to every invoice of the same PI; value = the PO number typed with it; replace=1 deletes the old one first)
 *  POST multipart { id, which: "extra", file }  — any other file attached to the invoice in Zoho under its own name
 *  POST { action: "eway", id, value }              — an e-way bill number typed in (kept here; Zoho invoices have no field for it)
 *  POST { action: "signer", email, name }          — your email and full name for Zoho Sign (once)
 *  POST { action: "draft", id }                    — merge and make a Zoho Sign "Sign yourself" draft with the boxes placed (never signed / sent here); its Zoho Sign page
 *  POST { action: "sign", id }                   — merge the invoice + PO + e-way bill PDFs and open Zoho Sign's signing page
 *  POST { action: "check", id }                    — how the signing stands
 *  POST { action: "connectSign", code, clientId?, clientSecret? } — Admin: connect Zoho Sign once
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const ID = /^\d{6,25}$/;

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canConvertInvoices(me)) return json({ error: "Not for your account" }, 403);
  try {
    const q = new URL(request.url).searchParams, view = q.get("poView"), po = view ?? q.get("po");
    if (po) {
      if (!goodWdId(po) || (!view && !ID.test(q.get("id") ?? ""))) return json({ error: "Unknown file" }, 400);
      const name = view ? await poLogFile(po) : (await poFileFor(q.get("id")!, po)).name;
      const res = await workdriveOpen(po);
      // Passed on as it arrives: a whole answer over 4.5 MB would be refused by the host.
      return new Response(res.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    if (q.has("poLog")) return json(await poLog());
    const scan = q.get("scan");
    if (scan) {
      if (!goodWdId(scan) || !(await isDue(scan))) return json({ error: "Unknown file" }, 404);
      const res = await workdriveOpen(scan);
      return new Response(res.body, { headers: { "content-type": "application/pdf", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    const merged = q.get("merged");
    if (merged) {
      if (!ID.test(merged)) return json({ error: "Unknown invoice" }, 400);
      // with=po,others picks what goes in (owner, 27 Nov); none given = the invoice with its PO and e-way bill, as before.
      const w = q.get("with");
      const f = await mergedInvoicePdf(merged, w === null ? undefined : { po: /\bpo\b/.test(w), others: /\bothers\b/.test(w) });
      return new Response(Buffer.from(f.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`, "cache-control": "private, no-store", "x-skipped": encodeURIComponent(f.skipped.join(", ")) } });
    }
    const signed = new URL(request.url).searchParams.get("signed");
    if (signed) {
      if (!ID.test(signed)) return json({ error: "Unknown invoice" }, 400);
      const f = await signedInvoicePdf(signed);
      if (!f) return json({ error: "Not signed yet." }, 409);
      return new Response(Buffer.from(f.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
    }
    const [data, sign, signer] = await Promise.all([converterData(), signInfo(), signerOf(me.id)]);
    return json({ ...data, sign: { connected: Boolean(sign), canConnect: isAdmin(me), signer: signer ? { email: signer.email, name: signer.name } : null } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't read the invoices" }, 502);
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canConvertInvoices(me)) return json({ error: "Not for your account" }, 403);
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await request.formData();
      const id = String(f.get("id") ?? "");
      const file = f.get("file");
      if (f.get("which") === "extra") {
        if (!ID.test(id) || !(file instanceof File)) return json({ error: "Pick a file for an invoice" }, 400);
        return json(await attachExtra(id, file));
      }
      const which = f.get("which") === "eway" ? "eway" : "po";
      if (!ID.test(id) || !(file instanceof File)) return json({ error: "Pick a PDF for an invoice" }, 400);
      const value = f.get("value");
      return json(await attachPdf(id, which, file, typeof value === "string" ? value.slice(0, 100) : undefined, f.get("replace") === "1"));
    }
    const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; value?: unknown; file?: unknown; files?: unknown; text?: unknown; email?: unknown; name?: unknown; code?: unknown; clientId?: unknown; clientSecret?: unknown } | null;
    const id = String(b?.id ?? "");
    if (b?.action === "signer") return json(await setSigner(me.id, { email: b.email, name: b.name }));
    if (b?.action === "connectSign") {
      if (!isAdmin(me)) return json({ error: "Only Admin connects Zoho Sign" }, 403);
      return json(await connectSign({ code: String(b.code ?? ""), clientId: b.clientId ? String(b.clientId) : undefined, clientSecret: b.clientSecret ? String(b.clientSecret) : undefined }, me.name));
    }
    if (b?.action === "scanPo") {
      const r = await scanPoFolder(4_000); // short, so the log's lines come as they are read
      return json({ ...r, log: r.read.length ? await poLog(r.read) : null });
    }
    if (b?.action === "checkPo") {
      const files = Array.isArray(b.files) ? b.files.filter(goodWdId).slice(0, 40) : [];
      return json({ log: await checkAgain(files) });
    }
    if (b?.action === "pageText") {
      if (!goodWdId(b.file) || (b.text !== null && typeof b.text !== "string")) return json({ error: "Unknown file" }, 400);
      const ids = await savePageText(b.file, b.text === null ? null : b.text.slice(0, 60_000));
      return json({ ok: true, log: ids.length ? await poLog(ids) : null });
    }
    if (!ID.test(id)) return json({ error: "Unknown invoice" }, 400);
    if (b?.action === "usePo") return goodWdId(b.file) ? json(await attachFoundPo(id, b.file)) : json({ error: "Unknown file" }, 400);
    if (b?.action === "po") return json(await setPoForPi(id, b.value));
    if (b?.action === "eway") return json(await setEway(id, b.value));
    if (b?.action === "check") return json({ status: await checkInvoiceSign(id) });
    if (b?.action === "draft") return json(await draftInvoiceSign(id));
    if (b?.action === "sign") {
      const signer = await signerOf(me.id);
      if (!signer) return json({ error: "Add your email and full name for Zoho Sign first." }, 409);
      const host = new URL(request.url).origin;
      return json(await startInvoiceSign(id, { name: signer.name, email: signer.email }, me.name, host));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't do that" }, 502);
  }
}
