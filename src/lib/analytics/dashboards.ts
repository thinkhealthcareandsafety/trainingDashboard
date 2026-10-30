import type { Grain } from "./model";
import type { Spec } from "./query";

/*
 * The official starter dashboards (ANALYTICS-PLAN.md §5) — defined here, not in the database, so they're always there
 * and always the same. A tile is a report spec; the dashboard's filter bar adds its period and filters to every tile
 * whose data has that field. `fixedPeriod` tiles ignore the period picker (e.g. "owed right now"), keeping their own
 * `spec.period` if they have one (e.g. "last 12 months").
 */

/** `section`: tiles in a row with the same section sit under one heading (owner, 27 Oct: "less congested"). */
export type Tile = { id: string; spec: Spec; w: 3 | 4 | 6 | 12; fixedPeriod?: boolean; note?: string; section?: string;
  /** Draw the monthly revenue goal across it (owner, 27 Oct: ₹50 L a month). */
  goalLine?: boolean;
  /** Never compared (cohorts, seasonality, lists over all of history) — the dashboard's "Compare" leaves it alone. */
  noCompare?: boolean;
  /** A taller chart (the India map, and the bars beside it). */
  tall?: boolean;
  /** Keeps its own grouping when the dashboard's "Show by" changes (stock levels: months can't be added up). */
  fixedGrain?: boolean };
/** `range`: a min–max on one of the dataset's `ranges` (e.g. invoices of ₹1 L or more). */
export type DashFilter = { field: string; label: string; range?: boolean };
/** `grains`: a "Show by Week / Month / Quarter / Year" switch for every time chart (owner, 29 Oct), starting on this one. */
/** `start`: filters already set when the tab opens, removable like any other (Defibtech: Brand = Defibtech). */
/** `pages`: set by hand (the team's dashboards — custom.ts): each page's tile ids, in order; else pages come from `section`.
 *  `custom`: the stored dashboard it was built from (for Edit). */
export type DashboardDef = { id: string; title: string; desc: string; tiles: Tile[]; filters: DashFilter[]; period: string; grains?: Grain; start?: Record<string, { values: string[]; exclude?: boolean }>;
  pages?: { name: string; tiles: string[]; boxes?: Record<string, import("./custom").Box> }[]; custom?: import("./custom").CustomDash;
  /** "What changed" line under the toolbar (phase 3, 29 Oct). */
  summary?: Summary;
  /** The whole tab is Admin's (Defibtech: built on costs) — else each report shows to whoever may read its data. */
  admin?: boolean };

/** "{grain}" in a title follows the chart's grouping (owner, 29 Oct: on Month it still said "quarter by quarter"). */
export const titleOf = (spec: Spec) => (spec.title ?? "").replaceAll("{grain}", { day: "day", week: "week", month: "month", quarter: "quarter", fy: "year" }[spec.grain ?? "month"]);

const kpi = (id: string, dataset: string, measure: string, title: string, extra: Partial<Tile> = {}): Tile =>
  ({ id, w: 3, spec: { dataset, measures: [measure], chart: "kpi", compare: true, title }, ...extra });

