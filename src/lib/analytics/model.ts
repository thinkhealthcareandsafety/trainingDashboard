import { BOOKED_DAYS } from "./goal";

/*
 * The Reports page's semantic layer (ANALYTICS-PLAN.md §3): every dataset, field and measure, defined once with a
 * plain-English definition. Reports, dashboards and (later) the AI all build on these — nobody writes queries — so two
 * charts of the same measure can never disagree. Pure: shared by the server (query.ts) and the browser (builder).
 */

export type Value = string | number | null | string[];
export type Row = Record<string, Value>;

export type FieldKind = "text" | "date";
/** `order`: the values' natural order (age bands, stages) — used instead of A–Z when sorting by label. */
export type Field = { key: string; label: string; kind: FieldKind; multi?: boolean; hint?: string; order?: string[] };
export type Format = "inr" | "count" | "pct" | "days";
/** Only the rows whose `field` is one of `values` (e.g. revenue from repeat invoices only). */
export type Where = { field: string; values: string[] };
type Agg =
  | { agg: "count"; where?: Where }
  | { agg: "sum" | "avg"; field: string; where?: Where }
  | { agg: "distinct"; field: string; where?: Where }
  | { agg: "ratio"; num: string; den: string; scale?: number }
  /** Share (%) of `sum` that the top `n` values of `field` make up — "top 10 customers' share". */
  | { agg: "topShare"; field: string; sum: string; n: number };
/** `better: "down"` — a fall is good news (overdue, days to pay, dependence on a few customers): KPIs colour it green. */
export type Measure = { key: string; label: string; format: Format; def: string; better?: "down" } & Agg;
export type BoardNeed = "training" | "aed";
export type Dataset = {
  key: string;
  label: string;
  desc: string;
  /** Where the rows come from — shown under the builder's data picker. */
  source: string;
  /** The field the date range and "by month / FY …" use. */
  dateField: string;
  fields: Field[];
  /** Numbers a filter can take a range of (owner, 27 Oct: "custom filters") — e.g. invoices of ₹1 L or more. */
  ranges?: { key: string; label: string }[];
  measures: Measure[];
  /** Who may read it: members whose boards include this one (money lives on the Training board). */
  board: BoardNeed;
  /** Costs and margins (owner, 28 Oct: ANALYTICS-PLAN §11 #25–26) — Admin only, also refused by the server. */
  admin?: boolean;
};
export const canRead = (d: Dataset, boards: string[], admin: boolean) => boards.includes(d.board) && (!d.admin || admin);

const DATE: Field = { key: "date", label: "Date", kind: "date" };
/** Stock's days-of-cover bands, most urgent first. */
export const COVER_ORDER = ["Out of stock, still selling", "Under 30 days", "30–90 days", "90–180 days", "Over 180 days", "Not sold in 90 days", "No stock, not selling", "Below zero in Zoho"];
const CUSTOMER: Field[] = [
  { key: "customer", label: "Customer", kind: "text" },
  { key: "customerType", label: "Customer type", kind: "text", hint: "New / Old Customer, New / Old Reseller (Zoho Books)" },
  { key: "sector", label: "Sector", kind: "text" },
  { key: "chain", label: "Hotel chain", kind: "text", hint: "Zoho Books “Special Identifier”: Marriott Hotels, Lemon Tree, Hyatt Hotels, Medic Assist" },
  { key: "state", label: "State", kind: "text", hint: "Billing state" },
  { key: "city", label: "City", kind: "text", hint: "Billing city" },
];

