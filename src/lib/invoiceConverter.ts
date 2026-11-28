import "server-only";
import { db } from "./db";
import { booksApi } from "./quotations";
import { fetchDetail } from "./zoho";
import { poInPdf, poKey } from "./poMatch";
import { type ConvCustomer, ewayFromText, poFromText, ewayFileName, cleanEway, groupByCustomer, isEwayFile, needsEway, poFileTest, piOf, poFileName, poState, splitAttachments, isSignedFile, signedFileName, mergedName, type MergePart } from "./invoiceConverterRules";

/*
 * The Invoice Converter's data and its writes to Zoho Books (owner, 17 Nov).
 *  - The invoices come from the Sales copy (salesDocs: every invoice since last FY, with its Purchase Order Number and
 *    whether it has attachments).
 *  - The e-way bill number and the attachment names are only in an invoice's full record, so those are read from Zoho
 *    a few at a time (invoices over ₹50,000, and any with attachments) and kept in `invoiceExtras` until the invoice
 *    changes.
 *  - Writes: the Purchase Order Number custom field (PUT /invoice/{id}/customfields, singular: Zoho refuses PUT on /invoices/{id}/customfields), and a PDF attached to the invoice
 *    (POST /invoices/{id}/attachment), named "PO - <invoice>.pdf" / "E-way bill - <invoice>.pdf". When the "Purchase
 *    order PDF" custom field exists in Zoho, the PO PDF can move there.
 */

const PO_FIELD = "982417000001000149"; // invoice custom field "Purchase Order Number" (cf_purchase_order_number)
// Invoice custom field "E-way Bill Number" (cf_e_way_bill_number), made 18 Nov for the converter (owner: what's added
// here goes into Zoho Books too); hidden on the invoice PDF.
const EWAY_FIELD = "982417000024432062";
const READ_BATCH = 20; // full records read per page load; the page asks again while some are pending

type SalesRow = { _id: string; kind: string; id: string; lmt?: string; date?: string; row: Record<string, unknown> };
/** `ewayFound`: the e-way bill number read from an attached PDF (Zoho keeps its own e-way bills; this one shows here). */
type Extras = { _id: string; lmt: string; eway: string | null; files: string[]; readAt: string; ewayFound?: string | null; /** Attachments opened and found to carry the invoice's PO number (owner, 25 Nov). */ poRead?: string[] };

const sales = async () => (await db()).collection<SalesRow>("salesDocs");
const extrasCol = async () => (await db()).collection<Extras>("invoiceExtras");

const wantsDetail = (r: SalesRow) => needsEway(Number(r.row.total) || 0) || Boolean(r.row.has_attachment);

/** PDFs on the invoice whose name doesn't say they are its PO: opened, and kept as it when they carry its PO number. */
async function poByReading(r: SalesRow, docs: { document_id?: string; file_name?: string }[]): Promise<string[]> {
  const po = r.row.cf_purchase_order_number, key = poKey(po), isPo = poFileTest(po);
  if (!key || docs.some((x) => isPo(String(x.file_name ?? "")))) return [];
  const { booksFile } = await import("./quotations");
  const out: string[] = [];
  for (const x of docs.slice(0, 5)) {
    const name = String(x.file_name ?? "");
    if (!x.document_id || !/\.pdf$/i.test(name) || isEwayFile(name)) continue;
    try {
      const { bytes } = await booksFile(`/invoices/${r.id}/documents/${x.document_id}`);
      if (poInPdf(key, await pdfText(bytes))) out.push(name);
    } catch (e) { console.error(`[invoice-converter] attachment of ${r.row.invoice_number}: ${e instanceof Error ? e.message : e}`); }
  }
  return out;
}

