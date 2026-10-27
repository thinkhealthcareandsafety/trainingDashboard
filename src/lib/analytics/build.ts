import type { BoardTraining } from "../types";
import { QUOTE_VALID_DAYS } from "../forecast";
import type { Row } from "./model";

/*
 * Rows for each dataset (model.ts) — from the Zoho Analytics tables the server keeps (source.ts) and the Training
 * board's trainings. Pure, so a script can check the totals against Zoho. Zoho Analytics exports values the way the
 * workspace formats them ("INR 852,000.00", "20/07/2021"); a column shown abbreviated ("INR 954.24K") would lose
 * precision, so only exact columns are used (e.g. line sub-totals, not the invoice "Total (BCY)").
 */

export type Raw = Record<string, string>;
export type RawTables = Partial<Record<TableKey, Raw[]>>;
export type TableKey = "invoices" | "invoiceItems" | "customers" | "addresses" | "salespersons" | "items" | "quotes" | "payments" | "salesOrders" | "salesOrderItems";

/** The Zoho Analytics tables used, with the columns kept (the rest is never stored). */
export const TABLES: Record<TableKey, { name: string; columns: string[] }> = {
  invoices: { name: "Invoices", columns: ["Invoice ID", "Invoice Number", "Invoice Date", "Invoice Status", "Customer ID", "Due Date", "Sub Total (BCY)", "Discount Amount (BCY)", "Is Discount Before Tax", "Balance (BCY)", "Salesperson ID", "Address ID", "Last Payment Date", "Business Type", "Lead Source", "Product Type", "Training Date", "Trainer Name", "Freight Incurred", "Shipped by", "Quote ID"] },
  invoiceItems: { name: "Invoice Items", columns: ["Item ID", "Invoice ID", "Product ID", "Item Name", "Quantity", "Sub Total (BCY)", "Tax Inclusive Total (BCY)"] },
  customers: { name: "Customers", columns: ["Customer ID", "Customer Name", "Status", "Type", "Sector", "Special Identifier", "Created Time"] },
  addresses: { name: "Customer Addresses", columns: ["Address ID", "Customer ID", "Billing City", "Billing State", "Shipping City", "Shipping State"] },
  salespersons: { name: "Salespersons", columns: ["Salesperson ID", "Name"] },
  items: { name: "Items", columns: ["Item ID", "Item Name", "Item Identifier", "Product Category", "Brand"] },
  quotes: { name: "Quotes", columns: ["Quote ID", "Quote Number", "Quote Date", "Status", "Customer ID", "Sub Total (BCY)", "Salesperson ID", "Address ID"] },
  payments: { name: "Customer Payments", columns: ["Payment ID", "Payment Date", "Customer ID", "Amount (BCY)", "Withholding Tax (BCY)", "Payment Mode"] },
  // PIs (27 Oct, for the ₹50 L goal's "booked" part). "Total (BCY)" exports abbreviated ("INR …K") — sub-totals only.
  salesOrders: { name: "Sales Orders", columns: ["Sales order ID", "Order Date", "Sales Order#", "Status", "Invoiced Status", "Customer ID", "Sub Total (BCY)", "Discount Amount (BCY)", "Is Discount Before Tax", "Salesperson ID", "Address ID"] },
  salesOrderItems: { name: "Sales Order Items", columns: ["Item ID", "Sales order ID", "Product ID", "Quantity", "Quantity Invoiced", "Quantity Cancelled", "Sub Total (BCY)"] },
};