export const DATASETS: Dataset[] = [
  {
    key: "sales",
    label: "Sales",
    desc: "Every invoice line in Zoho Books — products, consumables, trainings, services.",
    source: "Zoho Analytics (synced from Zoho Books): Invoices + Invoice Items + Customers + Items",
    dateField: "date",
    board: "training",
    fields: [
      { ...DATE, label: "Invoice date" },
      { key: "invoice", label: "Invoice", kind: "text" },
      ...CUSTOMER,
      { key: "salesperson", label: "Sales person", kind: "text" },
      { key: "item", label: "Item", kind: "text" },
      { key: "itemGroup", label: "Item group", kind: "text", hint: "Zoho Books “Item Identifier”: All AEDs, AED Pads, Training Services, Fire Safety…" },
      { key: "productType", label: "Product type", kind: "text", multi: true, hint: "Invoice field “Product Type” (an invoice can have several)" },
      { key: "businessType", label: "Business type", kind: "text", hint: "Products / Services / Training" },
      { key: "leadSource", label: "Lead source", kind: "text" },
      { key: "status", label: "Invoice status", kind: "text" },
      { key: "segment", label: "Customer segment", kind: "text", hint: "From each customer's history today — New: first bought in the last 180 days · Champions: bought in the last 180 days and 4+ invoices · Loyal: last 365 days, 2+ invoices · Promising: last 365 days, 1 invoice · At risk: 1–2 years ago, 2+ invoices · Hibernating: 1–2 years ago, 1 invoice · Lost: over 2 years ago", order: ["Champions", "Loyal", "New", "Promising", "At risk", "Hibernating", "Lost"] },
      { key: "cohort", label: "First bought (FY)", kind: "text", hint: "The financial year of the customer's first invoice (Zoho Books has them from Jul 2021)" },
      { key: "channel", label: "Resellers or direct", kind: "text", hint: "Resellers = customer type New / Old Reseller; everyone else is Direct" },
      { key: "fy", label: "Financial year", kind: "text" },
      { key: "monthName", label: "Month of the year", kind: "text", order: ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"] },
      { key: "repeat", label: "First or repeat", kind: "text", hint: "Is this invoice the customer's first ever in Zoho Books (since Jul 2021), or a repeat?", order: ["First invoice", "Repeat"] },
    ],
    ranges: [{ key: "docValue", label: "Invoice value" }],
    measures: [
      { key: "revenue", label: "Revenue", format: "inr", agg: "sum", field: "amount", def: "Invoice line totals before tax (after discounts), void and draft invoices left out." },
      { key: "revenueTax", label: "Revenue incl. tax", format: "inr", agg: "sum", field: "amountTax", def: "Invoice line totals including GST." },
      { key: "units", label: "Units", format: "count", agg: "sum", field: "qty", def: "Quantity on the invoice lines." },
      { key: "invoices", label: "Invoices", format: "count", agg: "distinct", field: "invoice", def: "Number of different invoices." },
      { key: "customers", label: "Customers billed", format: "count", agg: "distinct", field: "customer", def: "Number of different customers invoiced." },
      { key: "avgInvoice", label: "Average invoice", format: "inr", agg: "ratio", num: "revenue", den: "invoices", def: "Revenue ÷ invoices." },
      { key: "avgPrice", label: "Average selling price", format: "inr", agg: "ratio", num: "revenue", den: "units", def: "Revenue ÷ units: the average price per unit sold (after discounts, before tax). Compare like with like — one item group or item at a time." },
      { key: "newCustomers", label: "New customers", format: "count", agg: "distinct", field: "customer", where: { field: "repeat", values: ["First invoice"] }, def: "Customers whose first-ever invoice (Zoho Books has them from Jul 2021) falls in the period." },
      { key: "repeatRevenue", label: "Repeat revenue", format: "inr", agg: "sum", field: "amount", where: { field: "repeat", values: ["Repeat"] }, def: "Revenue from customers' second and later invoices." },
      { key: "repeatShare", label: "Repeat revenue share", format: "pct", agg: "ratio", num: "repeatRevenue", den: "revenue", scale: 100, def: "Repeat revenue ÷ revenue: how much comes from customers who bought before." },
      { key: "top10Share", label: "Top 10 customers' share", better: "down", format: "pct", agg: "topShare", field: "customer", sum: "amount", n: 10, def: "The 10 biggest customers' revenue ÷ all revenue — how much rides on a few customers." },
    ],
  },
  {
    key: "invoices",
    label: "Invoices & receivables",
    desc: "One row per invoice — what's billed, what's still owed and how old it is.",
    source: "Zoho Analytics (synced from Zoho Books): Invoices + Customers",
    dateField: "date",
    board: "training",
    fields: [
      { ...DATE, label: "Invoice date" },
      { key: "invoice", label: "Invoice", kind: "text" },
      ...CUSTOMER,
      { key: "salesperson", label: "Sales person", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "ageBand", label: "Age (overdue)", kind: "text", hint: "Days past the due date of what's still owed: Not due / 1–30 / 31–60 / 61–90 / 90+", order: ["Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days", "Paid"] },
      { key: "productType", label: "Product type", kind: "text", multi: true },
      { key: "businessType", label: "Business type", kind: "text" },
      { key: "leadSource", label: "Lead source", kind: "text" },
    ],
    ranges: [{ key: "docValue", label: "Invoice value" }],
    measures: [
      { key: "count", label: "Invoices", format: "count", agg: "count", def: "Number of invoices (void and draft left out)." },
      { key: "billed", label: "Billed", format: "inr", agg: "sum", field: "amount", def: "Invoice sub-totals before tax, less invoice-level discounts." },
      { key: "outstanding", label: "Outstanding", format: "inr", agg: "sum", field: "balance", def: "What customers still owe on these invoices (Zoho's balance, incl. tax)." },
      { key: "overdue", label: "Overdue", better: "down", format: "inr", agg: "sum", field: "overdue", def: "Outstanding on invoices past their due date." },
      { key: "overduePct", label: "Overdue %", better: "down", format: "pct", agg: "ratio", num: "overdue", den: "outstanding", scale: 100, def: "Overdue ÷ outstanding: how much of what's owed is late." },
      { key: "daysToPay", label: "Days to pay", better: "down", format: "days", agg: "avg", field: "daysToPay", def: "Average days from invoice date to the last payment, on paid invoices." },
    ],
  },
  {
    key: "quotes",
    label: "Quotes",
    desc: "One row per quotation — how many go out, their value, and how many are won.",
    source: "Zoho Analytics (synced from Zoho Books): Quotes + Customers",
    dateField: "date",
    board: "training",
    fields: [
      { ...DATE, label: "Quote date" },
      { key: "quote", label: "Quote", kind: "text" },
      ...CUSTOMER,
      { key: "salesperson", label: "Sales person", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "outcome", label: "Outcome", kind: "text", hint: "Won (accepted / invoiced), Lost (declined), Expired, Open" },
      { key: "age", label: "Age", kind: "text", hint: "Days since the quote was made — a quote is valid for 15 days, then a new one is made", order: ["0–15 days", "16–30 days", "31–90 days", "Over 90 days"] },
    ],
    ranges: [{ key: "docValue", label: "Quote value" }],
    measures: [
      { key: "count", label: "Quotes", format: "count", agg: "count", def: "Number of quotations (drafts left out)." },
      { key: "value", label: "Quote value", format: "inr", agg: "sum", field: "amount", def: "Quotation sub-totals before tax." },
      { key: "validOpen", label: "Open & still valid", format: "inr", agg: "sum", field: "amount", where: { field: "valid", values: ["yes"] }, def: "Value of open quotes at most 15 days old (a quote is valid for 15 days)." },
      { key: "validOpenCount", label: "Open quotes still valid", format: "count", agg: "count", where: { field: "valid", values: ["yes"] }, def: "Open quotes at most 15 days old." },
      { key: "won", label: "Quotes won", format: "count", agg: "sum", field: "won", def: "Quotations accepted or invoiced." },
      { key: "invoicedCount", label: "Quotes invoiced", format: "count", agg: "count", where: { field: "invoiced", values: ["yes"] }, def: "Quotations that became an invoice (Zoho status Invoiced, or an invoice made from them)." },
      { key: "daysToInvoice", label: "Days to invoice", better: "down", format: "days", agg: "avg", field: "daysToInvoice", def: "Average days from the quote to its first invoice, on quotes that were invoiced." },
      { key: "winRate", label: "Win rate", format: "pct", agg: "ratio", num: "won", den: "count", scale: 100, def: "Quotes won ÷ quotes." },
    ],
  },
  {
    key: "orders",
    label: "PIs (proforma invoices)",
    desc: "One row per PI — what's been ordered and what's still to invoice.",
    source: "Zoho Analytics (synced from Zoho Books): Sales Orders + Sales Order Items + Customers",
    dateField: "date",
    board: "training",
    fields: [
      { ...DATE, label: "PI date" },
      { key: "pi", label: "PI", kind: "text" },
      ...CUSTOMER,
      { key: "salesperson", label: "Sales person", kind: "text" },
      { key: "invoiced", label: "Invoiced?", kind: "text", hint: "Not invoiced / Part invoiced / Invoiced / Closed (closed by hand in Zoho)", order: ["Not invoiced", "Part invoiced", "Invoiced", "Closed"] },
    ],
    ranges: [{ key: "docValue", label: "PI value" }],
    measures: [
      { key: "count", label: "PIs", format: "count", agg: "count", def: "Number of PIs (void and draft left out)." },
      { key: "value", label: "PI value", format: "inr", agg: "sum", field: "amount", def: "PI sub-totals before tax, less PI-level discounts." },
      { key: "toInvoice", label: "Still to invoice", format: "inr", agg: "sum", field: "open", def: "The part of each PI not invoiced yet (lines' quantity not invoiced or cancelled), before tax. Closed PIs count 0." },
    ],
  },
  {
    key: "payments",
    label: "Payments received",
    desc: "One row per customer payment.",
    source: "Zoho Analytics (synced from Zoho Books): Customer Payments + Customers",
    dateField: "date",
    board: "training",
    fields: [{ ...DATE, label: "Payment date" }, ...CUSTOMER, { key: "mode", label: "Payment mode", kind: "text" }],
    measures: [
      { key: "received", label: "Received", format: "inr", agg: "sum", field: "amount", def: "Payment amounts." },
      { key: "tds", label: "TDS withheld", format: "inr", agg: "sum", field: "tds", def: "Tax withheld by the customer on these payments." },
      { key: "count", label: "Payments", format: "count", agg: "count", def: "Number of payments." },
    ],
  },
  {
    key: "trainings",
    label: "Trainings",
    desc: "The Training board's trainings — one per deal, as the Overview counts them.",
    source: "The Training board (live) + Zoho customers",
    dateField: "date",
    board: "training",
    fields: [
      { ...DATE, label: "Training date", hint: "The last training day — completed trainings count in that month, as on the Overview" },
      ...CUSTOMER.slice(0, 4),
      { key: "trainer", label: "Trainer", kind: "text", multi: true, hint: "A training with two trainers counts for each" },
      { key: "trainingType", label: "Training type", kind: "text" },
      { key: "status", label: "Status", kind: "text", hint: "Completed / Scheduled / Postponed / To mark completed" },
    ],
    measures: [
      { key: "count", label: "Trainings", format: "count", agg: "count", def: "Number of trainings (deals), to-be-decided ones left out." },
      { key: "people", label: "People", format: "count", agg: "sum", field: "people", def: "People trained — the number checked when scheduling, else the PI's quantity." },
      { key: "perTraining", label: "People per training", format: "count", agg: "ratio", num: "people", den: "count", def: "People ÷ trainings." },
      { key: "value", label: "Training value", format: "inr", agg: "sum", field: "value", def: "The training lines of each training's PI (or its invoice), before tax. Trainings still on a quote have none." },
      { key: "peopleValued", label: "People (with a value)", format: "count", agg: "sum", field: "peopleValued", def: "People on trainings that have a value (PI or invoice)." },
      { key: "valuedCount", label: "Trainings (with a value)", format: "count", agg: "sum", field: "valued", def: "Trainings that have a value (PI or invoice)." },
      { key: "valuePerPerson", label: "Value per person trained", format: "inr", agg: "ratio", num: "value", den: "peopleValued", def: "Training value ÷ people, on trainings that have a value." },
      { key: "valuePerTraining", label: "Value per training", format: "inr", agg: "ratio", num: "value", den: "valuedCount", def: "Training value ÷ trainings, on trainings that have a value." },
    ],
  },
  {
    // Owner, 28 Oct (ANALYTICS-PLAN §11 #25): gross margin on goods. Admin only.
    key: "margin",
    label: "Margin (goods)",
    desc: "Every invoice line for goods (trainings left out — Zoho has no cost for them) with what it cost us: Zoho's FIFO cost, else the average purchase price on bills.",
    source: "Zoho Analytics (synced from Zoho Books / Inventory): Invoice Items + FIFO Mapping + Stock Out Flow + Bills + Bill Item",
    dateField: "date",
    board: "training",
    admin: true,
    fields: [
      { ...DATE, label: "Invoice date" },
      { key: "invoice", label: "Invoice", kind: "text" },
      ...CUSTOMER,
      { key: "salesperson", label: "Sales person", kind: "text" },
      { key: "item", label: "Item", kind: "text" },
      { key: "itemGroup", label: "Item group", kind: "text", hint: "Zoho Books “Item Identifier”" },
      { key: "costSource", label: "Cost from", kind: "text", hint: "Zoho FIFO (stock items: the purchases the units came from) · Kit (a kit sold as one line, its parts listed at ₹0 on the same invoice: their FIFO cost) · Average purchase price (bills in the 12 months before the sale) · No cost in Zoho (kits / bundles with no bill of their own)", order: ["Zoho FIFO", "Kit (parts' FIFO cost)", "Average purchase price", "Kit part (cost on the kit)", "No cost in Zoho"] },
    ],
    measures: [
      { key: "revenue", label: "Revenue (goods)", format: "inr", agg: "sum", field: "amount", def: "Goods invoice lines before tax, after discounts (trainings left out)." },
      { key: "costedRevenue", label: "Revenue with a cost", format: "inr", agg: "sum", field: "costedAmount", def: "Goods revenue on lines whose cost Zoho has." },
      { key: "cost", label: "Cost of goods sold", format: "inr", agg: "sum", field: "cost", def: "What the goods sold cost us, before tax: Zoho's FIFO cost, else the average purchase price on bills." },
      { key: "profit", label: "Gross margin", format: "inr", agg: "sum", field: "profit", def: "Revenue − cost, on lines whose cost Zoho has." },
      { key: "marginPct", label: "Gross margin %", format: "pct", agg: "ratio", num: "profit", den: "costedRevenue", scale: 100, def: "Gross margin ÷ revenue with a cost." },
      { key: "noCost", label: "Revenue with no cost", format: "inr", agg: "sum", field: "amount", where: { field: "costSource", values: ["No cost in Zoho"] }, better: "down", def: "Goods revenue Zoho has no cost for (kits / bundles with no bill of their own) — left out of the margin." },
      { key: "units", label: "Units", format: "count", agg: "sum", field: "qty", def: "Quantity on the invoice lines." },
    ],
  },
  {
    // Owner, 28 Oct (ANALYTICS-PLAN §11 #26): what shipping costs us. Admin only, like margins.
    key: "freight",
    label: "Freight",
    desc: "One row per invoice — the freight paid to send it (invoice field “Freight Incurred”, filled in since Apr 2025) and the shipping charged to the customer.",
    source: "Zoho Analytics (synced from Zoho Books): Invoices + Customers",
    dateField: "date",
    board: "training",
    admin: true,
    fields: [
      { ...DATE, label: "Invoice date" },
      { key: "invoice", label: "Invoice", kind: "text" },
      ...CUSTOMER,
      { key: "salesperson", label: "Sales person", kind: "text" },
      { key: "courier", label: "Courier", kind: "text", hint: "Invoice field “Shipped by” (spellings merged)" },
      { key: "shipped", label: "Shipped?", kind: "text", hint: "yes = freight was paid on the invoice", order: ["yes", "no"] },
      { key: "businessType", label: "Business type", kind: "text" },
    ],
    measures: [
      { key: "freight", label: "Freight paid", format: "inr", agg: "sum", field: "freight", better: "down", def: "Invoice field “Freight Incurred”: what we paid to send the order (filled in on invoices since Apr 2025)." },
      { key: "charged", label: "Shipping charged", format: "inr", agg: "sum", field: "charged", def: "The shipping charge on the invoice, before tax — what the customer paid towards it." },
      { key: "revenue", label: "Revenue", format: "inr", agg: "sum", field: "amount", def: "Invoice sub-totals before tax, less invoice-level discounts (every invoice, shipped or not)." },
      { key: "shippedRevenue", label: "Revenue shipped", format: "inr", agg: "sum", field: "amount", where: { field: "shipped", values: ["yes"] }, def: "Revenue of the invoices that had freight." },
      { key: "freightPct", label: "Freight % of revenue", format: "pct", agg: "ratio", num: "freight", den: "revenue", scale: 100, better: "down", def: "Freight paid ÷ all revenue." },
      { key: "freightPctShipped", label: "Freight % of what was shipped", format: "pct", agg: "ratio", num: "freight", den: "shippedRevenue", scale: 100, better: "down", def: "Freight paid ÷ revenue of the invoices that had freight." },
      { key: "recovered", label: "Shipping recovered", format: "pct", agg: "ratio", num: "charged", den: "freight", scale: 100, def: "Shipping charged ÷ freight paid: how much of it customers paid." },
      { key: "shipments", label: "Shipments", format: "count", agg: "count", where: { field: "shipped", values: ["yes"] }, def: "Invoices with freight paid." },
      { key: "perShipment", label: "Freight per shipment", format: "inr", agg: "ratio", num: "freight", den: "shipments", better: "down", def: "Freight paid ÷ shipments." },
    ],
  },
  {
    // Owner, 28 Oct (ANALYTICS-PLAN §11 #27): stock on hand and days of cover. A snapshot — today, not a period.
    key: "stock",
    label: "Stock now",
    desc: "One row per item Zoho keeps stock of — what's on hand today, what it cost, and how long it lasts at the recent rate of sales.",
    source: "Zoho Analytics (synced from Zoho Books / Inventory): Stock In Flow + Stock Out Flow + Items + Sales Orders",
    dateField: "date",
    board: "training",
    fields: [
      { ...DATE, label: "Last sold", hint: "The item's last invoice — stock is today's, whatever the period" },
      { key: "item", label: "Item", kind: "text" },
      { key: "itemGroup", label: "Item group", kind: "text", hint: "Zoho Books “Item Identifier”" },
      { key: "itemStatus", label: "Item status", kind: "text", hint: "Active / Inactive in Zoho Books" },
      { key: "stock", label: "Stock", kind: "text", hint: "In stock · Out of stock · Sold more than bought (Zoho shows it below zero — a purchase or stock adjustment is missing there)", order: ["In stock", "Out of stock", "Sold more than bought"] },
      { key: "cover", label: "Days of cover", kind: "text", hint: "How long what's available lasts at the last 90 days' rate of sales", order: COVER_ORDER },
      { key: "reorder", label: "Reorder level", kind: "text", hint: "Available against the item's reorder level in Zoho (few items have one)", order: ["Below reorder level", "Above reorder level", "No reorder level"] },
    ],
    measures: [
      { key: "value", label: "Stock value (cost)", format: "inr", agg: "sum", field: "value", def: "What the stock on hand cost: each purchase still in stock × its purchase price, before tax (Zoho's FIFO)." },
      { key: "onHand", label: "Units on hand", format: "count", agg: "sum", field: "onHand", def: "Units in stock now (Zoho Inventory). Items Zoho shows below zero count 0." },
      { key: "committed", label: "Units committed", format: "count", agg: "sum", field: "committed", def: `Units still to invoice on PIs from the last ${BOOKED_DAYS} days (older open PIs are mostly stale).` },
      { key: "available", label: "Units available", format: "count", agg: "sum", field: "available", def: "On hand − committed." },
      { key: "sold90", label: "Units sold (90 days)", format: "count", agg: "sum", field: "sold90", def: "Units invoiced in the last 90 days." },
      { key: "daysCover", label: "Days of cover", format: "days", agg: "ratio", num: "available", den: "sold90", scale: 90, def: "Available ÷ units sold in the last 90 days × 90: how many days the stock lasts at that rate. Compare one item at a time." },
      { key: "items", label: "Items in stock", format: "count", agg: "count", where: { field: "stock", values: ["In stock"] }, def: "Items with at least one unit on hand." },
      { key: "toReorder", label: "Items to reorder", better: "down", format: "count", agg: "count", where: { field: "cover", values: ["Out of stock, still selling", "Under 30 days"] }, def: "Items that sold in the last 90 days and have under 30 days of cover (or none left)." },
      { key: "oversold", label: "Items below zero in Zoho", better: "down", format: "count", agg: "count", where: { field: "stock", values: ["Sold more than bought"] }, def: "Items invoiced with no stock recorded — Zoho shows them below zero until a purchase or stock adjustment is entered." },
      { key: "short", label: "Units below zero", format: "count", agg: "sum", field: "short", def: "How far below zero Zoho has the item (units invoiced with no stock recorded)." },
    ],
  },
];

export const datasetOf = (key: string) => DATASETS.find((d) => d.key === key);
export const fieldOf = (d: Dataset, key: string) => (key === "date" ? d.fields.find((f) => f.key === "date") : d.fields.find((f) => f.key === key));
export const measureOf = (d: Dataset, key: string) => d.measures.find((m) => m.key === key);

/* ---------------- Formatting (Indian style) ---------------- */

/** ₹ in lakh / crore: ₹3.4L, ₹1.2Cr, ₹48,500. */
export function inrShort(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)}L`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")}`;
}
export function formatValue(v: number | null | undefined, f: Format, short = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (f === "inr") return short ? inrShort(v) : `₹${Math.round(v).toLocaleString("en-IN")}`;
  if (f === "pct") return `${v.toFixed(v < 10 ? 1 : 0)}%`;
  if (f === "days") return `${Math.round(v)} d`;
  return Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v).toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN");
}

