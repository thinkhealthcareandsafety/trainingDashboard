import "server-only";
import { memberOfToken } from "./pins";

// Every API route except sign-in checks the session: an HttpOnly cookie set at sign-in (the browser sends it
// automatically; page scripts can't read it). Tokens are signed with a server-only secret (see pins.ts).

export const SESSION_COOKIE = "th_session";
const YEAR = 365 * 24 * 60 * 60;

function cookieValue(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The signed-in member's id, or null. */
export function memberIdOf(request: Request): string | null {
  return memberOfToken(cookieValue(request, SESSION_COOKIE));
}

export const unauthorized = () => Response.json({ error: "Please sign in" }, { status: 401 });

/** HTTPS when served over HTTPS (directly or behind a proxy); plain LAN/localhost http still works. */
const secure = (request: Request) => new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

export const sessionCookie = (token: string, request: Request) =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${YEAR}${secure(request) ? "; Secure" : ""}`;
export const clearedCookie = (request: Request) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(request) ? "; Secure" : ""}`;

/** The signed-in member's id and name (from the server's member list, not from the browser), or null. */
export async function signedInMember(request: Request): Promise<{ id: string; name: string } | null> {
  const id = memberIdOf(request);
  if (!id) return null;
  if (id === "admin") return { id, name: "Admin" };
  const { db } = await import("./db");
  const m = await (await db()).collection<{ _id: string; name?: string }>("members").findOne({ _id: id });
  return m?.name ? { id, name: m.name } : null;
}
