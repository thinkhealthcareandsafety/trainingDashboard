import "server-only";
import { db } from "./db";
import { booksApi } from "./quotations";
import { fetchDetail } from "./zoho";

/*
 * The PI of an invoice in the Invoice Converter (owner, 28 Nov: "I want to see the PIs of those invoices too, also
 * another option to attach an attachment with PI, download PI with attachment or download only PI"). The PI is the
 * Zoho Books sales order the invoice was made from ("Performa-25-1179"); its attachments live on it in Zoho.
 */

type Doc = { document_id?: string; file_name?: string };
type SalesRow = { _id: string; id: string; kind: string; row: Record<string, unknown> };
const sales = async () => (await db()).collection<SalesRow>("salesDocs");

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

const docsOf = async (soId: string) => ((((await fetchDetail("salesorders", soId)).documents as Doc[] | undefined) ?? []).filter((x) => x.document_id));

/** The PI's number and the names of the files on it. */
export async function piFiles(invoiceId: string): Promise<{ pi: string; files: string[] }> {
  const so = await piOfInvoice(invoiceId);
  return { pi: so.number, files: (await docsOf(so.id)).map((x) => String(x.file_name ?? "attachment")) };
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
  for (const x of await docsOf(so.id)) parts.push({ ...(await booksFile(`/salesorders/${so.id}/documents/${x.document_id}`)), name: String(x.file_name ?? "attachment") });
  const merged = await mergeParts(parts, so.number);
  return { bytes: merged.bytes, name, skipped: merged.skipped };
}

/** Any file put on the PI in Zoho under its own name (POST /salesorders/{id}/attachment). */
export async function attachToPi(invoiceId: string, file: File): Promise<{ ok: true; pi: string; name: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("The file is over 10 MB.");
  const so = await piOfInvoice(invoiceId);
  const name = (file.name || "attachment").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "attachment";
  const form = new FormData();
  form.append("attachment", new File([new Uint8Array(await file.arrayBuffer())], name, { type: file.type || "application/octet-stream" }));
  await booksApi("POST", `/salesorders/${so.id}/attachment`, {}, form);
  return { ok: true, pi: so.number, name };
}
