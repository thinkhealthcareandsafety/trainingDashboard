// All dates are handled as local calendar dates (the team works in IST).

export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from a to b (positive when b is later). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Zoho org fiscal year starts in April. */
export const FY_START_MONTH = 3;

export function fiscalYearStart(d: Date): Date {
  const y = d.getMonth() >= FY_START_MONTH ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, FY_START_MONTH, 1);
}

export function fiscalYearLabel(d: Date): string {
  const s = fiscalYearStart(d).getFullYear();
  return `FY ${s}-${String((s + 1) % 100).padStart(2, "0")}`;
}

/** Working days = every day except Sunday. */
export function workingDaysInRange(from: Date, to: Date): number {
  let n = 0;
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) if (d.getDay() !== 0) n++;
  return n;
}

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function fmtDate(s: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  const d = typeof s === "string" ? (s.length === 10 ? parseYmd(s) : new Date(s)) : s;
  return d.toLocaleDateString("en-IN", opts);
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtINR(n: number, compact = false): string {
  if (compact) {
    if (n >= 1e7) return `Rs.${(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `Rs.${(n / 1e5).toFixed(1)}L`;
    if (n >= 1e3) return `Rs.${(n / 1e3).toFixed(0)}K`;
  }
  return `Rs.${n.toLocaleString("en-IN")}`;
}

export function relativeDue(iso: string, now: Date): string {
  const diff = daysBetween(now, new Date(iso));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff < 0 ? `${-diff}d late` : `in ${diff}d`;
}
