import type { BoardTraining, PipelineDoc, Training } from "./types";
import { MONTHS_SHORT, fiscalYearStart, parseYmd, startOfDay } from "./dates";

/*
 * Training revenue forecast (owner, 20 Oct) — from the Zoho invoices by training date, like the Revenue tile.
 *  - This month: invoiced so far + invoiced for later this month + "booked": this month's board trainings that haven't
 *    reached an invoice yet, at the value of their PI, or of their quote while it is at most 15 days old (owner: quotes
 *    expire after 15 days — they make a new one, so an older quote's price isn't counted).
 *  - Later months: last year's same month × this year's momentum (revenue so far vs the same days last year).
 */

export const QUOTE_VALID_DAYS = 15;

const counts = (t: Training) => t.status !== "void" && t.status !== "draft" && t.status !== "pending_approval";
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const DAY = 86_400_000;

export type BookedWhy = "expired" | "part invoiced" | "no amount";
export interface Booked { t: BoardTraining; doc?: PipelineDoc; amount: number; why?: BookedWhy }

export interface ForecastMonth {
  key: string; // YYYY-MM
  label: string;
  year: number;
  lastYear: number; // the same month last fiscal year
  thisYear?: number; // invoiced so far (months up to this one)
  projected?: number; // this month and later: the month's expected total
  cumLast: number; // running totals from April
  cumThis?: number;
  cumProjected?: number;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface RevenueForecast {
  months: ForecastMonth[];
  /** This fiscal year so far ÷ last year up to the same day (1 when last year had nothing yet). */
  growth: number;
  soFar: number;
  sameDaysLastYear: number;
  monthSoFar: number;
  invoicedAhead: number; // invoices for trainings later this month
  booked: Booked[];
  bookedAmount: number;
  monthEnd: number;
  fyEnd: number;
  lastFyTotal: number;
  /** Today on the x axis: months since April, fractional (20 Oct ≈ 6.65). */
  todayX: number;
}

/** This month's trainings not yet invoiced, priced from their PI or a quote up to 15 days old. */
export function bookedThisMonth(board: BoardTraining[], pipeline: PipelineDoc[], today: Date): Booked[] {
  const key = monthKey(today);
  const docs = new Map(pipeline.map((d) => [d.id, d]));
  return board
    .filter((t) => t.status !== "tbd" && t.dates.length && (t.dates.at(-1) ?? "").startsWith(key) && /^(quote|pi):/.test(t.id))
    .map((t): Booked => {
      const [kind, id] = t.id.split(":");
      const doc = docs.get(`${kind === "pi" ? "salesorder" : "estimate"}:${id}`);
      if (!doc) return { t, amount: 0, why: "no amount" };
      if (doc.kind === "salesorder" && doc.status !== "open") return { t, doc, amount: 0, why: "part invoiced" };
      if (doc.kind === "estimate" && (startOfDay(today).getTime() - parseYmd(doc.date).getTime()) / DAY > QUOTE_VALID_DAYS) return { t, doc, amount: 0, why: "expired" };
      return { t, doc, amount: doc.amount };
    })
    .sort((a, b) => (a.t.dates.at(-1) ?? "").localeCompare(b.t.dates.at(-1) ?? ""));
}

export function revenueForecast(trainings: Training[], lastYear: { date: string; amount: number }[], board: BoardTraining[], pipeline: PipelineDoc[], today: Date): RevenueForecast {
  const t0 = startOfDay(today);
  const fy = fiscalYearStart(today);
  const lastFy = new Date(fy.getFullYear() - 1, fy.getMonth(), 1);
  const sameDayLastYear = new Date(t0.getFullYear() - 1, t0.getMonth(), Math.min(t0.getDate(), new Date(t0.getFullYear() - 1, t0.getMonth() + 1, 0).getDate()));
  const rows = trainings.filter(counts).map((t) => ({ d: parseYmd(t.trainingDate), amount: t.amount })).filter((r) => r.d >= fy);
  const lastRows = lastYear.map((r) => ({ d: parseYmd(r.date), amount: r.amount }));
  const sum = (xs: { amount: number }[]) => xs.reduce((s, r) => s + r.amount, 0);

  const soFar = sum(rows.filter((r) => r.d <= t0));
  const sameDaysLastYear = sum(lastRows.filter((r) => r.d <= sameDayLastYear));
  const growth = sameDaysLastYear > 0 ? soFar / sameDaysLastYear : 1;

  const booked = bookedThisMonth(board, pipeline, today);
  const bookedAmount = sum(booked);
  let cumLast = 0;
  let cumThis = 0;
  let cumProjected = 0;
  let monthSoFar = 0;
  let invoicedAhead = 0;
  const months = Array.from({ length: 12 }, (_, i): ForecastMonth => {
    const from = new Date(fy.getFullYear(), fy.getMonth() + i, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    const lastFrom = new Date(lastFy.getFullYear(), lastFy.getMonth() + i, 1);
    const lastTo = new Date(lastFrom.getFullYear(), lastFrom.getMonth() + 1, 0);
    const last = sum(lastRows.filter((r) => r.d >= lastFrom && r.d <= lastTo));
    cumLast += last;
    const inMonth = rows.filter((r) => r.d >= from && r.d <= to);
    const isCurrent = from <= t0 && t0 <= to;
    const isFuture = from > t0;
    const base = { key: monthKey(from), label: MONTHS_SHORT[from.getMonth()], year: from.getFullYear(), lastYear: last, cumLast, isCurrent, isFuture };
    if (!isCurrent && !isFuture) {
      const v = sum(inMonth);
      cumThis += v;
      cumProjected += v;
      return { ...base, thisYear: v, cumThis };
    }
    if (isCurrent) {
      monthSoFar = sum(inMonth.filter((r) => r.d <= t0));
      invoicedAhead = sum(inMonth.filter((r) => r.d > t0));
      const projected = monthSoFar + invoicedAhead + bookedAmount;
      cumThis += monthSoFar;
      cumProjected += projected;
      return { ...base, thisYear: monthSoFar, projected, cumThis, cumProjected };
    }
    // Already invoiced for a later month counts even when it beats last year's pattern.
    const projected = Math.max(last * growth, sum(inMonth));
    cumProjected += projected;
    return { ...base, projected, cumProjected };
  });

  const ci = months.findIndex((m) => m.isCurrent);
  const daysInMonth = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate();
  return {
    months,
    growth,
    soFar,
    sameDaysLastYear,
    monthSoFar,
    invoicedAhead,
    booked,
    bookedAmount,
    monthEnd: monthSoFar + invoicedAhead + bookedAmount,
    fyEnd: cumProjected,
    lastFyTotal: cumLast,
    todayX: Math.max(0, ci) + t0.getDate() / daysInMonth,
  };
}
