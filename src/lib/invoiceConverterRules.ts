import { poKey } from "./poMatch";

/*
 * The Invoice Converter (owner, 17 Nov): each customer with all their invoices, and for each invoice whether the
 * Purchase Order is there (its number on the invoice, a green tick; "Verbal" or nothing, a red cross), its PO PDF, and,
 * for invoices over ₹50,000, the e-way bill (number and PDF). Pure and client-safe.
 */

/** E-way bills: goods invoices over ₹50,000 need one (owner: "invoices value over 50k might probably be having an EWAY bill"). */
export const EWAY_OVER = 50_000;
export const needsEway = (total: number) => total > EWAY_OVER;

/** The PO field's value: a real number / reference → ok; "Verbal", "NA", "-" or empty → not ok. */
export function poState(raw: unknown): { ok: boolean; label: string } {
  const v = String(raw ?? "").trim();
  if (!v) return { ok: false, label: "No PO" };
  if (/^(verbal|verbally|na|n\/a|nil|none|-+|tbd|awaited|pending)$/i.test(v)) return { ok: false, label: v.length > 12 ? "Verbal" : v };
  return { ok: true, label: v };
}

/** The file names we give the attachments, so the converter can tell them apart on the invoice. */
export const poFileName = (invoice: string) => `PO - ${invoice}.pdf`;
export const ewayFileName = (invoice: string) => `E-way bill - ${invoice}.pdf`;
export const isPoFile = (name: string) => /^po\b|purchase.?order/i.test(name.trim());
/**
 * Which of an invoice's attachments are its PO (owner, 25 Nov: "6567134.pdf" put on in Zoho wasn't seen): named as one, or a
 * PDF named with the invoice's PO number (or a long part of it), or one that was opened and carries that number (`read`).
 */
export function poFileTest(po: unknown, read: string[] = []): (name: string) => boolean {
  const parts = poKey(po).split("-").filter((p) => p.length >= 5 && (p.match(/\d/g) ?? []).length >= 4);
  return (name) => isPoFile(name) || read.includes(name) || (/\.pdf$/i.test(name) && !isEwayFile(name) && parts.some((p) => new RegExp(`(?<![A-Z0-9])${p}(?![A-Z0-9])`, "i").test(name)));
}
export const isEwayFile = (name: string) => /e-?way/i.test(name);
/** The DSC-signed copy put on the invoice (owner, 27 Nov: sign with the DSC token instead of Zoho Sign). */
export const signedFileName = (invoice: string) => `Invoice ${invoice} signed.pdf`;
export const isSignedFile = (name: string) => /^invoice\b.*\bsigned\.pdf$/i.test(name.trim());
/**
 * Splits an invoice's attachments into its one PO, its one e-way bill, and the rest (owner, 27 Nov: "WCC_…_6570080_…
 * Report.pdf" carries the PO number but is a report, and was left out of "Invoice - PO - Attachment"). The PO is a file
 * named as one first, else the first that `isPo` takes; only that one, and other files named as a PO ("PO - …"), are
 * kept out of the attachments. The DSC-signed copy is never an attachment (it would go into the next merge).
 */
export function splitAttachments<T>(docs: T[], name: (d: T) => string, isPo: (n: string) => boolean): { po?: T; eway?: T; others: T[] } {
  const po = docs.find((d) => isPoFile(name(d))) ?? docs.find((d) => isPo(name(d)));
  const eway = docs.find((d) => isEwayFile(name(d)));
  return { po, eway, others: docs.filter((d) => d !== po && d !== eway && !isPoFile(name(d)) && !isEwayFile(name(d)) && !isSignedFile(name(d))) };
}

/*
 * One PI (Zoho sales order, "Performa-25-1214") → many invoices (owner, 18 Nov). Zoho puts the PI's number in the
 * invoice's Reference; invoices of the same PI share its Purchase Order, so they are shown linked and one PO number and
 * PDF fills them all.
 */
/** The PI an invoice was made from, from its Reference ("Performa-25-1223", "performa 25/1223 part 2" → "Performa-25-1223"). */
export function piOf(reference: unknown): string | null {
  const m = String(reference ?? "").match(/performa\s*[-_/ ]?\s*(\d{2})\s*[-_/ ]\s*(\d{1,6})(?!\d)/i);
  return m ? `Performa-${m[1]}-${m[2]}` : null;
}

