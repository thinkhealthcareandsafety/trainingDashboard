import type { Training } from "./types";
import { MONTHS_SHORT, addDays, fiscalYearStart, parseYmd, startOfDay, workingDaysInRange } from "./dates";

export const MONTHLY_TARGET = 10;
export const YEARLY_TARGET = 120;

/** Draft and void invoices don't count toward target (see spec open question). */
export function isDelivered(t: Training, today: Date): boolean {
  return t.status !== "void" && t.status !== "draft" && t.status !== "pending_approval" && parseYmd(t.trainingDate) <= startOfDay(today);
}

export function isScheduled(t: Training, today: Date): boolean {
  return t.status !== "void" && parseYmd(t.trainingDate) > startOfDay(today);
}

function inRange(t: Training, from: Date, to: Date) {
  const d = parseYmd(t.trainingDate);
  return d >= from && d <= to;
}

export interface PeriodStats {
  completed: number;
  scheduled: number;
  target: number;
  pct: number;
  expected: number; // where we should be today at a linear pace over working days
  ahead: number; // completed - expected
  forecast: number; // completed + scheduled for the rest of the period
  revenue: number;
  participants: number;
}

function periodStats(trainings: Training[], from: Date, to: Date, target: number, today: Date): PeriodStats {
  const t0 = startOfDay(today);
  const inPeriod = trainings.filter((t) => inRange(t, from, to));
  const delivered = inPeriod.filter((t) => isDelivered(t, today));
  const scheduled = inPeriod.filter((t) => isScheduled(t, today));
  const expected = (target * workingDaysInRange(from, t0)) / workingDaysInRange(from, to);
  return {
    completed: delivered.length,
    scheduled: scheduled.length,
    target,
    pct: delivered.length / target,
    expected,
    ahead: delivered.length - expected,
    forecast: delivered.length + scheduled.length,
    revenue: delivered.reduce((s, t) => s + t.amount, 0),
    participants: delivered.reduce((s, t) => s + t.participants, 0),
  };
}

export function monthStats(trainings: Training[], today: Date, monthOffset = 0): PeriodStats {
  const from = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0);
  return periodStats(trainings, from, to, MONTHLY_TARGET, monthOffset < 0 ? addDays(to, 1) : today);
}

export function fyStats(trainings: Training[], today: Date): PeriodStats {
  const from = fiscalYearStart(today);
  const to = new Date(from.getFullYear() + 1, from.getMonth(), 0);
  return periodStats(trainings, from, to, YEARLY_TARGET, today);
}

export interface MonthPoint {
  key: string; // YYYY-MM
  label: string;
  year: number;
  month: number;
  actual: number;
  scheduled: number;
  revenue: number;
  isCurrent: boolean;
  isFuture: boolean;
}

export function fiscalMonthSeries(trainings: Training[], today: Date): MonthPoint[] {
  const start = fiscalYearStart(today);
  return Array.from({ length: 12 }, (_, i) => {
    const from = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    const inMonth = trainings.filter((t) => inRange(t, from, to));
    const delivered = inMonth.filter((t) => isDelivered(t, today));
    return {
      key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`,
      label: MONTHS_SHORT[from.getMonth()],
      year: from.getFullYear(),
      month: from.getMonth(),
      actual: delivered.length,
      scheduled: inMonth.filter((t) => isScheduled(t, today)).length,
      revenue: delivered.reduce((s, t) => s + t.amount, 0),
      isCurrent: from.getFullYear() === today.getFullYear() && from.getMonth() === today.getMonth(),
      isFuture: from > today,
    };
  });
}

export type BreakdownKey = "trainingType" | "customerName" | "trainer" | "leadSource";

export function breakdown(trainings: Training[], key: BreakdownKey) {
  const map = new Map<string, { count: number; revenue: number; participants: number }>();
  for (const t of trainings) {
    const k = (t[key] as string | undefined) || "Unspecified";
    const cur = map.get(k) ?? { count: 0, revenue: 0, participants: 0 };
    cur.count++;
    cur.revenue += t.amount;
    cur.participants += t.participants;
    map.set(k, cur);
  }
  return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
}

/** Trainings delivered in a month (YYYY-MM) or the whole fiscal year when monthKey is null. */
export function deliveredIn(trainings: Training[], today: Date, monthKey: string | null): Training[] {
  return trainings.filter((t) => {
    if (!isDelivered(t, today)) return false;
    if (monthKey) return t.trainingDate.startsWith(monthKey);
    return parseYmd(t.trainingDate) >= fiscalYearStart(today);
  });
}
