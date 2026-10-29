import type { BoardTraining } from "../types";
import { QUOTE_VALID_DAYS } from "../forecast";
import { BOOKED_DAYS } from "./goal";
import type { Row, Value } from "./model";

/*
 * Rows for each dataset (model.ts) — from the Zoho Analytics tables the server keeps (source.ts) and the Training
 * board's trainings. Pure, so a script can check the totals against Zoho. Zoho Analytics exports values the way the
 * workspace formats them ("INR 852,000.00", "20/07/2021"); a column shown abbreviated ("INR 954.24K") would lose
 * precision, so only exact columns are used (e.g. line sub-totals, not the invoice "Total (BCY)").
 */

export type Raw = Record<string, string>;
export type RawTables = Partial<Record<TableKey, Raw[]>>;
export type TableKey = "invoices" | "invoiceItems" | "customers" | "addresses" | "salespersons" | "items" | "quotes" | "payments" | "salesOrders" | "salesOrderItems" | "stockIn" | "stockOut" | "warehouses" | "fifo" | "bills" | "billItems" | "quoteItems";
/** Read only when a report needs them (stock, margin), so the other Reports pages don't download them. */
export const STOCK_TABLES: TableKey[] = ["stockIn", "stockOut", "warehouses", "fifo", "bills", "billItems", "quoteItems"];

/** The Zoho Analytics tables used, with the columns kept (the rest is never stored). */
export const TABLES: Record<TableKey, { name: string; columns: string[] }> = {
  invoices: { name: "Invoices", columns: ["Invoice ID", "Invoice Number", "Invoice Date", "Invoice Status", "Customer ID", "Due Date", "Sub Total (BCY)", "Discount Amount (BCY)", "Is Discount Before Tax", "Balance (BCY)", "Salesperson ID", "Address ID", "Last Payment Date", "Business Type", "Lead Source", "Product Type", "Training Date", "Trainer Name", "Freight Incurred", "Shipped by", "Quote ID", "Shipping Charge (BCY)"] },
  invoiceItems: { name: "Invoice Items", columns: ["Item ID", "Invoice ID", "Product ID", "Item Name", "Quantity", "Sub Total (BCY)", "Tax Inclusive Total (BCY)"] },
  customers: { name: "Customers", columns: ["Customer ID", "Customer Name", "Status", "Type", "Sector", "Special Identifier", "Created Time"] },
  addresses: { name: "Customer Addresses", columns: ["Address ID", "Customer ID", "Billing City", "Billing State", "Shipping City", "Shipping State"] },
  salespersons: { name: "Salespersons", columns: ["Salesperson ID", "Name"] },
  items: { name: "Items", columns: ["Item ID", "Item Name", "Item Identifier", "Product Category", "Brand", "Status", "Reorder Level"] },
  quotes: { name: "Quotes", columns: ["Quote ID", "Quote Number", "Quote Date", "Status", "Customer ID", "Sub Total (BCY)", "Salesperson ID", "Address ID"] },
  payments: { name: "Customer Payments", columns: ["Payment ID", "Payment Date", "Customer ID", "Amount (BCY)", "Withholding Tax (BCY)", "Payment Mode"] },
  // PIs (27 Oct, for the ₹50 L goal's "booked" part). "Total (BCY)" exports abbreviated ("INR …K") — sub-totals only.
  salesOrders: { name: "Sales Orders", columns: ["Sales order ID", "Order Date", "Sales Order#", "Status", "Invoiced Status", "Customer ID", "Sub Total (BCY)", "Discount Amount (BCY)", "Is Discount Before Tax", "Salesperson ID", "Address ID"] },
  salesOrderItems: { name: "Sales Order Items", columns: ["Item ID", "Sales order ID", "Product ID", "Quantity", "Quantity Invoiced", "Quantity Cancelled", "Sub Total (BCY)"] },
  // Stock (owner, 28 Oct: ANALYTICS-PLAN §11 #27). Each stock-in row is one purchase / adjustment; "Quantity
  // Available" is what's left of it after Zoho's FIFO, so on hand = its sum per item. Stock-outs are what left (sales).
  stockIn: { name: "Stock In Flow Table", columns: ["Stock In Flow ID", "Product ID", "Transaction Date", "EntityType", "Quantity In", "Quantity Available", "Price (BCY)", "Warehouse ID"] },
  stockOut: { name: "Stock Out Flow Table", columns: ["Stock Out Flow ID", "Product ID", "Transaction Date", "Invoice ID", "EntityType", "Quantity Out", "Warehouse ID"] },
  warehouses: { name: "Warehouses", columns: ["Warehouse ID", "Warehouse Name", "Status"] },
  // Margin (owner, 28 Oct: §11 #25): what each stock-out cost — Zoho's FIFO, purchase by purchase.
  fifo: { name: "FIFO Mapping Table", columns: ["Stock In Flow ID", "Stock Out Flow ID", "Product ID", "Quantity Taken", "Total (BCY)"] },
  // Goods Zoho doesn't keep stock of have no FIFO cost: their average purchase price from the bills instead.
  bills: { name: "Bills", columns: ["Bill ID", "Bill Date", "Bill Status"] },
  billItems: { name: "Bill Item", columns: ["Bill ID", "Product ID", "Quantity", "Sub Total (BCY)"] },
  // Quotes per item (owner, 29 Oct: Defibtech "quotes sent and quotes converted").
  quoteItems: { name: "Quote Items", columns: ["Item ID", "Quote ID", "Product ID", "Item Name", "Quantity", "Sub Total (BCY)"] },
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
  const items = new Map((t.items ?? []).map((i) => [i["Item ID"], { group: text(i["Item Identifier"]), category: text(i["Product Category"]), brand: text(i["Brand"]), name: text(i["Item Name"]), status: text(i["Status"]) }]));
  const where = (addressId: string | undefined, customerId: string) => (addressId && addr.get(addressId)) || addrByCustomer.get(customerId) || { state: null, city: null };
  const who = (customerId: string): Cust => customers.get(customerId) ?? { name: "(unknown customer)", type: null, sector: null, chain: null };
  return { who, where, people, items, byName };
}

