"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardTraining, CalendarEntry } from "@/lib/types";
import { addDays, fmtDate, ymd } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { givesTraining, inEntry } from "@/lib/roles";
import { personColour, shortTraining } from "./Calendar";

/*
 * Reminders (owner, 19 Oct): a small popup at the bottom right, one at a time, for each training, meeting or event of
 * today and tomorrow that the member is picked for (the trainers; the people on a meeting / event, or everyone) —
 * soonest first. Each shows for 30 s, can be closed, and shows once a day per member (the server remembers). Clicking
 * one opens its card on its board (a meeting: the calendar); the next waits until that is closed.
 */

const SHOW_MS = 30_000;
const GAP_MS = 1_500;
type Reminder = { id: string; date: string; time?: string; kind: string; title: string; detail: string; colour: string; href: string };

function remindersFor(member: { id: string; name: string }, board: BoardTraining[], entries: CalendarEntry[], today: string, tomorrow: string): Reminder[] {
  const days = [today, tomorrow];
  const out: Reminder[] = [];
  for (const t of board) {
    if (t.status === "completed" || t.status === "tbd" || !givesTraining(member, t)) continue;
    for (const d of t.dates.filter((x) => days.includes(x))) {
      const who = t.board === "aed" ? ["Priyanka"] : t.trainers;
      out.push({
        id: `t:${t.id}:${d}`,
        date: d,
        time: t.time,
        kind: t.board === "aed" ? "AED training" : "Training",
        title: t.alias || t.customerName,
        detail: `${t.board === "aed" ? t.training : shortTraining(t.training)}${t.dates.length > 1 ? ` · day ${t.dates.indexOf(d) + 1} of ${t.dates.length}` : ""} · ${who.map((n) => n.split(" ")[0]).join(", ")}`,
        colour: personColour(who[0] ?? ""),
        href: `/follow-up?open=${encodeURIComponent(t.id)}`,
      });
    }
  }
  for (const e of entries) {
    if (!days.includes(e.date) || !inEntry(member, e)) continue;
    const who = e.everyone ? "Everyone" : (e.people ?? []).map((n) => n.split(" ")[0]).join(", ");
    out.push({
      id: `e:${e.id}:${e.date}`,
      date: e.date,
      time: e.allDay ? undefined : e.startTime,
      kind: e.type === "meeting" ? "Meeting" : "Event",
      title: e.title,
      detail: `${e.allDay ? "All day" : e.endTime ? `until ${e.endTime}` : ""}${e.linkedCustomer ? ` · ${e.linkedCustomer}` : ""} · ${who}`.replace(/^ · /, ""),
      colour: e.everyone ? "var(--brand)" : personColour(e.people?.[0] ?? e.createdBy ?? ""),
      href: `/calendar?date=${e.date}&entry=${encodeURIComponent(e.id)}`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

export function DayReminders() {
  const { data, entries, now, ready } = useStore();
  const { member } = useSession();
  const router = useRouter();
  const today = ymd(now);
  const tomorrow = ymd(addDays(now, 1));
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [current, setCurrent] = useState<Reminder | null>(null);
  const [cooling, setCooling] = useState(false);
  const [blocked, setBlocked] = useState(false); // a card / popup is open, or the tab is hidden
  // After a click: wait for the card it opens to appear and close again (or 20 s if nothing opens).
  const holding = useRef<{ since: number; sawDialog: boolean } | null>(null);

  useEffect(() => {
    if (!member) return;
    let stop = false;
    fetch("/api/reminders", { cache: "no-store" }).then((r) => r.json()).then((j: { ids?: string[] }) => { if (!stop) setSeen(new Set(j.ids ?? [])); }).catch(() => { if (!stop) setSeen(new Set()); });
    return () => { stop = true; };
  }, [member, today]);

  useEffect(() => {
    const check = () => {
      const dialog = Boolean(document.querySelector('[role="dialog"],[role="alertdialog"]'));
      const h = holding.current;
      if (h) {
        if (dialog) h.sawDialog = true;
        if ((h.sawDialog && !dialog) || (!h.sawDialog && Date.now() - h.since > 20_000)) holding.current = null;
      }
      setBlocked(dialog || document.visibilityState !== "visible" || Boolean(holding.current));
    };
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, []);

  const queue = useMemo(() => {
    if (!member || !seen || !data) return [];
    return remindersFor(member, [...(data.board ?? []), ...(data.aedBoard ?? [])], entries, today, tomorrow).filter((r) => !seen.has(r.id));
  }, [member, seen, data, entries, today, tomorrow]);

  // The next one, when nothing is in the way.
  useEffect(() => {
    if (!ready || current || cooling || blocked || !queue.length) return;
    setCurrent(queue[0]);
  }, [ready, current, cooling, blocked, queue]);

  // A card opened over a showing reminder: step aside (it comes back after).
  useEffect(() => { if (blocked && current && !holding.current) setCurrent(null); }, [blocked, current]);

  const done = (r: Reminder) => {
    setSeen((s) => new Set([...(s ?? []), r.id]));
    fetch("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [r.id] }) }).catch(() => {});
    setCurrent(null);
    setCooling(true);
    setTimeout(() => setCooling(false), GAP_MS);
  };
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => done(current), SHOW_MS);
    return () => clearTimeout(t);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;
  const r = current;
  const when = `${r.date === today ? "Today" : r.date === tomorrow ? "Tomorrow" : fmtDate(r.date)}${r.time ? ` · ${r.time}` : ""}`;
  const left = queue.length;
  return (
    <div role="status" aria-live="polite" className="modal-in fixed bottom-20 right-4 z-[65] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop lg:bottom-6 lg:right-6">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: r.colour }} aria-hidden />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => { holding.current = { since: Date.now(), sawDialog: false }; done(r); router.push(r.href); }}
          title="Open it"
        >
          <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">{when} · {r.kind}{left > 1 ? ` · 1 of ${left}` : ""}</span>
          <span className="mt-0.5 block truncate text-[14.5px] font-semibold text-ink">{r.title}</span>
          <span className="block truncate text-[12.5px] text-muted">{r.detail}</span>
        </button>
        <button type="button" onClick={() => done(r)} aria-label="Close reminder" title="Close" className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
          <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
      </div>
      <div className="h-[3px] bg-surface-2"><div key={r.id} className="reminder-bar h-full" style={{ background: r.colour }} /></div>
    </div>
  );
}
