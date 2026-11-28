import "server-only";
import { db } from "./db";
import { booksApi } from "./quotations";
import { fetchDetail } from "./zoho";

/*
 * PIs in the Invoice Converter (owner, 28 Nov: "I want to see the PIs of those invoices too, also another option to
 * attach an attachment with PI, download PI with attachment or download only PI"; later: "pull all the PIs into our
 * invoice converter too … when it's only PI, I want the merge options to be there still, PO can still be added to the
 * PI … and so can the attachments"). A PI is a Zoho Books sales order ("Performa-25-1179"); its PO number is its
 * "Purchase Order Number #" field, its PO PDF and other files are attachments on it.
 */

type Doc = { document_id?: string; file_name?: string };
type SalesRow = { _id: string; id: string; kind: string; lmt?: string; row: Record<string, unknown> };
const sales = async () => (await db()).collection<SalesRow>("salesDocs");
export const SO_ID = /^\d{6,25}$/;

/** The PI (sales order) of an invoice: from our copy of the sales orders, else from the invoice in Zoho. */
export async function piOfInvoice(invoiceId: string): Promise<{ id: string; number: string }> {
  const col = await sales();
  const inv = await col.findOne({ _id: `invoices:${invoiceId}` });
  const soId = String(inv?.row.salesorder_id ?? "");
  if (soId) {
    const so = await col.findOne({ _id: `salesorders:${soId}` });
    return { id: soId, number: String(so?.row.salesorder_number ?? inv?.row.reference_number ?? "PI") };
  }
  // Invoices in our copy carry the PI's number in their Reference (piOf), not its id: look that number up.
  const { piOf } = await import("./invoiceConverterRules");
  const num = piOf(inv?.row.reference_number);
  const byNumber = num ? await col.findOne({ kind: "salesorders", "row.salesorder_number": num } as Partial<SalesRow>) : null;
  if (byNumber && byNumber.kind === "salesorders" && byNumber.row.salesorder_number === num) return { id: byNumber.id || byNumber._id.replace(/^salesorders:/, ""), number: num! };
  const d = await fetchDetail("invoices", invoiceId);
  const id = String(d.salesorder_id ?? "");
  if (!id) throw new Error("This invoice wasn't made from a PI in Zoho.");
  return { id, number: String(d.salesorder_number ?? d.reference_number ?? "PI") };
}

/** A PI by its Zoho id: its number and customer, from our copy (else from Zoho). */
export async function piById(soId: string): Promise<{ id: string; number: string; customerId: string }> {
  if (!SO_ID.test(soId)) throw new Error("Unknown PI");
  const so = await (await sales()).findOne({ _id: `salesorders:${soId}` });
  if (so) return { id: soId, number: String(so.row.salesorder_number ?? "PI"), customerId: String(so.row.customer_id ?? "") };
  const d = await fetchDetail("salesorders", soId);
  return { id: soId, number: String(d.salesorder_number ?? "PI"), customerId: String(d.customer_id ?? "") };
}

export const piDocs = async (soId: string) => ((((await fetchDetail("salesorders", soId)).documents as Doc[] | undefined) ?? []).filter((x) => x.document_id));

/** The PI's number and the names of the files on it. */
export async function piFiles(invoiceId: string): Promise<{ pi: string; files: string[] }> {
  const so = await piOfInvoice(invoiceId);
  return { pi: so.number, files: (await piDocs(so.id)).map((x) => String(x.file_name ?? "attachment")) };
}

/** The files on a PI (by its id), to list and to tick one by one in its picker. */
export async function piFilesById(soId: string): Promise<{ pi: string; attachments: { id: string; name: string }[] }> {
  const so = await piById(soId);
  return { pi: so.number, attachments: (await piDocs(so.id)).map((x) => ({ id: String(x.document_id), name: String(x.file_name ?? "attachment") })) };
}