const live = (status: string | undefined) => !/void|draft/i.test(status ?? "");
/** A quote with no answer this many days after it was made counts as expired (owner, 27 Oct: §11 #132). */
export const QUOTE_EXPIRE_DAYS = 90;
// Defibtech report (owner, 29 Oct): Zoho's "Brand", else from the name — old inactive Defibtech items have no brand.
const brandOf = (brand: string | null, name: string | undefined) => brand ?? (/defibte?ch|lifeline/i.test(name ?? "") ? "Defibtech" : null);
/** AED / Pads / Battery from Zoho's item group ("All AEDs", "AED Pads", "AED Batteries"), else from the name. */
function kindOf(group: string | null, name: string | undefined) {
  const s = `${group ?? ""} | ${name ?? ""}`;
  return /pad|electrode/i.test(s) ? "Pads" : /batter/i.test(s) ? "Battery" : /trainer|accessor|bag|cabinet|bracket|sign|software/i.test(s) ? "Other" : /\baeds?\b|defibrillator|ddu-/i.test(s) ? "AED" : "Other";
}

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

  // Freight (owner, 28 Oct: §11 #26): one row per live invoice. "Shipped by" is typed by hand ("Shree Maruti Courier" /
  // "shree maruti"): spellings with the same letters, "Courier" or not, become the most used one.
  const courierKey = (s: string) => nameKey(s).replace(/courier$/, "");
  const spellings = new Map<string, Map<string, number>>();
  for (const i of t.invoices ?? []) {
    const s = text(i["Shipped by"]);
    if (!s) continue;
    const m = spellings.get(courierKey(s)) ?? spellings.set(courierKey(s), new Map()).get(courierKey(s))!;
    m.set(s, (m.get(s) ?? 0) + 1);
  }
  const courierOf = (s: string | null) => s && [...spellings.get(courierKey(s))!].sort((a, b) => b[1] - a[1])[0][0];
  const freight: Row[] = (t.invoices ?? []).filter((i) => live(i["Invoice Status"])).map((i) => {
    const sub = money(i["Sub Total (BCY)"]) ?? 0;
    const disc = /false|no/i.test(i["Is Discount Before Tax"] ?? "") ? 0 : money(i["Discount Amount (BCY)"]) ?? 0;
    const paid = money(i["Freight Incurred"]) ?? 0;
    return {
      date: day(i["Invoice Date"]), invoice: text(i["Invoice Number"]), ...customerFields(i["Customer ID"], i["Address ID"]),
      salesperson: ix.people.get(i["Salesperson ID"]) ?? null, courier: courierOf(text(i["Shipped by"])), shipped: paid > 0 ? "yes" : "no",
      businessType: text(i["Business Type"]), freight: paid, charged: money(i["Shipping Charge (BCY)"]) ?? 0, amount: sub - disc,
    };
  });

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
    const age = date ? Math.max(0, dayDiff(date, today)) : null;
    // One set of words everywhere (owner, 29 Oct: "converted, that is accepted … declined"); a quote with no answer
    // after QUOTE_EXPIRE_DAYS counts as expired (agreed 27 Oct, ANALYTICS-PLAN §11 #132) — not "open" for ever.
    const outcome = won ? "Accepted" : /declined|rejected/.test(s) ? "Declined" : /expired/.test(s) || (age ?? 0) > QUOTE_EXPIRE_DAYS ? "Expired" : "Waiting";
    return {
      date, quote: text(q["Quote Number"]), ...customerFields(q["Customer ID"], q["Address ID"]),
      salesperson: ix.people.get(q["Salesperson ID"]) ?? null, status: text(q["Status"]), outcome,
      age: age === null ? null : age <= 15 ? "0–15 days" : age <= 30 ? "16–30 days" : age <= 90 ? "31–90 days" : "Over 90 days",
      // Owner: a quote is valid for 15 days, then they make a new one.
      valid: outcome === "Waiting" && age !== null && age <= QUOTE_VALID_DAYS ? "yes" : "no",
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

  // A training's value (owner, 27 Oct: "revenue per person trained"): its invoice's training lines — what was billed —
  // else its PI's, before tax. The board gives each training the PI / invoice behind it, also when it sits on a payment
  // card. Quotes have no lines here, so they get none (and don't count in "per person").
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
        const value = (x.invoiceNumber ? trainingByInvoice.get(x.invoiceNumber) : undefined) ?? (x.piNumber ? trainingByPi.get(x.piNumber) : undefined);
        return value === undefined ? { value: null, peopleValued: 0, valued: 0 } : { value, peopleValued: x.people, valued: 1 };
      })(),
    };
  });

  // Margin (owner, 28 Oct: §11 #25, Admin only): goods lines — trainings have no cost in Zoho. Cost = what Zoho's FIFO
  // took out of stock for that invoice and item (shared over its lines by quantity); goods Zoho keeps no stock of =
  // their average purchase price on bills in the 12 months before the sale (else any earlier bill); else none — kits /
  // bundles with no bill of their own (₹72 L this FY on 28 Oct), shown as "No cost in Zoho", never guessed.
  let margin: Row[] | undefined;
  if (t.fifo && t.stockOut && t.billItems && t.bills) {
    const qtyOf = new Map<string, number>(); // the invoice's units of that item, over all its lines
    for (const li of t.invoiceItems ?? []) { const k = `${li["Invoice ID"]}|${li["Product ID"]}`; qtyOf.set(k, (qtyOf.get(k) ?? 0) + (money(li["Quantity"]) ?? 0)); }
    const billDay = new Map(t.bills.filter((b) => !/void|draft/i.test(b["Bill Status"] ?? "")).map((b) => [b["Bill ID"], day(b["Bill Date"])]));
    const buys = new Map<string, { d: string; q: number; v: number }[]>();
    for (const b of t.billItems) {
      const d = billDay.get(b["Bill ID"]);
      const q = money(b["Quantity"]) ?? 0;
      if (d && b["Product ID"] && q > 0) (buys.get(b["Product ID"]) ?? buys.set(b["Product ID"], []).get(b["Product ID"])!).push({ d, q, v: money(b["Sub Total (BCY)"]) ?? 0 });
    }
    const avgPrice = (product: string, on: string) => {
      const earlier = (buys.get(product) ?? []).filter((b) => b.d <= on);
      const from = new Date(Date.parse(on) - 365 * 86_400_000).toISOString().slice(0, 10);
      const use = earlier.some((b) => b.d >= from) ? earlier.filter((b) => b.d >= from) : earlier;
      const q = use.reduce((s, b) => s + b.q, 0);
      return q > 0 ? use.reduce((s, b) => s + b.v, 0) / q : null;
    };
    const outOf = new Map((t.stockOut ?? []).filter((r) => r["Invoice ID"]).map((r) => [r["Stock Out Flow ID"], { k: `${r["Invoice ID"]}|${r["Product ID"]}`, d: day(r["Transaction Date"]) }]));
    // Stock added by an adjustment at ~₹0 (a count correction — 11 Defibtech pads at ₹0.01 on 6 Jul 2026, found 29 Oct)
    // isn't a purchase: units FIFO takes from it are costed at the average bill price instead of ₹0.
    const zeroAdjust = new Set((t.stockIn ?? []).filter((r) => /adjust/i.test(r["EntityType"] ?? "") && (money(r["Price (BCY)"]) ?? 0) < 1).map((r) => r["Stock In Flow ID"]));
    const fifoCost = new Map<string, number>();
    for (const f of t.fifo) {
      const o = outOf.get(f["Stock Out Flow ID"]);
      if (!o) continue;
      const avg = zeroAdjust.has(f["Stock In Flow ID"]) && o.d ? avgPrice(f["Product ID"], o.d) : null;
      fifoCost.set(o.k, (fifoCost.get(o.k) ?? 0) + (avg !== null ? avg * (money(f["Quantity Taken"]) ?? 0) : money(f["Total (BCY)"]) ?? 0));
    }
    margin = [];
    for (const li of t.invoiceItems ?? []) {
      const inv = invoiceById.get(li["Invoice ID"]);
      const item = ix.items.get(li["Product ID"]);
      if (!inv || !live(inv["Invoice Status"]) || TRAINING_GROUPS.test(item?.group ?? "")) continue;
      const date = day(inv["Invoice Date"]);
      const sub = money(inv["Sub Total (BCY)"]) ?? 0;
      const disc = /false|no/i.test(inv["Is Discount Before Tax"] ?? "") ? 0 : money(inv["Discount Amount (BCY)"]) ?? 0;
      const amount = (money(li["Sub Total (BCY)"]) ?? 0) * (sub > 0 && disc > 0 ? (sub - disc) / sub : 1);
      const qty = money(li["Quantity"]) ?? 0;
      const k = `${li["Invoice ID"]}|${li["Product ID"]}`;
      const avg = fifoCost.has(k) || !date ? null : avgPrice(li["Product ID"], date);
      const cost = fifoCost.has(k) ? fifoCost.get(k)! * (qtyOf.get(k) ? qty / qtyOf.get(k)! : 1) : avg !== null ? avg * qty : null;
      margin.push({
        date, invoice: text(inv["Invoice Number"]), ...customerFields(inv["Customer ID"], inv["Address ID"]),
        salesperson: ix.people.get(inv["Salesperson ID"]) ?? null, item: text(li["Item Name"]), itemGroup: item?.group ?? null,
        brand: brandOf(item?.brand ?? null, li["Item Name"]), kind: kindOf(item?.group ?? null, li["Item Name"]),
        zohoItem: item?.name ?? text(li["Item Name"]), // the line's name is often retyped ("DDP 100" = Defibtech Pad DDP100)
        itemStatus: item?.status ?? null,
        costSource: fifoCost.has(k) ? "Zoho FIFO" : avg !== null ? "Average purchase price" : "No cost in Zoho",
        amount, qty, cost, costedAmount: cost === null ? 0 : amount, costedQty: cost === null ? 0 : qty, profit: cost === null ? null : amount - cost,
      });
    }
    // A kit sold as one priced line, with its parts listed at ₹0 to take them out of stock (e.g. "FRx AED with Child
    // Key" + the FRx units and keys at ₹0 — ₹32 L of cost on one invoice, 28 Oct): the parts' cost belongs to the kit.
    // Shared over the invoice's no-cost lines by value. ₹0 lines on an invoice with no such kit stay a cost (giveaways).
    const byInvoice = new Map<string, Row[]>();
    for (const r of margin) byInvoice.set(String(r.invoice), [...(byInvoice.get(String(r.invoice)) ?? []), r]);
    for (const rows of byInvoice.values()) {
      const parts = rows.filter((r) => r.amount === 0 && typeof r.cost === "number" && r.cost > 0);
      const kits = rows.filter((r) => r.costSource === "No cost in Zoho" && (r.amount as number) > 0);
      if (!parts.length || !kits.length) continue;
      const partsCost = parts.reduce((s, r) => s + (r.cost as number), 0);
      const kitValue = kits.reduce((s, r) => s + (r.amount as number), 0);
      for (const r of parts) Object.assign(r, { cost: 0, profit: 0, costedQty: 0, costSource: "Kit part (cost on the kit)" });
      for (const r of kits) {
        const c = partsCost * ((r.amount as number) / kitValue);
        Object.assign(r, { cost: c, costedAmount: r.amount, costedQty: r.qty, profit: (r.amount as number) - c, costSource: "Kit (parts' FIFO cost)" });
      }
    }
  }

  return {
    sales, invoices, quotes, payments, orders, trainings: boardRows, freight,
    ...(t.stockIn && t.stockOut ? { stock: stockRows(t, today), stockLevel: stockLevelRows(t, today) } : {}),
    ...(t.bills && t.billItems ? { purchases: purchaseRows(t) } : {}),
    ...(t.quoteItems ? { quoteItems: quoteItemRows(t, ix, customerFields, today) } : {}),
    ...(margin ? { margin } : {}),
  };
}

