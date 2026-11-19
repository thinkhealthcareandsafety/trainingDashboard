/*
 * GST summary (owner, 19 Nov: "CGST, SGST, IGST value for our sales, purchases and total — from invoices and bills —
 * daily, weekly and yearly; it increases daily"). Sales = the invoices' GST (not drafts / void), purchases = the bills' GST,
 * and the third row = sales minus purchases (what's left to pay). Today, the week from Monday, and the FY from 1 April;
 * the monthly summary: the month and the FY. Pure: the server passes each document's date and its Zoho record.
 */

export type GstSplit = { cgst: number; sgst: number; igst: number };
export type GstDoc = { date: string; split: GstSplit };
export type GstRow = GstSplit & { total: number; count: number };
export type GstPeriod = { label: string; from: string; to: string; sales: GstRow; purchases: GstRow; net: GstRow };

const zero = (): GstSplit => ({ cgst: 0, sgst: 0, igst: 0 });
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A Zoho invoice's / bill's GST from its `taxes` (tax_name "CGST9", "SGST2.5 (2.5%)", "IGST18"…), in rupees: a bill in
 * another currency is turned into rupees at its exchange rate. UTGST counts as SGST; anything else (cess) is left out.
 */
export function gstOf(doc: Record<string, unknown>): GstSplit {
  const rate = Number(doc.exchange_rate) > 0 ? Number(doc.exchange_rate) : 1;
  const s = zero();
  for (const t of (doc.taxes as { tax_name?: unknown; tax_amount?: unknown }[] | undefined) ?? []) {
    const name = String(t.tax_name ?? "").trim().toUpperCase();
    const amount = (Number(t.tax_amount) || 0) * rate;
    if (name.startsWith("CGST")) s.cgst += amount;
    else if (name.startsWith("SGST") || name.startsWith("UTGST")) s.sgst += amount;
    else if (name.startsWith("IGST")) s.igst += amount;
  }
  return { cgst: r2(s.cgst), sgst: r2(s.sgst), igst: r2(s.igst) };
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
  const s = zero();
  let count = 0;
  for (const d of docs) {
    if (d.date < from || d.date > to) continue;
    s.cgst += d.split.cgst; s.sgst += d.split.sgst; s.igst += d.split.igst; count++;
  }
  return { cgst: r2(s.cgst), sgst: r2(s.sgst), igst: r2(s.igst), total: r2(s.cgst + s.sgst + s.igst), count };
}

/** Each window's sales, purchases and sales minus purchases, up to `on`. */
export function gstPeriods(sales: GstDoc[], purchases: GstDoc[], windows: { label: string; from: string }[], on: string): GstPeriod[] {
  return windows.map(({ label, from }) => {
    const s = add(sales, from, on), p = add(purchases, from, on);
    const net = { cgst: r2(s.cgst - p.cgst), sgst: r2(s.sgst - p.sgst), igst: r2(s.igst - p.igst), total: r2(s.total - p.total), count: 0 };
    return { label, from, to: on, sales: s, purchases: p, net };
  });
}