/** Every customer with their invoices; reads up to READ_BATCH full records from Zoho that aren't known yet. */
export async function converterData(): Promise<{ customers: ConvCustomer[]; pending: number; scansDue: number }> {
  const poFolder = await import("./poFolder");
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
      const docs = (d.documents as { document_id?: string; file_name?: string }[] | undefined) ?? [];
      const files = docs.map((x) => String(x.file_name ?? "")).filter(Boolean);
      const poRead = await poByReading(r, docs);
      const e: Extras = { _id: r.id, poRead, ewayFound: extras.get(r.id)?.ewayFound ?? null, lmt: r.lmt ?? "", eway: String(d.ewaybill_number ?? (d.eway_bill_details as { eway_bill_number?: string } | undefined)?.eway_bill_number ?? "") || null, files, readAt: new Date().toISOString() };
      const { _id: _x, ...body } = e;
      void _x;
      await (await extrasCol()).replaceOne({ _id: r.id }, body, { upsert: true });
      extras.set(r.id, e);
    } catch (err) {
      console.error(`[invoice-converter] ${r.row.invoice_number}: ${err instanceof Error ? err.message : err}`);
      break; // Zoho busy: try again on the next load
    }
  }
  // PO PDFs found in WorkDrive; if that can't be read the page works as before.
  const found = await (async () => {
    await poFolder.matchNewKeys([...new Set(rows.map((r) => poKey(r.row.cf_purchase_order_number)).filter(Boolean))]);
    return poFolder.poFiles();
  })().catch((e) => { console.error(`[po folder] ${e instanceof Error ? e.message : e}`); return new Map<string, { id: string; name: string }[]>(); });
  const list = rows.map((r) => {
    const total = Number(r.row.total) || 0;
    const e = extras.get(r.id);
    const po = poState(r.row.cf_purchase_order_number);
    const files = e?.files ?? [];
    const pending = wantsDetail(r) && !fresh(r);
    const isPo = poFileTest(r.row.cf_purchase_order_number, e?.poRead);
    const poFound = pending || files.some(isPo) ? undefined : found.get(poKey(r.row.cf_purchase_order_number));
    return {
      ...(poFound?.length ? { poFound } : {}),
      customerId: String(r.row.customer_id ?? r.row.customer_name ?? ""), customerName: names.get(String(r.row.customer_id ?? "")) || String(r.row.customer_name ?? ""),
      id: r.id, number: String(r.row.invoice_number ?? ""), date: String(r.row.date ?? r.date ?? ""), total, status: String(r.row.status ?? ""), pi: piOf(r.row.reference_number),
      po: po.label, poOk: po.ok, poPdf: files.some(isPo),
      others: splitAttachments(files, (n) => n, isPo).others,
      ...(files.some(isSignedFile) ? { signedPdf: files.find(isSignedFile) } : {}),
      eway: e?.eway || String(r.row.cf_e_way_bill_number ?? "").trim() || e?.ewayFound || null, ewayZoho: Boolean(e?.eway), ewayPdf: files.some(isEwayFile), needsEway: needsEway(total),
      pending,
      sign: signs.get(r.id)?.status,
    };
  });
  return { customers: groupByCustomer(list), pending: list.filter((i) => i.pending).length, scansDue: await poFolder.picturesDue().catch(() => 0) };
}

/** One custom field on an invoice in Zoho (Zoho's spec: PUT /invoice/{id}/customfields, body { custom_fields: [...] }). */
async function setInvoiceField(invoiceId: string, fieldId: string, value: string) {
  await booksApi("PUT", `/invoice/${invoiceId}/customfields`, {}, { custom_fields: [{ customfield_id: fieldId, value }] });
}

/**
 * An e-way bill number typed here, written to the invoice's "E-way Bill Number" field in Zoho and to our copy (Zoho's
 * own e-way bills still show first). Empty clears it.
 */
