import { renderTemplate } from "./templateText";

/*
 * The Training Manager login in email (docs/TRAINING_MANAGER_PLAN.md step 8). Two editable templates (Templates page,
 * "Training Manager"): the sentence in the login box added to a training quote's email, and the "Send login" email from
 * the Trainings page. The box itself — link, email, password, Sign in button — is fixed, so it always works.
 * Pure: the email step's preview, the Templates page and the server all use it.
 */

export const PORTAL_VARS = ["name", "training", "number"] as const;
export type PortalTemplate = { id: "box" | "login"; label: string; subject: string | null; body: string; note: string };

export const PORTAL_TEMPLATES: PortalTemplate[] = [
  {
    id: "box", label: "Login box in the quotation email", subject: null,
    body: "Your Training Manager is ready: propose the training date, confirm how many will attend and build your attendee list, all in one place.",
    note: "The sentence at the top of the login box added under a training quotation's email. The link, email, password and Sign in button follow it.",
  },
  {
    id: "login", label: "Send login (from Trainings)", subject: "Your Think Health Training Manager login · {number}",
    body: "Hello {name},\n\nYour Training Manager for {training} is ready. Sign in to propose the training date, confirm how many will attend and build your attendee list.\n\nWarm regards,\nThink Health Training Team",
    note: "Sent from learn@thinkhealth.in by Send login on the Trainings page, with a new password. The login box follows the message.",
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

export type LoginBox = { intro: string; link: string; email: string; password: string | null };

/** The login box: a bordered panel that reads well in Gmail and Outlook (tables, inline styles). */
export function loginBoxHtml(b: LoginBox): string {
  const row = (k: string, v: string) => `<tr><td style="padding:4px 14px 4px 0;color:#587080;font-size:14px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0;color:#0f2a3a;font-size:14px">${v}</td></tr>`;
  const password = b.password
    ? `<span style="font-family:Consolas,Menlo,monospace;font-size:16px;font-weight:700;letter-spacing:1px;color:#034f72">${esc(b.password)}</span>`
    : `The password you already have. Forgot it? Choose &ldquo;Forgot or want to change your password?&rdquo; on the sign-in page.`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #d3dfe7;border-radius:12px;border-collapse:separate;max-width:560px;font-family:Segoe UI,Arial,sans-serif">
<tr><td style="padding:20px 22px">
<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#034f72">Your Training Manager</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#3a5263">${esc(b.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">${row("Link", `<a href="${esc(b.link)}" style="color:#0077b6">${esc(b.link.replace(/^https?:\/\//, ""))}</a>`)}${row("Email", esc(b.email))}${row("Password", password)}</table>
<p style="margin:16px 0 0"><a href="${esc(b.link)}" style="display:inline-block;background:#0077b6;color:#ffffff;padding:11px 22px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none">Sign in</a></p>
</td></tr></table>`;
}

export type PortalVars = { name: string; training: string; number: string };

/** The "Send login" email: the message, then the box. */
export function loginEmail(t: { subject: string; body: string; box: string }, v: PortalVars, box: Omit<LoginBox, "intro">): { subject: string; html: string } {
  const vars = { name: v.name.split(" ")[0], training: v.training, number: v.number };
  return {
    subject: renderTemplate(t.subject, vars),
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f2a3a;line-height:1.55">${paragraphs(renderTemplate(t.body, vars))}${loginBoxHtml({ ...box, intro: renderTemplate(t.box, vars) })}</div>`,
  };
}

/** The training's link in emails and QR codes: <base>/<Training Number>. */
export const trainingLink = (base: string, number: string) => `${base}/${encodeURIComponent(number)}`;
