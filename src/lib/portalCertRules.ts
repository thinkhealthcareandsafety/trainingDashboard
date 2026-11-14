import type { Session } from "./attendanceRules";
import { renderTemplate } from "./templateText";

/*
 * Certificates from the quiz (owner, 14 Nov): "after the quiz is done … then only they pass and can get the certificate on
 * their email … also they only get the certificate after the training is ended by the coordinator". Pure: when they go,
 * what each one prints, and the email's wording (Templates → Training Manager → "Certificate email").
 * Later, not now (owner): the passed list goes into the master Zoho Sheet (serials, FAT-OD numbers); Shreya's Fulfillment card.
 */

const lastDay = (days: string[]) => [...days].sort().at(-1) ?? "";

/** The coordinator pressed End training on the last training day: the certificates go out. */
export function certificatesReady(days: string[], sessions: Session[] = []): boolean {
  const last = lastDay(days);
  return Boolean(last) && sessions.some((s) => s.day === last && s.endedAt);
}

/**
 * Our fallback when the coordinator never pressed End (owner said yes to "Send certificates" on Trainings): from the last
 * training day on, and never while a session is running.
 */
export function staffMaySend(days: string[], today: string, sessions: Session[] = []): boolean {
  const last = lastDay(days);
  if (!last || today < last) return false;
  return !sessions.some((s) => s.day === today && !s.endedAt);
}

/** The date a certificate prints: the last training day they were marked present, else the day they passed. */
export const certDay = (presentDays: string[], passedDay: string) => [...presentDays].sort().at(-1) ?? passedDay;

/**
 * Until the master-sheet step: FAT-OD/<dd-mm-yyyy>/<TH number>. TH numbers are unique and never reused, so no sheet
 * number is taken or doubled.
 */
export const portalCertNumber = (day: string, th: string) => `FAT-OD/${day.slice(0, 10).split("-").reverse().join("-")}/${th}`;

/** India's calendar day of an instant (the training's day when they passed). */
export const indiaDayOf = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

/* ---------------- The email ---------------- */

export const CERT_VARS = ["name", "training", "score", "link", "certno"] as const;
export const CERT_TEMPLATE = {
  id: "certificate", label: "Certificate email (after the quiz)",
  subject: "Your certificate · {training}",
  body: "Dear {name},\n\nCongratulations on passing the quiz with {score}. Your certificate ({certno}) is attached.\n\nYou can also download it any time from your page:\n{link}\n\nThank you for training with Think Health.\n\nWarm regards,\nThink Health Training Team",
  note: "Sent from learn@thinkhealth.in to each person who passed the quiz, once the coordinator ends the training on its last day. Their certificate goes with it as a PDF.",
};
export type CertVars = Record<(typeof CERT_VARS)[number], string>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#0a6aa1">${u}</a>`);

export function certEmail(t: { subject: string; body: string }, v: CertVars): { subject: string; html: string; text: string } {
  const text = renderTemplate(t.body, v).trim();
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">${text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  return { subject: renderTemplate(t.subject, v).replace(/\s+/g, " ").trim(), html, text };
}

/** "Asha Rao.pdf" style, safe as a file name. */
export const certFileName = (name: string) => `Certificate - ${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Think Health"}.pdf`;

/* ---------------- The passed list (owner, 14 Nov: "the training people list we will get right away") ---------------- */

export type PassedRow = { th: string; name: string; email: string; pct: number; badge: boolean; day: string; certNo: string; emailedAt: string | null };
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** The passed list as CSV (opens in Excel): one row per person who passed. Later (owner): these rows go into the master Zoho Sheet. */
export function passedCsv(rows: PassedRow[]): string {
  const head = ["TH number", "Name", "Email", "Score %", "First Aid Badge", "Training day", "Certificate no.", "Certificate emailed"];
  const day = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
  const body = rows.map((r) => [r.th, r.name, r.email, String(r.pct), r.badge ? "Yes" : "", day(r.day), r.certNo, r.emailedAt ? day(indiaDayOf(r.emailedAt)) : ""].map(cell).join(","));
  return "\uFEFF" + [head.join(","), ...body].join("\r\n") + "\r\n";
}