/** The tabs as built (before phase 3 merged some — see MERGED below). */
const TABS: DashboardDef[] = [
  {
    id: "sales",
    title: "Sales",
    desc: "Everything invoiced in Zoho Books — products, consumables, trainings — by month, customer, sector, channel and sales person.",
    period: "fy",
    filters: [
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "leadSource", label: "Lead source" },
      { field: "chain", label: "Hotel chain" },
      { field: "itemGroup", label: "Item group" },
      { field: "brand", label: "Brand" },
      { field: "zohoItem", label: "Item" },
      { field: "state", label: "State" },
      { field: "docValue", label: "Invoice value", range: true },
    ],
    tiles: [
      kpi("rev", "sales", "revenue", "Revenue (before tax)"),
      kpi("inv", "sales", "invoices", "Invoices"),
      kpi("cust", "sales", "customers", "Customers billed"),
      kpi("avg", "sales", "avgInvoice", "Average invoice"),
      // Second row (owner, 27 Oct: "add more KPIs").
      kpi("new", "sales", "newCustomers", "New customers"),
      kpi("repeat", "sales", "repeatShare", "Repeat revenue share"),
      kpi("top10", "sales", "top10Share", "Top 10 customers' share"),
      { id: "active", w: 3, fixedPeriod: true, spec: { dataset: "sales", measures: ["customers"], chart: "kpi", compare: true, period: "12m", title: "Active customers (last 12 months)" } },
      { id: "bymonth", section: "Over time", w: 12, spec: { dataset: "sales", measures: ["revenue"], by: ["date"], grain: "month", chart: "column", title: "Revenue by month" } },
      { id: "sector", section: "Customers", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["sector"], limit: 7, chart: "bar", title: "Revenue by sector" } },
      { id: "customers", section: "Customers", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["customer"], limit: 10, chart: "bar", title: "Top 10 customers" } },
      { id: "state", section: "Customers", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["state"], limit: 10, chart: "bar", title: "Revenue by state" } },
      { id: "lead", section: "Customers", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["leadSource"], limit: 6, chart: "donut", title: "Revenue by lead source" } },
      { id: "group", section: "Products & team", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["itemGroup"], limit: 7, chart: "bar", title: "Revenue by item group" } },
      { id: "person", section: "Products & team", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["salesperson"], limit: 7, chart: "bar", title: "Revenue by sales person" } },
      kpi("outstanding", "invoices", "outstanding", "Owed to us now", { section: "Money owed", fixedPeriod: true }),
      kpi("overdue", "invoices", "overdue", "Overdue now", { section: "Money owed", fixedPeriod: true }),
      kpi("overduePct", "invoices", "overduePct", "Overdue %", { section: "Money owed", fixedPeriod: true }),
      kpi("daysToPay", "invoices", "daysToPay", "Average days to pay", { section: "Money owed" }),
      { id: "owed", section: "Money owed", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["outstanding"], by: ["ageBand"], sort: "label", chart: "column", filters: [{ field: "ageBand", values: ["Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] }], title: "Owed to us, by age" } },
      { id: "debtors", section: "Money owed", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["outstanding"], by: ["customer"], limit: 10, chart: "bar", title: "Who owes the most" } },
    ],
  },
  {
    id: "growth",
    title: "Growth",
    desc: "Where growth comes from — this year against last year by sector and customer type, which customers moved the number, who to win back, and the months against the goal.",
    period: "fy",
    filters: [
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "leadSource", label: "Lead source" },
      { field: "chain", label: "Hotel chain" },
      { field: "itemGroup", label: "Item group" },
      { field: "brand", label: "Brand" },
      { field: "zohoItem", label: "Item" },
      { field: "state", label: "State" },
      { field: "docValue", label: "Invoice value", range: true },
    ],
    tiles: [
      { id: "matrix", section: "This year vs last year", w: 12, spec: { dataset: "sales", measures: ["revenue"], by: ["sector", "customerType"], chart: "matrix", title: "Revenue by sector and customer type" } },
      { id: "bridge", section: "Where the change came from", w: 6, spec: { dataset: "sales", measures: ["revenue"], analysis: "bridge", chart: "waterfall", title: "Revenue bridge, customer by customer" } },
      { id: "whySector", section: "Where the change came from", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["sector"], analysis: "drivers", chart: "diverging", limit: 5, title: "What changed — by sector" } },
      { id: "whyCustomer", section: "Where the change came from", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["customer"], analysis: "drivers", chart: "diverging", limit: 6, title: "What changed — by customer" } },
      { id: "whyGroup", section: "Where the change came from", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["itemGroup"], analysis: "drivers", chart: "diverging", limit: 5, title: "What changed — by item group" } },
      { id: "newRepeat", section: "Customers", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["date", "repeat"], grain: "month", chart: "stacked", title: "New vs repeat revenue" } },
      { id: "pareto", section: "Customers", w: 6, spec: { dataset: "sales", measures: ["revenue"], analysis: "pareto", chart: "bar", title: "How revenue is spread over customers" } },
      { id: "winback", section: "Customers", w: 12, spec: { dataset: "sales", measures: ["revenue"], analysis: "winback", chart: "table", limit: 25, title: "Win back: bought then, not since" } },
      { id: "goal", section: "Against the goal", w: 12, fixedPeriod: true, goalLine: true, note: "The last 12 months, whatever the period", spec: { dataset: "sales", measures: ["revenue"], by: ["date"], grain: "month", period: "12m", chart: "column", title: "Revenue by month against the goal" } },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    desc: "Who's loyal and who's slipping, how each year's new customers come back, who's due pads and batteries, who could buy more — resellers and hotel chains too.",
    period: "fy",
    filters: [
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "segment", label: "Segment" },
      { field: "state", label: "State" },
    ],
    tiles: [
      { id: "segCount", section: "Segments", w: 6, fixedPeriod: true, noCompare: true, note: "Every customer, from their whole history", spec: { dataset: "sales", measures: ["customers"], by: ["segment"], sort: "label", chart: "bar", title: "Customers by segment" } },
      { id: "segRevenue", section: "Segments", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["segment"], sort: "label", chart: "bar", title: "Revenue by segment" } },
      { id: "atRisk", section: "Segments", w: 12, fixedPeriod: true, noCompare: true, note: "Bought 2+ times, last 1–2 years ago — call them first", spec: { dataset: "sales", measures: ["revenue"], by: ["customer"], limit: 12, chart: "bar", filters: [{ field: "segment", values: ["At risk"] }], title: "At risk: biggest customers by what they've spent" } },
      // Report #18 (owner, 27 Oct): the map for the shape of it, the bars for exact amounts — Delhi and Goa are big for us
      // but tiny on a map.
      { id: "stateMap", section: "Where they are", w: 6, tall: true, note: "Darker = more · hover for last year · click a state to filter", spec: { dataset: "sales", measures: ["revenue"], by: ["state"], chart: "map", title: "Revenue across India" } },
      { id: "stateBars", section: "Where they are", w: 6, tall: true, spec: { dataset: "sales", measures: ["revenue"], by: ["state"], limit: 15, chart: "bar", title: "Revenue by state" } },
      { id: "cohort", section: "Do new customers come back?", w: 12, fixedPeriod: true, noCompare: true, spec: { dataset: "sales", measures: ["customers"], by: ["cohort", "fy"], chart: "matrix", relative: "first", title: "Customers by the year they first bought" } },
      // Renewals (owner, 30 Oct — phase 5): certificates run out 2 years after the training; pads / batteries fall due.
      { id: "dueMonths", section: "Call them", w: 12, fixedPeriod: true, noCompare: true, note: "Certificates: 2 years after the last training invoice · pads: every 2 years, batteries: every 4, from the AED or the last ones bought", spec: { dataset: "sales", measures: ["revenue"], analysis: "dueMonths", chart: "stacked", title: "Renewals due, month by month" } },
      { id: "renewals", section: "Call them", w: 12, fixedPeriod: true, noCompare: true, spec: { dataset: "sales", measures: ["revenue"], analysis: "renewals", chart: "table", limit: 25, title: "Certificates running out (3 months either side of today)" } },
      { id: "reorder", section: "Call them", w: 12, noCompare: true, spec: { dataset: "sales", measures: ["revenue"], analysis: "reorder", chart: "table", limit: 25, title: "Due pads or batteries: AEDs bought 18+ months ago, nothing since" } },
      { id: "noTraining", section: "Call them", w: 6, noCompare: true, spec: { dataset: "sales", measures: ["revenue"], analysis: "crosssell", variant: "training", chart: "table", limit: 15, title: "Bought AEDs, never a training" } },
      { id: "noAed", section: "Call them", w: 6, noCompare: true, spec: { dataset: "sales", measures: ["revenue"], analysis: "crosssell", variant: "aed", chart: "table", limit: 15, title: "Took a training, never bought an AED" } },
      kpi("resellerShare", "sales", "revenue", "Revenue from resellers", { section: "Resellers vs direct", spec: { dataset: "sales", measures: ["revenue"], chart: "kpi", compare: true, title: "Revenue from resellers", filters: [{ field: "channel", values: ["Resellers"] }] } }),
      kpi("directShare", "sales", "revenue", "Revenue direct", { section: "Resellers vs direct", spec: { dataset: "sales", measures: ["revenue"], chart: "kpi", compare: true, title: "Revenue direct", filters: [{ field: "channel", values: ["Direct"] }] } }),
      kpi("resellers", "sales", "customers", "Resellers billed", { section: "Resellers vs direct", spec: { dataset: "sales", measures: ["customers"], chart: "kpi", compare: true, title: "Resellers billed", filters: [{ field: "channel", values: ["Resellers"] }] } }),
      kpi("resellerTop", "sales", "top10Share", "Top 10 resellers' share", { section: "Resellers vs direct", spec: { dataset: "sales", measures: ["top10Share"], chart: "kpi", compare: true, title: "Top 10 resellers' share", filters: [{ field: "channel", values: ["Resellers"] }] } }),
      { id: "channelMonth", section: "Resellers vs direct", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["date", "channel"], grain: "month", chart: "stacked", title: "Resellers and direct, by month" } },
      { id: "topResellers", section: "Resellers vs direct", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["customer"], limit: 10, chart: "bar", filters: [{ field: "channel", values: ["Resellers"] }], title: "Top resellers" } },
      { id: "chainRevenue", section: "Hotel chains", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["chain"], chart: "bar", filters: [{ field: "chain", values: ["(blank)"], exclude: true }], title: "Revenue by hotel chain" } },
      { id: "chainProps", section: "Hotel chains", w: 6, spec: { dataset: "sales", measures: ["customers"], by: ["chain"], chart: "bar", filters: [{ field: "chain", values: ["(blank)"], exclude: true }], title: "Properties billed, by chain" } },
    ],
  },
  {
    id: "products",
    title: "Products",
    desc: "What sells, at what price, in which months — whether growth came from more units, better prices or a richer mix — and the stock on hand.",
    period: "fy",
    filters: [
      { field: "itemGroup", label: "Item group" },
      { field: "brand", label: "Brand" },
      { field: "zohoItem", label: "Item" },
      { field: "itemStatus", label: "Item status" },
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "leadSource", label: "Lead source" },
      { field: "salesperson", label: "Sales person" },
    ],
    tiles: [
      { id: "pvm", section: "Why revenue moved", w: 6, spec: { dataset: "sales", measures: ["revenue"], analysis: "pvm", chart: "waterfall", title: "Price, volume and mix" } },
      { id: "pvmAed", section: "Why revenue moved", w: 6, note: "AEDs only", spec: { dataset: "sales", measures: ["revenue"], analysis: "pvm", chart: "waterfall", filters: [{ field: "itemGroup", values: ["All AEDs"] }], title: "Price, volume and mix — AEDs" } },
      { id: "season", section: "Seasonality", w: 12, fixedPeriod: true, noCompare: true, goalLine: true, note: "Every financial year since Zoho Books began", spec: { dataset: "sales", measures: ["revenue"], by: ["fy", "monthName"], chart: "heatmap", title: "Revenue by month, year by year" } },
      { id: "mix", section: "Product mix", w: 12, noCompare: true, fixedPeriod: true, note: "The last 12 months", spec: { dataset: "sales", measures: ["revenue"], by: ["date", "itemGroup"], grain: "month", period: "12m", limit: 6, chart: "stacked100", title: "Share of revenue by item group" } },
      { id: "price", section: "Prices", w: 6, noCompare: true, note: "Filter to one item for a clean price line", spec: { dataset: "sales", measures: ["avgPrice"], by: ["date", "itemGroup"], grain: "quarter", limit: 4, chart: "line", filters: [{ field: "itemGroup", values: ["All AEDs", "AED Pads", "AED Batteries", "Training Services"] }], title: "Average selling price by quarter" } },
      { id: "priceItems", section: "Prices", w: 6, spec: { dataset: "sales", measures: ["avgPrice"], by: ["zohoItem"], limit: 10, chart: "bar", filters: [{ field: "itemGroup", values: ["All AEDs"] }], title: "Average price per AED model" } },
      { id: "leadTable", section: "Lead sources", w: 12, spec: { dataset: "sales", measures: ["revenue", "invoices", "customers", "newCustomers", "avgInvoice"], by: ["leadSource"], chart: "table", title: "Lead-source performance" } },
      // Stock (owner, 28 Oct: ANALYTICS-PLAN §11 #27) — today's, so the period and Compare leave it alone.
      ...([["stockValue", "value", "Stock value (cost)"], ["stockItems", "items", "Items in stock"], ["stockReorder", "toReorder", "Items to reorder"], ["stockBelow", "oversold", "Items below zero in Zoho"]] as const)
        .map(([id, measure, title]): Tile => ({ id, w: 3, section: "Stock now", fixedPeriod: true, noCompare: true, spec: { dataset: "stock", measures: [measure], chart: "kpi", title } })),
      { id: "stockLow", section: "Stock now", w: 12, fixedPeriod: true, noCompare: true, note: "Sold in the last 90 days, under 30 days of cover left", spec: { dataset: "stock", measures: ["sold90", "available", "daysCover", "committed", "onHand"], by: ["item"], limit: 15, chart: "table", filters: [{ field: "cover", values: ["Out of stock, still selling", "Under 30 days"] }], title: "To reorder" } },
      { id: "stockGroup", section: "Stock now", w: 6, fixedPeriod: true, noCompare: true, spec: { dataset: "stock", measures: ["value"], by: ["itemGroup"], limit: 8, chart: "bar", title: "Stock value by item group" } },
      { id: "stockCover", section: "Stock now", w: 6, fixedPeriod: true, noCompare: true, note: "Not sold in 90 days = slow-moving stock", spec: { dataset: "stock", measures: ["value"], by: ["cover"], sort: "label", chart: "bar", filters: [{ field: "stock", values: ["In stock"] }], title: "Stock value by days of cover" } },
      { id: "stockItemsTable", section: "Stock now", w: 12, fixedPeriod: true, noCompare: true, spec: { dataset: "stock", measures: ["value", "onHand", "committed", "available", "sold90", "daysCover"], by: ["item"], limit: 20, chart: "table", filters: [{ field: "stock", values: ["In stock"] }], title: "Stock by item" } },
      // Stock health for every brand (owner, 30 Oct — phase 5): dead stock, turns, when to order.
      kpi("deadValue", "stock", "deadValue", "Dead stock (no sale in 180 days)", { section: "Stock health", fixedPeriod: true, noCompare: true }),
      kpi("turns", "stock", "turns", "Stock turns (12 months)", { section: "Stock health", fixedPeriod: true, noCompare: true }),
      kpi("orderNow", "stock", "items", "Items to order now", { section: "Stock health", fixedPeriod: true, noCompare: true, spec: { dataset: "stock", measures: ["items"], chart: "kpi", title: "Items to order now", filters: [{ field: "orderBand", values: ["Order now"] }] } }),
      { id: "deadBrand", section: "Stock health", w: 6, fixedPeriod: true, noCompare: true, note: "In stock, no sale in 180 days or never", spec: { dataset: "stock", measures: ["deadValue"], by: ["brand"], limit: 8, chart: "bar", title: "Dead stock by brand" } },
      { id: "turnsBrand", section: "Stock health", w: 6, fixedPeriod: true, noCompare: true, spec: { dataset: "stock", measures: ["turns", "sold365", "onHand", "value"], by: ["brand"], limit: 12, chart: "table", filters: [{ field: "stock", values: ["In stock"] }], title: "Stock turns by brand" } },
      { id: "orderBy", section: "Stock health", w: 12, fixedPeriod: true, noCompare: true, note: "Sold in the last 90 days; 30 days to get new stock in", spec: { dataset: "stock", measures: ["sold90", "available", "daysCover", "orderIn"], by: ["item"], limit: 20, chart: "table", filters: [{ field: "orderBand", values: ["Order now", "Within 30 days"] }], title: "Order these soon" } },
      { id: "deadItems", section: "Stock health", w: 12, fixedPeriod: true, noCompare: true, spec: { dataset: "stock", measures: ["deadValue", "onHand"], by: ["item"], limit: 15, chart: "table", filters: [{ field: "idle", values: ["No sale in 180+ days", "Never sold"] }], title: "Dead stock, item by item" } },
      { id: "stockZero", section: "Stock now", w: 12, fixedPeriod: true, noCompare: true, note: "Invoiced with no stock recorded — enter the purchase or a stock adjustment in Zoho (or untick stock tracking for services)", spec: { dataset: "stock", measures: ["short", "sold90"], by: ["item"], limit: 15, chart: "table", filters: [{ field: "stock", values: ["Sold more than bought"] }], title: "Below zero in Zoho" } },
    ],
  },
  {
    id: "team",
    title: "Team & pipeline",
    desc: "Each sales person's numbers, and how quotes turn into invoices.",
    period: "fy",
    filters: [
      { field: "salesperson", label: "Sales person" },
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
    ],
    tiles: [
      kpi("quotes", "quotes", "count", "Quotes"),
      kpi("rate", "quotes", "winRate", "Conversion rate"),
      kpi("days", "quotes", "daysToInvoice", "Days from quote to invoice"),
      kpi("valid", "quotes", "validOpen", "Open & still valid (₹)", { fixedPeriod: true }),
      { id: "scorecard", section: "Sales people", w: 12, spec: { dataset: "sales", measures: ["revenue", "invoices", "avgInvoice", "customers", "newCustomers"], by: ["salesperson"], chart: "table", title: "Sales-person scorecard" } },
      { id: "personRate", section: "Sales people", w: 6, spec: { dataset: "quotes", measures: ["winRate"], by: ["salesperson"], limit: 7, chart: "bar", title: "Conversion rate by sales person" } },
      { id: "personDays", section: "Sales people", w: 6, spec: { dataset: "quotes", measures: ["daysToInvoice"], by: ["salesperson"], limit: 7, chart: "bar", title: "Days from quote to invoice, by sales person" } },
      { id: "funnel", section: "Quote funnel", w: 6, spec: { dataset: "quotes", measures: ["count", "won", "invoicedCount"], analysis: "funnel", chart: "bar", title: "From quote to invoice" } },
      { id: "openAge", section: "Quote funnel", w: 6, fixedPeriod: true, note: "Open quotes now — valid for 15 days", spec: { dataset: "quotes", measures: ["value"], by: ["age"], sort: "label", chart: "column", filters: [{ field: "outcome", values: ["Waiting"] }], title: "Open quotes by age" } },
    ],
  },
  {
    id: "collections",
    title: "Collections",
    desc: "What's owed, how late it is, who pays slowly — by customer, sector and sales person.",
    period: "fy",
    filters: [
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "state", label: "State" },
      { field: "docValue", label: "Invoice value", range: true },
    ],
    tiles: [
      kpi("outstanding", "invoices", "outstanding", "Owed to us now", { fixedPeriod: true }),
      kpi("overdue", "invoices", "overdue", "Overdue now", { fixedPeriod: true }),
      kpi("overduePct", "invoices", "overduePct", "Overdue %", { fixedPeriod: true }),
      kpi("daysToPay", "invoices", "daysToPay", "Average days to pay"),
      { id: "age", section: "Owed now", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["outstanding"], by: ["ageBand"], sort: "label", chart: "column", filters: [{ field: "ageBand", values: ["Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] }], title: "Owed to us, by age" } },
      { id: "debtors", section: "Owed now", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["overdue"], by: ["customer"], limit: 10, chart: "bar", title: "Most overdue, by customer" } },
      { id: "byPerson", section: "Owed now", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["overdue"], by: ["salesperson"], limit: 7, chart: "bar", title: "Overdue by sales person" } },
      { id: "bySector", section: "Owed now", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["overdue"], by: ["sector"], limit: 7, chart: "bar", title: "Overdue by sector" } },
      // Cash coming in (owner, 30 Oct — phase 5): what's owed, by when it falls due.
      kpi("due30", "invoices", "due30", "Falling due, next 30 days", { section: "Coming in", fixedPeriod: true, noCompare: true }),
      kpi("due90", "invoices", "due90", "Falling due, next 90 days", { section: "Coming in", fixedPeriod: true, noCompare: true }),
      { id: "dueWeek", section: "Coming in", w: 12, fixedPeriod: true, noCompare: true, note: "Open invoices by the week their due date falls in (incl. tax); Wk 01 = the next 7 days", spec: { dataset: "invoices", measures: ["outstanding"], by: ["dueWeek"], sort: "label", chart: "column", filters: [{ field: "dueBand", values: ["Overdue", "Next 30 days", "31–60 days", "61–90 days"] }], title: "Cash due, week by week (next 90 days)" } },
      { id: "dueBand", section: "Coming in", w: 6, fixedPeriod: true, noCompare: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["outstanding"], by: ["dueBand"], sort: "label", chart: "bar", filters: [{ field: "dueBand", values: ["Overdue", "Next 30 days", "31–60 days", "61–90 days", "Later", "No due date"] }], title: "Owed, by when it falls due" } },
      { id: "duePerson", section: "Coming in", w: 6, fixedPeriod: true, noCompare: true, note: "Open invoices falling due in the next 90 days", spec: { dataset: "invoices", measures: ["outstanding"], by: ["customer"], limit: 10, chart: "bar", filters: [{ field: "dueBand", values: ["Next 30 days", "31–60 days", "61–90 days"] }], title: "Who should pay next 90 days" } },
      { id: "dtpMonth", section: "How fast they pay", w: 6, note: "Paid invoices only — recent months look faster until the rest are paid", spec: { dataset: "invoices", measures: ["daysToPay"], by: ["date"], grain: "month", chart: "line", title: "Days to pay, by invoice month" } },
      { id: "dtpSector", section: "How fast they pay", w: 6, spec: { dataset: "invoices", measures: ["daysToPay"], by: ["sector"], limit: 8, chart: "bar", title: "Days to pay, by sector" } },
      { id: "slowest", section: "How fast they pay", w: 12, spec: { dataset: "invoices", measures: ["daysToPay", "billed"], by: ["customer"], limit: 12, chart: "bar", title: "Slowest payers (average days)" } },
    ],
  },
  {
    id: "trainings",
    title: "Trainings",
    desc: "The Training board's trainings — completed and coming up, by month, trainer, type and customer.",
    period: "fy",
    filters: [
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "trainer", label: "Trainer" },
      { field: "trainingType", label: "Training type" },
      { field: "status", label: "Status" },
    ],
    tiles: [
      kpi("count", "trainings", "count", "Trainings"),
      kpi("people", "trainings", "people", "People"),
      kpi("per", "trainings", "perTraining", "People per training"),
      kpi("trev", "sales", "revenue", "Training revenue", { spec: { dataset: "sales", measures: ["revenue"], chart: "kpi", compare: true, title: "Training revenue", filters: [{ field: "itemGroup", values: ["Training Services"] }] } }),
      { id: "bymonth", section: "Over time", w: 12, spec: { dataset: "trainings", measures: ["count"], by: ["date", "status"], grain: "month", chart: "stacked", title: "Trainings by month" } },
      { id: "trainer", section: "Breakdown", w: 6, spec: { dataset: "trainings", measures: ["count"], by: ["trainer"], chart: "bar", title: "Trainings by trainer" } },
      { id: "type", section: "Breakdown", w: 6, spec: { dataset: "trainings", measures: ["people"], by: ["trainingType"], limit: 7, chart: "bar", title: "People by training type" } },
      { id: "customers", section: "Breakdown", w: 6, spec: { dataset: "trainings", measures: ["people"], by: ["customer"], limit: 10, chart: "bar", title: "Top customers (people)" } },
      { id: "sector", section: "Breakdown", w: 6, spec: { dataset: "trainings", measures: ["count"], by: ["sector"], limit: 6, chart: "donut", title: "Trainings by sector" } },
      // Training economics (owner, 27 Oct — report #23): value from each training's PI / invoice training lines.
      kpi("value", "trainings", "value", "Training value", { section: "Training economics" }),
      kpi("perPerson", "trainings", "valuePerPerson", "Value per person trained", { section: "Training economics" }),
      kpi("perTrainingValue", "trainings", "valuePerTraining", "Value per training", { section: "Training economics" }),
      kpi("valued", "trainings", "valuedCount", "Trainings with a PI or invoice", { section: "Training economics" }),
      { id: "ppSector", section: "Training economics", w: 6, spec: { dataset: "trainings", measures: ["valuePerPerson"], by: ["sector"], limit: 8, chart: "bar", title: "Value per person, by sector" } },
      { id: "ppType", section: "Training economics", w: 6, spec: { dataset: "trainings", measures: ["valuePerPerson"], by: ["trainingType"], limit: 8, chart: "bar", title: "Value per person, by training type" } },
    ],
  },
  {
    id: "quotes",
    title: "Quotes",
    desc: "Quotations sent and accepted — by month, sales person and customer.",
    period: "fy",
    filters: [
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "outcome", label: "Result" },
      { field: "docValue", label: "Quote value", range: true },
    ],
    tiles: [
      kpi("count", "quotes", "count", "Quotes"),
      kpi("value", "quotes", "value", "Quote value"),
      kpi("won", "quotes", "won", "Quotes accepted"),
      kpi("rate", "quotes", "winRate", "Conversion rate"),
      kpi("validValue", "quotes", "validOpen", "Open & still valid (₹)", { fixedPeriod: true }),
      kpi("validCount", "quotes", "validOpenCount", "Open & still valid (quotes)", { fixedPeriod: true }),
      { id: "bymonth", section: "Over time", w: 12, spec: { dataset: "quotes", measures: ["count"], by: ["date", "outcome"], grain: "month", chart: "stacked", title: "Quotes by month and result" } },
      { id: "person", section: "Breakdown", w: 6, spec: { dataset: "quotes", measures: ["winRate"], by: ["salesperson"], limit: 7, chart: "bar", title: "Conversion rate by sales person" } },
      { id: "outcome", section: "Breakdown", w: 6, spec: { dataset: "quotes", measures: ["value"], by: ["outcome"], chart: "donut", title: "Quote value by result" } },
      { id: "open", section: "Open quotes", w: 12, spec: { dataset: "quotes", measures: ["value"], by: ["customer"], limit: 10, chart: "bar", filters: [{ field: "outcome", values: ["Waiting"] }], title: "Biggest open quotes (by customer)" } },
      // Quote follow-up (owner, 30 Oct — phase 5): quotes with no answer, by how long they've waited, and the list to chase.
      { id: "waitAge", section: "Follow up", w: 6, fixedPeriod: true, noCompare: true, note: "Quotes with no answer yet, whatever the period", spec: { dataset: "quotes", measures: ["value"], by: ["waitAge"], sort: "label", chart: "column", filters: [{ field: "outcome", values: ["Waiting"] }], title: "Waiting for an answer, by days" } },
      { id: "waitPerson", section: "Follow up", w: 6, fixedPeriod: true, noCompare: true, note: "Quotes with no answer yet, whatever the period", spec: { dataset: "quotes", measures: ["count"], by: ["salesperson", "waitAge"], chart: "stacked", filters: [{ field: "outcome", values: ["Waiting"] }], title: "Waiting for an answer, by sales person" } },
      { id: "followup", section: "Follow up", w: 12, fixedPeriod: true, noCompare: true, spec: { dataset: "quotes", measures: ["value"], analysis: "followup", chart: "table", limit: 25, title: "Quotes to chase, oldest first" } },
    ],
  },
  {
    // Owner, 28 Oct (ANALYTICS-PLAN §11 #25–26, "yessir" = defaults): costs — Admin only (the datasets are `admin`, so
    // the tab shows only to Admin and the server refuses the data to anyone else).
    id: "margin",
    title: "Margin",
    desc: "Admin only — what it costs us: gross margin on goods (Zoho's FIFO cost) and the freight paid to send orders.",
    period: "fy",
    filters: [
      { field: "itemGroup", label: "Item group" },
      { field: "brand", label: "Brand" },
      { field: "zohoItem", label: "Item" },
      { field: "itemStatus", label: "Item status" },
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "state", label: "State" },
      { field: "courier", label: "Courier" },
    ],
    tiles: [
      kpi("profit", "margin", "profit", "Gross margin (goods)", { section: "Gross margin" }),
      kpi("marginPct", "margin", "marginPct", "Gross margin %", { section: "Gross margin" }),
      kpi("cogs", "margin", "cost", "Cost of goods sold", { section: "Gross margin" }),
      kpi("noCost", "margin", "noCost", "Revenue with no cost in Zoho", { section: "Gross margin" }),
      { id: "marginMonth", section: "Gross margin", w: 6, spec: { dataset: "margin", measures: ["profit"], by: ["date"], grain: "month", chart: "column", title: "Gross margin by month" } },
      { id: "marginPctMonth", section: "Gross margin", w: 6, spec: { dataset: "margin", measures: ["marginPct"], by: ["date"], grain: "month", chart: "line", title: "Gross margin % by month" } },
      { id: "marginGroups", section: "Gross margin", w: 12, spec: { dataset: "margin", measures: ["costedRevenue", "cost", "profit", "marginPct"], by: ["itemGroup"], limit: 10, chart: "table", title: "By item group" } },
      { id: "marginItems", section: "Items & customers", w: 12, spec: { dataset: "margin", measures: ["profit", "marginPct", "costedRevenue", "units"], by: ["zohoItem"], limit: 15, chart: "table", title: "Items that earn the most" } },
      { id: "marginCustomers", section: "Items & customers", w: 12, spec: { dataset: "margin", measures: ["profit", "marginPct", "costedRevenue"], by: ["customer"], limit: 10, chart: "table", title: "Customers that earn the most (goods)" } },
      { id: "marginPeople", section: "Items & customers", w: 12, spec: { dataset: "margin", measures: ["profit", "marginPct", "costedRevenue"], by: ["salesperson"], chart: "table", title: "By sales person (goods)" } },
      { id: "marginMissing", section: "Missing costs", w: 12, note: "Kits and bundles that aren't stock items and have no bill of their own — their parts never leave stock in Zoho, so they're left out of the margin", spec: { dataset: "margin", measures: ["noCost", "units"], by: ["item"], limit: 15, chart: "table", filters: [{ field: "costSource", values: ["No cost in Zoho"] }], title: "Goods sold with no cost in Zoho" } },
      kpi("freight", "freight", "freight", "Freight paid", { section: "Freight" }),
      kpi("freightPct", "freight", "freightPct", "Freight % of revenue", { section: "Freight" }),
      kpi("perShipment", "freight", "perShipment", "Freight per shipment", { section: "Freight" }),
      kpi("recovered", "freight", "recovered", "Shipping charged to customers", { section: "Freight" }),
      { id: "freightMonth", section: "Freight", w: 12, note: "“Freight Incurred” is filled in on invoices since Apr 2025", spec: { dataset: "freight", measures: ["freight"], by: ["date"], grain: "month", chart: "column", title: "Freight paid by month" } },
      { id: "freightPctMonth", section: "Freight", w: 6, spec: { dataset: "freight", measures: ["freightPctShipped"], by: ["date"], grain: "month", chart: "line", title: "Freight as % of what was shipped, by month" } },
      { id: "freightState", section: "Freight", w: 6, spec: { dataset: "freight", measures: ["freight"], by: ["state"], limit: 10, chart: "bar", title: "Freight paid by state" } },
      { id: "courier", section: "Freight", w: 12, spec: { dataset: "freight", measures: ["freight", "shipments", "perShipment", "freightPctShipped"], by: ["courier"], chart: "table", filters: [{ field: "shipped", values: ["yes"] }], title: "Couriers" } },
      { id: "freightCustomers", section: "Freight", w: 12, spec: { dataset: "freight", measures: ["freight", "shipments", "charged", "freightPctShipped"], by: ["customer"], limit: 10, chart: "table", filters: [{ field: "shipped", values: ["yes"] }], title: "Customers we pay the most freight for" } },
    ],
  },
  defibtech(),
];

