/*
 * The new Overview (owner, 16 Nov sketch: "replace the Overview section entirely"): quotations sent and invoiced, in
 * value, for the company and for Sumit, Ashish and Pranjal (Shikha: only her training goals) — today / this week /
 * this month (or dates they pick) against the period before; and this financial year so far: its day number, the
 * average per day, today against that average. Pure and client-safe; the server sends one sum per day per person.
 */

export type DaySums = Record<string, Record<string, [number, number]>>; // ymd → person → [quoted, invoiced]
export const PEOPLE = [
  { key: "all", label: "Company" },
  { key: "sumit", label: "Sumit" },
  { key: "ashish", label: "Ashish" },
  { key: "pranjal", label: "Pranjal" },
] as const;
export type PersonKey = (typeof PEOPLE)[number]["key"];

/** A salesperson's name ("Sumit A Shah") → the Overview's key, by first name; others count only for the company. */
export function personKey(name: string): PersonKey | null {
  const f = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return f === "sumit" || f === "ashish" || f === "pranjal" ? f : null;
}

const parse = (s: string) => new Date(`${s}T00:00:00`);
export const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const add = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymdOf(d); };
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

/** Quoted and invoiced for one person over [from, to], both days included. */
export function sum(days: DaySums, person: string, from: string, to: string): { quoted: number; invoiced: number } {
  let quoted = 0, invoiced = 0;
  for (const [day, people] of Object.entries(days)) {
    if (day < from || day > to) continue;
    const v = people[person];
    if (v) { quoted += v[0]; invoiced += v[1]; }
  }
  return { quoted, invoiced };
}

export type Period = "day" | "week" | "month" | "year" | "custom";
export type Span = { from: string; to: string; label: string };
/**
 * The period and the one it's compared with (owner: "compare to yesterday, last week, last month"), like for like: this
 * week so far against the same days of last week, this month so far against the same days of last month; a picked
 * range against the same number of days just before it.
 */
export function periods(kind: Period, on: string, custom?: { from: string; to: string }): { now: Span; before: Span } {
  const fmt = (s: string) => parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (kind === "day") return { now: { from: on, to: on, label: fmt(on) }, before: { from: add(on, -1), to: add(on, -1), label: fmt(add(on, -1)) } };
  if (kind === "week") {
    const d = parse(on);
    const mon = add(on, -((d.getDay() + 6) % 7));
    const n = daysBetween(mon, on);
    return { now: { from: mon, to: on, label: `${fmt(mon)} – ${fmt(on)}` }, before: { from: add(mon, -7), to: add(mon, -7 + n), label: `${fmt(add(mon, -7))} – ${fmt(add(mon, -7 + n))}` } };
  }
  if (kind === "year") {
    // The financial year so far (April) against the same days of the last one.
    const d = parse(on);
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const from = `${y}-04-01`, lastFrom = `${y - 1}-04-01`;
    const lastTo = ymdOf(new Date(d.getFullYear() - 1, d.getMonth(), Math.min(d.getDate(), new Date(d.getFullYear() - 1, d.getMonth() + 1, 0).getDate())));
    return { now: { from, to: on, label: `${fmt(from)} – ${fmt(on)}` }, before: { from: lastFrom, to: lastTo, label: `${fmt(lastFrom)} – ${fmt(lastTo)}` } };
  }
  if (kind === "month") {
    const d = parse(on);
    const first = ymdOf(new Date(d.getFullYear(), d.getMonth(), 1));
    const prevFirst = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevLast = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
    const prevTo = ymdOf(new Date(prevFirst.getFullYear(), prevFirst.getMonth(), Math.min(d.getDate(), prevLast)));
    return { now: { from: first, to: on, label: `${fmt(first)} – ${fmt(on)}` }, before: { from: ymdOf(prevFirst), to: prevTo, label: `${fmt(ymdOf(prevFirst))} – ${fmt(prevTo)}` } };
  }
  const from = custom?.from && custom.to && custom.from <= custom.to ? custom.from : on;
  const to = custom?.from && custom.to && custom.from <= custom.to ? custom.to : on;
  const n = daysBetween(from, to) + 1;
  return { now: { from, to, label: `${fmt(from)} – ${fmt(to)}` }, before: { from: add(from, -n), to: add(from, -1), label: `${fmt(add(from, -n))} – ${fmt(add(from, -1))}` } };
}

/** The financial year so far (April to March): which day it is, the totals, the average per day, today against it. */
export function yearSoFar(days: DaySums, person: string, today: string): { day: number; label: string; quoted: number; invoiced: number; avgQuoted: number; avgInvoiced: number; todayQuoted: number; todayInvoiced: number } {
  const d = parse(today);
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const start = `${startYear}-04-01`;
  const day = daysBetween(start, today) + 1;
  const t = sum(days, person, start, today), n = sum(days, person, today, today);
  return {
    day, label: `FY ${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`,
    quoted: t.quoted, invoiced: t.invoiced, avgQuoted: Math.round(t.quoted / day), avgInvoiced: Math.round(t.invoiced / day),
    todayQuoted: n.quoted, todayInvoiced: n.invoiced,
  };
}

/** The change against the other value, as a signed % (null when there's nothing to compare with). */
export const change = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** ₹ in Indian style, compact: ₹8,450 · ₹4.2 L · ₹1.35 Cr. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${+(n / 1e7).toFixed(a >= 1e8 ? 1 : 2)} Cr`;
  if (a >= 1e5) return `₹${+(n / 1e5).toFixed(a >= 1e6 ? 1 : 2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** One day's sums from the Sales copy's rows (the server's /api/overview): sent = not a draft; invoiced = not a draft or void. */
export type SalesDayRow = { _id: string; kind: string; date: string; row: Record<string, unknown> };

export function daySums(rows: SalesDayRow[], since: string): DaySums {
  const out: DaySums = {};
  for (const r of rows) {
    if (r.kind !== "estimates" && r.kind !== "invoices") continue;
    const day = String(r.row.date ?? r.date ?? "").slice(0, 10);
    if (!day || day < since) continue;
    const status = String(r.row.status ?? "").toLowerCase();
    if (status === "draft" || (r.kind === "invoices" && status === "void")) continue;
    const value = Number(r.row.total) || 0;
    const slot = r.kind === "estimates" ? 0 : 1;
    const day0 = (out[day] ??= {});
    for (const who of ["all", personKey(String(r.row.salesperson_name ?? ""))]) {
      if (!who) continue;
      const v = (day0[who] ??= [0, 0]);
      v[slot] += value;
    }
  }
  return out;
}

