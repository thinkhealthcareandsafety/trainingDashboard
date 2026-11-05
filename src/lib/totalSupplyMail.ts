import nodemailer from "nodemailer";
import { TS } from "./totalSupply";

/*
 * Sends from Total Supply's own Gmail (owner, 5 Nov), not through Zoho: Gmail's SMTP with an App Password, which the owner
 * sets on Vercel as TS_GMAIL_APP_PASSWORD. Gmail keeps a copy in that account's Sent folder by itself.
 */
export const tsMailOn = () => Boolean(process.env.TS_GMAIL_APP_PASSWORD?.trim());

export async function sendTsMail(m: { to: string[]; cc: string[]; subject: string; html: string; attachments: { filename: string; content: Buffer; contentType?: string }[] }): Promise<void> {
  const pass = process.env.TS_GMAIL_APP_PASSWORD?.replace(/\s+/g, ""); // Google shows it in groups of four
  if (!pass) throw new Error("Total Supply's Gmail isn't connected yet");
  const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: TS.sender, pass }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 45_000 });
  try {
    await mail.sendMail({ from: { name: TS.name, address: TS.sender }, to: m.to, cc: m.cc.length ? m.cc : undefined, subject: m.subject, html: m.html, attachments: m.attachments });
  } catch (e) {
    // Gmail's answer says what's wrong; the password is never in it.
    const code = (e as { code?: string }).code;
    throw new Error(code === "EAUTH" ? "Gmail refused the App Password for saletotalsupply@gmail.com: make a new one and update it on Vercel" : `Gmail didn't send it: ${e instanceof Error ? e.message : "unknown error"}`);
  } finally {
    mail.close();
  }
}
