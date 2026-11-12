import { cleanPhone } from "./trainingManager";

/*
 * The Training Manager's rules (docs/TRAINING_MANAGER_PLAN.md steps 5–7), pure, used by the portal and the server:
 * a coordinator's proposal (dates, location, headcount), the attendee list (typed, Excel/CSV, QR), duplicates by phone,
 * and the TH numbers.
 */

export type ProposalDate = { date: string; time: string }; // "2026-12-04", "10:00" ("" = no time yet)
export type Proposal = { dates: ProposalDate[]; tentative: boolean; location: string; headcount: number; at: string; by: string };
export type Stamp = "Awaiting date" | "Proposed" | "Confirmed";

export const MAX_DATES = 10;
export const MAX_PEOPLE = 2000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The coordinator's proposal, checked (today = "YYYY-MM-DD", India time, from the caller). */
export function readProposal(raw: unknown, today: string): Omit<Proposal, "at" | "by"> | { error: string } {
  const r = (raw ?? {}) as { dates?: unknown; tentative?: unknown; location?: unknown; headcount?: unknown };
  const dates: ProposalDate[] = [];
  for (const d of Array.isArray(r.dates) ? (r.dates as { date?: unknown; time?: unknown }[]) : []) {
    const date = String(d?.date ?? "").trim(), time = String(d?.time ?? "").trim();
    if (!date && !time) continue;
    if (!DATE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) return { error: "Pick a date for each day" };
    if (date < today) return { error: "A date can't be in the past" };
    if (time && !TIME.test(time)) return { error: "That time doesn't look right" };
    if (dates.some((x) => x.date === date)) return { error: "The same date is there twice" };
    dates.push({ date, time });
  }
  if (!dates.length) return { error: "Pick the training date" };
  if (dates.length > MAX_DATES) return { error: `At most ${MAX_DATES} days` };
  const location = String(r.location ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (location.length < 2) return { error: "Where will the training be? Type the location." };
  const headcount = Number(r.headcount);
  if (!Number.isInteger(headcount) || headcount < 1 || headcount > 5000) return { error: "How many people will attend? Type the number." };
  return { dates: dates.sort((a, b) => a.date.localeCompare(b.date)), tentative: r.tentative === true, location, headcount };
}

/** The proposal's fields people compare (to tell whether anything changed). */
export const sameProposal = (a: Omit<Proposal, "at" | "by">, b: Omit<Proposal, "at" | "by">) =>
  JSON.stringify([a.dates, a.tentative, a.location, a.headcount]) === JSON.stringify([b.dates, b.tentative, b.location, b.headcount]);

/** "Today" in India, as YYYY-MM-DD. */
export const indiaToday = (now = new Date()) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/* ---------------- Participants ---------------- */

export type Person = { name: string; phone: string; email?: string };
export type Skipped = { row: number; text: string; why: string };

export const cleanName = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
export const cleanEmail = (s: unknown) => { const e = String(s ?? "").trim().toLowerCase().slice(0, 200); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""; };

/** One typed or joined person, checked. */
export function readPerson(raw: unknown): Person | { error: string } {
  const r = (raw ?? {}) as { name?: unknown; phone?: unknown; email?: unknown };
  const name = cleanName(r.name), phone = cleanPhone(String(r.phone ?? ""));
  if (!name) return { error: "Type the name" };
  if (!phone) return { error: "The phone number should be a 10-digit mobile" };
  const email = String(r.email ?? "").trim() ? cleanEmail(r.email) : "";
  if (String(r.email ?? "").trim() && !email) return { error: "That email doesn't look right" };
  return email ? { name, phone, email } : { name, phone };
}

/**
 * Rows from an Excel or CSV file → people. In each row the phone is the first cell that is a 10-digit mobile and the name
 * the first other cell with letters in it; header rows ("Name / Number") and rows without a mobile are skipped, with why.
 */
export function peopleFromRows(rows: unknown[][]): { people: Person[]; skipped: Skipped[] } {
  const people: Person[] = [], skipped: Skipped[] = [];
  rows.forEach((cells, i) => {
    const vals = cells.map((c) => String(c ?? "").trim());
    if (!vals.some(Boolean)) return; // empty rows say nothing
    const text = vals.filter(Boolean).join(" · ").slice(0, 80);
    const pi = vals.findIndex((v) => cleanPhone(v));
    if (pi < 0) return skipped.push({ row: i + 1, text, why: "no 10-digit mobile number" });
    const name = cleanName(vals.find((v, j) => j !== pi && /[a-z]/i.test(v) && !cleanEmail(v)));
    if (!name) return skipped.push({ row: i + 1, text, why: "no name" });
    const email = vals.map(cleanEmail).find(Boolean);
    people.push(email ? { name, phone: cleanPhone(vals[pi]), email } : { name, phone: cleanPhone(vals[pi]) });
  });
  return { people, skipped };
}

/** A CSV file's rows (quotes, commas inside quotes, CRLF). Semicolon- or tab-separated files work too. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** The phones that appear more than once (both rows get marked, each with Remove). */
export function duplicatePhones(list: { phone: string }[]): Set<string> {
  const seen = new Set<string>(), dup = new Set<string>();
  for (const p of list) (seen.has(p.phone) ? dup : seen).add(p.phone);
  return dup;
}

/** TH001, TH002 … TH1000 — one count across every training. */
export const thId = (n: number) => `TH${String(n).padStart(3, "0")}`;
export const TH_ID = /^TH\d{3,7}$/;

/** "4 Dec 2026, 10:00" */
export function fmtProposalDate(d: ProposalDate): string {
  const t = new Date(`${d.date}T00:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => t.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  const day = `${part({ weekday: "short" })}, ${part({ day: "numeric" })} ${part({ month: "short" })} ${part({ year: "numeric" })}`;
  if (!d.time) return day;
  const [h, m] = d.time.split(":").map(Number);
  return `${day}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