/** Owner, 29 Oct: "on the overview add kpis for conversion rates — quotes sent and quotes converted, that is accepted,
 *  and declined". One row per quote and Zoho item (a quote listing an item twice counts once); invoiced = accepted. */
function quoteItemRows(t: RawTables, ix: ReturnType<typeof indexes>, customerFields: (customerId: string, addressId?: string) => Record<string, Value>, today: string): Row[] {
  const quotes = new Map((t.quotes ?? []).map((q) => [q["Quote ID"], q]));
  const seen = new Map<string, Row>();
  for (const li of t.quoteItems ?? []) {
    const q = quotes.get(li["Quote ID"]);
    const item = ix.items.get(li["Product ID"]);
    if (!q) continue;
    const s = (q["Status"] ?? "").toLowerCase();
    const name = item?.name ?? text(li["Item Name"]);
    const k = `${li["Quote ID"]}|${li["Product ID"] || name}`;
    const amount = money(li["Sub Total (BCY)"]) ?? 0;
    const had = seen.get(k);
    if (had) { had.amount = (had.amount as number) + amount; continue; }
    const date = day(q["Quote Date"]);
    const old = date ? dayDiff(date, today) > QUOTE_EXPIRE_DAYS : false;
    seen.set(k, {
      date, quote: text(q["Quote Number"]), ...customerFields(q["Customer ID"], q["Address ID"]),
      salesperson: ix.people.get(q["Salesperson ID"]) ?? null,
      stage: /accepted|invoiced/.test(s) ? "Accepted" : /declined|rejected/.test(s) ? "Declined" : /expired/.test(s) ? "Expired" : /draft/.test(s) ? "Draft" : old ? "Expired" : "Waiting",
      item: text(li["Item Name"]), zohoItem: name, itemStatus: item?.status ?? null, itemGroup: item?.group ?? null,
      brand: brandOf(item?.brand ?? null, name ?? ""), kind: kindOf(item?.group ?? null, name ?? ""), amount,
    });
  }
  return [...seen.values()];
}