/** The PI's PDF from Zoho, alone or followed by its attachments (PDFs and pictures; others left out and named). */
export async function piPdf(invoiceId: string, withFiles: boolean): Promise<{ bytes: Uint8Array; name: string; skipped: string[] }> {
  const { booksFile } = await import("./quotations");
  const so = await piOfInvoice(invoiceId);
  const pdf = await booksFile(`/salesorders/${so.id}`, { accept: "pdf" });
  const name = `${so.number}${withFiles ? " - Attachment" : ""}.pdf`;
  if (!withFiles) return { bytes: pdf.bytes, name, skipped: [] };
  const { mergeParts } = await import("./pdfMerge");
  const parts = [{ ...pdf, name: `${so.number}.pdf` }];
  for (const x of await piDocs(so.id)) parts.push({ ...(await booksFile(`/salesorders/${so.id}/documents/${x.document_id}`)), name: String(x.file_name ?? "attachment") });
  const merged = await mergeParts(parts, so.number);
  return { bytes: merged.bytes, name, skipped: merged.skipped };
}

/**
 * A PI's merged PDF, its parts in the order ticked: "pi" (the PI from Zoho), "doc:<id>" (a file on the PI), "inv:<id>"
 * (one of its invoices). Named after the parts: "Performa-25-1250 - PO - Invoice.pdf".
 */
export async function piMerged(soId: string, order: string[]): Promise<{ bytes: Uint8Array; name: string; skipped: string[] }> {
  const { booksFile } = await import("./quotations");
  const { mergeParts } = await import("./pdfMerge");
  const so = await piById(soId);
  const docs = order.some((p) => p.startsWith("doc:")) ? await piDocs(so.id) : [];
  const parts: { bytes: Uint8Array; type: string; name: string }[] = [];
  const words: string[] = [];
  for (const p of order) {
    if (p === "pi") { parts.push({ ...(await booksFile(`/salesorders/${so.id}`, { accept: "pdf" })), name: `${so.number}.pdf` }); words.push(so.number); }
    else if (p.startsWith("doc:")) {
      const d = docs.find((x) => x.document_id === p.slice(4));
      if (!d) continue;
      parts.push({ ...(await booksFile(`/salesorders/${so.id}/documents/${d.document_id}`)), name: String(d.file_name ?? "attachment") });
      words.push(/^po\b/i.test(String(d.file_name ?? "")) ? "PO" : "Attachment");
    } else if (p.startsWith("inv:")) {
      const inv = await (await sales()).findOne({ _id: `invoices:${p.slice(4)}` });
      // Only an invoice of this PI.
      const { piOf } = await import("./invoiceConverterRules");
      if (!inv || piOf(inv.row.reference_number) !== so.number) continue;
      parts.push({ ...(await booksFile(`/invoices/${inv.id}`, { accept: "pdf" })), name: `Invoice ${inv.row.invoice_number}.pdf` });
      words.push(`Invoice ${inv.row.invoice_number}`);
    }
  }
  if (!parts.length) throw new Error("Nothing to merge: none of the picked files is on this PI.");
  const merged = await mergeParts(parts, so.number);
  const name = words.filter((w, k) => !(w === "Attachment" && words[k - 1] === "Attachment")).join(" - ");
  return { bytes: merged.bytes, name: `${name}.pdf`, skipped: merged.skipped };
}

const cleanName = (file: File) => (file.name || "attachment").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "attachment";

/** Any file put on a PI (by its id) in Zoho under `name` (POST /salesorders/{id}/attachment); our copy notes it. */
async function putOnPi(soId: string, name: string, bytes: Uint8Array, type: string) {
  const form = new FormData();
  form.append("attachment", new File([new Uint8Array(bytes)], name, { type }));
  await booksApi("POST", `/salesorders/${soId}/attachment`, {}, form);
  await (await sales()).updateOne({ _id: `salesorders:${soId}` }, { $set: { "row.has_attachment": true } });
}

