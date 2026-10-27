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
  goalLine?: boolean };
/** `range`: a min–max on one of the dataset's `ranges` (e.g. invoices of ₹1 L or more). */
export type DashFilter = { field: string; label: string; range?: boolean };
export type DashboardDef = { id: string; title: string; desc: string; tiles: Tile[]; filters: DashFilter[]; period: string };

const kpi = (id: string, dataset: string, measure: string, title: string, extra: Partial<Tile> = {}): Tile =>
  ({ id, w: 3, spec: { dataset, measures: [measure], chart: "kpi", compare: true, title }, ...extra });

export const DASHBOARDS: DashboardDef[] = [
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
      kpi("rate", "quotes", "winRate", "Win rate"),
      kpi("days", "quotes", "daysToInvoice", "Days from quote to invoice"),
      kpi("valid", "quotes", "validOpen", "Open & still valid (₹)", { fixedPeriod: true }),
      { id: "scorecard", section: "Sales people", w: 12, spec: { dataset: "sales", measures: ["revenue", "invoices", "avgInvoice", "customers", "newCustomers"], by: ["salesperson"], chart: "table", title: "Sales-person scorecard" } },
      { id: "personRate", section: "Sales people", w: 6, spec: { dataset: "quotes", measures: ["winRate"], by: ["salesperson"], limit: 7, chart: "bar", title: "Win rate by sales person" } },
      { id: "personDays", section: "Sales people", w: 6, spec: { dataset: "quotes", measures: ["daysToInvoice"], by: ["salesperson"], limit: 7, chart: "bar", title: "Days from quote to invoice, by sales person" } },
      { id: "funnel", section: "Quote funnel", w: 6, spec: { dataset: "quotes", measures: ["count", "won", "invoicedCount"], analysis: "funnel", chart: "bar", title: "From quote to invoice" } },
      { id: "openAge", section: "Quote funnel", w: 6, fixedPeriod: true, note: "Open quotes now — valid for 15 days", spec: { dataset: "quotes", measures: ["value"], by: ["age"], sort: "label", chart: "column", filters: [{ field: "outcome", values: ["Open"] }], title: "Open quotes by age" } },
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
    ],
  },
  {
    id: "quotes",
    title: "Quotes",
    desc: "Quotations sent and won — by month, sales person and customer.",
    period: "fy",
    filters: [
      { field: "customerType", label: "Customer type" },
      { field: "sector", label: "Sector" },
      { field: "salesperson", label: "Sales person" },
      { field: "outcome", label: "Outcome" },
      { field: "docValue", label: "Quote value", range: true },
    ],
    tiles: [
      kpi("count", "quotes", "count", "Quotes"),
      kpi("value", "quotes", "value", "Quote value"),
      kpi("won", "quotes", "won", "Quotes won"),
      kpi("rate", "quotes", "winRate", "Win rate"),
      kpi("validValue", "quotes", "validOpen", "Open & still valid (₹)", { fixedPeriod: true }),
      kpi("validCount", "quotes", "validOpenCount", "Open & still valid (quotes)", { fixedPeriod: true }),
      { id: "bymonth", section: "Over time", w: 12, spec: { dataset: "quotes", measures: ["count"], by: ["date", "outcome"], grain: "month", chart: "stacked", title: "Quotes by month and outcome" } },
      { id: "person", section: "Breakdown", w: 6, spec: { dataset: "quotes", measures: ["winRate"], by: ["salesperson"], limit: 7, chart: "bar", title: "Win rate by sales person" } },
      { id: "outcome", section: "Breakdown", w: 6, spec: { dataset: "quotes", measures: ["value"], by: ["outcome"], chart: "donut", title: "Quote value by outcome" } },
      { id: "open", section: "Open quotes", w: 12, spec: { dataset: "quotes", measures: ["value"], by: ["customer"], limit: 10, chart: "bar", filters: [{ field: "outcome", values: ["Open"] }], title: "Biggest open quotes (by customer)" } },
    ],
  },
];
