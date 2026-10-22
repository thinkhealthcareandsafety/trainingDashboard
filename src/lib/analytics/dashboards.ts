import type { Spec } from "./query";

/*
 * The official starter dashboards (ANALYTICS-PLAN.md §5) — defined here, not in the database, so they're always there
 * and always the same. A tile is a report spec; the dashboard's filter bar adds its period and filters to every tile
 * whose data has that field. `fixedPeriod` tiles ignore the period (e.g. "owed right now").
 */

export type Tile = { id: string; spec: Spec; w: 3 | 4 | 6 | 12; fixedPeriod?: boolean; note?: string };
export type DashFilter = { field: string; label: string };
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
    ],
    tiles: [
      kpi("rev", "sales", "revenue", "Revenue (before tax)"),
      kpi("inv", "sales", "invoices", "Invoices"),
      kpi("cust", "sales", "customers", "Customers billed"),
      kpi("avg", "sales", "avgInvoice", "Average invoice"),
      { id: "bymonth", w: 12, spec: { dataset: "sales", measures: ["revenue"], by: ["date"], grain: "month", chart: "column", title: "Revenue by month" } },
      { id: "sector", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["sector"], limit: 7, chart: "bar", title: "Revenue by sector" } },
      { id: "customers", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["customer"], limit: 10, chart: "bar", title: "Top 10 customers" } },
      { id: "group", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["itemGroup"], limit: 7, chart: "bar", title: "Revenue by item group" } },
      { id: "lead", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["leadSource"], limit: 6, chart: "donut", title: "Revenue by lead source" } },
      { id: "person", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["salesperson"], limit: 7, chart: "bar", title: "Revenue by sales person" } },
      { id: "state", w: 6, spec: { dataset: "sales", measures: ["revenue"], by: ["state"], limit: 10, chart: "bar", title: "Revenue by state" } },
      { id: "owed", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["outstanding"], by: ["ageBand"], sort: "label", chart: "column", filters: [{ field: "ageBand", values: ["Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] }], title: "Owed to us, by age" } },
      { id: "debtors", w: 6, fixedPeriod: true, note: "All open invoices, whatever the period", spec: { dataset: "invoices", measures: ["outstanding"], by: ["customer"], limit: 10, chart: "bar", title: "Who owes the most" } },
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
      { id: "bymonth", w: 12, spec: { dataset: "trainings", measures: ["count"], by: ["date", "status"], grain: "month", chart: "stacked", title: "Trainings by month" } },
      { id: "trainer", w: 6, spec: { dataset: "trainings", measures: ["count"], by: ["trainer"], chart: "bar", title: "Trainings by trainer" } },
      { id: "type", w: 6, spec: { dataset: "trainings", measures: ["people"], by: ["trainingType"], limit: 7, chart: "bar", title: "People by training type" } },
      { id: "customers", w: 6, spec: { dataset: "trainings", measures: ["people"], by: ["customer"], limit: 10, chart: "bar", title: "Top customers (people)" } },
      { id: "sector", w: 6, spec: { dataset: "trainings", measures: ["count"], by: ["sector"], limit: 6, chart: "donut", title: "Trainings by sector" } },
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
    ],
    tiles: [
      kpi("count", "quotes", "count", "Quotes"),
      kpi("value", "quotes", "value", "Quote value"),
      kpi("won", "quotes", "won", "Quotes won"),
      kpi("rate", "quotes", "winRate", "Win rate"),
      { id: "bymonth", w: 12, spec: { dataset: "quotes", measures: ["count"], by: ["date", "outcome"], grain: "month", chart: "stacked", title: "Quotes by month and outcome" } },
      { id: "person", w: 6, spec: { dataset: "quotes", measures: ["winRate"], by: ["salesperson"], limit: 7, chart: "bar", title: "Win rate by sales person" } },
      { id: "outcome", w: 6, spec: { dataset: "quotes", measures: ["value"], by: ["outcome"], chart: "donut", title: "Quote value by outcome" } },
      { id: "open", w: 12, spec: { dataset: "quotes", measures: ["value"], by: ["customer"], limit: 10, chart: "bar", filters: [{ field: "outcome", values: ["Open"] }], title: "Biggest open quotes (by customer)" } },
    ],
  },
];