/** A customer's invoices as blocks: a PI with two or more invoices is one linked block (`pi` set); the rest stand alone. */
export type ConvBlock = { pi: string | null; invoices: ConvInvoice[] };
export function blocksOf(invoices: ConvInvoice[]): ConvBlock[] {
  const count = new Map<string, number>();
  for (const i of invoices) if (i.pi) count.set(i.pi, (count.get(i.pi) ?? 0) + 1);
  const out: ConvBlock[] = [];
  const at = new Map<string, ConvBlock>();
  // In list order (newest first): a linked block sits where its newest invoice is.
  for (const i of invoices) {
    const pi = i.pi && (count.get(i.pi) ?? 0) > 1 ? i.pi : null;
    if (!pi) { out.push({ pi: null, invoices: [i] }); continue; }
    const b = at.get(pi);
    if (b) b.invoices.push(i);
    else { const nb = { pi, invoices: [i] }; at.set(pi, nb); out.push(nb); }
  }
  return out;
}

/** An e-way bill number typed in: 12 digits, spaces allowed. */
export const cleanEway = (raw: unknown): string | null => { const v = String(raw ?? "").replace(/\s+/g, ""); return /^\d{12}$/.test(v) ? v : null; };

export type ConvInvoice = {
  id: string; number: string; date: string; total: number; status: string;
  /** The PI it was made from (piOf the Reference), if any. */
  pi: string | null;
  po: string; poOk: boolean; poPdf: boolean;
  /** Other attachments on the invoice (not its PO or e-way bill), by name (owner, 27 Nov). */
  others?: string[];
  eway: string | null; ewayPdf: boolean; needsEway: boolean;
  /** The e-way bill number is Zoho's own (made in Zoho); otherwise it was typed or read here and can be changed here. */
  ewayZoho: boolean;
  /** The e-way bill / attachments not read from Zoho yet (filled in a few at a time). */
  pending: boolean;
  /** Merge and sign (owner, 17 Nov): Zoho Sign's status for this invoice ("inprogress", "completed", …), if started. */
  sign?: string;
  /** The DSC-signed copy on the invoice in Zoho, by name (owner, 27 Nov). */
  signedPdf?: string;
  /** PO PDFs in the WorkDrive PO folder that carry this invoice's PO number, when it has no PO PDF yet (owner, 24 Nov). */
  poFound?: { id: string; name: string }[];
};
export type ConvCustomer = { id: string; name: string; invoices: ConvInvoice[]; latest: string; missing: number };

/** Customers, newest invoice first; within each, newest first. `missing` = invoices with something still to add. */
export function groupByCustomer(list: (ConvInvoice & { customerId: string; customerName: string })[]): ConvCustomer[] {
  const map = new Map<string, ConvCustomer>();
  for (const i of list) {
    const c = map.get(i.customerId) ?? { id: i.customerId, name: i.customerName, invoices: [], latest: "", missing: 0 };
    const { customerId: _c, customerName: _n, ...inv } = i;
    void _c; void _n;
    c.invoices.push(inv);
    if (inv.date > c.latest) c.latest = inv.date;
    if (!inv.poOk || !inv.poPdf || (inv.needsEway && (!inv.eway || !inv.ewayPdf))) c.missing++;
    map.set(i.customerId, c);
  }
  for (const c of map.values()) c.invoices.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  return [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name));
}

/*
 * The number from an attached PDF (owner, 17 Nov: "if I add the PDF, it should automatically add the id from the PDF"):
 * the PO number from a purchase order, the e-way bill number from an e-way bill, read from the PDF's text. A scanned
 * PDF (only a picture) has no text, so nothing is found and the number is typed as before.
 */
const PO_LABEL = /(?:purchase\s*order|p\.?\s*o\.?)\s*(?:no\.?|number|num|#|ref(?:erence)?)?\s*[:#.\-–]?\s*([A-Z0-9][A-Z0-9/\-_.]{2,40})/gi;
const NOT_PO = /^(date|dated|box|number|no|details|value|amount|order|terms|copy)$/i;
/** The PO number on a purchase order: the value after "PO No", "P.O. Number", "Purchase Order No" and the like. */
export function poFromText(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  for (const m of t.matchAll(PO_LABEL)) {
    const v = m[1].replace(/[.\-_/]+$/, "");
    if (v.length >= 3 && /\d/.test(v) && !NOT_PO.test(v)) return v;
  }
  return null;
}

/** The e-way bill number: 12 digits, after "E-Way Bill No" / "EWB No" when labelled, else the first 12-digit number. */
export function ewayFromText(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  const labelled = t.match(/(?:e-?\s*way\s*bill|ewb)\s*(?:no\.?|number|#)?\s*[:#.\-–]?\s*(\d{4}\s?\d{4}\s?\d{4})\b/i);
  if (labelled) return labelled[1].replace(/\s/g, "");
  const any = t.match(/(?<!\d)(\d{12})(?!\d)/);
  return any ? any[1] : null;
}