/*
 * Owner, 29 Oct ("YEAH GO FOR IT" — phase 3 of the Reports review): 11 tabs → 8, one home per report. Sales + Growth,
 * Quotes + Team & pipeline, Collections + Margin become one tab each (the second part's pages follow the first's);
 * copies of a report kept on two tabs are dropped from the one that isn't its home. The old tab ids live on as
 * ALIASES, so My dashboard, the team's dashboards and anyone's hidden-tabs list keep working.
 */
export const ALIASES: Record<string, string> = { growth: "sales", team: "quotes", margin: "collections" };
export const tabOf = (id: string) => ALIASES[id] ?? id;

/** "What changed" under a tab's toolbar: this measure against the comparison, and which values of `by` moved it most. */
export type Summary = { dataset: string; measure: string; by: string };

const MERGED: { id: string; title: string; desc: string; parts: string[]; drop?: string[]; summary?: Summary }[] = [
  { id: "sales", title: "Sales & growth", parts: ["sales", "growth"], drop: ["sales.state", "sales.Money owed"],
    desc: "Everything invoiced in Zoho Books — how much, who bought, where it came from, and what changed against last year.",
    summary: { dataset: "sales", measure: "revenue", by: "sector" } },
  { id: "customers", title: "Customers", parts: ["customers"], summary: { dataset: "sales", measure: "revenue", by: "customer" }, desc: "" },
  { id: "products", title: "Products & stock", parts: ["products"], summary: { dataset: "sales", measure: "revenue", by: "itemGroup" }, desc: "" },
  { id: "quotes", title: "Quotes & team", parts: ["quotes", "team"], drop: ["team.rate", "team.personRate"],
    desc: "Quotations sent and accepted, what's still open, and how each sales person turns quotes into invoices.",
    summary: { dataset: "quotes", measure: "value", by: "salesperson" } },
  { id: "collections", title: "Money", parts: ["collections", "margin"],
    desc: "What's owed and how fast it's paid; for Admin, what the goods cost us (gross margin) and freight.",
    summary: { dataset: "payments", measure: "received", by: "customer" } },
  { id: "trainings", title: "Trainings", parts: ["trainings"], summary: { dataset: "trainings", measure: "count", by: "trainer" }, desc: "" },
  { id: "defibtech", title: "Defibtech", parts: ["defibtech"], summary: { dataset: "margin", measure: "revenue", by: "kind" }, desc: "" },
];

