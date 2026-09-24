"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Announcement, CalendarEntry, CardEvent, FollowUp, FollowUpActivity, Member, TickerItem, TrainingsResponse } from "./types";
import { addDays, ymd } from "./dates";
import { followUpsFromPipeline, followUpsFromTrainings, seedManualFollowUps } from "./followups";
import { buildTickerItems } from "./ticker";

// Calendar entries, follow-ups and announcements are cached in the browser and, when the server has
// MONGODB_URI configured, shared with the whole team through /api/store (only changed documents are sent).

const KEYS = {
  entries: "th.entries.v2",
  followUps: "th.followups.v2",
  removedTriggers: "th.removedTriggers.v2",
  announcements: "th.announcements.v2",
  members: "th.members.v1",
  cardEvents: "th.cardEvents.v1",
  tickerSnooze: "th.tickerSnooze.v1",
};

function load<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback();
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const uid = () => Math.random().toString(36).slice(2, 10);

type SharedName = "entries" | "followUps" | "removedTriggers" | "announcements" | "members" | "cardEvents";
type SharedDoc = { id: string } & Record<string, unknown>;
const SHARED: SharedName[] = ["entries", "followUps", "removedTriggers", "announcements", "members", "cardEvents"];
const PULL_MS = 60_000;

function seedEntries(today: Date): CalendarEntry[] {
  const c = new Date().toISOString();
  const e = (days: number, p: Omit<CalendarEntry, "id" | "date" | "createdAt">): CalendarEntry => ({
    ...p,
    id: uid(),
    date: ymd(addDays(today, days)),
    createdAt: c,
    demo: true,
  });
  return [
    e(0, { type: "meeting", title: "Client call — Orion IT Park", startTime: "11:00", endTime: "11:30", allDay: false, priority: "high" }),
    e(0, { type: "note", title: "Send certificate batch to courier", allDay: true, priority: "medium" }),
    e(2, { type: "meeting", title: "Audit prep with trainers", startTime: "15:00", endTime: "16:00", allDay: false, priority: "high" }),
    e(4, { type: "date", title: "AED stock review", allDay: true, priority: "low" }),
    e(8, { type: "meeting", title: "Quarterly review", startTime: "10:00", endTime: "12:00", allDay: false, priority: "medium" }),
    e(-3, { type: "note", title: "Update trainer roster", allDay: true, priority: "low" }),
  ];
}

function seedAnnouncements(today: Date): Announcement[] {
  return [
    { id: "a1", text: "New AED Awareness course launches 1 Oct", priority: "low", startsAt: addDays(today, -2).toISOString(), endsAt: addDays(today, 10).toISOString(), demo: true },
  ];
}

