import "server-only";
import { db } from "./db";
import { type Raw, buyPrices, day, money, shareKits } from "./analytics/build";
import type { Row } from "./analytics/model";
import { STALE_MS, copyTables, dataState, datasetRows, refreshAnalyticsData } from "./analytics/source";
import { type Buy, type Judged, type MLine, type OpenQuote, type QLine, judge, openQuotes } from "./margin";

/*
 * The margin report's lines (margin.ts): the Zoho Analytics copy's margin rows, plus the invoices too new for that copy
 * (it runs up to a day behind) from the Sales board's own copies (`salesDetails`), costed at the average purchase price
 * until Zoho's cost arrives. Read-only everywhere.
 */
const TRAINING = /training services/i;
const QUOTE_DAYS = 90; // as Reports: no answer after this many days = expired
const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(v) || 0;

export type MarginData = { lines: Judged[]; quotes: OpenQuote[]; buys: Buy[]; training: { date: string; person: string; amount: number }[]; unread: number; refreshedAt: string | null };
type Detail = { _id: string; doc: Record<string, unknown> };

let memo: { key: string; at: number; data: MarginData } | null = null;

export async function marginData(today: string, fresh = false): Promise<MarginData> {
  const { rows, state } = await datasetRows(today, false, true);
  const key = `${state.refreshedAt ?? ""}|${today}`;
  if (!fresh && memo && memo.key === key && Date.now() - memo.at < 60_000) return memo.data;
  if (!rows.margin) throw new Error("The margin isn't ready yet: the Zoho data is still being copied. Try again in a few minutes.");
  const t = await copyTables(state, true);
  const price = buyPrices(t);
  const items = new Map((t.items ?? []).map((i) => [i["Item ID"], i]));
  const lines: MLine[] = rows.margin.filter((r) => r.date).map((r) => ({
    date: str(r.date), invoice: str(r.invoice), customer: str(r.customer), person: str(r.salesperson), item: str(r.zohoItem ?? r.item), group: str(r.itemGroup), brand: str(r.brand),
    qty: num(r.qty), amount: num(r.amount), cost: typeof r.cost === "number" ? r.cost : null, estimated: false,
  }));
  // Packing and freight lines are often renamed on the line: either name tells.
  rows.margin.filter((r) => r.date).forEach((r, i) => { if (/packing|freight|courier|shipping|forwarding/i.test(str(r.item)) && !/packing|freight|courier|shipping|forwarding/i.test(lines[i].item)) lines[i].item = str(r.item); });
  const training = rows.sales.filter((r) => r.date && TRAINING.test(str(r.itemGroup))).map((r) => ({ date: str(r.date), person: str(r.salesperson), amount: num(r.amount) }));

  // Invoices not in the copy yet (every invoice there counts, whatever its status).
  const known = new Set((t.invoices ?? []).map((i) => i["Invoice Number"]));
  const from = new Date(Date.parse(today) - 45 * 86_400_000).toISOString().slice(0, 10);
  const d = await db();
  const docs = (await d.collection<Detail>("salesDetails").find({ "doc.date": { $gte: from } }, {
    projection: Object.fromEntries(["invoice_id", "invoice_number", "date", "status", "customer_name", "salesperson_name", "exchange_rate", "sub_total", "discount_amount", "is_discount_before_tax", "line_items"].map((k) => [`doc.${k}`, 1])),
  }).toArray()).filter((x) => x._id.startsWith("invoices:") && str(x.doc?.date) >= from && !known.has(str(x.doc.invoice_number)) && !/void|draft/i.test(str(x.doc.status)));
  for (const { doc } of docs) {
    const rate = num(doc.exchange_rate) || 1, sub = num(doc.sub_total), disc = doc.is_discount_before_tax === false ? 0 : num(doc.discount_amount);
    const share = sub > 0 && disc > 0 ? (sub - disc) / sub : 1;
    const mine: (Omit<MLine, "estimated"> & Row)[] = [];
    for (const li of (doc.line_items as Record<string, unknown>[] | undefined) ?? []) {
      const it: Raw | undefined = items.get(str(li.item_id)), qty = num(li.quantity), amount = num(li.item_total) * rate * share;
      if (TRAINING.test(it?.["Item Identifier"] ?? "")) { training.push({ date: str(doc.date), person: str(doc.salesperson_name), amount }); continue; }
      const unit = price(str(li.item_id), str(doc.date));
      const cost = unit === null ? null : unit * qty;
      mine.push({ date: str(doc.date), invoice: str(doc.invoice_number), customer: str(doc.customer_name), person: str(doc.salesperson_name), item: str(it?.["Item Name"] ?? li.name), group: str(it?.["Item Identifier"]), brand: str(it?.["Brand"]), qty, amount, cost, costSource: cost === null ? "No cost in Zoho" : "Average purchase price" });
    }
    shareKits(mine);
    for (const l of mine) lines.push({ date: l.date, invoice: l.invoice, customer: l.customer, person: l.person, item: l.item, group: l.group, brand: l.brand, qty: l.qty, amount: l.amount, cost: l.cost, estimated: true });
  }
  const have = new Set(docs.map((x) => x._id));
  const unread = (await d.collection<{ _id: string; kind: string; date?: string; row: Record<string, unknown> }>("salesDocs").find({ kind: "invoices", date: { $gte: from } }, { projection: { kind: 1, date: 1, "row.status": 1, "row.invoice_number": 1 } }).toArray())
    .filter((r) => r.kind === "invoices" && str(r.date) >= from && !/void|draft/i.test(str(r.row.status)) && !known.has(str(r.row.invoice_number)) && !have.has(r._id)).length;

  // Quotes waiting for an answer.
  const customers = new Map((t.customers ?? []).map((c) => [c["Customer ID"], c["Customer Name"]]));
  const people = new Map((t.salespersons ?? []).map((p) => [p["Salesperson ID"], p["Name"]]));
  const oldest = new Date(Date.parse(today) - QUOTE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const open = new Map((t.quotes ?? []).filter((q) => !/accepted|invoiced|declined|rejected|expired|draft|void/i.test(q["Status"] ?? "") && (day(q["Quote Date"]) ?? "") >= oldest).map((q) => [q["Quote ID"], q]));
  const ql: (QLine & Row)[] = [];
  for (const li of t.quoteItems ?? []) {
    const q = open.get(li["Quote ID"]), it = items.get(li["Product ID"]);
    const name = `${it?.["Item Name"] ?? ""} ${li["Item Name"] ?? ""}`;
    if (!q || TRAINING.test(it?.["Item Identifier"] ?? "") || /packing|freight|courier|shipping|forwarding/i.test(name)) continue;
    const unit = price(li["Product ID"], today), qty = money(li["Quantity"]) ?? 0;
    ql.push({ invoice: li["Quote ID"], costSource: unit === null ? "No cost in Zoho" : "Average purchase price", quote: str(q["Quote Number"]), date: day(q["Quote Date"]) ?? "", customer: str(customers.get(q["Customer ID"])), person: str(people.get(q["Salesperson ID"])), amount: money(li["Sub Total (BCY)"]) ?? 0, cost: unit === null ? null : unit * qty });
  }
  shareKits(ql); // a kit priced as one line, its parts at ₹0: the parts' cost is the kit's
  const buys: Buy[] = (rows.purchases ?? []).filter((r) => r.date).map((r) => ({ item: str(r.zohoItem ?? r.item), date: str(r.date), qty: num(r.qty), amount: num(r.amount) }));
  const data: MarginData = { lines: judge(lines), quotes: openQuotes(ql), buys, training, unread, refreshedAt: state.refreshedAt ?? null };
  memo = { key, at: Date.now(), data };
  return data;
}

/** The Zoho copy is renewed when it's older than Reports lets it be (after the answer; never twice at once). */
export async function renewIfOld(): Promise<void> {
  const s = await dataState();
  if (!s.running && (s.refreshedAt ? Date.now() - Date.parse(s.refreshedAt) : Infinity) > STALE_MS) await refreshAnalyticsData("Overview (automatic)").catch(() => undefined);
}