/** Owner, 29 Oct: "purchase trend charts, per year, per month" — one row per bill line (void / draft bills left out). */
function purchaseRows(t: RawTables): Row[] {
  const items = new Map((t.items ?? []).map((i) => [i["Item ID"], i]));
  const billDay = new Map((t.bills ?? []).filter((b) => live(b["Bill Status"])).map((b) => [b["Bill ID"], day(b["Bill Date"])]));
  const out: Row[] = [];
  for (const b of t.billItems ?? []) {
    const date = billDay.get(b["Bill ID"]);
    const item = items.get(b["Product ID"]);
    if (!date || !item) continue; // lines without an item (freight, services typed in) aren't goods we stock
    const name = text(item["Item Name"]);
    const group = text(item["Item Identifier"]);
    out.push({ date, item: name, zohoItem: name, itemStatus: text(item["Status"]), itemGroup: group, brand: brandOf(text(item["Brand"]), name ?? ""), kind: kindOf(group, name ?? ""), qty: money(b["Quantity"]) ?? 0, amount: money(b["Sub Total (BCY)"]) ?? 0 });
  }
  return out;
}

/** Owner, 29 Oct: "a monthly chart of how much stock we have" — units on hand at each month end, per item: every
 *  stock-in (bills, adjustments, opening stock) minus every stock-out up to that day. The running month's row is today. */