/** "INR 852,000.00" / "3,250.00" / "-1,200" → number; abbreviated "INR 954.24K" → approximate (avoid those columns). */
export function money(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/INR|Rs\.?|₹|,|\s/gi, "");
  const m = t.match(/^(-?\d+(?:\.\d+)?)(K|M|L|Cr)?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, l: 1e5, cr: 1e7 }[(m[2] ?? "").toLowerCase() as "k"] ?? 1;
  return Number(m[1]) * mult;
}
const MON: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
/** "20/07/2021" (dd/MM/yyyy) / "2024-07-15 17:10:46" / "20 Jul, 2021" → "2021-07-20". */
export function day(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*,?[ -](\d{4})/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return null;
}
const text = (s: string | undefined) => (s ?? "").trim() || null;
/** Multi-select values ("AEDs, CPR Training") → a list, spaces tidied. */
const list = (s: string | undefined) => (s ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
export const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Cust = { name: string; type: string | null; sector: string | null; chain: string | null };

function indexes(t: RawTables) {
  const customers = new Map<string, Cust>();
  const byName = new Map<string, Cust>();
  for (const c of t.customers ?? []) {
    const v = { name: text(c["Customer Name"]) ?? "(no name)", type: text(c["Type"]), sector: text(c["Sector"]), chain: text(c["Special Identifier"]) };
    customers.set(c["Customer ID"], v);
    if (!byName.has(nameKey(v.name))) byName.set(nameKey(v.name), v);
  }
  const addr = new Map<string, { state: string | null; city: string | null }>();
  const addrByCustomer = new Map<string, { state: string | null; city: string | null }>();
  for (const a of t.addresses ?? []) {
    const v = { state: text(a["Billing State"]) ?? text(a["Shipping State"]), city: text(a["Billing City"]) ?? text(a["Shipping City"]) };
    addr.set(a["Address ID"], v);
    if (!addrByCustomer.has(a["Customer ID"]) && (v.state || v.city)) addrByCustomer.set(a["Customer ID"], v);
  }
  // Zoho has the same person twice in different capitals ("Nikita Shah" / "Nikita shah"): one name each.
  // The spelling with every word capitalised wins.
  const spell = (n: string) => n.toLowerCase().replace(/\s+/g, " ");
  const variants = new Map<string, string[]>();
  for (const s of t.salespersons ?? []) { const n = text(s["Name"]); if (n) variants.set(spell(n), [...(variants.get(spell(n)) ?? []), n]); }
  const best = (n: string) => { const vs = variants.get(spell(n)) ?? [n]; return vs.find((v) => v.split(" ").every((w) => /^[A-Z]/.test(w))) ?? vs[0]; };
  const people = new Map((t.salespersons ?? []).map((s) => { const n = text(s["Name"]); return [s["Salesperson ID"], n ? best(n) : null]; }));
  const items = new Map((t.items ?? []).map((i) => [i["Item ID"], { group: text(i["Item Identifier"]), category: text(i["Product Category"]) }]));
  const where = (addressId: string | undefined, customerId: string) => (addressId && addr.get(addressId)) || addrByCustomer.get(customerId) || { state: null, city: null };
  const who = (customerId: string): Cust => customers.get(customerId) ?? { name: "(unknown customer)", type: null, sector: null, chain: null };
  return { who, where, people, items, byName };
}

const live = (status: string | undefined) => !/void|draft/i.test(status ?? "");

export function buildRows(t: RawTables, trainings: BoardTraining[], today: string): Record<string, Row[]> {
  const ix = indexes(t);
  const customerFields = (customerId: string, addressId?: string) => {
    const c = ix.who(customerId);
    const w = ix.where(addressId, customerId);
    return { customer: c.name, customerType: c.type, sector: c.sector, chain: c.chain, state: w.state, city: w.city };
  };

  // Invoices (one row each) — also the header for the sales lines.
  const invoiceById = new Map<string, Raw>();
  const invoices: Row[] = [];
  for (const i of t.invoices ?? []) {
    invoiceById.set(i["Invoice ID"], i);
    if (!live(i["Invoice Status"])) continue;
    const date = day(i["Invoice Date"]);
    const due = day(i["Due Date"]);
    const sub = money(i["Sub Total (BCY)"]) ?? 0;
    const disc = /false|no/i.test(i["Is Discount Before Tax"] ?? "") ? 0 : money(i["Discount Amount (BCY)"]) ?? 0;
    const balance = money(i["Balance (BCY)"]) ?? 0;
    const late = balance > 0 && due && due < today ? dayDiff(due, today) : 0;
    const paidOn = day(i["Last Payment Date"]);
    invoices.push({
      date, invoice: text(i["Invoice Number"]), ...customerFields(i["Customer ID"], i["Address ID"]),
      salesperson: ix.people.get(i["Salesperson ID"]) ?? null, status: text(i["Invoice Status"]),
      ageBand: balance <= 0 ? "Paid" : !late ? "Not due" : late <= 30 ? "1–30 days" : late <= 60 ? "31–60 days" : late <= 90 ? "61–90 days" : "90+ days",
      productType: list(i["Product Type"]), businessType: text(i["Business Type"]), leadSource: text(i["Lead Source"]),
      amount: sub - disc, docValue: sub - disc, balance, overdue: late ? balance : 0,
      daysToPay: balance <= 0 && paidOn && date ? Math.max(0, dayDiff(date, paidOn)) : null,
    });
  }

  // Each customer's first-ever live invoice (earliest date, then the lowest number) — "New customers" / "Repeat". By
  // name, like every customer count here: a name that's in Zoho twice (two contacts) is one customer.
  const firstOf = new Map<string, { date: string; no: string; id: string }>();
  const custKey = (customerId: string) => nameKey(ix.who(customerId).name);
  for (const i of t.invoices ?? []) {
    const date = day(i["Invoice Date"]);
    if (!date || !live(i["Invoice Status"])) continue;
    const k = custKey(i["Customer ID"]);
    const cur = firstOf.get(k);
    const no = i["Invoice Number"] ?? "";
    if (!cur || date < cur.date || (date === cur.date && no.localeCompare(cur.no, "en", { numeric: true }) < 0)) firstOf.set(k, { date, no, id: i["Invoice ID"] });
  }

  // Each customer's history (by name): invoices, first and last purchase → segment and cohort (owner, 27 Oct: second
  // batch of reports). Segments are plain rules over days since the last purchase and how often they've bought —
  // B2B safety buyers come back every year or two, so the windows are long.
  const hist = new Map<string, { invoices: Set<string>; first: string; last: string }>();
  for (const i of t.invoices ?? []) {
    const date = day(i["Invoice Date"]);
    if (!date || !live(i["Invoice Status"])) continue;
    const k = custKey(i["Customer ID"]);
    const h = hist.get(k) ?? { invoices: new Set<string>(), first: date, last: date };
    h.invoices.add(i["Invoice ID"]);
    if (date < h.first) h.first = date;
    if (date > h.last) h.last = date;
    hist.set(k, h);
  }
  const segmentOf = new Map<string, string>();
  for (const [k, h] of hist) {
    const since = dayDiff(h.last, today);
    const n = h.invoices.size;
    segmentOf.set(k,
      dayDiff(h.first, today) <= 180 ? "New"
      : since > 730 ? "Lost"
      : since > 365 ? (n >= 2 ? "At risk" : "Hibernating")
      : since <= 180 && n >= 4 ? "Champions"
      : n >= 2 ? "Loyal" : "Promising");
  }
  const fyName = (ymd: string) => { const y = Number(ymd.slice(0, 4)) - (Number(ymd.slice(5, 7)) < 4 ? 1 : 0); return `FY ${y}-${String(y + 1).slice(2)}`; };
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Sales: invoice lines; an invoice-level discount (before tax) is shared out over its lines by their share.
  const sales: Row[] = [];
  for (const li of t.invoiceItems ?? []) {
    const inv = invoiceById.get(li["Invoice ID"]);
    if (!inv || !live(inv["Invoice Status"])) continue;
    const sub = money(inv["Sub Total (BCY)"]) ?? 0;
    const disc = /false|no/i.test(inv["Is Discount Before Tax"] ?? "") ? 0 : money(inv["Discount Amount (BCY)"]) ?? 0;
    const factor = sub > 0 && disc > 0 ? (sub - disc) / sub : 1;
    const item = ix.items.get(li["Product ID"]);
    sales.push({
      date: day(inv["Invoice Date"]), invoice: text(inv["Invoice Number"]), ...customerFields(inv["Customer ID"], inv["Address ID"]),
      salesperson: ix.people.get(inv["Salesperson ID"]) ?? null, item: text(li["Item Name"]), itemGroup: item?.group ?? null,
      productType: list(inv["Product Type"]), businessType: text(inv["Business Type"]), leadSource: text(inv["Lead Source"]), status: text(inv["Invoice Status"]),
      repeat: firstOf.get(custKey(inv["Customer ID"]))?.id === li["Invoice ID"] ? "First invoice" : "Repeat",
      segment: segmentOf.get(custKey(inv["Customer ID"])) ?? null,
      cohort: hist.has(custKey(inv["Customer ID"])) ? fyName(hist.get(custKey(inv["Customer ID"]))!.first) : null,
      channel: /reseller/i.test(ix.who(inv["Customer ID"]).type ?? "") ? "Resellers" : "Direct",
      fy: day(inv["Invoice Date"]) ? fyName(day(inv["Invoice Date"])!) : null,
      monthName: day(inv["Invoice Date"]) ? MONTH_NAMES[Number(day(inv["Invoice Date"])!.slice(5, 7)) - 1] : null,
      docValue: sub - disc, // the whole invoice (for "invoices of ₹1 L or more")
      amount: (money(li["Sub Total (BCY)"]) ?? 0) * factor, amountTax: money(li["Tax Inclusive Total (BCY)"]) ?? 0, qty: money(li["Quantity"]) ?? 0,
    });
  }

  // A quote's first live invoice (invoices carry the quote they came from) — "days from quote to invoice".
  const invoicedOn = new Map<string, string>();
  for (const i of t.invoices ?? []) {
    const q = i["Quote ID"]; const dt = day(i["Invoice Date"]);
    if (q && dt && live(i["Invoice Status"]) && dt < (invoicedOn.get(q) ?? "9999")) invoicedOn.set(q, dt);
  }
  const quotes: Row[] = (t.quotes ?? []).filter((q) => !/draft/i.test(q["Status"] ?? "")).map((q) => {
    const s = (q["Status"] ?? "").toLowerCase();
    const won = /accepted|invoiced/.test(s);
    const date = day(q["Quote Date"]);
    const outcome = won ? "Won" : /declined|rejected/.test(s) ? "Lost" : /expired/.test(s) ? "Expired" : "Open";
    const age = date ? Math.max(0, dayDiff(date, today)) : null;
    return {
      date, quote: text(q["Quote Number"]), ...customerFields(q["Customer ID"], q["Address ID"]),
      salesperson: ix.people.get(q["Salesperson ID"]) ?? null, status: text(q["Status"]), outcome,
      age: age === null ? null : age <= 15 ? "0–15 days" : age <= 30 ? "16–30 days" : age <= 90 ? "31–90 days" : "Over 90 days",
      // Owner: a quote is valid for 15 days, then they make a new one.
      valid: outcome === "Open" && age !== null && age <= QUOTE_VALID_DAYS ? "yes" : "no",
      amount: money(q["Sub Total (BCY)"]) ?? 0, docValue: money(q["Sub Total (BCY)"]) ?? 0, won: won ? 1 : 0,
      invoiced: invoicedOn.has(q["Quote ID"]) || /invoiced/.test(s) ? "yes" : "no",
      daysToInvoice: date && invoicedOn.has(q["Quote ID"]) ? Math.max(0, dayDiff(date, invoicedOn.get(q["Quote ID"])!)) : null,
    };
  });

  const payments: Row[] = (t.payments ?? []).map((p) => ({
    date: day(p["Payment Date"]), ...customerFields(p["Customer ID"]), mode: text(p["Payment Mode"]),
    amount: money(p["Amount (BCY)"]) ?? 0, tds: money(p["Withholding Tax (BCY)"]) ?? 0,
  }));

  // PIs: what's still to invoice = each line's share not invoiced (or cancelled) yet, after the PI's discount.
  const openByOrder = new Map<string, number>();
  for (const li of t.salesOrderItems ?? []) {
    const qty = money(li["Quantity"]) ?? 0;
    const done = (money(li["Quantity Invoiced"]) ?? 0) + (money(li["Quantity Cancelled"]) ?? 0);
    const share = qty > 0 ? Math.max(0, qty - done) / qty : 0;
    openByOrder.set(li["Sales order ID"], (openByOrder.get(li["Sales order ID"]) ?? 0) + (money(li["Sub Total (BCY)"]) ?? 0) * share);
  }
  const orders: Row[] = (t.salesOrders ?? []).filter((o) => !/void|draft/i.test(o["Status"] ?? "")).map((o) => {
    const sub = money(o["Sub Total (BCY)"]) ?? 0;
    const disc = /false|no/i.test(o["Is Discount Before Tax"] ?? "") ? 0 : money(o["Discount Amount (BCY)"]) ?? 0;
    const factor = sub > 0 && disc > 0 ? (sub - disc) / sub : 1;
    // A PI closed by hand in Zoho won't be invoiced: nothing left to invoice.
    const closed = /closed/i.test(o["Status"] ?? "");
    const open = closed ? 0 : (openByOrder.get(o["Sales order ID"]) ?? 0) * factor;
    const inv = (o["Invoiced Status"] ?? "").toLowerCase();
    return {
      date: day(o["Order Date"]), pi: text(o["Sales Order#"]), ...customerFields(o["Customer ID"], o["Address ID"]),
      salesperson: ix.people.get(o["Salesperson ID"]) ?? null, status: text(o["Status"]),
      invoiced: closed ? "Closed" : /partial/.test(inv) ? "Part invoiced" : /^invoiced$/.test(inv) || open < 1 ? "Invoiced" : "Not invoiced",
      amount: sub - disc, docValue: sub - disc, open: open >= 1 ? open : 0,
    };
  });

  // A training's value (owner, 27 Oct: "revenue per person trained"): its PI's training lines — or, on an invoice card,
  // its invoice's — before tax. Quotes have no lines here, so they get none (and don't count in "per person").
  const TRAINING_GROUPS = /training services/i;
  const piNo = new Map((t.salesOrders ?? []).map((o) => [o["Sales order ID"], { no: o["Sales Order#"], o }]));
  const trainingByPi = new Map<string, number>();
  for (const li of t.salesOrderItems ?? []) {
    if (!TRAINING_GROUPS.test(ix.items.get(li["Product ID"])?.group ?? "")) continue;
    const pi = piNo.get(li["Sales order ID"]);
    if (!pi?.no || /void|draft/i.test(pi.o["Status"] ?? "")) continue;
    const sub = money(pi.o["Sub Total (BCY)"]) ?? 0;
    const disc = /false|no/i.test(pi.o["Is Discount Before Tax"] ?? "") ? 0 : money(pi.o["Discount Amount (BCY)"]) ?? 0;
    const factor = sub > 0 && disc > 0 ? (sub - disc) / sub : 1;
    trainingByPi.set(pi.no, (trainingByPi.get(pi.no) ?? 0) + (money(li["Sub Total (BCY)"]) ?? 0) * factor);
  }
  const trainingByInvoice = new Map<string, number>();
  for (const r of sales) if (TRAINING_GROUPS.test(String(r.itemGroup ?? "")) && typeof r.invoice === "string") trainingByInvoice.set(r.invoice, (trainingByInvoice.get(r.invoice) ?? 0) + (r.amount as number));

  // Trainings: the Training board's, one per deal; customer type / sector from Zoho by name.
  const boardRows: Row[] = trainings.filter((x) => x.board === "training" && x.status !== "tbd" && x.dates.length).map((x) => {
    const last = x.dates.at(-1)!;
    const c = ix.byName.get(nameKey(x.customerName));
    return {
      date: last, customer: x.customerName, customerType: c?.type ?? null, sector: c?.sector ?? null, chain: c?.chain ?? null,
      trainer: x.trainers.length ? x.trainers : [], trainingType: x.training || null,
      status: x.status === "completed" ? "Completed" : last < today ? "To mark completed" : x.status === "postponed" ? "Postponed" : "Scheduled",
      people: x.people,
      ...(() => {
        const value = x.id.startsWith("pi:") ? trainingByPi.get(x.docNumber) : x.id.startsWith("invoice:") ? trainingByInvoice.get(x.docNumber) : undefined;
        return value === undefined ? { value: null, peopleValued: 0, valued: 0 } : { value, peopleValued: x.people, valued: 1 };
      })(),
    };
  });

  return { sales, invoices, quotes, payments, orders, trainings: boardRows };
}
