import type { BoardTraining, Training } from "./types";
import { MONTHS_SHORT, addDays, fiscalYearStart, parseYmd, startOfDay, workingDaysInRange, ymd as ymdOf } from "./dates";

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

/* ---------------- The boards' trainings (targets, trend, breakdown) ---------------- */

/** Targets (owner, 13 Oct 2026): 10 trainings and 300 people a month; 120 and 3000 a fiscal year (April–March). */
export const PEOPLE_MONTHLY_TARGET = 300;
export const PEOPLE_YEARLY_TARGET = 3000;

/** The day a training counts on: its last training day (a multi-day training is one training). */
export const countsOn = (t: BoardTraining) => t.dates.at(-1) ?? "";
const dated = (t: BoardTraining) => t.status !== "tbd" && t.dates.length > 0;

export interface BoardPeriod {
  completed: number;
  scheduled: number; // dated, not marked completed yet, counting in this period
  people: number; // people trained (completed)
  peopleScheduled: number;
  target?: number;
  peopleTarget?: number;
  expected: number; // trainings expected by today at a working-day pace
  peopleExpected: number;
}

function boardPeriod(list: BoardTraining[], from: Date, to: Date, today: Date, target?: number, peopleTarget?: number): BoardPeriod {
  const inRange = list.filter((t) => dated(t) && parseYmd(countsOn(t)) >= from && parseYmd(countsOn(t)) <= to);
  const done = inRange.filter((t) => t.status === "completed");
  const open = inRange.filter((t) => t.status !== "completed");
  const t0 = startOfDay(today);
  const share = workingDaysInRange(from, t0 < to ? t0 : to) / Math.max(1, workingDaysInRange(from, to));
  return {
    completed: done.length,
    scheduled: open.length,
    people: done.reduce((n, t) => n + t.people, 0),
    peopleScheduled: open.reduce((n, t) => n + t.people, 0),
    target,
    peopleTarget,
    expected: (target ?? 0) * share,
    peopleExpected: (peopleTarget ?? 0) * share,
  };
}

export function boardMonth(list: BoardTraining[], today: Date, targets = true): BoardPeriod {
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return boardPeriod(list, from, to, today, targets ? MONTHLY_TARGET : undefined, targets ? PEOPLE_MONTHLY_TARGET : undefined);
}

export function boardYear(list: BoardTraining[], today: Date, targets = true): BoardPeriod {
  const from = fiscalYearStart(today);
  const to = new Date(from.getFullYear() + 1, from.getMonth(), 0);
  return boardPeriod(list, from, to, today, targets ? YEARLY_TARGET : undefined, targets ? PEOPLE_YEARLY_TARGET : undefined);
}

export interface BoardMonthPoint extends Omit<MonthPoint, "revenue"> { people: number }

export function boardMonthSeries(list: BoardTraining[], today: Date): BoardMonthPoint[] {
  const start = fiscalYearStart(today);
  return Array.from({ length: 12 }, (_, i) => {
    const from = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    const p = boardPeriod(list, from, to, today);
    return {
      key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`,
      label: MONTHS_SHORT[from.getMonth()],
      year: from.getFullYear(),
      month: from.getMonth(),
      actual: p.completed,
      scheduled: p.scheduled,
      people: p.people,
      isCurrent: from.getFullYear() === today.getFullYear() && from.getMonth() === today.getMonth(),
      isFuture: from > today,
    };
  });
}

/** Completed trainings in a month (YYYY-MM), or the whole fiscal year when monthKey is null. */
export function completedIn(list: BoardTraining[], today: Date, monthKey: string | null): BoardTraining[] {
  return list.filter((t) => {
    if (t.status !== "completed" || !dated(t)) return false;
    if (monthKey) return countsOn(t).startsWith(monthKey);
    return parseYmd(countsOn(t)) >= fiscalYearStart(today);
  });
}

export type BoardBreakdownKey = "training" | "client" | "trainer";

/** Count and people per training type, client (alias first) or trainer (a training with two trainers counts for both). */
export function boardBreakdown(list: BoardTraining[], key: BoardBreakdownKey) {
  const map = new Map<string, { count: number; people: number; items: BoardTraining[] }>();
  const add = (k: string, t: BoardTraining) => {
    const cur = map.get(k) ?? { count: 0, people: 0, items: [] };
    cur.count++;
    cur.people += t.people;
    cur.items.push(t);
    map.set(k, cur);
  };
  for (const t of list) {
    if (key === "trainer") for (const n of t.trainers.length ? t.trainers : ["Not recorded"]) add(n, t);
    else add((key === "training" ? t.training : t.alias || t.customerName) || "Unspecified", t);
  }
  return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count || b.people - a.people);
}

/** Dated, not yet completed trainings with a day in the next `days` days (today included), soonest first. */
export function upcoming(list: BoardTraining[], today: Date, days: number): { t: BoardTraining; next: string }[] {
  const from = ymdOf(startOfDay(today));
  const to = ymdOf(addDays(startOfDay(today), days));
  return list
    .filter((t) => t.status !== "completed" && dated(t))
    .map((t) => ({ t, next: t.dates.find((d) => d >= from) ?? "" }))
    .filter((x) => x.next && x.next <= to)
    .sort((a, b) => a.next.localeCompare(b.next) || a.t.customerName.localeCompare(b.t.customerName));
}
