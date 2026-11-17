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
export const isEwayFile = (name: string) => /e-?way/i.test(name);

export type ConvInvoice = {
  id: string; number: string; date: string; total: number; status: string;
  po: string; poOk: boolean; poPdf: boolean;
  eway: string | null; ewayPdf: boolean; needsEway: boolean;
  /** The e-way bill / attachments not read from Zoho yet (filled in a few at a time). */
  pending: boolean;
  /** Merge and sign (owner, 17 Nov): Zoho Sign's status for this invoice ("inprogress", "completed", …), if started. */
  sign?: string;
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