/** Any file put on the invoice's PI in Zoho under its own name. */
export async function attachToPi(invoiceId: string, file: File): Promise<{ ok: true; pi: string; name: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("The file is over 10 MB.");
  const so = await piOfInvoice(invoiceId);
  const name = cleanName(file);
  await putOnPi(so.id, name, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
  return { ok: true, pi: so.number, name };
}

/** Any file put on a PI (by its id) under its own name. */
export async function attachToPiById(soId: string, file: File): Promise<{ ok: true; pi: string; name: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("The file is over 10 MB.");
  const so = await piById(soId);
  const name = cleanName(file);
  await putOnPi(so.id, name, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
  return { ok: true, pi: so.number, name };
}

/** The invoices made from this PI (same customer, not void). */
async function invoicesOfPi(number: string, customerId: string): Promise<SalesRow[]> {
  const { piOf } = await import("./invoiceConverterRules");
  return (await (await sales()).find({ kind: "invoices" }).toArray())
    .filter((r) => r.kind === "invoices" && String(r.row.status ?? "") !== "void" && piOf(r.row.reference_number) === number && (!customerId || String(r.row.customer_id ?? "") === customerId));
}

/**
 * The PI's PO number: on the PI in Zoho (its "Purchase Order Number #" field, PUT /salesorder/{id}/customfields) and in
 * our copy, and on every invoice made from it, as "Add PO for all" did. `ids` = those invoices.
 */
export async function setPiPo(soId: string, raw: unknown): Promise<{ po: string; ok: boolean; ids: string[] }> {
  const { poState } = await import("./invoiceConverterRules");
  const so = await piById(soId);
  const value = String(raw ?? "").trim().slice(0, 100);
  const d = await fetchDetail("salesorders", so.id);
  const field = ((d.custom_fields as { customfield_id?: string; api_name?: string }[] | undefined) ?? []).find((f) => f.api_name === "cf_purchase_order_number");
  if (!field?.customfield_id) throw new Error("This PI has no Purchase Order Number field in Zoho.");
  await booksApi("PUT", `/salesorder/${so.id}/customfields`, {}, { custom_fields: [{ customfield_id: field.customfield_id, value }] });
  await (await sales()).updateOne({ _id: `salesorders:${so.id}` }, value ? { $set: { "row.cf_purchase_order_number": value } } : { $unset: { "row.cf_purchase_order_number": "" } });
  const invoices = await invoicesOfPi(so.number, so.customerId);
  if (invoices.length) {
    const { setPoForPi } = await import("./invoiceConverter");
    await setPoForPi(invoices[0].id, value);
  }
  const s = poState(value);
  return { po: s.label, ok: s.ok, ids: invoices.map((r) => r.id) };
}

/**
 * The PO PDF put on a PI ("PO - Performa-25-1250.pdf"), its number read from it when none is typed and set on the PI;
 * and, as before, on its invoices that have no PO PDF yet (owner: one PO for every invoice of a PI).
 */
export async function attachPiPo(soId: string, file: File, typed?: string): Promise<{ ok: true; po?: string; poOk?: boolean; found: boolean; ids: string[] }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("The file is over 10 MB.");
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error("Attach a PDF.");
  const so = await piById(soId);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { pdfText, attachPdf, hasPoPdf } = await import("./invoiceConverter");
  const { poFromText, poFileName } = await import("./invoiceConverterRules");
  const found = typed?.trim() || poFromText(await pdfText(bytes)) || "";
  await putOnPi(so.id, poFileName(so.number), bytes, "application/pdf");
  let po: { po: string; ok: boolean } | undefined;
  if (found) po = await setPiPo(so.id, found);
  const invoices = await invoicesOfPi(so.number, so.customerId);
  const first = [];
  for (const r of invoices) if (!(await hasPoPdf(r.id))) first.push(r.id);
  let ids: string[] = [];
  if (first.length) ids = (await attachPdf(first[0], "po", new File([bytes], file.name, { type: "application/pdf" }), found || undefined)).ids;
  return { ok: true, ...(po ? { po: po.po, poOk: po.ok } : {}), found: Boolean(found), ids };
}