export async function setEway(invoiceId: string, raw: unknown): Promise<{ eway: string | null }> {
  const typed = String(raw ?? "").trim();
  const eway = typed ? cleanEway(typed) : null;
  if (typed && !eway) throw new Error("An e-way bill number has 12 digits.");
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  if (!row) throw new Error("That invoice isn't in our copy yet. Sync, then try again.");
  await setInvoiceField(invoiceId, EWAY_FIELD, eway ?? "");
  await (await sales()).updateOne({ _id: `invoices:${invoiceId}` }, eway ? { $set: { "row.cf_e_way_bill_number": eway } } : { $unset: { "row.cf_e_way_bill_number": "" } });
  const col = await extrasCol();
  const had = await col.findOne({ _id: invoiceId });
  await col.replaceOne({ _id: invoiceId }, { lmt: had?.lmt ?? (wantsDetail(row) ? "" : row.lmt ?? ""), eway: had?.eway ?? null, ewayFound: eway, files: had?.files ?? [], readAt: had?.readAt ?? new Date().toISOString(), ...(had?.poRead ? { poRead: had.poRead } : {}) }, { upsert: true });
  return { eway: had?.eway || eway };
}

/** The invoice's Purchase Order Number, written to Zoho and to our copy. */
export async function setPoNumber(invoiceId: string, raw: unknown): Promise<{ po: string; ok: boolean }> {
  const value = String(raw ?? "").trim().slice(0, 100);
  // Zoho's spec (invoices.yml, update_custom_fields_in_invoice): singular "invoice", body { custom_fields: [{ customfield_id, value }] }.
  await setInvoiceField(invoiceId, PO_FIELD, value);
  await (await sales()).updateOne({ _id: `invoices:${invoiceId}` }, value ? { $set: { "row.cf_purchase_order_number": value } } : { $unset: { "row.cf_purchase_order_number": "" } });
  const s = poState(value);
  return { po: s.label, ok: s.ok };
}

/**
 * The invoices made from the same PI as this one (same customer, not void), this one first (owner, 18 Nov: "that PO will
 * be the same for all the invoices that reference that PI"). An invoice with no PI is on its own.
 */
export async function samePiInvoices(invoiceId: string): Promise<SalesRow[]> {
  const rows = (await (await sales()).find({ kind: "invoices" }).toArray()).filter((r) => r.kind === "invoices" && String(r.row.status ?? "") !== "void");
  const me = rows.find((r) => r.id === invoiceId);
  if (!me) return [];
  const pi = piOf(me.row.reference_number);
  if (!pi) return [me];
  const cust = String(me.row.customer_id ?? "");
  return [me, ...rows.filter((r) => r.id !== invoiceId && piOf(r.row.reference_number) === pi && String(r.row.customer_id ?? "") === cust)];
}

/** The PO number written to every invoice of the same PI; `ids` = the invoices that now carry it. */
export async function setPoForPi(invoiceId: string, raw: unknown): Promise<{ po: string; ok: boolean; ids: string[] }> {
  const group = await samePiInvoices(invoiceId);
  const ids = group.length ? group.map((r) => r.id) : [invoiceId];
  let s = { po: "", ok: false };
  for (const id of ids) s = await setPoNumber(id, raw);
  return { ...s, ids };
}

/** One PDF attached to one invoice in Zoho under `name`, and noted in our copy at once (the next full read confirms it). */
async function attachOne(invoiceId: string, lmt: string | undefined, name: string, bytes: Uint8Array<ArrayBuffer>, ewayFound?: string | null, type = "application/pdf") {
  const form = new FormData();
  form.append("attachment", new File([bytes], name, { type }));
  await booksApi("POST", `/invoices/${invoiceId}/attachment`, {}, form);
  const col = await extrasCol();
  const had = await col.findOne({ _id: invoiceId });
  await col.replaceOne({ _id: invoiceId }, { lmt: lmt ?? had?.lmt ?? "", eway: had?.eway ?? null, ewayFound: ewayFound ?? had?.ewayFound ?? null, files: [...(had?.files ?? []), name], readAt: had?.readAt ?? new Date().toISOString(), ...(had?.poRead ? { poRead: had.poRead } : {}) }, { upsert: true });
  await (await sales()).updateOne({ _id: `invoices:${invoiceId}` }, { $set: { "row.has_attachment": true } });
  return had;
}

/**
 * Replace (owner, 23 Nov: "once these are added, why can I not replace them"): the invoice's PO or e-way bill PDFs, found
 * by name in its full record, deleted in Zoho (DELETE /invoices/{id}/documents/{document id}) and dropped from our copy.
 */
