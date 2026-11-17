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
  const signs = await signStates();
  // The customer's name as Zoho has it now (owner, 17 Nov: renamed customers, e.g. "JLL Mumbai" → "Jones Lang LaSalle …"):
  // invoices keep the name from when they were made, so the current one comes from the customers copy.
  const names = new Map((await (await db()).collection<{ _id: string; name?: string }>("zohoCustomers").find({}, { projection: { name: 1 } }).toArray()).map((c) => [String(c._id), String(c.name ?? "")]));
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
      customerId: String(r.row.customer_id ?? r.row.customer_name ?? ""), customerName: names.get(String(r.row.customer_id ?? "")) || String(r.row.customer_name ?? ""),
      id: r.id, number: String(r.row.invoice_number ?? ""), date: String(r.row.date ?? r.date ?? ""), total, status: String(r.row.status ?? ""),
      po: po.label, poOk: po.ok, poPdf: files.some(isPoFile),
      eway: e?.eway ?? null, ewayPdf: files.some(isEwayFile), needsEway: needsEway(total),
      pending: wantsDetail(r) && !fresh(r),
      sign: signs.get(r.id)?.status,
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

/* ---------------- Merge and sign (owner, 17 Nov) ---------------- */

/**
 * "We merge invoice PDF + PO PDF + e-way bill PDF, then we add a sign, date, full name": the invoice PDF from Zoho Books,
 * then whichever PO and e-way bill attachments the invoice has, as one PDF, sent to Zoho Sign with one signature box,
 * the signer's full name and the date at the bottom right of the invoice's last page. The signer signs on the dashboard
 * (Zoho Sign's embedded page); the signed PDF is then downloaded from here (and from Zoho Sign) any time.
 */
type SignDoc = { _id: string; requestId: string; actionId: string; status: string; by: string; at: string; signedAt?: string; parts: string[] };
const signsCol = async () => (await db()).collection<SignDoc>("invoiceSigns");
type SignerDoc = { _id: string; email: string; name: string };
const signersCol = async () => (await db()).collection<SignerDoc>("signers");

export async function signerOf(memberId: string): Promise<SignerDoc | null> {
  return (await signersCol()).findOne({ _id: memberId });
}
export async function setSigner(memberId: string, raw: { email?: unknown; name?: unknown }): Promise<SignerDoc> {
  const email = String(raw.email ?? "").trim().toLowerCase();
  const name = String(raw.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email doesn't look right.");
  if (name.length < 2) throw new Error("Type your full name as it should appear.");
  const doc = { _id: memberId, email, name };
  await (await signersCol()).replaceOne({ _id: memberId }, { email, name }, { upsert: true });
  return doc;
}

/** Each invoice's signing state, for the page. */
export async function signStates(): Promise<Map<string, { status: string; at: string; by: string }>> {
  return new Map((await (await signsCol()).find({}).toArray()).map((s) => [s._id, { status: s.status, at: s.signedAt ?? s.at, by: s.by }]));
}

export async function startInvoiceSign(invoiceId: string, signer: { name: string; email: string }, by: string, host: string): Promise<{ signUrl: string; parts: string[]; skipped: string[] }> {
  const { booksFile } = await import("./quotations");
  const { mergeParts, signSpot } = await import("./pdfMerge");
  const { startSigning, signUrlAgain } = await import("./zohoSign");
  // Already waiting for this signer: the same request, a fresh signing page.
  const had = await (await signsCol()).findOne({ _id: invoiceId });
  if (had && had.status !== "completed" && had.status !== "declined" && had.status !== "expired") {
    return { signUrl: await signUrlAgain(had.requestId, had.actionId, host), parts: had.parts, skipped: [] };
  }
  const d = await fetchDetail("invoices", invoiceId);
  const number = String(d.invoice_number ?? invoiceId);
  const docs = ((d.documents as { document_id?: string; file_name?: string; file_type?: string }[] | undefined) ?? []).filter((x) => x.document_id);
  const parts: { bytes: Uint8Array; type: string; name: string }[] = [];
  const inv = await booksFile(`/invoices/${invoiceId}`, { accept: "pdf" });
  parts.push({ ...inv, name: `Invoice ${number}.pdf` });
  for (const pick of [docs.find((x) => isPoFile(String(x.file_name ?? ""))), docs.find((x) => isEwayFile(String(x.file_name ?? "")))]) {
    if (!pick) continue;
    const f = await booksFile(`/invoices/${invoiceId}/documents/${pick.document_id}`);
    parts.push({ ...f, name: String(pick.file_name ?? "attachment") });
  }
  const merged = await mergeParts(parts, `Invoice ${number}`);
  const names = parts.map((p) => p.name);
  const s = await startSigning(merged.bytes, { name: `Invoice ${number} · ${String(d.customer_name ?? "")}`.slice(0, 200), fileName: `Invoice ${number} merged.pdf`, signer, spot: signSpot(merged.signPage), host });
  await (await signsCol()).replaceOne({ _id: invoiceId }, { requestId: s.requestId, actionId: s.actionId, status: "inprogress", by, at: new Date().toISOString(), parts: names }, { upsert: true });
  return { signUrl: s.signUrl, parts: names, skipped: merged.skipped };
}

/** Asks Zoho Sign how the invoice's signing stands (after the signing page closes). */
export async function checkInvoiceSign(invoiceId: string): Promise<string> {
  const { signStatus } = await import("./zohoSign");
  const col = await signsCol();
  const had = await col.findOne({ _id: invoiceId });
  if (!had) return "none";
  if (had.status === "completed") return "completed";
  const status = await signStatus(had.requestId);
  if (status && status !== had.status) await col.updateOne({ _id: invoiceId }, { $set: { status, ...(status === "completed" ? { signedAt: new Date().toISOString() } : {}) } });
  return status || had.status;
}

/** The signed PDF and a file name for it. */
export async function signedInvoicePdf(invoiceId: string): Promise<{ bytes: Uint8Array; name: string } | null> {
  const { signedPdf } = await import("./zohoSign");
  const had = await (await signsCol()).findOne({ _id: invoiceId });
  if (!had || (await checkInvoiceSign(invoiceId)) !== "completed") return null;
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  return { bytes: await signedPdf(had.requestId), name: `Invoice ${String(row?.row.invoice_number ?? invoiceId)} signed.pdf` };
}
