import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Binary } from "mongodb";
import { db } from "./db";
import { CERT_FONT_FILES, type FontBytes, singleCertificate } from "./certPdf";
import type { DesignId } from "./certificates";
import { type CertLine, certificateLines, recordCertificate } from "./portalTrainings";
import { certEmail, certFileName } from "./portalCertRules";
import { certTemplate } from "./templateStore";
import { portalBase } from "./portalHost";
import { trainingLink } from "./portalEmail";
import { sendMail } from "./zohoMail";

/*
 * Certificates from the quiz (owner, 14 Nov), made and emailed on the server: one A5 page per person, in the design Admin
 * uploaded for the Fulfillment board (certDesigns: it carries the signature and the seal), from learn@thinkhealth.in with
 * the PDF attached and a link to their page (where it can always be downloaded). Each person gets it once; someone with no
 * email yet gets it when they give one. Only the live site sends (a local server or a test never emails anyone).
 * The fonts are read from public/certificate-fonts (next.config.ts traces them into these routes).
 */

const FROM = "learn@thinkhealth.in";

let fonts: Promise<FontBytes> | null = null;
function fontBytes(): Promise<FontBytes> {
  fonts ??= Promise.all((Object.keys(CERT_FONT_FILES) as (keyof typeof CERT_FONT_FILES)[]).map(async (k) =>
    [k, new Uint8Array(await readFile(path.join(process.cwd(), "public", "certificate-fonts", CERT_FONT_FILES[k])))] as const))
    .then((xs) => Object.fromEntries(xs) as FontBytes).catch((e) => { fonts = null; throw e; });
  return fonts;
}

async function designBytes(id: DesignId): Promise<Uint8Array> {
  const d = await (await db()).collection<{ _id: string; pdf: Binary }>("certDesigns").findOne({ _id: id });
  if (!d) throw new Error("The certificate design isn't uploaded yet: Admin uploads it once on the Fulfillment board");
  return new Uint8Array(d.pdf.buffer);
}

/** One person's certificate as a PDF. */
export async function certificatePdf(c: CertLine): Promise<Uint8Array> {
  return singleCertificate(await designBytes(c.design), { serial: 0, certNo: c.certNo, name: c.name, location: c.location, course: c.course, date: c.day }, await fontBytes());
}

/** Their own page (the certificate's download is there). */
export const pageLink = (c: Pick<CertLine, "number" | "th" | "token">) => `${trainingLink(portalBase(), c.number)}/${c.th}?p=${encodeURIComponent(c.token)}`;

export type SendResult = { sent: number; noEmail: number; failed: { name: string; error: string }[] };
type Mailer = (to: string, m: { subject: string; html: string; attachments: { name: string; bytes: Uint8Array }[] }) => Promise<{ attached: number }>;

/**
 * Emails every passed person's certificate that hasn't gone yet (`only`: just this one person). `mailer` / `pdf` are for
 * tests; without them only the live site sends.
 */
export async function sendCertificates(trainingId: string, by: string, opts: { only?: string; mailer?: Mailer; pdf?: (c: CertLine) => Promise<Uint8Array> } = {}): Promise<SendResult> {
  const out: SendResult = { sent: 0, noEmail: 0, failed: [] };
  if (!opts.mailer && process.env.VERCEL_ENV !== "production") throw new Error("Only the live site sends certificates.");
  const mailer: Mailer = opts.mailer ?? ((to, m) => sendMail(FROM, { to, ...m }));
  const make = opts.pdf ?? certificatePdf;
  const t = await certTemplate();
  for (const c of await certificateLines(trainingId)) {
    if (opts.only && c.th !== opts.only) continue;
    if (c.emailedAt) continue;
    if (!c.email) { out.noEmail++; continue; }
    try {
      const pdf = await make(c);
      const m = certEmail(t, { name: c.name, training: c.course, score: `${c.pct}%`, link: pageLink(c), certno: c.certNo });
      const r = await mailer(c.email, { subject: m.subject, html: m.html, attachments: [{ name: certFileName(c.name), bytes: pdf }] });
      await recordCertificate(trainingId, c.th, { emailedAt: new Date().toISOString(), email: c.email, attached: r.attached > 0, by });
      out.sent++;
    } catch (e) {
      const error = e instanceof Error ? e.message : "Couldn't send it";
      console.error(`[certificates] ${c.th} not sent:`, error);
      await recordCertificate(trainingId, c.th, { error, by }).catch(() => undefined);
      out.failed.push({ name: c.name, error });
    }
  }
  return out;
}
