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

/** Training revenue (invoice lines, before tax) for trainings dated from `from` to `to`, both included. */
export function revenueBetween(trainings: Training[], from: Date, to: Date): number {
  return trainings.filter((t) => t.status !== "void" && t.status !== "draft" && t.status !== "pending_approval" && inRange(t, startOfDay(from), startOfDay(to))).reduce((s, t) => s + t.amount, 0);
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

/** Priyanka's AedSmartx targets (owner, 14 Oct 2026): 5 AED trainings a month, 60 a fiscal year. No people target —
 * AED trainings record no head-count. AED trainings never count toward the team targets. */
export const AED_MONTHLY_TARGET = 5;
export const AED_YEARLY_TARGET = 60;

/** `since` (YYYY-MM-01): the board's first month. A fiscal year that starts before it counts from that month, against
 * the months left (e.g. FY 2026-27 from Sept: 7 of 12 → 35 of 60). */
export interface Targets { month: number; year: number; peopleMonth?: number; peopleYear?: number; since?: string }
export const TEAM_TARGETS: Targets = { month: MONTHLY_TARGET, year: YEARLY_TARGET, peopleMonth: PEOPLE_MONTHLY_TARGET, peopleYear: PEOPLE_YEARLY_TARGET };
export const AED_TARGETS: Targets = { month: AED_MONTHLY_TARGET, year: AED_YEARLY_TARGET, since: "2026-09-01" }; // = AED_SINCE (zohoSync.ts, server-only)

/** The day a training counts on: its last training day (a multi-day training is one training). */
export const countsOn = (t: BoardTraining) => t.dates.at(-1) ?? "";
const dated = (t: BoardTraining) => t.status !== "tbd" && t.dates.length > 0;

export interface BoardPeriod {
  completed: number;
  scheduled: number; // dated today or later, not marked completed yet, counting in this period
  unmarked: number; // the date has passed but nobody pressed "Training completed" — not upcoming, needs marking
  people: number; // people trained (completed)
  peopleScheduled: number;
  target?: number;
  peopleTarget?: number;
  since?: Date; // set when the period starts later than the fiscal year (the board's first month)
  expected: number; // trainings expected by today at a working-day pace
  peopleExpected: number;
}

function boardPeriod(list: BoardTraining[], from: Date, to: Date, today: Date, target?: number, peopleTarget?: number): BoardPeriod {
  const inRange = list.filter((t) => dated(t) && parseYmd(countsOn(t)) >= from && parseYmd(countsOn(t)) <= to);
  const done = inRange.filter((t) => t.status === "completed");
  const t0 = startOfDay(today);
  const open = inRange.filter((t) => t.status !== "completed" && parseYmd(countsOn(t)) >= t0);
  const unmarked = inRange.filter((t) => t.status !== "completed" && parseYmd(countsOn(t)) < t0);
  const share = workingDaysInRange(from, t0 < to ? t0 : to) / Math.max(1, workingDaysInRange(from, to));
  return {
    completed: done.length,
    scheduled: open.length,
    unmarked: unmarked.length,
    people: done.reduce((n, t) => n + t.people, 0),
    peopleScheduled: open.reduce((n, t) => n + t.people, 0),
    target,
    peopleTarget,
    expected: (target ?? 0) * share,
    peopleExpected: (peopleTarget ?? 0) * share,
  };
}

export function boardMonth(list: BoardTraining[], today: Date, targets: Targets = TEAM_TARGETS): BoardPeriod {
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return boardPeriod(list, from, to, today, targets.month, targets.peopleMonth);
}

export function boardYear(list: BoardTraining[], today: Date, targets: Targets = TEAM_TARGETS): BoardPeriod {
  const fy = fiscalYearStart(today);
  const to = new Date(fy.getFullYear() + 1, fy.getMonth(), 0);
  const since = targets.since ? parseYmd(targets.since) : null;
  if (!since || since <= fy) return boardPeriod(list, fy, to, today, targets.year, targets.peopleYear);
  const share = (12 * (to.getFullYear() - since.getFullYear()) + to.getMonth() - since.getMonth() + 1) / 12;
  const part = (n?: number) => (n === undefined ? undefined : Math.round(n * share));
  return { ...boardPeriod(list, since, to, today, part(targets.year), part(targets.peopleYear)), since };
}

export interface BoardMonthPoint extends Omit<MonthPoint, "revenue"> { people: number }

/** The fiscal year month by month — from the board's first month when it started later (`since`, e.g. AedSmartx from Sept). */
export function boardMonthSeries(list: BoardTraining[], today: Date, since?: string): BoardMonthPoint[] {
  const fy = fiscalYearStart(today);
  const first = since && parseYmd(since) > fy ? parseYmd(since) : fy;
  const start = new Date(first.getFullYear(), first.getMonth(), 1);
  const months = 12 - (12 * (start.getFullYear() - fy.getFullYear()) + start.getMonth() - fy.getMonth());
  return Array.from({ length: months }, (_, i) => {
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

/** Dated, not yet completed trainings with a day in the next `days` days — today and the days after it, `days` in all — soonest first. */
export function upcoming(list: BoardTraining[], today: Date, days: number): { t: BoardTraining; next: string }[] {
  const from = ymdOf(startOfDay(today));
  const to = ymdOf(addDays(startOfDay(today), days - 1));
  return list
    .filter((t) => t.status !== "completed" && dated(t))
    .map((t) => ({ t, next: t.dates.find((d) => d >= from) ?? "" }))
    .filter((x) => x.next && x.next <= to)
    .sort((a, b) => a.next.localeCompare(b.next) || a.t.customerName.localeCompare(b.t.customerName));
}