function stockLevelRows(t: RawTables, today: string): Row[] {
  const items = new Map((t.items ?? []).map((i) => [i["Item ID"], i]));
  const moves = new Map<string, { d: string; q: number }[]>();
  const add = (p: string | undefined, d: string | null, q: number) => { if (p && d && q) (moves.get(p) ?? moves.set(p, []).get(p)!).push({ d, q }); };
  for (const r of t.stockIn ?? []) add(r["Product ID"], day(r["Transaction Date"]), money(r["Quantity In"]) ?? 0);
  for (const r of t.stockOut ?? []) add(r["Product ID"], day(r["Transaction Date"]), -(money(r["Quantity Out"]) ?? 0));
  const out: Row[] = [];
  for (const [p, ms] of moves) {
    const item = items.get(p);
    const name = text(item?.["Item Name"]) ?? "(unknown item)";
    const group = text(item?.["Item Identifier"]);
    const base = { item: name, zohoItem: name, itemStatus: text(item?.["Status"]), itemGroup: group, brand: brandOf(text(item?.["Brand"]), name), kind: kindOf(group, name) };
    ms.sort((a, b) => (a.d < b.d ? -1 : 1));
    let i = 0, level = 0;
    for (let m = ms[0].d.slice(0, 7); m <= today.slice(0, 7); m = nextMonth(m)) {
      const end = m === today.slice(0, 7) ? today : new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
      while (i < ms.length && ms[i].d <= end) level += ms[i++].q;
      // FIFO rounding leaves 0.0001s; Zoho below zero (sold before the purchase was entered) counts 0, as in "Stock now".
      out.push({ ...base, date: end, onHand: level > 0.001 ? level : 0 });
    }
  }
  return out;
}
const nextMonth = (m: string) => { const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
const SOLD_DAYS = 90;

/**
 * Stock now (owner, 28 Oct: ANALYTICS-PLAN §11 #27) — one row per item Zoho keeps stock of (any stock movement).
 * On hand = what's left of each purchase after Zoho's FIFO ("Quantity Available"), worth its purchase price. Zoho puts
 * a negative "backup" row when something is invoiced with no stock recorded (often services / licences set up as
 * goods): those items count 0 on hand and are listed as "Sold more than bought". Committed = still to invoice on PIs
 * from the last BOOKED_DAYS days (older open PIs are mostly stale — 5,100 units on PIs over 6 months old on 28 Oct).
 * Days of cover = available ÷ what sold in the last 90 days.
 */
/** On hand per item (the same sum as `stockRows`) — the quotation popup's stock column. */
export function onHandByItem(t: RawTables): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of t.stockIn ?? []) {
    const left = money(r["Quantity Available"]) ?? 0;
    if (left > 0) m.set(r["Product ID"], (m.get(r["Product ID"]) ?? 0) + left);
  }
  for (const [k, v] of m) if (v <= 0.001) m.delete(k);
  return m;
}

