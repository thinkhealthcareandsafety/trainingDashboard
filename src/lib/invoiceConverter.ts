import "server-only";
import { db } from "./db";
import { booksApi } from "./quotations";
import { fetchDetail } from "./zoho";
import { type ConvCustomer, ewayFileName, groupByCustomer, isEwayFile, isPoFile, needsEway, poFileName, poState } from "./invoiceConverterRules";

/*
 * The Invoice Converter's data and its writes to Zoho Books (owner, 17 Nov).
 *  - The invoices come from the Sales copy (salesDocs: every invoice since last FY, with its Purchase Order Number and
 *    whether it has attachments).
 *  - The e-way bill number and the attachment names are only in an invoice's full record, so those are read from Zoho
 *    a few at a time (invoices over ₹50,000, and any with attachments) and kept in `invoiceExtras` until the invoice
 *    changes.
 *  - Writes: the Purchase Order Number custom field (PUT /invoices/{id}/customfields), and a PDF attached to the invoice
 *    (POST /invoices/{id}/attachment), named "PO - <invoice>.pdf" / "E-way bill - <invoice>.pdf". When the "Purchase
 *    order PDF" custom field exists in Zoho, the PO PDF can move there.
 */

const PO_FIELD = "982417000001000149"; // invoice custom field "Purchase Order Number" (cf_purchase_order_number)
const READ_BATCH = 20; // full records read per page load; the page asks again while some are pending

type SalesRow = { _id: string; kind: string; id: string; lmt?: string; date?: string; row: Record<string, unknown> };
type Extras = { _id: string; lmt: string; eway: string | null; files: string[]; readAt: string };

const sales = async () => (await db()).collection<SalesRow>("salesDocs");
const extrasCol = async () => (await db()).collection<Extras>("invoiceExtras");

const wantsDetail = (r: SalesRow) => needsEway(Number(r.row.total) || 0) || Boolean(r.row.has_attachment);

/** Every customer with their invoices; reads up to READ_BATCH full records from Zoho that aren't known yet. */
export async function converterData(): Promise<{ customers: ConvCustomer[]; pending: number }> {
  const rows = (await (await sales()).find({ kind: "invoices" }).toArray()).filter((r) => r.kind === "invoices" && String(r.row.status ?? "") !== "void");
  const extras = new Map((await (await extrasCol()).find({}).toArray()).map((e) => [e._id, e]));
  const fresh = (r: SalesRow) => { const e = extras.get(r.id); return e && e.lmt === (r.lmt ?? ""); };
  // Read the missing ones, newest first, a few per load.
  const todo = rows.filter((r) => wantsDetail(r) && !fresh(r)).sort((a, b) => String(b.row.date ?? "").localeCompare(String(a.row.date ?? "")));
  for (const r of todo.slice(0, READ_BATCH)) {
    try {
      const d = await fetchDetail("invoices", r.id);
      const files = ((d.documents as { file_name?: string }[] | undefined) ?? []).map((x) => String(x.file_name ?? "")).filter(Boolean);
      const e: Extras = { _id: r.id, lmt: r.lmt ?? "", eway: String(d.ewaybill_number ?? (d.eway_bill_details as { eway_bill_number?: string } | undefined)?.eway_bill_number ?? "") || null, files, readAt: new Date().toISOString() };
      const { _id: _x, ...body } = e;
      void _x;
      await (await extrasCol()).replaceOne({ _id: r.id }, body, { upsert: true });
      extras.set(r.id, e);
    } catch (err) {
      console.error(`[invoice-converter] ${r.row.invoice_number}: ${err instanceof Error ? err.message : err}`);
      break; // Zoho busy: try again on the next load
    }
  }
  const list = rows.map((r) => {
    const total = Number(r.row.total) || 0;
    const e = extras.get(r.id);
    const po = poState(r.row.cf_purchase_order_number);
    const files = e?.files ?? [];
    return {
      customerId: String(r.row.customer_id ?? r.row.customer_name ?? ""), customerName: String(r.row.customer_name ?? ""),
      id: r.id, number: String(r.row.invoice_number ?? ""), date: String(r.row.date ?? r.date ?? ""), total, status: String(r.row.status ?? ""),
      po: po.label, poOk: po.ok, poPdf: files.some(isPoFile),
      eway: e?.eway ?? null, ewayPdf: files.some(isEwayFile), needsEway: needsEway(total),
      pending: wantsDetail(r) && !fresh(r),
    };
  });
  return { customers: groupByCustomer(list), pending: list.filter((i) => i.pending).length };
}

/** The invoice's Purchase Order Number, written to Zoho and to our copy. */
export async function setPoNumber(invoiceId: string, raw: unknown): Promise<{ po: string; ok: boolean }> {
  const value = String(raw ?? "").trim().slice(0, 100);
  await booksApi("PUT", `/invoices/${invoiceId}/customfields`, {}, [{ customfield_id: PO_FIELD, value }]);
  await (await sales()).updateOne({ _id: `invoices:${invoiceId}` }, value ? { $set: { "row.cf_purchase_order_number": value } } : { $unset: { "row.cf_purchase_order_number": "" } });
  const s = poState(value);
  return { po: s.label, ok: s.ok };
}

/** A PO or e-way bill PDF attached to the invoice in Zoho, under our name for it. */
export async function attachPdf(invoiceId: string, which: "po" | "eway", file: File): Promise<{ ok: true }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("The file is over 10 MB.");
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error("Attach a PDF.");
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  const number = String(row?.row.invoice_number ?? invoiceId);
  const name = which === "po" ? poFileName(number) : ewayFileName(number);
  const form = new FormData();
  form.append("attachment", new File([await file.arrayBuffer()], name, { type: "application/pdf" }));
  await booksApi("POST", `/invoices/${invoiceId}/attachment`, {}, form);
  // Known at once here; the next full read from Zoho confirms it.
  const col = await extrasCol();
  const had = await col.findOne({ _id: invoiceId });
  await col.replaceOne({ _id: invoiceId }, { lmt: row?.lmt ?? had?.lmt ?? "", eway: had?.eway ?? null, files: [...(had?.files ?? []), name], readAt: had?.readAt ?? new Date().toISOString() }, { upsert: true });
  await (await sales()).updateOne({ _id: `invoices:${invoiceId}` }, { $set: { "row.has_attachment": true } });
  return { ok: true };
}