export interface Toast {
  id: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Store {
  ready: boolean;
  now: Date;
  data: TrainingsResponse | null;
  syncing: boolean;
  refresh: () => Promise<void>;
  /** "team" = shared through MongoDB; "browser" = this device only. */
  storage: "team" | "browser";
  /** Zoho Books users (owners) and customers (clients) for pickers. */
  team: string[];
  customers: string[];

  entries: CalendarEntry[];
  saveEntry: (e: CalendarEntry) => void;
  deleteEntry: (id: string) => void;

  followUps: FollowUp[];
  saveFollowUp: (f: FollowUp, activity?: Omit<FollowUpActivity, "id" | "at">) => void;
  deleteFollowUp: (id: string) => void;
  patchFollowUps: (ids: string[], patch: Partial<FollowUp>, activity?: Omit<FollowUpActivity, "id" | "at">) => void;

  /** Follow-ups board: people using it, and every change they made to a card (revertable). */
  members: Member[];
  addMember: (name: string) => Member;
  cardEvents: CardEvent[];
  addCardEvents: (events: Omit<CardEvent, "id" | "at">[]) => CardEvent[];
  revertCardEvent: (id: string, by: string) => void;

  announcements: Announcement[];

  ticker: TickerItem[];
  snoozeTicker: (id: string, hours: number) => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <StoreProvider>");
  return s;
}

export function newId() {
  return uid();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<TrainingsResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [cardEvents, setCardEvents] = useState<CardEvent[]>([]);
  const [removedTriggers, setRemovedTriggers] = useState<string[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tickerSnooze, setTickerSnooze] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [meta, setMeta] = useState<{ team: string[]; customers: string[] }>({ team: [], customers: [] });
  // Saves are gated on this state (not a ref) so the empty initial state is never written
  // over stored data, including during React's dev double-mount.
  const [hydrated, setHydrated] = useState(false);

  // Load persisted state once on the client (avoids SSR/hydration mismatch).
  useEffect(() => {
    const today = new Date();
    setEntries(load(KEYS.entries, () => seedEntries(today)));
    setFollowUps(load(KEYS.followUps, () => seedManualFollowUps(today)));
    setMembers(load(KEYS.members, () => []));
    setCardEvents(load(KEYS.cardEvents, () => []));
    try { localStorage.removeItem("th.leads.v1"); } catch {} // replaced by live Zoho customers
    setRemovedTriggers(load(KEYS.removedTriggers, () => []));
    setAnnouncements(load(KEYS.announcements, () => seedAnnouncements(today)));
    setTickerSnooze(load(KEYS.tickerSnooze, () => ({})));
    setHydrated(true);
  }, []);

  // ---- Team storage (MongoDB via /api/store) ----
  const [remote, setRemote] = useState(false);
  const inflight = useRef(0);
  const lastLocalChange = useRef(0);
  const synced = useRef<Record<SharedName, Map<string, string>>>({
    entries: new Map(), followUps: new Map(), removedTriggers: new Map(), announcements: new Map(), members: new Map(), cardEvents: new Map(),
  });
  const applyServer = useCallback((json: Record<string, unknown>) => {
    const docsOf = (c: SharedName): SharedDoc[] =>
      c === "removedTriggers" ? ((json[c] as string[]) ?? []).map((id) => ({ id })) : ((json[c] as SharedDoc[]) ?? []);
    for (const c of SHARED) synced.current[c] = new Map(docsOf(c).map((d) => [d.id, JSON.stringify(d)]));
    setEntries((json.entries as CalendarEntry[]) ?? []);
    setFollowUps((json.followUps as FollowUp[]) ?? []);
    setRemovedTriggers((json.removedTriggers as string[]) ?? []);
    setAnnouncements((json.announcements as Announcement[]) ?? []);
    setMembers((json.members as Member[]) ?? []);
    setCardEvents((json.cardEvents as CardEvent[]) ?? []);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let stop = false;
    const pull = async (first: boolean) => {
      try {
        const res = await fetch("/api/store", { cache: "no-store" });
        const json = await res.json();
        if (stop || !json.enabled || json.error) return;
        // Never overwrite edits that haven't reached the server yet.
        if (!first && (inflight.current > 0 || Date.now() - lastLocalChange.current < 5000)) return;
        const hasData = SHARED.some((c) => ((json[c] as unknown[]) ?? []).length > 0);
        // First connect to an empty database: keep local data and let the push effects upload it.
        if (first && !hasData) setRemote(true);
        else {
          applyServer(json);
          setRemote(true);
        }
      } catch {}
    };
    pull(true);
    const t = setInterval(() => pull(false), PULL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [hydrated, applyServer]);

  const push = useCallback((c: SharedName, docs: SharedDoc[]) => {
    const prev = synced.current[c];
    const next = new Map(docs.map((d) => [d.id, JSON.stringify(d)]));
    const upserts = docs.filter((d) => prev.get(d.id) !== next.get(d.id));
    const deletes = [...prev.keys()].filter((id) => !next.has(id));
    synced.current[c] = next;
    if (!upserts.length && !deletes.length) return;
    inflight.current++;
    lastLocalChange.current = Date.now();
    fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: c, upserts, deletes }) })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
      })
      .catch(() => {
        synced.current[c] = prev; // retry on the next change
      })
      .finally(() => {
        inflight.current--;
      });
  }, []);

  useEffect(() => { if (remote) push("entries", entries as unknown as SharedDoc[]); }, [remote, entries, push]);
  useEffect(() => { if (remote) push("followUps", followUps as unknown as SharedDoc[]); }, [remote, followUps, push]);
  useEffect(() => { if (remote) push("removedTriggers", removedTriggers.map((id) => ({ id }))); }, [remote, removedTriggers, push]);
  useEffect(() => { if (remote) push("announcements", announcements as unknown as SharedDoc[]); }, [remote, announcements, push]);
  useEffect(() => { if (remote) push("members", members as unknown as SharedDoc[]); }, [remote, members, push]);
  useEffect(() => { if (remote) push("cardEvents", cardEvents as unknown as SharedDoc[]); }, [remote, cardEvents, push]);

  // Browser cache (also the only storage when MongoDB isn't configured).
  useEffect(() => { if (hydrated) save(KEYS.entries, entries); }, [hydrated, entries]);
  useEffect(() => { if (hydrated) save(KEYS.followUps, followUps); }, [hydrated, followUps]);
  useEffect(() => { if (hydrated) save(KEYS.removedTriggers, removedTriggers); }, [hydrated, removedTriggers]);
  useEffect(() => { if (hydrated) save(KEYS.announcements, announcements); }, [hydrated, announcements]);
  useEffect(() => { if (hydrated) save(KEYS.members, members); }, [hydrated, members]);
  useEffect(() => { if (hydrated) save(KEYS.cardEvents, cardEvents); }, [hydrated, cardEvents]);
  useEffect(() => { if (hydrated) save(KEYS.tickerSnooze, tickerSnooze); }, [hydrated, tickerSnooze]);

  const refresh = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/trainings${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as TrainingsResponse;
      const next = { ...json, pipeline: json.pipeline ?? [] };
      if (next.error && next.trainings.length === 0) {
        // Zoho unavailable: keep showing the last good data (from memory or this browser), flagged.
        setData((d) => {
          const last = d && d.trainings.length ? d : load<TrainingsResponse | null>("th.lastBooks.v1", () => null);
          return last ? { ...last, error: next.error } : next;
        });
      } else {
        setData(next);
        if (!next.error && next.source === "zoho") save("th.lastBooks.v1", next);
      }
    } catch (e) {
      setData((d) => (d ? { ...d, error: String(e) } : { source: "mock", syncedAt: new Date().toISOString(), trainings: [], pipeline: [], error: String(e) }));
    } finally {
      setSyncing(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const pullMeta = () =>
      fetch("/api/zoho/meta", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setMeta({ team: j.team ?? [], customers: j.customers ?? [] }))
        .catch(() => {});
    pullMeta();
    const t = setInterval(pullMeta, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Initial load + near-real-time polling every 5 minutes; clock ticks every minute.
  useEffect(() => {
    refresh();
    const poll = setInterval(() => refresh(), 5 * 60_000);
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // Reconcile with the current data source:
  // - once Zoho is live, sample (demo) items disappear;
  // - auto follow-ups are rebuilt from current Zoho data; stale ones are dropped unless someone worked on them;
  // - follow-ups the user deleted are never re-created.
  useEffect(() => {
    if (!data || !hydrated) return;
    const live = data.source === "zoho" && !data.error;
    const auto = [...followUpsFromTrainings(data.trainings, new Date()), ...followUpsFromPipeline(data.pipeline ?? [], new Date())];
    const autoKeys = new Set(auto.map((f) => f.triggerKey));
    const touched = (f: FollowUp) => f.status !== "pending" || f.activities.length > 1;
    setFollowUps((cur) => {
      const kept = cur.filter((f) => {
        if (live && f.demo) return false;
        if (f.triggerKey && !autoKeys.has(f.triggerKey) && !touched(f)) return false;
        return true;
      });
      // Untouched auto follow-ups pick up the latest Zoho details (names, dates, priority).
      const autoByKey = new Map(auto.map((f) => [f.triggerKey, f]));
      for (let i = 0; i < kept.length; i++) {
        const f = kept[i];
        const fresh = f.triggerKey ? autoByKey.get(f.triggerKey) : undefined;
        if (fresh && !touched(f)) kept[i] = { ...fresh, id: f.id, createdAt: f.createdAt, activities: f.activities };
      }
      const have = new Set(kept.map((f) => f.triggerKey).filter(Boolean));
      const add = auto.filter((f) => !have.has(f.triggerKey) && !removedTriggers.includes(f.triggerKey!));
      const next = [...kept, ...add];
      return JSON.stringify(next) === JSON.stringify(cur) ? cur : next;
    });
    if (live) {
      setEntries((cur) => (cur.some((e) => e.demo) ? cur.filter((e) => !e.demo) : cur));
      setAnnouncements((cur) => (cur.some((a) => a.demo) ? cur.filter((a) => !a.demo) : cur));
    }
  }, [data, hydrated, removedTriggers]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = uid();
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 10_000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const saveEntry = useCallback((e: CalendarEntry) => {
    setEntries((cur) => (cur.some((x) => x.id === e.id) ? cur.map((x) => (x.id === e.id ? e : x)) : [...cur, e]));
  }, []);

  const deleteEntry = useCallback(
    (id: string) => {
      const victim = entries.find((x) => x.id === id);
      if (!victim) return;
      setEntries((cur) => cur.filter((x) => x.id !== id));
      toast({ text: `Deleted "${victim.title}"`, actionLabel: "Undo", onAction: () => setEntries((c) => [...c, victim]) });
    },
    [entries, toast],
  );

  const withActivity = (f: FollowUp, a?: Omit<FollowUpActivity, "id" | "at">): FollowUp => {
    const { eff: _eff, ...clean } = f as FollowUp & { eff?: unknown }; // "eff" is a view-only field
    return a ? { ...clean, activities: [...clean.activities, { ...a, id: uid(), at: new Date().toISOString() }] } : clean;
  };

  const saveFollowUp = useCallback((f: FollowUp, a?: Omit<FollowUpActivity, "id" | "at">) => {
    setFollowUps((cur) => {
      const next = withActivity(f, a);
      return cur.some((x) => x.id === f.id) ? cur.map((x) => (x.id === f.id ? next : x)) : [...cur, next];
    });
  }, []);

  const patchFollowUps = useCallback((ids: string[], patch: Partial<FollowUp>, a?: Omit<FollowUpActivity, "id" | "at">) => {
    setFollowUps((cur) => cur.map((x) => (ids.includes(x.id) ? withActivity({ ...x, ...patch }, a) : x)));
  }, []);

  const deleteFollowUp = useCallback(
    (id: string) => {
      const victim = followUps.find((x) => x.id === id);
      if (!victim) return;
      setFollowUps((cur) => cur.filter((x) => x.id !== id));
      if (victim.triggerKey) setRemovedTriggers((r) => [...r, victim.triggerKey!]);
      toast({
        text: `Deleted follow-up "${victim.subject}"`,
        actionLabel: "Undo",
        onAction: () => {
          setFollowUps((c) => [...c, victim]);
          if (victim.triggerKey) setRemovedTriggers((r) => r.filter((k) => k !== victim.triggerKey));
        },
      });
    },
    [followUps, toast],
  );

  const addMember = useCallback(
    (name: string) => {
      const clean = name.trim();
      const existing = members.find((m) => m.name.toLowerCase() === clean.toLowerCase());
      if (existing) return existing;
      const m: Member = { id: uid(), name: clean, createdAt: new Date().toISOString() };
      setMembers((cur) => [...cur, m]);
      return m;
    },
    [members],
  );

  const addCardEvents = useCallback((events: Omit<CardEvent, "id" | "at">[]) => {
    // Events saved together keep their order: each gets its own millisecond.
    const t0 = Date.now();
    const created = events.map((e, i): CardEvent => ({ ...e, id: uid() + uid(), at: new Date(t0 + i).toISOString() }));
    if (created.length) setCardEvents((cur) => [...cur, ...created]);
    return created;
  }, []);

  const revertCardEvent = useCallback((id: string, by: string) => {
    setCardEvents((cur) => cur.map((e) => (e.id === id && !e.revertedAt ? { ...e, revertedAt: new Date().toISOString(), revertedBy: by } : e)));
  }, []);

  const snoozeTicker = useCallback((id: string, hours: number) => {
    setTickerSnooze((s) => ({ ...s, [id]: new Date(Date.now() + hours * 3_600_000).toISOString() }));
  }, []);

  const ticker = useMemo(() => {
    if (!data) return [];
    return buildTickerItems(data.trainings, followUps, entries, announcements, now).filter(
      (i) => !tickerSnooze[i.id] || new Date(tickerSnooze[i.id]) < now,
    );
  }, [data, followUps, entries, announcements, now, tickerSnooze]);

  const value: Store = {
    ready,
    now,
    data,
    syncing,
    refresh: () => refresh(true),
    storage: remote ? "team" : "browser",
    team: meta.team,
    customers: meta.customers,
    entries,
    saveEntry,
    deleteEntry,
    followUps,
    saveFollowUp,
    deleteFollowUp,
    patchFollowUps,
    members,
    addMember,
    cardEvents,
    addCardEvents,
    revertCardEvent,
    announcements,
    ticker,
    snoozeTicker,
    toasts,
    toast,
    dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
