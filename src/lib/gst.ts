/*
 * GST summary (owner, 19 Nov: "CGST, SGST, IGST value for our sales, purchases and total — from invoices and bills —
 * daily, weekly and yearly; it increases daily"). A table per period, a row per tax and rate (IGST 5 / 18 / 28 %,
 * CGST 2.5 / 9 / 14 %, SGST 2.5 / 9 / 14 %, then Total = IGST + CGST + SGST), columns Purchase (bills), Sale (invoices,
 * not drafts / void) and Total = sale minus purchase. Today, the week from Monday, the FY from 1 April; the monthly
 * summary: the month and the FY. Pure: the server passes each document's date and its Zoho record.
 */

export type GstTax = "IGST" | "CGST" | "SGST";
/** GST by tax and rate: "IGST 18" → ₹. */
export type GstSplit = Record<string, number>;
export type GstDoc = { date: string; split: GstSplit };
export type GstRow = { byRate: GstSplit; total: number; count: number };
export type GstPeriod = { label: string; from: string; to: string; sales: GstRow; purchases: GstRow; net: GstRow };

/** The rows the owner listed, always shown (in this order); any other rate Zoho has goes after its tax's. */
export const GST_RATES: { tax: GstTax; rate: number }[] = [
  { tax: "IGST", rate: 5 }, { tax: "IGST", rate: 18 }, { tax: "IGST", rate: 28 },
  { tax: "CGST", rate: 2.5 }, { tax: "CGST", rate: 9 }, { tax: "CGST", rate: 14 },
  { tax: "SGST", rate: 2.5 }, { tax: "SGST", rate: 9 }, { tax: "SGST", rate: 14 },
];
const r2 = (v: number) => Math.round(v * 100) / 100;
export const rateKey = (tax: GstTax, rate: number) => `${tax} ${rate}`;

/**
 * A Zoho invoice's / bill's GST by tax and rate, from its `taxes` (tax_name "CGST9", "SGST2.5 (2.5%)", "IGST18"…), in
 * rupees: a bill in another currency is turned into rupees at its exchange rate. UTGST counts as SGST; cess is left out.
 */
export function gstOf(doc: Record<string, unknown>): GstSplit {
  const fx = Number(doc.exchange_rate) > 0 ? Number(doc.exchange_rate) : 1;
  const out: GstSplit = {};
  for (const t of (doc.taxes as { tax_name?: unknown; tax_amount?: unknown }[] | undefined) ?? []) {
    const m = /^(CGST|SGST|UTGST|IGST)\s*\(?\s*([\d.]+)/i.exec(String(t.tax_name ?? "").trim());
    if (!m) continue;
    const tax = (m[1].toUpperCase() === "UTGST" ? "SGST" : m[1].toUpperCase()) as GstTax;
    const k = rateKey(tax, Number(m[2]));
    out[k] = r2((out[k] ?? 0) + (Number(t.tax_amount) || 0) * fx);
  }
  return out;
}

/** The table's rows: the owner's nine, then any other rate found, each after its own tax's. */
export function gstRows(periods: GstPeriod[]): { tax: GstTax; rate: number; key: string }[] {
  const keys = new Set(GST_RATES.map((r) => rateKey(r.tax, r.rate)));
  const extra: { tax: GstTax; rate: number }[] = [];
  for (const p of periods) for (const row of [p.sales, p.purchases]) for (const [k, v] of Object.entries(row.byRate)) {
    if (keys.has(k) || !v) continue;
    keys.add(k);
    const [tax, rate] = k.split(" ");
    extra.push({ tax: tax as GstTax, rate: Number(rate) });
  }
  const order: GstTax[] = ["IGST", "CGST", "SGST"];
  return [...GST_RATES, ...extra]
    .sort((a, b) => order.indexOf(a.tax) - order.indexOf(b.tax) || a.rate - b.rate)
    .map((r) => ({ ...r, key: rateKey(r.tax, r.rate) }));
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The Monday of `on`'s week. */
export function weekStart(on: string): string {
  const d = new Date(`${on}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
/** 1 April of `on`'s financial year. */
export const fyStartOf = (on: string) => `${Number(on.slice(5, 7)) >= 4 ? on.slice(0, 4) : Number(on.slice(0, 4)) - 1}-04-01`;

/** The periods a summary shows: daily → today, this week, this FY; monthly → this month, this FY. */
export function gstWindows(kind: "daily" | "monthly", on: string): { label: string; from: string }[] {
  const fy = fyStartOf(on);
  const fyLabel = `This year (FY ${fy.slice(2, 4)}-${String(Number(fy.slice(0, 4)) + 1).slice(2)}, since 1 April)`;
  if (kind === "monthly") return [{ label: "This month", from: `${on.slice(0, 7)}-01` }, { label: fyLabel, from: fy }];
  return [{ label: "Today", from: on }, { label: "This week (from Monday)", from: weekStart(on) }, { label: fyLabel, from: fy }];
}

function add(docs: GstDoc[], from: string, to: string): GstRow {
  const byRate: GstSplit = {};
  let count = 0;
  for (const d of docs) {
    if (d.date < from || d.date > to) continue;
    for (const [k, v] of Object.entries(d.split)) byRate[k] = (byRate[k] ?? 0) + v;
    count++;
  }
  for (const k of Object.keys(byRate)) byRate[k] = r2(byRate[k]);
  return { byRate, total: r2(Object.values(byRate).reduce((s, v) => s + v, 0)), count };
}

/** Each window's purchases, sales and sale minus purchase, up to `on`. */
export function gstPeriods(sales: GstDoc[], purchases: GstDoc[], windows: { label: string; from: string }[], on: string): GstPeriod[] {
  return windows.map(({ label, from }) => {
    const s = add(sales, from, on), p = add(purchases, from, on);
    const byRate: GstSplit = {};
    for (const k of new Set([...Object.keys(s.byRate), ...Object.keys(p.byRate)])) byRate[k] = r2((s.byRate[k] ?? 0) - (p.byRate[k] ?? 0));
    return { label, from, to: on, sales: s, purchases: p, net: { byRate, total: r2(s.total - p.total), count: 0 } };
  });
}
