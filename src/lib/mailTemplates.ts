import "server-only";
import { db } from "./db";
import { fmtDate } from "./dates";

/*
 * Email templates, kept in MongoDB `mailTemplates` (one document per flow) so the wording can change without a release.
 * The first time a flow is used, its document is created from the defaults below. `{invoice}` becomes the invoice number.
 * Step 1 is a new email; later steps are replies in the same thread (the last step is used again after that).
 */

export type MailTemplate = { _id: string; from: string; signature: string; subject: string; steps: { label: string; body: string }[] };

const DEFAULTS: Record<string, MailTemplate> = {
  aed_onboarding: {
    _id: "aed_onboarding",
    from: "hello@thinkhealth.in",
    signature: "Priyanka A.",
    subject: "Invoice# {invoice} Request for Details for Client Onboarding - AED Smartx",
    steps: [
      {
        label: "First contact",
        body: `Hello Sir/ Ma'am,

This is Priyanka from Think Health Care and Safety

Invoice # {invoice}

We’d like to onboard you onto our AED Management Software to streamline monitoring and compliance.

To initiate registration, please share the following details:

Full name of the organization

Admin: Email address (this will be your login ID):

Phone number:

Organization name:

Complete address with pin code:


Once received, we’ll fast-track your onboarding and share next steps.

This information is essential for ensuring the safety and well-being of your employees.

Rest assured, all details will be kept confidential and used only for onboarding.

Looking forward to your response.

*** Kindly redirect to the correct desk if wrongly address***

Best regards,
Priyanka A.
Think Health Care and Safety`,
      },
      {
        label: "1st reminder",
        body: `Hello Sir/ Ma'am,

Awaiting for your soonest reply on below/ Appreciate your urgent reply.



Best regards,
Priyanka A.
Think Health Care and Safety`,
      },
      {
        label: "2nd reminder",
        body: `Hello Sir/ Ma'am,

Any update on below.


Best regards,
Priyanka A.
Think Health Care and Safety`,
      },
    ],
  },
  // PLACEHOLDER wording until the owner sends the real template. Keep "Thank you for hosting" in the subject: Shikha's
  // Zoho Mail filter forwards replies to digital@ by it, and {ref} (the PI) keeps each customer's thread apart.
  fulfil_gratitude: {
    _id: "fulfil_gratitude",
    from: "learn@thinkhealth.in",
    signature: "Think Health Care and Safety",
    subject: "Thank you for hosting our training - {location} ({ref})",
    steps: [
      {
        label: "Gratitude email",
        body: `Dear Sir/ Ma'am,

Thank you for hosting our {course} at {location} on {dates}. It was a pleasure working with your team.

To issue the participation certificates, please reply to this email with the full names of all participants, exactly as they should appear on the certificates (one name per line).

Best regards,
Think Health Care and Safety`,
      },
    ],
  },
};

export async function getTemplate(id: string): Promise<MailTemplate> {
  const col = (await db()).collection<MailTemplate>("mailTemplates");
  const saved = await col.findOne({ _id: id });
  if (saved) return saved;
  const d = DEFAULTS[id];
  if (!d) throw new Error(`No email template "${id}"`);
  await col.updateOne({ _id: id }, { $setOnInsert: d }, { upsert: true });
  return d;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
const html = (text: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${esc(text).replace(/\r?\n/g, "<br>")}</div>`;
const when = (iso: string) =>
  `${fmtDate(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}, ${new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;

/**
 * The email for step `step` (1-based; past the last template the last one repeats). Reminders quote the emails before
 * them, newest on top — "on below" — as an email client would.
 */
export function buildMail(t: MailTemplate, step: number, vars: Record<string, string>, earlier: { at: string; step: number }[]) {
  const pick = (n: number) => t.steps[Math.min(Math.max(n, 1), t.steps.length) - 1];
  const subject = fill(t.subject, vars);
  const text = fill(pick(step).body, vars);
  let quoted = "";
  for (const e of earlier) {
    const head = `On ${when(e.at)}, ${esc(t.signature)} &lt;${esc(t.from)}&gt; wrote:`;
    quoted = `<br><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555">${head}</div><blockquote style="margin:4px 0 0 6px;padding-left:10px;border-left:2px solid #ccc">${html(fill(pick(e.step).body, vars))}${quoted}</blockquote>`;
  }
  return { subject: step > 1 ? `Re: ${subject}` : subject, label: pick(step).label, text, html: html(text) + quoted };
}