/* ---------------- Dates: Indian fiscal year (April–March) ---------------- */

export type Grain = "day" | "week" | "month" | "quarter" | "fy";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** FY of a date: 2026-10-22 → 2026 (FY 2026-27). */
export const fyOf = (ymd: string) => { const y = Number(ymd.slice(0, 4)); return Number(ymd.slice(5, 7)) >= 4 ? y : y - 1; };
export function grainKey(ymd: string, g: Grain): string {
  if (g === "day") return ymd.slice(0, 10);
  if (g === "month") return ymd.slice(0, 7);
  const fy = fyOf(ymd);
  if (g === "fy") return `${fy}`;
  if (g === "quarter") return `${fy}-Q${Math.floor(((Number(ymd.slice(5, 7)) + 8) % 12) / 3) + 1}`;
  // ISO-ish week: the Monday the week starts on.
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function grainLabel(key: string, g: Grain, long = false): string {
  if (g === "fy") return `FY ${key}-${String(Number(key) + 1).slice(2)}`;
  if (g === "quarter") { const [fy, q] = key.split("-"); return `${q} FY${String(Number(fy)).slice(2)}-${String(Number(fy) + 1).slice(2)}`; }
  if (g === "month") { const m = MONTHS[Number(key.slice(5, 7)) - 1]; return long ? `${m} ${key.slice(0, 4)}` : `${m} ${key.slice(2, 4)}`; }
  const d = new Date(`${key}T00:00:00Z`);
  return `${g === "week" ? "Wk of " : ""}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${long ? ` ${d.getUTCFullYear()}` : ""}`;
}

/** The date presets of the filter bar, from `today` (YYYY-MM-DD). */
export type Period = { key: string; label: string; from?: string; to?: string };
export function periods(today: string): Period[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const fy = fyOf(today);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthEnd = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const back = (months: number) => { const d = new Date(Date.UTC(y, m - 1 - months, 1)); return d.toISOString().slice(0, 10); };
  const lm = new Date(Date.UTC(y, m - 2, 1));
  return [
    { key: "fy", label: `This FY (${fy}-${String(fy + 1).slice(2)})`, from: `${fy}-04-01`, to: `${fy + 1}-03-31` },
    { key: "lastfy", label: `Last FY (${fy - 1}-${String(fy).slice(2)})`, from: `${fy - 1}-04-01`, to: `${fy}-03-31` },
    { key: "month", label: "This month", from: `${y}-${pad(m)}-01`, to: monthEnd(y, m) },
    { key: "lastmonth", label: "Last month", from: lm.toISOString().slice(0, 10), to: monthEnd(lm.getUTCFullYear(), lm.getUTCMonth() + 1) },
    { key: "3m", label: "Last 3 months", from: back(2), to: monthEnd(y, m) },
    { key: "12m", label: "Last 12 months", from: back(11), to: monthEnd(y, m) },
    { key: "all", label: "All time" },
  ];
}
