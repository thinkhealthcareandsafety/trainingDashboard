import { signedInMember, unauthorized } from "@/lib/auth";
import { canConvertInvoices, isAdmin } from "@/lib/roles";
import { attachPdf, checkInvoiceSign, converterData, draftInvoiceSign, mergedInvoicePdf, setEway, setPoForPi, setSigner, signedInvoicePdf, signerOf, startInvoiceSign } from "@/lib/invoiceConverter";
import { connectSign, signInfo } from "@/lib/zohoSign";

export const dynamic = "force-dynamic";

/*
 * The Invoice Converter (owner, 17 Nov). Full access and logistics only.
 *  GET                         — every customer with their invoices (PO, e-way bill, signing), Zoho Sign's connection, your signer details
 *  GET ?signed=<invoice id>    — the signed PDF (once Zoho Sign says completed)
 *  GET ?merged=<invoice id>    — the invoice + PO + e-way bill PDFs merged, unsigned
 *  POST { action: "po", id, value }                — the Purchase Order Number, on every invoice of the same PI
 *  POST multipart { id, which: "po" | "eway", file, value? } — a PDF attached in Zoho (a PO: to every invoice of the same PI; value = the PO number typed with it)
 *  POST { action: "eway", id, value }              — an e-way bill number typed in (kept here; Zoho invoices have no field for it)
 *  POST { action: "signer", email, name }          — your email and full name for Zoho Sign (once)
 *  POST { action: "draft", id }                    — merge and make a Zoho Sign draft with the boxes placed (never sent); its Zoho Sign page
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
    const merged = new URL(request.url).searchParams.get("merged");
    if (merged) {
      if (!ID.test(merged)) return json({ error: "Unknown invoice" }, 400);
      const f = await mergedInvoicePdf(merged);
      return new Response(Buffer.from(f.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
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
      const which = f.get("which") === "eway" ? "eway" : "po";
      const file = f.get("file");
      if (!ID.test(id) || !(file instanceof File)) return json({ error: "Pick a PDF for an invoice" }, 400);
      const value = f.get("value");
      return json(await attachPdf(id, which, file, typeof value === "string" ? value.slice(0, 100) : undefined));
    }
    const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; value?: unknown; email?: unknown; name?: unknown; code?: unknown; clientId?: unknown; clientSecret?: unknown } | null;
    const id = String(b?.id ?? "");
    if (b?.action === "signer") return json(await setSigner(me.id, { email: b.email, name: b.name }));
    if (b?.action === "connectSign") {
      if (!isAdmin(me)) return json({ error: "Only Admin connects Zoho Sign" }, 403);
      return json(await connectSign({ code: String(b.code ?? ""), clientId: b.clientId ? String(b.clientId) : undefined, clientSecret: b.clientSecret ? String(b.clientSecret) : undefined }, me.name));
    }
    if (!ID.test(id)) return json({ error: "Unknown invoice" }, 400);
    if (b?.action === "po") return json(await setPoForPi(id, b.value));
    if (b?.action === "eway") return json(await setEway(id, b.value));
    if (b?.action === "check") return json({ status: await checkInvoiceSign(id) });
    if (b?.action === "draft") {
      const signer = await signerOf(me.id);
      return json(await draftInvoiceSign(id, signer ? { name: signer.name, email: signer.email } : null));
    }
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
