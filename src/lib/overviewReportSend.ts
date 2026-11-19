import "server-only";
import { db } from "./db";
import { type ReportKind, summaryEmail } from "./dailySummary";
import { gatherSummary } from "./dailySummaryGather";
import { summaryPdf } from "./summaryPdf";
import { summaryTables } from "./summaryTables";
import { NOT_ATTACHED, sendMail } from "./zohoMail";

/*
 * The summary emailed to Sumit (owner, 19 Nov: in tables, as a PDF — summaryTables.ts / summaryPdf.ts; the email carries
 * the headline only, and the old body (dailySummary.ts) if the PDF can't be attached): daily Monday–Saturday at 7 pm India time, and the monthly one on
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
  const facts = await gatherSummary(kind, on);
  const mail = summaryEmail(facts);
  const doc = summaryTables(facts);
  const name = `${kind === "daily" ? "Daily" : "Monthly"} summary ${kind === "daily" ? on : on.slice(0, 7)}.pdf`;
  try {
    await sendMail(FROM, { to, subject: mail.subject, html: pdfBody(doc.kicker, doc.headline), attachments: [{ name, bytes: await summaryPdf(doc) }], needAttachments: true });
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith(NOT_ATTACHED))) throw e;
    console.error(`[overview report] ${e.message} — sending the summary in the email instead`);
    await sendMail(FROM, { to, subject: mail.subject, html: mail.html });
  }
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The email around the PDF: the date, the headline, and where the rest is. */
export const pdfBody = (kicker: string, headline: string) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.45;color:#1c1c1e;max-width:560px">
<div style="font-size:13px;color:#6e6e73">${escHtml(kicker)}</div>
<div style="font-size:18px;font-weight:700;line-height:1.3;margin:6px 0 12px">${escHtml(headline)}</div>
<div>The full summary, in tables, is in the attached PDF.</div>
<div style="margin-top:14px;font-size:12px;color:#6e6e73">Sent automatically by the Think Health dashboard.</div>
</div>`;

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
