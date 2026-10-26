"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type Who, availability, focusOf, isAdminId, teamDay, teamTime, ago } from "@/lib/progress/model";
import type { Done, Todo, TodoBucket, TodoTone } from "@/lib/progress/todos";
import { PersonAvatar } from "./bits";
import { PROGRESS_CHANGED, type Snapshot } from "./useProgress";

/*
 * Everyone's to-do (owner, 26 Oct): one column per person — what's overdue, today, in the next 7 days, and the steps
 * waiting on them on their board — read from the boards, nothing typed in. Click an item = its card on its board.
 * Admin, Shikha, Sumit and Ashish see everyone; the others their own column (the server decides).
 */

type Answer = { today: string; all: boolean; people: Who[]; todos: Todo[]; done: Done[] } | { error: string };
const BUCKETS: { key: TodoBucket; label: string; tone: string }[] = [
  { key: "overdue", label: "Overdue", tone: "text-high" },
  { key: "today", label: "Today", tone: "text-ink" },
  { key: "week", label: "Next 7 days", tone: "text-ink-2" },
  { key: "open", label: "To do", tone: "text-ink-2" },
];
const TONE: Record<TodoTone, string> = {
  bad: "bg-high-bg text-high", warn: "bg-medium-bg text-medium", info: "bg-info-bg text-info", ok: "bg-low-bg text-low", plain: "bg-surface-2 text-ink-2",
};
/** Short, so the action keeps its words: "Today", "Tomorrow", "Thu 29 Oct", "5 days ago" (the full date in the tooltip). */
const fullDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const dayLabel = (d: string, today: string) => {
  const diff = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff < 0 ? `${-diff} days ago` : fullDay(d).replace(",", "");
};