async function removeOld(invoiceId: string, which: "po" | "eway") {
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  const isIt = which === "po" ? poFileTest(row?.row.cf_purchase_order_number, (await (await extrasCol()).findOne({ _id: invoiceId }))?.poRead) : isEwayFile;
  const d = await fetchDetail("invoices", invoiceId);
  const docs = ((d.documents as { document_id?: string; file_name?: string }[] | undefined) ?? []).filter((x) => x.document_id && isIt(String(x.file_name ?? "")));
  for (const x of docs) await booksApi("DELETE", `/invoices/${invoiceId}/documents/${x.document_id}`);
  const col = await extrasCol();
  const had = await col.findOne({ _id: invoiceId });
  if (had) await col.updateOne({ _id: invoiceId }, { $set: { files: (had.files ?? []).filter((n) => !isIt(n)), ...(which === "eway" ? { ewayFound: null } : {}) } });
}

/** The PDF's text (empty for a scanned one, or one that can't be read). */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : String(text ?? "");
  } catch (e) {
    console.error(`[invoice-converter] reading the PDF's text failed: ${e instanceof Error ? e.message : e}`);
    return "";
  }
}

/**
 * Attaches the PDF to the invoice in Zoho, and fills in the number it carries (owner, 17 Nov: "if I add the PDF, it should
 * automatically add the id from the PDF"): a PO's number goes into the invoice's Purchase Order Number when that has
 * none (or "Verbal"); an e-way bill's number shows here when Zoho has none on the invoice. `found` says what was read.
 */
export type AttachResult = {
  ok: true; found: string | null; po?: string; poOk?: boolean; eway?: string;
  /** The invoices that got the PDF, and those whose PO number was set (a PO goes to every invoice of the same PI). */
  ids: string[]; poIds: string[];
};
/**
 * A PO PDF goes to every invoice of the same PI that has none yet (owner, 18 Nov), each under its own name
 * ("PO - <invoice>.pdf"). Its number: `typed` when given (the linked block's "PO for all"), written to all of them;
 * otherwise the number read from the PDF, written where the invoice has none or "Verbal". An e-way bill is per invoice.
 * `known`: the invoice's own PO number, already matched on this PDF (poFolder.ts) — taken as the number read, and the PDF
 * goes only to those invoices of the PI that have the same number or none.
 * `replace`: the old PDF goes first (a PO's on every invoice of the PI), and the number read from the new one wins.
 */
