import { renderTemplate } from "./templateText";

/*
 * Certificates from the quiz (owner, 14 Nov): "after the quiz is done … then only they pass and can get the certificate on
 * their email". Owner, 16 Nov: "certificates should be sent on their mail the moment they pass the quiz" (no longer after
 * End). Pure: what each one prints, and the email's wording (Templates → Training Manager → "Certificate email").
 * Later, not now (owner): the passed list goes into the master Zoho Sheet (serials, FAT-OD numbers); Shreya's Fulfillment card.
 */

/** The date a certificate prints: the last training day they were marked present, else the day they passed. */
export const certDay = (presentDays: string[], passedDay: string) => [...presentDays].sort().at(-1) ?? passedDay;

/**
 * Until the master-sheet step: FAT-OD/<dd-mm-yyyy>/<TH number>. TH numbers are unique and never reused, so no sheet
 * number is taken or doubled.
 */
export const portalCertNumber = (day: string, th: string) => `FAT-OD/${day.slice(0, 10).split("-").reverse().join("-")}/${th}`;

/** India's calendar day of an instant (the training's day when they passed). */
export const indiaDayOf = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

/* ---------------- The official certificates, for the coordinator once paid (owner, 16 Nov) ---------------- */

export type InvoiceLite = { number: string; reference: string; total: number; balance: number; status: string };
const cites = (ref: string, num: string) => Boolean(ref && num && ref.toLowerCase().includes(num.toLowerCase()));
/**
 * "When the payment is received for this training then only the option to download certificates will be visible" (owner,
 * 16 Nov; fully paid): the training's invoices are those whose reference cites its Performa (or its quote, when the
 * Performa was skipped), as the quote's story links them; void ones don't count. Paid = at least one, and none owes money.
 */
export function paidInFull(invoices: InvoiceLite[], refs: string[]): boolean {
  const mine = invoices.filter((i) => i.status !== "void" && refs.some((r) => cites(i.reference, r)));
  return mine.length > 0 && mine.every((i) => i.balance <= 0.5 || i.status === "paid");
}

/* ---------------- The email ---------------- */

export const CERT_VARS = ["name", "training", "score", "link", "certno"] as const;
export const CERT_TEMPLATE = {
  id: "certificate", label: "Certificate email (after the quiz)",
  subject: "Your certificate · {training}",
  body: "Dear {name},\n\nCongratulations on passing the quiz with {score}. Your certificate ({certno}) is attached.\n\nYou can also download it any time from your page:\n{link}\n\nThank you for training with Think Health.\n\nWarm regards,\nThink Health Training Team",
  note: "Sent from learn@thinkhealth.in to each person the moment they pass the quiz (or when they add their email after passing), with their Good Samaritan certificate as a PDF. {certno} is its number (IAGS-SN/…).",
};
export type CertVars = Record<(typeof CERT_VARS)[number], string>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#0a6aa1">${u}</a>`);

export function certEmail(t: { subject: string; body: string }, v: CertVars): { subject: string; html: string; text: string } {
  const text = renderTemplate(t.body, v).trim();
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">${text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  return { subject: renderTemplate(t.subject, v).replace(/\s+/g, " ").trim(), html, text };
}

/** The Good Samaritan certificate's file name (owner, 16 Nov). */
export const goodSamaritanFileName = (name: string) => `Good Samaritan certificate - ${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Think Health"}.pdf`;

/** "Asha Rao.pdf" style, safe as a file name. */
export const certFileName = (name: string) => `Certificate - ${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Think Health"}.pdf`;

/* ---------------- The passed list (owner, 14 Nov: "the training people list we will get right away") ---------------- */

export type PassedRow = { th: string; name: string; email: string; pct: number; badge: boolean; day: string; certNo: string; gsNo?: string; emailedAt: string | null };
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** The passed list as CSV (opens in Excel): one row per person who passed. Later (owner): these rows go into the master Zoho Sheet. */
export function passedCsv(rows: PassedRow[]): string {
  const head = ["TH number", "Name", "Email", "Score %", "First Aid Badge", "Training day", "Certificate no.", "Good Samaritan no.", "Good Samaritan emailed"];
  const day = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
  const body = rows.map((r) => [r.th, r.name, r.email, String(r.pct), r.badge ? "Yes" : "", day(r.day), r.certNo, r.gsNo ?? "", r.emailedAt ? day(indiaDayOf(r.emailedAt)) : ""].map(cell).join(","));
  return "\uFEFF" + [head.join(","), ...body].join("\r\n") + "\r\n";
}
