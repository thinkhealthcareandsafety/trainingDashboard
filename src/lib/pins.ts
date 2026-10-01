import "server-only";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

// Follow-ups sign-in PINs. Member PINs are stored hashed in the "memberPins" collection, which is not one of the
// shared COLLECTIONS, so they never reach a browser. The Admin PIN lives only in ADMIN_PIN on the server.

export const ADMIN_ID = "admin";
const COLLECTION = "memberPins";
type PinDoc = { _id: string; salt: string; hash: string; updatedAt: string };

export const validPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin);
const hashOf = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function adminPinOk(pin: unknown): boolean {
  const expected = process.env.ADMIN_PIN;
  return Boolean(expected) && typeof pin === "string" && same(pin, expected!);
}

/** "ok", "wrong", or "unset" (no PIN stored for this member yet). */
export async function checkMemberPin(memberId: string, pin: string): Promise<"ok" | "wrong" | "unset"> {
  const doc = await (await db()).collection<PinDoc>(COLLECTION).findOne({ _id: memberId });
  if (!doc) return "unset";
  return same(hashOf(pin, doc.salt), doc.hash) ? "ok" : "wrong";
}

export async function setMemberPin(memberId: string, pin: string): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  await (await db()).collection<PinDoc>(COLLECTION).replaceOne(
    { _id: memberId },
    { salt, hash: hashOf(pin, salt), updatedAt: new Date().toISOString() },
    { upsert: true },
  );
}

// Guessing guard: after 5 wrong PINs for one name, that name is paused for a minute (per server process).
const guard = globalThis as unknown as { _thPinFails?: Map<string, { n: number; until: number }> };
const fails = (guard._thPinFails ??= new Map());
export function lockedFor(key: string): number {
  const f = fails.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
export async function noteFailure(key: string) {
  const f = fails.get(key) ?? { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) (f.n = 0), (f.until = Date.now() + 60_000);
  fails.set(key, f);
  await new Promise((r) => setTimeout(r, 800)); // slow down guessing
}
export const noteSuccess = (key: string) => fails.delete(key);

// Sign-in stays until the member signs out: the browser keeps a token signed with a server-only secret,
// checked whenever the page opens. SESSION_SECRET if set; otherwise derived from other server-only settings.
function sessionSecret(): string {
  return process.env.SESSION_SECRET || createHash("sha256").update(`th-session:${process.env.MONGODB_URI ?? ""}:${process.env.ADMIN_PIN ?? ""}`).digest("hex");
}
const sign = (memberId: string) => createHmac("sha256", sessionSecret()).update(memberId).digest("base64url");
export const sessionToken = (memberId: string) => `${Buffer.from(memberId).toString("base64url")}.${sign(memberId)}`;
/** The member id a token was issued to, or null if it isn't genuine. */
export function memberOfToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const [id64, mac] = token.split(".");
  if (!id64 || !mac) return null;
  const memberId = Buffer.from(id64, "base64url").toString();
  return same(mac, sign(memberId)) ? memberId : null;
}
