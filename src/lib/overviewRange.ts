/*
 * The Overview's date button (owner, 4 Nov): This month, Last month, This quarter, Custom. Whichever is picked, the comparison
 * stays like for like (owner's rule: this month so far against the same days of last month, never part against whole).
 */
import { addDays, daysBetween, startOfDay } from "./dates";

export type OverviewRange = { kind: "month" | "lastMonth" | "quarter" } | { kind: "custom"; from: string; to: string };
export const RANGE_KEY = "th.overview.range"; // per person, in this browser: a convenience only

export type RangeDates = {
  from: Date; to: Date;
  /** What it's compared with. */
  prevFrom: Date; prevTo: Date;
  label: string;
  /** One calendar month: the monthly targets apply. */
  whole: boolean;
  /** Over before today. */
  past: boolean;
};

const monthName = (d: Date) => d.toLocaleDateString("en-IN", { month: "long" });
const dayMonth = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const earlier = (a: Date, b: Date) => (a < b ? a : b);
const lastDayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** A month; while it's running, compared with the same days of the month before, otherwise with the whole of it. */
function monthRange(first: Date, today: Date, label: string): RangeDates {
  const to = lastDayOf(first);
  const prevFrom = new Date(first.getFullYear(), first.getMonth() - 1, 1);
  const prevEnd = lastDayOf(prevFrom);
  const running = today >= first && today < to;
  const prevTo = running ? new Date(prevFrom.getFullYear(), prevFrom.getMonth(), Math.min(today.getDate(), prevEnd.getDate())) : prevEnd;
  return { from: first, to, prevFrom, prevTo, label, whole: true, past: to < today };
}

export function rangeDates(r: OverviewRange, now: Date): RangeDates {
  const today = startOfDay(now);
  if (r.kind === "lastMonth") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return monthRange(first, today, monthName(first));
  }
  if (r.kind === "quarter") {
    const m = Math.floor(today.getMonth() / 3) * 3;
    const from = new Date(today.getFullYear(), m, 1);
    const to = new Date(today.getFullYear(), m + 3, 0);
    const prevFrom = new Date(today.getFullYear(), m - 3, 1);
    const prevTo = earlier(addDays(prevFrom, daysBetween(from, today)), new Date(today.getFullYear(), m, 0));
    return { from, to, prevFrom, prevTo, label: `${from.toLocaleDateString("en-IN", { month: "short" })}–${to.toLocaleDateString("en-IN", { month: "short" })}`, whole: false, past: false };
  }
  if (r.kind === "custom") {
    const from = startOfDay(new Date(`${r.from}T00:00:00`));
    const to = startOfDay(new Date(`${r.to}T00:00:00`));
    if (from.getDate() === 1 && to.getTime() === lastDayOf(from).getTime()) return monthRange(from, today, monthName(from));
    // The days before it, as many as have happened so far.
    const prevTo = addDays(from, -1);
    return { from, to, prevFrom: addDays(prevTo, -Math.max(0, daysBetween(from, earlier(to, today)))), prevTo, label: `${dayMonth(from)} – ${dayMonth(to)}`, whole: false, past: to < today };
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return monthRange(first, today, monthName(first));
}

/** "1–4 Oct", or "28 Sep – 3 Oct" across months. */
export function spanLabel(a: Date, b: Date): string {
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${dayMonth(b)}` : `${dayMonth(a)} – ${dayMonth(b)}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** What's in the browser, read forgivingly: anything unexpected is simply This month. */
export function parseRange(raw: string | null): OverviewRange {
  try {
    const v = JSON.parse(raw ?? "null") as { kind?: string; from?: unknown; to?: unknown } | null;
    if (v?.kind === "lastMonth" || v?.kind === "quarter") return { kind: v.kind };
    if (v?.kind === "custom" && typeof v.from === "string" && typeof v.to === "string" && DATE.test(v.from) && DATE.test(v.to) && v.from <= v.to) return { kind: "custom", from: v.from, to: v.to };
  } catch {}
  return { kind: "month" };
}