function merge(m: (typeof MERGED)[number]): DashboardDef {
  const parts = m.parts.map((id) => TABS.find((d) => d.id === id)!);
  const tiles: Tile[] = [];
  const sections = new Set<string>();
  for (const [i, p] of parts.entries()) {
    for (const t of p.tiles) {
      if (m.drop?.includes(`${p.id}.${t.id}`) || (t.section && m.drop?.includes(`${p.id}.${t.section}`))) continue;
      // A later part's numbers with no section start its own page; a section name taken already gets the part's name.
      let section = t.section ?? (i > 0 ? p.title : undefined);
      if (i > 0 && section && sections.has(section)) section = `${section} (${p.title.toLowerCase()})`;
      tiles.push(i > 0 || section !== t.section ? { ...t, section } : t);
    }
    for (const t of tiles) if (t.section) sections.add(t.section);
  }
  const filters: DashFilter[] = [];
  for (const f of parts.flatMap((p) => p.filters)) if (!filters.some((x) => x.field === f.field)) filters.push(f);
  return { ...parts[0], title: m.title, desc: m.desc || parts[0].desc, tiles, filters, summary: m.summary };
}

/** The tabs, in order (Saved reports follows them). */
export const DASHBOARDS: DashboardDef[] = MERGED.map(merge);

