"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Member } from "./types";

// Who is signed in, for the whole app. Signing in sets an HttpOnly session cookie (the server checks it on every
// API call); the browser also remembers the member so the name shows instantly. Signed in stays signed in —
// across tabs, pages and restarts — until "Sign out", which applies to every open tab.

const SESSION_KEY = "th.session";
type Saved = { member: Member; token: string };

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Saved | null;
    return s?.member?.id && s.token ? s : null;
  } catch {
    return null;
  }
}
function writeSaved(s: Saved | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

type SessionValue = {
  member: Member | null;
  /** Checked on this device (false until the first look at the browser's saved sign-in). */
  ready: boolean;
  /** The server accepted the session — safe to call the API. */
  verified: boolean;
  signIn: (m: Member, token: string) => void;
  signOut: () => void;
};
const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside <SessionProvider>");
  return s;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);

  const verify = useCallback(async (s: Saved) => {
    try {
      // Also turns a sign-in saved before cookies were used into a cookie.
      const res = await fetch("/api/members/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: s.token }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; memberId?: string };
      if (res.status === 401 || (j.ok && j.memberId !== s.member.id)) {
        writeSaved(null);
        setMember(null);
        setVerified(false);
        return;
      }
      setVerified(true);
    } catch {
      setVerified(true); // offline: let the API calls report it
    }
  }, []);

  useEffect(() => {
    const s = readSaved();
    if (s) {
      setMember(s.member);
      void verify(s);
    }
    setReady(true);
    // Signing in or out in another tab applies here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY) return;
      const next = readSaved();
      setMember(next?.member ?? null);
      setVerified(Boolean(next));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [verify]);

  const signIn = useCallback((m: Member, token: string) => {
    writeSaved({ member: m, token });
    setMember(m);
    setVerified(true); // the sign-in response already set the cookie
  }, []);

  const signOut = useCallback(() => {
    writeSaved(null);
    setMember(null);
    setVerified(false);
    void fetch("/api/members/sign-out", { method: "POST" }).catch(() => {});
  }, []);

  return <Ctx.Provider value={{ member, ready, verified, signIn, signOut }}>{children}</Ctx.Provider>;
}