export async function attachPdf(invoiceId: string, which: "po" | "eway", file: File, typed?: string, replace = false, known?: string): Promise<AttachResult> {
  if (file.size > 10 * 1024 * 1024) throw new Error("The file is over 10 MB.");
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error("Attach a PDF.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = await pdfText(bytes);
  const found = which === "po" ? known ?? poFromText(text) : ewayFromText(text);

  if (which === "eway") {
    const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
    if (replace) await removeOld(invoiceId, "eway");
    const had = await attachOne(invoiceId, row?.lmt, ewayFileName(String(row?.row.invoice_number ?? invoiceId)), bytes, found);
    const fresh = Boolean(found && !had?.eway && (replace || !String(row?.row.cf_e_way_bill_number ?? "").trim()));
    // The number read from the PDF goes into Zoho's "E-way Bill Number" too, when the invoice has none yet.
    if (fresh && found) {
      try { await setEway(invoiceId, found); } catch (err) { console.error(`[invoice-converter] e-way bill number into Zoho for ${row?.row.invoice_number ?? invoiceId}: ${err instanceof Error ? err.message : err}`); }
    }
    return { ok: true, found, ids: [invoiceId], poIds: [], ...(fresh && found ? { eway: found } : {}) };
  }

  const whole = await samePiInvoices(invoiceId);
  if (!whole.length) throw new Error("That invoice isn't in our copy yet. Sync, then try again.");
  const group = known ? whole.filter((r, n) => n === 0 || !poState(r.row.cf_purchase_order_number).ok || poKey(r.row.cf_purchase_order_number) === poKey(known)) : whole;
  const extras = new Map((await (await extrasCol()).find({ _id: { $in: group.map((r) => r.id) } }).toArray()).map((e) => [e._id, e]));
  // The one clicked always; the others of its PI only if they have no PO PDF yet (no second copy on an invoice).
  // Replacing: every invoice of the PI, each one's old PO PDF deleted first.
  const targets = replace ? group : group.filter((r, n) => n === 0 || !(extras.get(r.id)?.files ?? []).some(poFileTest(r.row.cf_purchase_order_number, extras.get(r.id)?.poRead)));
  const ids: string[] = [];
  for (const r of targets) {
    if (replace) await removeOld(r.id, "po");
    await attachOne(r.id, r.lmt, poFileName(String(r.row.invoice_number ?? r.id)), bytes);
    ids.push(r.id);
  }
  const value = (typed ?? "").trim();
  const number = value || found;
  if (!number) return { ok: true, found, ids, poIds: [] };
  const poIds: string[] = [];
  let s = { po: "", ok: false };
  for (const r of group) {
    if (!value && !replace && poState(r.row.cf_purchase_order_number).ok) continue; // a number read from a PDF never overwrites one typed in Zoho
    s = await setPoNumber(r.id, number);
    poIds.push(r.id);
  }
  return poIds.length ? { ok: true, found, ids, poIds, po: s.po, poOk: s.ok } : { ok: true, found, ids, poIds };
}

/**
 * Other attachments (owner, 27 Nov: "add another column to add additional attachment, we can add as many, it only shows
 * the attachment name"): any file, kept under its own name, on this invoice only. Nothing is read from it.
 */
export async function attachExtra(invoiceId: string, file: File): Promise<{ ok: true; name: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("The file is over 10 MB.");
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  if (!row) throw new Error("That invoice isn't in our copy yet. Sync, then try again.");
  const name = (file.name || "attachment").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "attachment";
  await attachOne(invoiceId, row.lmt, name, new Uint8Array(await file.arrayBuffer()), undefined, file.type || "application/octet-stream");
  return { ok: true, name };
}

/** The PDF picked after "PO found" (owner, 24 Nov): from WorkDrive onto the invoice, only if it carries its PO number. */
export async function attachFoundPo(invoiceId: string, fileId: string): Promise<AttachResult> {
  const { poFileFor } = await import("./poFolder");
  const { workdriveOpen } = await import("./workdrive");
  const { name } = await poFileFor(invoiceId, fileId);
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  const had = await (await extrasCol()).findOne({ _id: invoiceId });
  if ((had?.files ?? []).some(poFileTest(row?.row.cf_purchase_order_number, had?.poRead))) throw new Error("This invoice already has a PO PDF. Refresh the page.");
  const bytes = new Uint8Array(await (await workdriveOpen(fileId)).arrayBuffer());
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new Error("That file isn't a PDF");
  return attachPdf(invoiceId, "po", new File([bytes], name, { type: "application/pdf" }), undefined, false, String(row?.row.cf_purchase_order_number ?? "").trim());
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
  const { signSpot } = await import("./pdfMerge");
  const { startSigning, signUrlAgain } = await import("./zohoSign");
  // Already waiting for this signer: the same request, a fresh signing page.
  const had = await (await signsCol()).findOne({ _id: invoiceId });
  if (had && had.status !== "completed" && had.status !== "declined" && had.status !== "expired") {
    return { signUrl: await signUrlAgain(had.requestId, had.actionId, host), parts: had.parts, skipped: [] };
  }
  const { merged, names, number, customer } = await mergedFor(invoiceId);
  const s = await startSigning(merged.bytes, { name: `Invoice ${number} · ${customer}`.slice(0, 200), fileName: `Invoice ${number} merged.pdf`, signer, spot: signSpot(merged.signPage), host });
  await (await signsCol()).replaceOne({ _id: invoiceId }, { requestId: s.requestId, actionId: s.actionId, status: "inprogress", by, at: new Date().toISOString(), parts: names }, { upsert: true });
  return { signUrl: s.signUrl, parts: names, skipped: merged.skipped };
}

/**
 * Merge and draft (owner, 20 Nov: "only Merge and Draft … auto opens Zoho Sign with that draft … just don't send, I can
 * send it myself … no need to save"): the merged PDF as a Zoho Sign draft with the signature, date and full name boxes
 * where the owner puts them; nothing kept here, nothing sent, no API credits used. Returns Zoho Sign's page for it.
 */
export async function draftInvoiceSign(invoiceId: string): Promise<{ url: string; parts: string[]; skipped: string[] }> {
  const { findSignLabel, signBoxes } = await import("./pdfMerge");
  const { createDraft } = await import("./zohoSign");
  const { merged, names, number, customer } = await mergedFor(invoiceId);
  const boxes = signBoxes(await findSignLabel(merged.bytes, merged.firstPages));
  // Zoho Sign refuses some characters in names ("·" was refused live, 20 Nov): letters, digits, spaces and - _ . ( ) only.
  const plain = (s: string) => s.replace(/[^\p{L}\p{N} _.()-]+/gu, " ").replace(/\s+/g, " ").trim();
  const d = await createDraft(merged.bytes, { name: plain(`Invoice ${number} - ${customer}`).slice(0, 200), fileName: `${plain(`Invoice ${number} merged`)}.pdf`, boxes });
  return { url: d.url, parts: names, skipped: merged.skipped };
}

/**
 * What goes into a merged PDF, in order (owner, 28 Nov: ticked in a sequence — invoice, PO, e-way bill, other
 * attachments, PI, files on the PI). Zoho Sign's merge and the older "with=" downloads use invoice → PO → e-way bill.
 */
/** The parts picked, from Zoho Books, as one PDF in the order picked; where the invoice's own pages begin and end. */
async function mergedFor(invoiceId: string, order: MergePart[] = ["invoice", "po", "eway"]) {
  const { booksFile } = await import("./quotations");
  const { mergeParts } = await import("./pdfMerge");
  const d = await fetchDetail("invoices", invoiceId);
  const number = String(d.invoice_number ?? invoiceId);
  const docs = ((d.documents as { document_id?: string; file_name?: string }[] | undefined) ?? []).filter((x) => x.document_id);
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  const isPo = poFileTest(row?.row.cf_purchase_order_number, (await (await extrasCol()).findOne({ _id: invoiceId }))?.poRead);
  const { po, eway, others } = splitAttachments(docs, (x) => String(x.file_name ?? ""), isPo);
  const file = async (doc: { document_id?: string; file_name?: string }) => ({ ...(await booksFile(`/invoices/${invoiceId}/documents/${doc.document_id}`)), name: String(doc.file_name ?? "attachment") });
  const pi = order.includes("pi") || order.includes("pifiles") ? await import("./piFiles").then((m) => m.piOfInvoice(invoiceId)) : null;
  const parts: { bytes: Uint8Array; type: string; name: string }[] = [];
  let invoiceAt = -1;
  for (const part of order) {
    if (part === "invoice") { invoiceAt = parts.length; parts.push({ ...(await booksFile(`/invoices/${invoiceId}`, { accept: "pdf" })), name: `Invoice ${number}.pdf` }); }
    if (part === "po" && po) parts.push(await file(po));
    if (part === "eway" && eway) parts.push(await file(eway));
    if (part === "others") for (const x of others) parts.push(await file(x));
    if (part === "pi" && pi) parts.push({ ...(await booksFile(`/salesorders/${pi.id}`, { accept: "pdf" })), name: `${pi.number}.pdf` });
    if (part === "pifiles" && pi) {
      const { piDocs } = await import("./piFiles");
      for (const x of await piDocs(pi.id)) parts.push({ ...(await booksFile(`/salesorders/${pi.id}/documents/${x.document_id}`)), name: String(x.file_name ?? "attachment") });
    }
  }
  if (!parts.length) throw new Error("Nothing to merge: none of the picked files is on this invoice.");
  const merged = await mergeParts(parts, `Invoice ${number}`);
  // The invoice's own pages (for the DSC stamp): from where it starts to where the next part starts.
  const invStart = invoiceAt >= 0 ? merged.starts[invoiceAt] : 0;
  const invPages = invoiceAt >= 0 ? (merged.starts[invoiceAt + 1] ?? Number.MAX_SAFE_INTEGER) - invStart : 1;
  return { merged, names: parts.map((p) => p.name), number, pi: pi?.number ?? null, customer: String(d.customer_name ?? ""), invStart, invPages };
}

/** The merged PDF to download or sign, its parts in `order` (none = invoice → PO → e-way bill). */
export async function mergedInvoicePdf(invoiceId: string, order?: MergePart[]): Promise<{ bytes: Uint8Array; name: string; skipped: string[]; number: string; spot: { page: number; x: number; y: number; w: number; h: number } }> {
  const { dscSpot, findBankLine, findSignLabel } = await import("./pdfMerge");
  const { merged, number, pi, invStart, invPages } = await mergedFor(invoiceId, order);
  // Where the DSC signer puts its stamp: under the T&C on the invoice's first page (owner, 28 Nov), wherever the
  // invoice falls in the order; without an invoice, the first page.
  const bank = await findBankLine(merged.bytes, invStart);
  const spot = dscSpot(bank, bank ? null : await findSignLabel(merged.bytes, invPages, invStart));
  return { bytes: merged.bytes, name: order ? mergedName(number, pi, order) : `Invoice ${number} - merged.pdf`, skipped: merged.skipped ?? [], number, spot };
}

/**
 * The DSC-signed PDF (owner, 27 Nov: "instead of Zoho Sign signature, we use this … signature"): signed on the owner's PC
 * by the DSC signer with the token, sent here, and put on the invoice in Zoho as "Invoice <number> signed.pdf" (an
 * older signed copy is deleted first). Only a PDF that carries a signature is taken.
 */
export async function attachSigned(invoiceId: string, file: File): Promise<{ ok: true; name: string }> {
  if (file.size > 20 * 1024 * 1024) throw new Error("The signed PDF is over 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (head !== "%PDF-" || !/\/ByteRange\s*\[/.test(Buffer.from(bytes).toString("latin1"))) throw new Error("That PDF isn't signed.");
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  if (!row) throw new Error("That invoice isn't in our copy yet. Sync, then try again.");
  const name = signedFileName(String(row.row.invoice_number ?? invoiceId));
  const d = await fetchDetail("invoices", invoiceId);
  for (const x of ((d.documents as { document_id?: string; file_name?: string }[] | undefined) ?? []).filter((x) => x.document_id && isSignedFile(String(x.file_name ?? "")))) {
    await booksApi("DELETE", `/invoices/${invoiceId}/documents/${x.document_id}`);
  }
  const col = await extrasCol();
  const had = await col.findOne({ _id: invoiceId });
  if (had) await col.updateOne({ _id: invoiceId }, { $set: { files: (had.files ?? []).filter((n) => !isSignedFile(n)) } });
  await attachOne(invoiceId, row.lmt, name, bytes as Uint8Array<ArrayBuffer>);
  return { ok: true, name };
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
  if (!had) {
    // Signed with the DSC token (owner, 27 Nov): the signed copy on the invoice in Zoho.
    const d = await fetchDetail("invoices", invoiceId);
    const doc = ((d.documents as { document_id?: string; file_name?: string }[] | undefined) ?? []).find((x) => x.document_id && isSignedFile(String(x.file_name ?? "")));
    if (!doc) return null;
    const { booksFile } = await import("./quotations");
    return { bytes: (await booksFile(`/invoices/${invoiceId}/documents/${doc.document_id}`)).bytes, name: String(doc.file_name) };
  }
  if ((await checkInvoiceSign(invoiceId)) !== "completed") return null;
  const row = await (await sales()).findOne({ _id: `invoices:${invoiceId}` });
  return { bytes: await signedPdf(had.requestId), name: `Invoice ${String(row?.row.invoice_number ?? invoiceId)} signed.pdf` };
}