function stockRows(t: RawTables, today: string): Row[] {
  const items = new Map((t.items ?? []).map((i) => [i["Item ID"], i]));
  const s = new Map<string, { left: number; value: number; short: number; sold: number; lastSold: string | null; committed: number }>();
  const get = (p: string) => s.get(p) ?? s.set(p, { left: 0, value: 0, short: 0, sold: 0, lastSold: null, committed: 0 }).get(p)!;
  for (const r of t.stockIn ?? []) {
    const left = money(r["Quantity Available"]) ?? 0;
    const x = get(r["Product ID"]);
    if (left >= 0) { x.left += left; x.value += left * (money(r["Price (BCY)"]) ?? 0); } else x.short -= left;
  }
  const since = new Date(Date.parse(today) - SOLD_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const r of t.stockOut ?? []) {
    const date = day(r["Transaction Date"]);
    const x = get(r["Product ID"]);
    if (!/invoice/i.test(r["EntityType"] ?? "") || !date) continue; // sales only — not adjustments / returns to vendors
    if (date > since && date <= today) x.sold += money(r["Quantity Out"]) ?? 0;
    if (!x.lastSold || date > x.lastSold) x.lastSold = date;
  }
  const bookedFrom = new Date(Date.parse(today) - BOOKED_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recentPi = new Set((t.salesOrders ?? []).filter((o) => !/void|draft|closed/i.test(o["Status"] ?? "") && (day(o["Order Date"]) ?? "") >= bookedFrom).map((o) => o["Sales order ID"]));
  for (const li of t.salesOrderItems ?? []) {
    if (!recentPi.has(li["Sales order ID"]) || !s.has(li["Product ID"])) continue;
    const open = (money(li["Quantity"]) ?? 0) - (money(li["Quantity Invoiced"]) ?? 0) - (money(li["Quantity Cancelled"]) ?? 0);
    if (open > 0) s.get(li["Product ID"])!.committed += open;
  }
  return [...s].map(([p, x]) => {
    const item = items.get(p);
    // A tiny fraction left by FIFO rounding (0.0001) is nothing.
    const onHand = x.left > 0.001 ? x.left : 0;
    const available = onHand - x.committed;
    const perDay = x.sold / SOLD_DAYS;
    const cover = perDay > 0 ? available / perDay : null;
    const reorder = money(item?.["Reorder Level"]) ?? 0;
    // Below zero: mostly bought per order and invoiced without stock (N95 masks, bandages) or services set up as goods
    // — not stock to reorder, so their own band (28 Oct: they filled "To reorder").
    const below = x.short > 0 && onHand === 0;
    return {
      date: x.lastSold, item: text(item?.["Item Name"]) ?? "(unknown item)", itemGroup: text(item?.["Item Identifier"]),
      itemStatus: text(item?.["Status"]),
      stock: below ? "Sold more than bought" : onHand > 0 ? "In stock" : "Out of stock",
      cover: below ? "Below zero in Zoho" : cover === null ? (onHand > 0 ? "Not sold in 90 days" : "No stock, not selling")
        : available <= 0 ? "Out of stock, still selling" : cover < 30 ? "Under 30 days" : cover < 90 ? "30–90 days" : cover < 180 ? "90–180 days" : "Over 180 days",
      reorder: reorder <= 0 ? "No reorder level" : available < reorder ? "Below reorder level" : "Above reorder level",
      onHand, value: x.value, committed: x.committed, available, sold90: x.sold, short: x.short,
    };
  });
}
