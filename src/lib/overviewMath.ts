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

/*
 * Against last year (owner, 17 Nov): today / this week / this month as they stand against last financial year's average
 * day / week / month (its total ÷ its days, ÷ its days/7, ÷ 12); the year so far against the same days of last FY. Each
 * side has quotations sent, invoiced, and the conversion (invoiced ÷ quotations, %).
 */
export type Side = { quoted: number; invoiced: number; conversion: number | null };
export type VsLastYear = { kind: Exclude<Period, "custom">; now: Side; last: Side; label: string; daysIn: number; daysTotal: number; vsCompany: boolean };

const side = (quoted: number, invoiced: number): Side => ({ quoted, invoiced, conversion: quoted > 0 ? Math.round((invoiced / quoted) * 100) : null });

/**
 * `against`: whose last year to compare with. Owner, 17 Nov: a salesperson against the company's last year ("the
 * salesperson vs the company's, not their own" — they may ask for their own again later).
 */
export function vsLastYear(days: DaySums, person: string, kind: Exclude<Period, "custom">, on: string, against: string = person): VsLastYear {
  const d = parse(on);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const lastFrom = `${y - 1}-04-01`, lastTo = `${y}-03-31`;
  const lastDays = daysBetween(lastFrom, lastTo) + 1;
  const span = periods(kind, on);
  const n = sum(days, person, span.now.from, span.now.to);
  let last: { quoted: number; invoiced: number };
  if (kind === "year") last = sum(days, against, span.before.from, span.before.to);
  else {
    const t = sum(days, against, lastFrom, lastTo);
    const share = kind === "day" ? 1 / lastDays : kind === "week" ? 7 / lastDays : 1 / 12;
    last = { quoted: Math.round(t.quoted * share), invoiced: Math.round(t.invoiced * share) };
  }
  const daysIn = daysBetween(span.now.from, span.now.to) + 1;
  const daysTotal = kind === "day" ? 1 : kind === "week" ? 7 : kind === "month" ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() : daysBetween(`${y}-04-01`, `${y + 1}-03-31`) + 1;
  return { kind, now: side(n.quoted, n.invoiced), last: side(last.quoted, last.invoiced), label: span.now.label, daysIn, daysTotal, vsCompany: against !== person && against === "all" };
}

/**
 * The story of one row in short plain lines (owner: "what was more then, is less now, the conversion is less…"), each
 * marked good (green), needs to be better (red) or neutral.
 */
export type Remark = { text: string; tone: "good" | "bad" | "neutral" };
export function remarks(v: VsLastYear, nowWord: string): Remark[] {
  const lastWord = v.vsCompany
    ? { day: "the company’s average day last year", week: "the company’s average week last year", month: "the company’s average month last year", year: "the company’s same days last year" }[v.kind]
    : { day: "last year’s average day", week: "last year’s average week", month: "last year’s average month", year: "the same days last year" }[v.kind];
  const lines: Remark[] = [];
  const say = (what: string, a: number, b: number) => {
    if (!a && !b) return lines.push({ text: `No ${what.toLowerCase()} ${nowWord}, and none last year either.`, tone: "neutral" });
    if (!a) return lines.push({ text: `No ${what.toLowerCase()} ${nowWord} yet (${lastWord}: ${inrShort(b)}).`, tone: "bad" });
    if (!b) return lines.push({ text: `${what}: ${inrShort(a)}, against none last year.`, tone: "good" });
    const c = change(a, b)!;
    if (c === 0) return lines.push({ text: `${what}: the same as ${lastWord}.`, tone: "neutral" });
    lines.push({ text: `${what}: ${Math.abs(c)}% ${c > 0 ? "more" : "less"} than ${lastWord}.`, tone: c > 0 ? "good" : "bad" });
  };
  say("Quotations", v.now.quoted, v.last.quoted);
  say("Invoiced", v.now.invoiced, v.last.invoiced);
  const a = v.now.conversion, b = v.last.conversion;
  if (a !== null && b !== null) {
    lines.push(a === b
      ? { text: `Conversion the same as last year: ${a}%.`, tone: "neutral" }
      : { text: `Conversion ${a > b ? "better" : "worse"}: ${a}%, against ${b}% last year.`, tone: a > b ? "good" : "bad" });
  }
  const behind = v.now.quoted < v.last.quoted || v.now.invoiced < v.last.invoiced;
  if (behind && v.kind !== "day" && v.kind !== "year" && v.daysIn < v.daysTotal) lines.push({ text: `${v.daysIn} of ${v.daysTotal} days gone: still time to catch up.`, tone: "neutral" });
  return lines;
}

/** Month by month for the line chart: this financial year's months up to the day looked at (owner, 17 Nov: "this FY for now"; the last one so far); `n` for a fixed count instead. */
export type MonthPoint = { key: string; label: string; year: number; quoted: number; invoiced: number; conversion: number | null; partial: boolean };
export function monthly(days: DaySums, person: string, on: string, n?: number): MonthPoint[] {
  const d = parse(on);
  n ??= ((d.getMonth() - 3 + 12) % 12) + 1; // April → 1, March → 12
  const out: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const to = i === 0 ? on : ymdOf(last);
    const t = sum(days, person, ymdOf(first), to);
    const s = side(t.quoted, t.invoiced);
    out.push({ key: ymdOf(first).slice(0, 7), label: first.toLocaleDateString("en-IN", { month: "short" }), year: first.getFullYear(), ...s, partial: i === 0 && to < ymdOf(last) });
  }
  return out;
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


/*
 * This FY against last FY, day by day (owner, 18 Nov: "x axis is days, y axis is value … 2 lines, this FY and last
 * year"; "1st April to current for the latest year, and for last year the whole 365 days"). Day 0 is 1 April; this FY
 * runs to the day looked at, last FY all its days. `running` = the total so far instead of each day's own value.
 */
export type FyLines = { start: string; lastStart: string; length: number; now: { quoted: number[]; invoiced: number[] }; last: { quoted: number[]; invoiced: number[] } };
export function fyLines(days: DaySums, person: string, on: string, running = false): FyLines {
  const d = parse(on);
  const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const start = `${fy}-04-01`, lastStart = `${fy - 1}-04-01`;
  const length = daysBetween(lastStart, start); // 365 or 366
  const series = (from: string, n: number) => {
    const quoted: number[] = [], invoiced: number[] = [];
    let q = 0, i = 0;
    for (let k = 0; k < n; k++) {
      const v = days[add(from, k)]?.[person] ?? [0, 0];
      q = running ? q + v[0] : v[0];
      i = running ? i + v[1] : v[1];
      quoted.push(q); invoiced.push(i);
    }
    return { quoted, invoiced };
  };
  return { start, lastStart, length, now: series(start, Math.min(length, daysBetween(start, on) + 1)), last: series(lastStart, length) };
}
