import "server-only";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

/*
 * The Training Manager portal's sign-in (docs/TRAINING_MANAGER_PLAN.md step 3): training coordinators, apart from the
 * staff's PIN sign-in. A login is the coordinator's email; its password is random, made when the login is sent (step 8),
 * and kept only scrambled (scrypt) — nobody can read it back. "Forgot / reset password": a 6-digit code from
 * learn@thinkhealth.in, valid 10 minutes, 5 tries, at most 3 codes an hour; then they choose their own password.
 * Sessions last 30 days on their device (cookie th_portal; only its hash is stored). Wrong passwords: after 5, wait 15
 * minutes. Nothing here says whether an email has a login — the answers are the same either way.
 */

export const PORTAL_COOKIE = "th_portal";
const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const OTP_MS = 10 * 60_000;
const OTP_TRIES = 5;
const OTP_PER_HOUR = 3;
export const MIN_PASSWORD = 8;

/** The portal session's token from a request's cookies. */
export const portalToken = (request: Request) => (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${PORTAL_COOKIE}=`))?.slice(PORTAL_COOKIE.length + 1);

type Login = {
  _id: string; // the coordinator's email, lower case
  name: string;
  salt: string;
  hash: string;
  failed: number;
  lockedUntil?: string;
  otp?: { hash: string; expires: string; tries: number };
  otpSent?: string[]; // when codes were sent (the last hour's count)
  createdAt: string;
  passwordSetAt: string;
  lastLogin?: string;
};
type Session = { _id: string; email: string; expires: string };

const logins = async () => (await db()).collection<Login>("portalLogins");
const sessions = async () => (await db()).collection<Session>("portalSessions");
const now = () => new Date();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const scramble = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const cleanEmail = (e: unknown) => String(e ?? "").trim().toLowerCase().slice(0, 200);
export const goodEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** 12 characters that can't be mistaken for each other (no 0/O, 1/l/I) — read from an email and typed. */
export function newPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => letters[randomInt(letters.length)]).join("");
}

/** Makes (or resets) a coordinator's login with a new random password — returned once, for the email (step 8). */
export async function issueLogin(email: string, name: string): Promise<string> {
  const password = newPassword();
  const salt = randomBytes(16).toString("hex");
  const had = await (await logins()).findOne({ _id: email });
  const at = now().toISOString();
  await (await logins()).replaceOne({ _id: email }, { name: name || had?.name || "", salt, hash: scramble(password, salt), failed: 0, createdAt: had?.createdAt ?? at, passwordSetAt: at }, { upsert: true });
  return password;
}

/** Whether this coordinator already has a login (step 8: a training quote then says "the password you already have"). */
export async function hasLogin(email: string): Promise<boolean> {
  return Boolean(await (await logins()).findOne({ _id: email }));
}

/** Takes back a login just made for an email that then failed to send, so the next email makes a fresh one. */
export async function dropLogin(email: string): Promise<void> {
  await (await logins()).deleteOne({ _id: email });
}

async function startSession(email: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString("base64url");
  const maxAge = SESSION_DAYS * 86_400;
  await (await sessions()).insertOne({ _id: sha(token), email, expires: new Date(Date.now() + maxAge * 1000).toISOString() });
  return { token, maxAge };
}

export type SignIn = { ok: true; token: string; maxAge: number; name: string } | { ok: false; error: string; status: number };
const WRONG = "That email and password don't match. Check the email we sent you, or reset your password.";

export async function signIn(emailRaw: unknown, passwordRaw: unknown): Promise<SignIn> {
  const email = cleanEmail(emailRaw), password = String(passwordRaw ?? "");
  if (!goodEmail(email) || !password) return { ok: false, error: "Type your email and password", status: 400 };
  const col = await logins();
  const l = await col.findOne({ _id: email });
  if (!l) return { ok: false, error: WRONG, status: 401 };
  if (l.lockedUntil && l.lockedUntil > now().toISOString()) return { ok: false, error: "Too many tries. Wait 15 minutes, or reset your password.", status: 429 };
  if (!same(scramble(password, l.salt), l.hash)) {
    const failed = (l.failed ?? 0) + 1;
    await col.updateOne({ _id: email }, { $set: { failed: failed >= MAX_FAILS ? 0 : failed, ...(failed >= MAX_FAILS ? { lockedUntil: new Date(Date.now() + LOCK_MS).toISOString() } : {}) } });
    return { ok: false, error: failed >= MAX_FAILS ? "Too many tries. Wait 15 minutes, or reset your password." : WRONG, status: failed >= MAX_FAILS ? 429 : 401 };
  }
  await col.updateOne({ _id: email }, { $set: { failed: 0, lastLogin: now().toISOString() }, $unset: { lockedUntil: "" } });
  return { ok: true, ...(await startSession(email)), name: l.name };
}

/** The signed-in coordinator, from the cookie's token; null when there's none or it ran out. */
export async function portalUser(token: string | undefined): Promise<{ email: string; name: string } | null> {
  if (!token || token.length > 100) return null;
  const s = await (await sessions()).findOne({ _id: sha(token) });
  if (!s || s.expires < now().toISOString()) return null;
  const l = await (await logins()).findOne({ _id: s.email });
  return l ? { email: l._id, name: l.name } : null;
}

export async function signOut(token: string | undefined): Promise<void> {
  if (token) await (await sessions()).deleteOne({ _id: sha(token) });
}

/** Reset, step 1: a code to their email — only when they have a login; the answer is the same either way. */
export async function requestCode(emailRaw: unknown, send: (to: string, code: string, name: string) => Promise<void>): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const email = cleanEmail(emailRaw);
  if (!goodEmail(email)) return { ok: false, error: "Type the email we sent your login to", status: 400 };
  const col = await logins();
  const l = await col.findOne({ _id: email });
  if (!l) return { ok: true };
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const recent = (l.otpSent ?? []).filter((t) => t > hourAgo);
  if (recent.length >= OTP_PER_HOUR) return { ok: false, error: "We've sent 3 codes this hour. Use the latest one, or try again in an hour.", status: 429 };
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  await col.updateOne({ _id: email }, { $set: { otp: { hash: sha(`${email}:${code}`), expires: new Date(Date.now() + OTP_MS).toISOString(), tries: 0 }, otpSent: [...recent, now().toISOString()] } });
  await send(email, code, l.name);
  return { ok: true };
}

/** Reset, step 2: the code and a password of their choice; signs them in. */
export async function resetPassword(emailRaw: unknown, codeRaw: unknown, passwordRaw: unknown): Promise<SignIn> {
  const email = cleanEmail(emailRaw), code = String(codeRaw ?? "").replace(/\D/g, ""), password = String(passwordRaw ?? "");
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Choose a password of at least ${MIN_PASSWORD} characters`, status: 400 };
  const col = await logins();
  const l = await col.findOne({ _id: email });
  const bad = { ok: false as const, error: "That code isn't right, or it ran out. Ask for a new one.", status: 400 };
  if (!l?.otp || l.otp.expires < now().toISOString() || l.otp.tries >= OTP_TRIES) return bad;
  if (!same(sha(`${email}:${code}`), l.otp.hash)) {
    await col.updateOne({ _id: email }, { $set: { "otp.tries": l.otp.tries + 1 } });
    return bad;
  }
  const salt = randomBytes(16).toString("hex");
  await col.updateOne({ _id: email }, { $set: { salt, hash: scramble(password, salt), failed: 0, passwordSetAt: now().toISOString(), lastLogin: now().toISOString() }, $unset: { otp: "", lockedUntil: "" } });
  return { ok: true, ...(await startSession(email)), name: l.name };
}
