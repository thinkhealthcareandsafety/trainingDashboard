"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Presence, PtRequest, Who } from "@/lib/progress/model";

/** What GET /api/progress returns. */
export type Snapshot = {
  me: Who; now: string; today: string; team: Who[];
  presence: Presence[]; requests: PtRequest[]; replies: Record<string, number>;
  needsMe: string[]; // requests I'm tagged in and haven't answered (reply / resolve) — red until then
};

const POLL_MS = 15_000; // like the team data: changes by others show within ~15 s [A3]
export const PROGRESS_CHANGED = "th:progress-changed"; // after our own change: reload now, and tell the sidebar badge

/** The tracker's data, kept fresh while the tab is visible; `call` sends a change and reloads. */
export function useProgress() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch("/api/progress", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Server said ${r.status}`);
      setSnap(await r.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the server");
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PROGRESS_CHANGED, load);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(PROGRESS_CHANGED, load); };
  }, [load]);
  return { snap, error, reload: load };
}

/** Sends a change; on success tells the page (and the sidebar badge) to reload. Returns the server's answer or { error }. */
export async function call<T = Record<string, unknown>>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T & { error?: string }> {
  try {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ...j, error: j.error ?? `Server said ${r.status}` };
    window.dispatchEvent(new Event(PROGRESS_CHANGED));
    return j;
  } catch {
    return { error: "Couldn't reach the server — check the connection and try again" } as T & { error: string };
  }
}
