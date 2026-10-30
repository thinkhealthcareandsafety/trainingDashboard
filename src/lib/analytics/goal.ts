import { workingDaysInRange } from "../dates";

/*
 * The monthly revenue goal (owner, 27 Oct: "a monthly goal of ₹50 lakh shown as a vertical meter on the left").
 * Revenue = every Zoho Books invoice, before tax — the Sales dataset's "Revenue". Admin can change the goal, and set a
 * different one for single months. Pure: the meter (browser) and the route (server) share it.
 */

export const DEFAULT_GOAL = 50_00_000;
/** "Booked" = PIs from the last BOOKED_DAYS days not invoiced yet. Older open PIs are mostly stale (27 Oct: most of the
 * open PI value is over a year old), so they'd make the month look closer than it is. */
export const BOOKED_DAYS = 60;

/** `people`: each sales person's monthly revenue target (owner, 30 Oct — phase 5), by their Zoho name. */
export type Goal = { monthly: number; months: Record<string, number>; people: Record<string, number>; updatedAt?: string; updatedBy?: string };

export const goalFor = (g: Goal, month: string) => g.months[month] ?? g.monthly;

const local = (ymd: string) => new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
export const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

export type Pace = {
  /** Where an even pace over the working days (Mon–Sat) puts us by the end of today. */
  expected: number;
  /** Month end if the rest of the month goes like the working days so far, today counted as a whole day (null for the
   * first 3 working days — too noisy). */
  estimate: number | null;
  /** ₹ needed per working day left (today included), 0 once reached. */
  perDay: number;
  daysLeft: number;
};

export function pace(goal: number, invoiced: number, today: string): Pace {
  const month = today.slice(0, 7);
  const from = local(`${month}-01`);
  const end = local(monthEnd(month));
  const t = local(today);
  const all = workingDaysInRange(from, end);
  const done = workingDaysInRange(from, t);
  const daysLeft = workingDaysInRange(t, end);
  return {
    expected: (goal * done) / Math.max(1, all),
    estimate: done > 3 ? (invoiced / done) * all : null,
    perDay: daysLeft ? Math.max(0, goal - invoiced) / daysLeft : 0,
    daysLeft,
  };
}
