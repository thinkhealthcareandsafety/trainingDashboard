import "server-only";
import { db } from "./db";
import { type ReportKind, summaryEmail } from "./dailySummary";
import { gatherSummary } from "./dailySummaryGather";
import { sendMail } from "./zohoMail";

/*
 * The summary emailed to Sumit (owner, 18 Nov; the email body only, no PDF since session 33 — dailySummary.ts): daily Monday–Saturday at 7 pm India time, and the monthly one on
 * the month's last day at 7 pm (even a Sunday). Called by the schedulers (GitHub at ~7:02 pm with a retry, Vercel's
 * daily cron at 7:30–8:29 pm as the fallback): it never sends before 7 pm and never twice — the day (and the month) is
 * claimed in kv `overview_report` before sending, and released again if the send fails so the next call retries.
 */

const TO = process.env.REPORT_TO ?? "sshah@thinkhealth.in";
const FROM = process.env.REPORT_FROM ?? "hello@thinkhealth.in";
const KEY = "overview_report";

type State = { _id: string; daily?: string; monthly?: string };
const kv = async () => (await db()).collection<State>("kv");

/** India's date and time for an instant: { ymd, hour, weekday (0 = Sunday), lastOfMonth }. */
export function indiaNow(at: Date): { ymd: string; hour: number; weekday: number; lastOfMonth: boolean } {
  const d = new Date(at.getTime() + 5.5 * 3600_000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { ymd: d.toISOString().slice(0, 10), hour: d.getUTCHours(), weekday: d.getUTCDay(), lastOfMonth: day === last };
}

/** Which reports are due at this moment, given what was sent (pure). */
export function dueReports(at: Date, sent: { daily?: string; monthly?: string }): ReportKind[] {
  const n = indiaNow(at);
  if (n.hour < 19) return [];
  const out: ReportKind[] = [];
  if (n.weekday !== 0 && sent.daily !== n.ymd) out.push("daily");
  if (n.lastOfMonth && sent.monthly !== n.ymd.slice(0, 7)) out.push("monthly");
  return out;
}

/** Claims a report for today / this month; false when another run already did. */
async function claim(kind: ReportKind, mark: string): Promise<boolean> {
  try {
    const r = await (await kv()).updateOne({ _id: KEY, [kind]: { $ne: mark } }, { $set: { [kind]: mark } }, { upsert: true });
    return ((r as { modifiedCount?: number }).modifiedCount ?? 0) + ((r as { upsertedCount?: number }).upsertedCount ?? 0) > 0;
  } catch {
    return false; // the upsert met a document already marked: another run has it
  }
}
const release = async (kind: ReportKind, mark: string) => { await (await kv()).updateOne({ _id: KEY, [kind]: mark }, { $unset: { [kind]: "" } }).catch(() => undefined); };

/** Builds and sends one summary for the India day `on`. */
export async function sendOverviewReport(kind: ReportKind, on: string, to = TO): Promise<void> {
  const mail = summaryEmail(await gatherSummary(kind, on));
  await sendMail(FROM, { to, subject: mail.subject, html: mail.html });
}

/** The scheduler's call: sends what is due now (or `force` one now, for a test). */
export async function runOverviewReports(opts: { at?: Date; force?: ReportKind; to?: string } = {}): Promise<{ sent: ReportKind[]; skipped?: string; error?: string }> {
  const at = opts.at ?? new Date();
  const n = indiaNow(at);
  if (opts.force) {
    await sendOverviewReport(opts.force, n.ymd, opts.to);
    return { sent: [opts.force] };
  }
  const state = (await (await kv()).findOne({ _id: KEY })) ?? { _id: KEY };
  const due = dueReports(at, state);
  if (!due.length) return { sent: [], skipped: n.hour < 19 ? "before 7 pm" : "already sent" };
  const sent: ReportKind[] = [];
  for (const kind of due) {
    const mark = kind === "daily" ? n.ymd : n.ymd.slice(0, 7);
    if (!(await claim(kind, mark))) continue;
    try {
      await sendOverviewReport(kind, n.ymd);
      sent.push(kind);
    } catch (e) {
      await release(kind, mark);
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[overview report] ${kind} ${n.ymd}: ${error}`);
      return { sent, error };
    }
  }
  return { sent };
}