/** `mode` "todo" = what's due; "done" = the work each person did in the last 7 days (from the boards' change log). */
export function TodoBoard({ snap, now, onOpenRequest, mode = "todo" }: { snap: Snapshot; now: Date; onOpenRequest: (id: string) => void; mode?: "todo" | "done" }) {
  const [data, setData] = useState<Answer | null>(null);
  const load = useCallback(() => {
    fetch("/api/progress/todos", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => setData((d) => d ?? { error: "Couldn't reach the server" }));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    window.addEventListener(PROGRESS_CHANGED, load);
    return () => { clearInterval(t); window.removeEventListener(PROGRESS_CHANGED, load); };
  }, [load]);

  // Columns slide sideways (◀ ▶) when they don't all fit — no page scroll.
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = row.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [measure, data]);
  const slide = (dir: number) => row.current?.scrollBy({ left: dir * 296, behavior: "smooth" });

  if (!data) return <div className="h-full min-h-60 animate-pulse rounded-2xl bg-surface-2" />;
  if ("error" in data) return <p className="text-[14px] text-high">{data.error}</p>;

  const pres = new Map(snap.presence.map((p) => [p.id, p]));
  // You first, then whoever has the most overdue / today, then the rest; Admin last.
  const weight = (id: string) => (mode === "done" ? data.done.filter((d) => d.who === id).length : data.todos.filter((t) => t.who === id && (t.bucket === "overdue" || t.bucket === "today")).length);
  const people = [...data.people].sort((a, b) => Number(b.id === snap.me.id) - Number(a.id === snap.me.id) || Number(isAdminId(a.id)) - Number(isAdminId(b.id)) || weight(b.id) - weight(a.id));
  const single = people.length === 1;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {edges.left && <Arrow side="left" onClick={() => slide(-1)} />}
      {edges.right && <Arrow side="right" onClick={() => slide(1)} />}
      <div ref={row} onScroll={measure} className="no-scrollbar flex h-full min-h-0 snap-x gap-3 overflow-x-auto lg:pb-0">
        {people.map((m) => {
          const items = data.todos.filter((t) => t.who === m.id);
          const done = data.done.filter((d) => d.who === m.id);
          const a = availability(pres.get(m.id), now);
          const focus = focusOf(pres.get(m.id), snap.today);
          const overdue = items.filter((t) => t.bucket === "overdue").length;
          return (
            <section key={m.id} aria-label={`${m.name}'s to-do`} className={`card flex min-h-[320px] shrink-0 snap-start flex-col p-0 lg:min-h-0 ${single ? "w-full max-w-[640px]" : "w-[min(284px,calc(100vw-48px))]"}`}>
              <header className="border-b border-line px-3.5 pb-2.5 pt-3">
                <div className="flex items-center gap-2.5">
                  <PersonAvatar name={m.name} size={34} dim={a.state !== "active"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[15px] font-semibold text-ink">{m.id === snap.me.id ? "You" : m.name}</span>
                      <span className="ml-auto shrink-0 text-[12.5px] tabular-nums text-muted" title={mode === "done" ? "Things done in the last 7 days" : "Things to do"}>{mode === "done" ? done.reduce((n, d) => n + d.count, 0) : items.length}</span>
                    </div>
                    <span className={`block truncate text-[12px] ${a.state === "active" ? "text-low" : "text-muted"}`}>
                      {a.state === "active" ? "● Active" : a.manual ? `○ Away${a.until ? ` until ${teamTime(a.until)}` : ""}` : `○ Away · ${a.lastSeenAt ? `seen ${ago(a.lastSeenAt, now)}` : "not seen yet"}`}
                      {overdue ? <span className="font-semibold text-high"> · {overdue} overdue</span> : null}
                    </span>
                  </div>
                </div>
                {focus && <p className="mt-1.5 truncate text-[12.5px] text-ink-2" title={focus.text}><span className="text-muted">Focus:</span> {focus.text}</p>}
              </header>
              <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
                {mode === "done" ? <DoneList list={done} today={data.today} /> : <>
                {!items.length && <p className="py-4 text-center text-[13px] text-muted">Nothing due ✓</p>}
                {BUCKETS.map((b) => {
                  const list = items.filter((t) => t.bucket === b.key);
                  if (!list.length) return null;
                  return (
                    <div key={b.key}>
                      <h3 className={`mb-1 text-[11.5px] font-bold uppercase tracking-wide ${b.tone}`}>{b.label} ({list.length})</h3>
                      <ul className="space-y-1.5">{list.map((t) => <Item key={t.id} t={t} today={data.today} onOpenRequest={onOpenRequest} />)}</ul>
                    </div>
                  );
                })}
                </>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Item({ t, today, onOpenRequest }: { t: Todo; today: string; onOpenRequest: (id: string) => void }) {
  const body = (
    <>
      <span className="flex items-start gap-1.5">
        <span className={`rounded-md px-1.5 py-px text-[11.5px] font-semibold leading-snug ${TONE[t.tone]}`}>{t.tag}</span>
        {t.date && <span className={`ml-auto shrink-0 pt-px text-[11.5px] font-medium ${t.bucket === "overdue" ? "text-high" : "text-muted"}`} title={fullDay(t.date)}>{dayLabel(t.date, today)}</span>}
      </span>
      <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-ink" title={t.title}>{t.title}</span>
      {t.detail && <span className="block truncate text-[12px] text-muted" title={t.detail}>{t.detail}</span>}
    </>
  );
  const cls = "press block w-full rounded-xl border border-line bg-surface px-2.5 py-1.5 text-left hover:border-line-strong hover:bg-surface-2/50";
  return (
    <li>
      {t.requestId ? <button type="button" className={cls} onClick={() => onOpenRequest(t.requestId!)}>{body}</button>
        : t.href ? <Link href={t.href} className={cls}>{body}</Link>
        : <div className={cls}>{body}</div>}
    </li>
  );
}

/** A person's work done, newest first, by day: "Today", "Yesterday", "Sat 24 Oct". */
function DoneList({ list, today }: { list: Done[]; today: string }) {
  if (!list.length) return <p className="py-4 text-center text-[13px] text-muted">Nothing recorded in the last 7 days</p>;
  const days = [...new Set(list.map((d) => teamDay(d.at)))];
  return (
    <>
      {days.map((day) => {
        const items = list.filter((d) => teamDay(d.at) === day);
        return (
          <div key={day}>
            <h3 className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-2">{dayLabel(day, today) === "Today" ? "Today" : dayLabel(day, today) === "Yesterday" ? "Yesterday" : fullDay(day).replace(",", "")} ({items.reduce((n, d) => n + d.count, 0)})</h3>
            <ul className="space-y-1.5">
              {items.map((d) => {
                const body = (
                  <>
                    <span className="flex items-start gap-1.5">
                      <span className="rounded-md bg-low-bg px-1.5 py-px text-[11.5px] font-semibold leading-snug text-low">✓ {d.tag}{d.count > 1 ? ` ×${d.count}` : ""}</span>
                      <span className="ml-auto shrink-0 pt-px text-[11.5px] font-medium text-muted">{teamTime(d.at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-ink" title={d.title}>{d.title}</span>
                    {d.detail && <span className="block truncate text-[12px] text-muted" title={d.detail}>{d.detail}</span>}
                  </>
                );
                const cls = "press block w-full rounded-xl border border-line bg-surface px-2.5 py-1.5 text-left hover:border-line-strong hover:bg-surface-2/50";
                return <li key={d.id}>{d.href ? <Link href={d.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={side === "left" ? "Earlier columns" : "More columns"}
      className={`press absolute top-3 z-10 grid size-9 place-items-center rounded-full bg-ink/85 text-surface shadow-pop hover:bg-ink ${side === "left" ? "-left-3" : "-right-3"}`}>
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={side === "left" ? "M12 5l-5 5 5 5" : "M8 5l5 5-5 5"} />
      </svg>
    </button>
  );
}