/** Owner, 29 Oct: "a report of defibtech aeds, pads, battery, their price change between sales and purchase and its
 *  average" — then, the same day: "i have 3 items … i want to see all about it … the charts and tables confuse me, make
 *  them easier". So: never one average over all three (an AED and a pad don't average), plain words, no comparisons;
 *  an Overview with each product's four numbers side by side, then a page per product. Built on the margin data (each
 *  sale with what its units cost us), so it's Admin only like Margin. All time by default — a few dozen units a year. */
function defibtech(): DashboardDef {
  const products = [{ kind: "AED", name: "AED", page: "AEDs" }, { kind: "Pads", name: "Pads", page: "Pads" }, { kind: "Battery", name: "Battery", page: "Batteries" }];
  // Brand is the tab's starting filter, not fixed in the charts (owner, 29 Oct: "select what items i want to include and
  // what items i dont") — remove it and any item can be picked.
  const only = (kind: string) => [{ field: "kind", values: [kind] }];
  const three = [{ field: "kind", values: ["AED", "Pads", "Battery"] }];
  // A product's four numbers: a row of the Overview, and again on top of its own page (its own ids).
  const four = (p: (typeof products)[number], section: string, suffix = ""): Tile[] => ([
    ["Sale", "avgSale", "average selling price"], ["Cost", "avgCost", "average purchase price"],
    ["Profit", "diffPerUnit", "profit per unit"], ["Units", "costedUnits", "units sold"],
  ] as const).map(([id, measure, what]) => ({ id: `d${p.kind}${id}${suffix}`, section, w: 3, noCompare: true, spec: { dataset: "margin", measures: [measure], chart: "kpi", filters: only(p.kind), title: `${p.name} · ${what}` } }));
  const numbers = products.flatMap((p) => four(p, "Overview"));
  const page = (p: (typeof products)[number]): Tile[] => [
    ...four(p, p.page, "P"),
    { id: `d${p.kind}Price`, section: p.page, w: 12, noCompare: true, note: "The gap between the two lines is what we make on each unit · hover a point for the numbers", spec: { dataset: "margin", measures: ["avgSale", "avgCost"], by: ["date"], grain: "quarter", chart: "line", filters: only(p.kind), title: `${p.name}: selling price vs purchase price, {grain} by {grain}` } },
    { id: `d${p.kind}Qty`, section: p.page, w: 6, noCompare: true, note: "Click a bar to see only that period's sales on this page", spec: { dataset: "margin", measures: ["costedUnits"], by: ["date"], grain: "quarter", chart: "column", filters: only(p.kind), title: "Units sold each {grain}" } },
    { id: `d${p.kind}Who`, section: p.page, w: 6, noCompare: true, note: "Click a customer to see their prices", spec: { dataset: "margin", measures: ["costedUnits"], by: ["customer"], limit: 8, chart: "bar", filters: only(p.kind), title: "Who buys the most (units)" } },
    { id: `d${p.kind}Type`, section: p.page, w: 6, noCompare: true, spec: { dataset: "margin", measures: ["avgSale"], by: ["customerType"], limit: 6, chart: "bar", filters: only(p.kind), title: "Average selling price, by customer type" } },
    { id: `d${p.kind}Person`, section: p.page, w: 6, noCompare: true, spec: { dataset: "margin", measures: ["avgSale"], by: ["salesperson"], limit: 6, chart: "bar", filters: only(p.kind), title: "Average selling price, by sales person" } },
  ];
  return {
    id: "defibtech",
    title: "Defibtech",
    admin: true,
    desc: "Admin only — Defibtech AEDs, pads and batteries: what we sell one for, what it cost us, and what we make on each, on average (before tax).",
    period: "all",
    grains: "quarter",
    start: { brand: { values: ["Defibtech"] } },
    filters: [
      { field: "brand", label: "Brand" },
      { field: "zohoItem", label: "Item" },
      { field: "itemStatus", label: "Item status" },
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "state", label: "State" },
    ],
    tiles: [
      ...numbers,
      // Owner, 29 Oct: "kpis for conversion rates. quotes sent and quotes converted, that is accepted, and declined".
      ...([["qSent", "quotesSent", "Quotes sent"], ["qAccepted", "quotesAccepted", "Quotes accepted"], ["qDeclined", "quotesDeclined", "Quotes declined"], ["qConversion", "conversion", "Conversion rate"]] as const)
        .map(([id, measure, title]): Tile => ({ id, section: "Overview", w: 3, noCompare: true, spec: { dataset: "quoteItems", measures: [measure], chart: "kpi", title } })),
      { id: "dRevenue", section: "Overview", w: 6, noCompare: true, spec: { dataset: "margin", measures: ["revenue"], by: ["kind"], sort: "label", chart: "bar", filters: three, title: "Sales of each, before tax" } },
      { id: "dQtyAll", section: "Overview", w: 6, noCompare: true, spec: { dataset: "margin", measures: ["costedUnits"], by: ["date", "kind"], grain: "quarter", chart: "stacked", filters: three, title: "Units sold each {grain}" } },
      { id: "qTime", section: "Overview", w: 12, noCompare: true, note: "A quote with these items, by what became of it · invoiced quotes count as accepted", spec: { dataset: "quoteItems", measures: ["quotesSent"], by: ["date", "stage"], grain: "quarter", chart: "stacked", title: "Quotes sent each {grain}, by result" } },
      // Owner, 29 Oct: "where is all Defibtech items and their reports" — every Defibtech item in Zoho, not just the three
      // (pediatric pads, the bag, the trainer, old item names), item by item.
      ...([["aSales", "margin", "revenue", "Sales, before tax"], ["aProfit", "margin", "profit", "Profit"], ["aUnits", "margin", "costedUnits", "Units sold"], ["aSpent", "purchases", "spent", "Spent on purchases"]] as const)
        .map(([id, dataset, measure, title]): Tile => ({ id, section: "All items", w: 3, noCompare: true, spec: { dataset, measures: [measure], chart: "kpi", title } })),
      { id: "aSalesTime", section: "All items", w: 12, noCompare: true, spec: { dataset: "margin", measures: ["revenue"], by: ["date", "zohoItem"], grain: "quarter", limit: 6, chart: "stacked", title: "Sales each {grain}, item by item" } },
      { id: "aUnitsItem", section: "All items", w: 6, noCompare: true, note: "Click an item to see only it on this page", spec: { dataset: "margin", measures: ["costedUnits"], by: ["zohoItem"], limit: 12, chart: "bar", title: "Units sold, item by item" } },
      { id: "aProfitItem", section: "All items", w: 6, noCompare: true, spec: { dataset: "margin", measures: ["profit"], by: ["zohoItem"], limit: 12, chart: "bar", title: "Profit, item by item" } },
      { id: "aSaleItem", section: "All items", w: 6, noCompare: true, spec: { dataset: "margin", measures: ["avgSale"], by: ["zohoItem"], limit: 12, chart: "bar", title: "Average selling price, item by item" } },
      { id: "aPaidItem", section: "All items", w: 6, noCompare: true, spec: { dataset: "purchases", measures: ["paidPerUnit"], by: ["zohoItem"], limit: 12, chart: "bar", title: "Price we paid per unit, item by item" } },
      { id: "aBoughtItem", section: "All items", w: 6, noCompare: true, spec: { dataset: "purchases", measures: ["bought"], by: ["zohoItem"], limit: 12, chart: "bar", title: "Units bought, item by item" } },
      { id: "aStockItem", section: "All items", w: 6, noCompare: true, fixedPeriod: true, spec: { dataset: "stockLevel", measures: ["level"], by: ["zohoItem"], limit: 12, chart: "bar", period: "month", title: "In stock today, item by item" } },
      ...products.flatMap(page),
      // Owner, 29 Oct: "purchase trend charts, per year, per month" — from the bills.
      ...products.map((p): Tile => ({ id: `b${p.kind}Units`, section: "Purchases", w: 3, noCompare: true, spec: { dataset: "purchases", measures: ["bought"], chart: "kpi", filters: only(p.kind), title: `${p.name} · units bought` } })),
      { id: "bSpent", section: "Purchases", w: 3, noCompare: true, spec: { dataset: "purchases", measures: ["spent"], chart: "kpi", filters: three, title: "Spent on all three" } },
      { id: "bUnits", section: "Purchases", w: 6, noCompare: true, spec: { dataset: "purchases", measures: ["bought"], by: ["date", "kind"], grain: "quarter", chart: "stacked", filters: three, title: "Units bought each {grain}" } },
      { id: "bMoney", section: "Purchases", w: 6, noCompare: true, spec: { dataset: "purchases", measures: ["spent"], by: ["date", "kind"], grain: "quarter", chart: "stacked", filters: three, title: "Money spent each {grain}, before tax" } },
      ...products.map((p): Tile => ({ id: `b${p.kind}Price`, section: "Purchases", w: 4, noCompare: true, spec: { dataset: "purchases", measures: ["paidPerUnit"], by: ["date"], grain: "quarter", chart: "line", filters: only(p.kind), title: `${p.name}: price paid per unit, by {grain}` } })),
      // Owner, 29 Oct: "a monthly chart of how much stock we have of those items" — always by month.
      ...products.map((p): Tile => ({ id: `s${p.kind}Now`, section: "Stock", w: 4, noCompare: true, fixedPeriod: true, spec: { dataset: "stockLevel", measures: ["level"], chart: "kpi", period: "month", filters: only(p.kind), title: `${p.name} · in stock today` } })),
      ...products.map((p): Tile => ({ id: `s${p.kind}Month`, section: "Stock", w: 4, noCompare: true, fixedGrain: true, spec: { dataset: "stockLevel", measures: ["level"], by: ["date"], grain: "month", chart: "column", filters: only(p.kind), title: `${p.page} in stock, month end` } })),
    ],
  };
}
