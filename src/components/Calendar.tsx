"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BoardTraining, CalendarEntry, EntryType, Member } from "@/lib/types";
import { addDays, daysBetween, fmtDate, parseYmd, startOfDay, ymd } from "@/lib/dates";
import { type CardView, TRAINERS, busyTrainers, salespersonLabel, cardDue, daysValue, fmtDays, fulfilCardId, orderTrainers } from "@/lib/pipeline";
import { newId, useStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { boardsFor, canSeeTraining, ownsEntry, ownsTraining, seesWholeCalendar } from "@/lib/roles";
import { Combobox, IconButton, Segmented, btn, inputCls } from "./ui";
import {
  type CertChoice, ChangeLog, DocsSection, DueChip, FormRow, Header, NotesPanel, Row, ScheduleRows, Section, Shell, TrainingSection,
  certEvents, certOf, certReady, dateAllowed, minTrainingDate, scheduleText, trainingDateEvents,
} from "./followups/CardModal";
import { AedCardModal } from "./followups/AedModal";
import { StatePill } from "./followups/FulfilCerts";
import { useBoardCards } from "./followups/useBoards";
import { datesInfo, istDay, reminderDays, reminderKey, reminderRecipients } from "@/lib/reminderPlan";

/*
 * The calendar (owner, 19 Oct): every training from the boards on its days — customer, training, who gives it — plus
 * meetings and events. Each member sees their own calendar; Admin, Shikha, Sumit and Ashish see everyone's (roles.ts).
 * Every person has a colour. A training opens its card right here (dates, trainers, location, email, documents, what
 * happens after); "+ New" schedules a training (Training board or AedSmartx) or adds a meeting / event.
 */

const TYPE_LABEL: Record<EntryType, string> = { meeting: "Meeting", event: "Event" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function monthGrid(year: number, month: number): Date[] {
  const start1 = new Date(year, month, 1);
  const offset = (start1.getDay() + 6) % 7; // Monday-first
  const start = addDays(start1, -offset);
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/* ---------------- People's colours ---------------- */

// One colour per person (owner: "give each person a colour"): the team's fixed, anyone else from the spare set by name.
const OWN_COLOUR: Record<string, string> = {
  shikha: "#0d9488", ashish: "#2563eb", sumit: "#d97706", priyanka: "#9333ea", arti: "#db2777", shreya: "#16a34a", admin: "#475569",
};
const SPARE = ["#dc2626", "#0891b2", "#7c3aed", "#ea580c", "#65a30d", "#be185d"];
const EXTERNAL = "#94a3b8";
export function personColour(name: string, known = true): string {
  const key = first(name).toLowerCase();
  if (OWN_COLOUR[key]) return OWN_COLOUR[key];
  if (!known) return EXTERNAL;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}
const tint = (c: string, pct = 14) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/* ---------------- What the calendar shows ---------------- */

type Item =
  | { kind: "training"; key: string; date: string; time?: string; who: string[]; t: BoardTraining }
  | { kind: "entry"; key: string; date: string; time?: string; who: string[]; e: CalendarEntry };
type KindFilter = "all" | "training" | "aed" | "meeting" | "event";
/** "all" = everyone (whole-calendar viewers), "mine", or one person's name. */
/** "all" = everyone, "mine", "external" = the external trainers, or one person's name. */
type WhoFilter = string;
const EXTERNAL_KEY = "external";

/** "THCAS BLS Training 2025 (I)" → "BLS Training". */
export const shortTraining = (name: string) => name.split(",").map((n) => n.replace(/^THCAS\s+/i, "").replace(/\s*\(I\)\s*$/i, "").replace(/\s+20\d\d\b/, "").trim()).join(", ");
const entryWho = (e: CalendarEntry) => (e.everyone ? ["Everyone"] : e.people?.length ? e.people : e.createdBy ? [e.createdBy] : []);
const trainingWho = (t: BoardTraining) => (t.board === "aed" ? ["Priyanka"] : t.trainers);
/** Past its last day and nobody pressed "Training completed". */
const unmarked = (t: BoardTraining, today: string) => t.status !== "completed" && t.dates.length > 0 && (t.dates.at(-1) ?? "") < today;

function useCalendarItems(kind: KindFilter, who: WhoFilter) {
  const { entries, data, members } = useStore();
  const { member } = useSession();
  const whole = member ? seesWholeCalendar(member) : false;
  const known = useMemo(() => new Set([...members.map((m) => first(m.name).toLowerCase()), "admin"]), [members]);
  const byDate = useMemo(() => {
    const m = new Map<string, Item[]>();
    if (!member) return m;
    const add = (it: Item) => m.set(it.date, [...(m.get(it.date) ?? []), it]);
    const outside = (n: string) => n !== "Everyone" && !known.has(first(n).toLowerCase());
    const pickWho = (names: string[], mine: boolean) => (who === "all" ? true : who === "mine" ? mine : who === EXTERNAL_KEY ? names.some(outside) : names.some((n) => n === "Everyone" || first(n).toLowerCase() === first(who).toLowerCase()));
    const trainings = [...(data?.board ?? []), ...(data?.aedBoard ?? [])].filter((t) => t.status !== "tbd" && canSeeTraining(member, t));
    for (const t of trainings) {
      if (kind !== "all" && kind !== (t.board === "aed" ? "aed" : "training")) continue;
      if (!pickWho(trainingWho(t), ownsTraining(member, t))) continue;
      for (const d of t.dates) add({ kind: "training", key: `t:${t.id}:${d}`, date: d, time: t.time, who: trainingWho(t), t });
    }
    for (const e of entries) {
      if (kind !== "all" && kind !== e.type) continue;
      if (!pickWho(entryWho(e), ownsEntry(member, e))) continue;
      add({ kind: "entry", key: `e:${e.id}`, date: e.date, time: e.allDay ? undefined : e.startTime, who: entryWho(e), e });
    }
    // Priority is the time of day: all-day first, then by time.
    m.forEach((v) => v.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || label(a).localeCompare(label(b))));
    return m;
  }, [entries, data, member, kind, who, known]);
  return { byDate, whole, known, member };
}
const label = (it: Item) => (it.kind === "training" ? it.t.alias || it.t.customerName : it.e.title);

/**
 * The people in what's shown, for the legend (and the Who filter): the team by name; anyone else (external trainers)
 * as one "External trainers" entry (owner, 19 Oct).
 */
function peopleOf(byDate: Map<string, Item[]>, known: Set<string>): { key: string; name: string; colour: string }[] {
  const seen = new Map<string, string>();
  let external = false;
  for (const list of byDate.values()) for (const it of list) for (const n of it.who) {
    if (n === "Everyone") continue;
    if (!known.has(first(n).toLowerCase())) external = true;
    else if (!seen.has(first(n).toLowerCase())) seen.set(first(n).toLowerCase(), n);
  }
  const team = [...seen.values()].sort((a, b) => a.localeCompare(b)).map((n) => ({ key: n, name: n, colour: personColour(n) }));
  return external ? [...team, { key: EXTERNAL_KEY, name: "External trainers", colour: EXTERNAL }] : team;
}

/* ---------------- One item on the grid / in the agenda ---------------- */

function Chip({ it, known, today, onOpen, draggable }: { it: Item; known: Set<string>; today: string; onOpen: (it: Item) => void; draggable?: boolean }) {
  const colours = it.who.map((n) => (n === "Everyone" ? "var(--brand)" : personColour(n, known.has(first(n).toLowerCase()))));
  const c = colours[0] ?? EXTERNAL;
  const names = it.who.map(first).join(", ");
  const line1 = `${it.time ? `${it.time} · ` : ""}${label(it)}`;
  const line2 = it.kind === "training"
    ? `${it.t.board === "aed" ? "AED training" : shortTraining(it.t.training)}${it.t.dates.length > 1 ? ` · day ${it.t.dates.indexOf(it.date) + 1}/${it.t.dates.length}` : ""} · ${names || "trainer not set"}`
    : `${TYPE_LABEL[it.e.type]}${it.e.allDay ? " · all day" : it.e.endTime ? ` – ${it.e.endTime}` : ""} · ${names}`;
  const done = it.kind === "training" && it.t.status === "completed";
  const late = it.kind === "training" && unmarked(it.t, today);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={draggable && it.kind === "entry" ? (ev) => ev.dataTransfer.setData("text/entry", it.e.id) : undefined}
      onClick={(ev) => { ev.stopPropagation(); onOpen(it); }}
      className={`block w-full min-w-0 rounded-md border-l-[3px] px-1.5 py-[3px] text-left text-[11.5px] leading-[1.3] transition hover:brightness-95 ${done ? "opacity-60" : ""}`}
      style={{ borderLeftColor: c, background: tint(c) }}
      title={`${line1}\n${line2}${done ? "\nCompleted" : late ? "\nDay passed — mark it completed" : it.kind === "training" && it.t.status === "postponed" ? "\nPostponed" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate font-semibold text-ink">{line1}</span>
        {done && <span className="shrink-0 text-low" aria-label="Completed">✓</span>}
        {late && <span className="size-1.5 shrink-0 rounded-full bg-high" aria-label="Mark completed" />}
        {colours.length > 1 && <span className="ml-auto flex shrink-0 gap-0.5">{colours.slice(1, 4).map((x, i) => <span key={i} className="size-1.5 rounded-full" style={{ background: x }} />)}</span>}
      </span>
      <span className="block truncate text-muted">{line2}</span>
    </button>
  );
}

/* ---------------- Day agenda (side panel / under the mini calendar) ---------------- */

function DayAgenda({ date, items, known, today, onAdd, onOpen }: { date: string; items: Item[]; known: Set<string>; today: string; onAdd?: () => void; onOpen: (it: Item) => void }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-muted">{date === today ? "Today" : fmtDate(date, { weekday: "long" })}</div>
          <div className="text-[15px] font-semibold tracking-tight">{fmtDate(date, { day: "numeric", month: "long" })}</div>
        </div>
        {onAdd && <button className={btn.ghost} onClick={onAdd}><span aria-hidden>+</span> New</button>}
      </div>
      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          Nothing on this day.
          {onAdd && <><br /><button className="mt-1 font-medium text-ink-2 hover:text-ink" onClick={onAdd}>Schedule a training, meeting or event</button></>}
        </div>
      ) : (
        <ul className="no-scrollbar mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {items.map((it) => (
            <li key={it.key}><Chip it={it} known={known} today={today} onOpen={onOpen} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Month navigation ---------------- */

function MonthNav({ cursor, setCursor, onToday, large = false }: { cursor: Date; setCursor: (d: Date) => void; onToday: () => void; large?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className={`${large ? "text-[18px]" : "text-[15px]"} min-w-0 font-semibold tracking-tight`}>
        {cursor.toLocaleDateString("en-IN", { month: "long" })} <span className="font-normal text-muted">{cursor.getFullYear()}</span>
      </h2>
      <div className="ml-auto flex items-center rounded-lg border border-line">
        <IconButton label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded-r-none">
          <path d="M12 5l-5 5 5 5" />
        </IconButton>
        <button onClick={onToday} className="h-8 border-x border-line px-2.5 text-xs font-medium text-ink-2 hover:bg-surface-2">Today</button>
        <IconButton label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded-l-none">
          <path d="M8 5l5 5-5 5" />
        </IconButton>
      </div>
    </div>
  );
}

/* ---------------- Mini calendar (Overview) ---------------- */

export function MiniCalendar() {
  const { now } = useStore();
  const todayStr = ymd(now);
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(todayStr);
  const { byDate, known } = useCalendarItems("all", "mine");
  const days = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const href = (it: Item) => (it.kind === "training" ? `/calendar?date=${it.date}&card=${encodeURIComponent(it.t.id)}` : `/calendar?date=${it.date}&entry=${encodeURIComponent(it.e.id)}`);

  return (
    <section className="card p-5" aria-label="Calendar">
      <MonthNav cursor={cursor} setCursor={setCursor} onToday={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(todayStr); }} />
      <div className="mt-4 grid grid-cols-7 text-center text-[11px] font-medium text-faint">
        {WEEKDAYS.map((w) => <div key={w} className="pb-2">{w.slice(0, 2)}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day) => {
          const key = ymd(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const list = byDate.get(key) ?? [];
          const dots = [...new Set(list.flatMap((it) => it.who.slice(0, 1)))].slice(0, 3);
          const isToday = key === todayStr;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`relative mx-auto flex size-10 flex-col items-center justify-center rounded-lg text-[13px] transition hover:bg-surface-2 ${inMonth ? "text-ink" : "text-faint/60"} ${key === selected && !isToday ? "ring-1 ring-ink/70" : ""}`}
              aria-label={`${fmtDate(key, { day: "numeric", month: "long" })}${list.length ? `, ${list.length} on the calendar` : ""}`}
            >
              <span className={`grid size-6 place-items-center rounded-full num ${isToday ? "bg-ink font-semibold text-surface" : list.length ? "font-semibold" : ""}`}>{day.getDate()}</span>
              <span className="absolute bottom-1 flex items-center gap-0.5">
                {dots.map((n) => <span key={n} className="size-1 rounded-full" style={{ background: n === "Everyone" ? "var(--brand)" : personColour(n, known.has(first(n).toLowerCase())) }} />)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <DayAgenda date={selected} items={byDate.get(selected) ?? []} known={known} today={todayStr} onOpen={(it) => { window.location.href = href(it); }} />
        <Link href={`/calendar?date=${selected}`} className="mt-3 inline-block text-[13px] font-semibold text-brand hover:underline">Open the calendar →</Link>
      </div>
    </section>
  );
}

/* ---------------- Full calendar (calendar page) ---------------- */

/** On a desktop the month fills the screen down to a 16 px margin — no page scroll (owner's rule); phones scroll. */
function useFitHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  // The page's own bottom padding is taken back, so the margin under the month is exactly 16 px.
  const [pull, setPull] = useState(0);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      if (window.innerWidth < 1024) return setH(null);
      const pad = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).paddingBottom) || 0 : 0;
      setPull(Math.max(0, pad - 16));
      const next = Math.max(520, Math.floor(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 16));
      setH((x) => (x === next ? x : next));
    };
    fit();
    const late = setTimeout(fit, 600); // after the page's entry animation
    window.addEventListener("resize", fit);
    return () => { clearTimeout(late); window.removeEventListener("resize", fit); };
  }, []);
  return { ref, h, pull };
}

/** How many two-line items fit in one day cell. */
function useCellRoom(rows: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rowH = el.clientHeight / rows;
      setRoom(Math.max(1, Math.floor((rowH - 30 - 18) / 37)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);
  return { ref, room };
}

type Open = { item: Item } | { add: string } | null;

export function FullCalendar({ initialDate, openCard, openEntry }: { initialDate?: string; openCard?: string; openEntry?: string }) {
  const { now, entries, saveEntry, data, members } = useStore();
  const { member } = useSession();
  const todayStr = ymd(now);
  const start = initialDate ? parseYmd(initialDate) : now;
  const [cursor, setCursor] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const [selected, setSelected] = useState(initialDate ?? todayStr);
  const [kind, setKind] = useState<KindFilter>("all");
  const [who, setWho] = useState<WhoFilter>("all");
  const [open, setOpen] = useState<Open>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // The person filter works for everyone (within what they may see); the legend lists everyone in view, unfiltered.
  const { byDate, whole, known } = useCalendarItems(kind, who);
  const unfiltered = useCalendarItems(kind, "all").byDate;
  const boards = member ? boardsFor(member) : [];
  const cards = useBoardCards({ training: boards.includes("training"), aed: boards.includes("aed") });
  const days = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const weeks = days.length / 7;
  const fit = useFitHeight();
  const cell = useCellRoom(weeks);
  // Only the people in the month on screen.
  const gridKey = `${ymd(days[0])}:${days.length}`;
  const people = useMemo(() => {
    const inGrid = new Set(days.map(ymd));
    return peopleOf(new Map([...unfiltered].filter(([d]) => inGrid.has(d))), known);
  }, [unfiltered, known, gridKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a link (Overview, ticker, a reminder): the training card or the meeting / event straight away.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    if (openEntry) {
      const e = entries.find((x) => x.id === openEntry);
      if (e) { opened.current = true; setOpen({ item: { kind: "entry", key: `e:${e.id}`, date: e.date, who: entryWho(e), e } }); }
    } else if (openCard) {
      const t = [...(data?.board ?? []), ...(data?.aedBoard ?? [])].find((x) => x.id === openCard);
      if (t) { opened.current = true; setOpen({ item: { kind: "training", key: `t:${t.id}`, date: initialDate ?? t.dates[0] ?? todayStr, time: t.time, who: trainingWho(t), t } }); }
    }
  }, [openCard, openEntry, entries, data, initialDate, todayStr]);

  // Keyboard: N = new on the selected day.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key.toLowerCase() === "n" && !open && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) setOpen({ add: selected });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected]);

  const move = (id: string, date: string) => {
    const e = entries.find((x) => x.id === id);
    if (e && e.date !== date) saveEntry({ ...e, date });
  };
  const kinds: { value: KindFilter; label: string }[] = [
    { value: "all", label: "All" },
    ...(boards.includes("training") || !boards.includes("aed") ? [{ value: "training" as const, label: "Trainings" }] : []),
    ...(boards.includes("aed") ? [{ value: "aed" as const, label: "AED" }] : []),
    { value: "meeting", label: "Meetings" },
    { value: "event", label: "Events" },
  ];
  const closeModal = useCallback(() => setOpen(null), []);

  return (
    <div ref={fit.ref} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]" style={fit.h ? { height: fit.h, marginBottom: -fit.pull } : undefined}>
      <section className="card flex min-h-0 flex-col overflow-hidden" aria-label="Month view">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3">
          <div className="min-w-56 flex-1">
            <MonthNav large cursor={cursor} setCursor={setCursor} onToday={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(todayStr); }} />
          </div>
          <Segmented value={kind} onChange={setKind} options={kinds} />
          {whole && (
            <select className="h-8 rounded-full border border-line bg-surface pl-3 pr-7 text-[12.5px] text-ink-2 focus:border-brand focus:outline-none" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose calendar">
              <option value="all">Everyone</option>
              <option value="mine">Only mine</option>
              {[...new Set([...members.map((m) => m.name), ...people.filter((p) => p.key !== EXTERNAL_KEY).map((p) => p.name)])].sort().map((n) => <option key={n} value={n}>{n}</option>)}
              {people.some((p) => p.key === EXTERNAL_KEY) && <option value={EXTERNAL_KEY}>External trainers</option>}
            </select>
          )}
          <button className={btn.primary} onClick={() => setOpen({ add: selected })}><span aria-hidden>+</span> New</button>
        </div>

        <div className="grid grid-cols-7 border-b border-line bg-surface-2/50 text-[12px] font-medium text-muted">
          {WEEKDAYS.map((w) => <div key={w} className="px-3 py-1.5">{w}</div>)}
        </div>
        <div ref={cell.ref} className="grid min-h-0 flex-1 grid-cols-7" style={fit.h ? { gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` } : undefined}>
          {days.map((day, i) => {
            const key = ymd(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const list = byDate.get(key) ?? [];
            const isToday = key === todayStr;
            const isSel = key === selected;
            const weekend = i % 7 >= 5;
            const room = fit.h ? cell.room : 3;
            const shown = list.length > room ? list.slice(0, room - 1 || 1) : list;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(key)}
                onDoubleClick={() => setOpen({ add: key })}
                onKeyDown={(e) => { if (e.key === "Enter") setSelected(key); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                onDrop={(e) => { e.preventDefault(); move(e.dataTransfer.getData("text/entry"), key); setDragOver(null); }}
                className={`group relative min-h-[64px] min-w-0 cursor-pointer overflow-hidden border-b border-line p-1 text-left transition-colors md:min-h-[96px] lg:min-h-0 ${i % 7 !== 6 ? "border-r" : ""} ${
                  weekend ? "bg-surface-2/40" : "bg-surface"
                } ${!inMonth ? "opacity-45" : ""} ${dragOver === key ? "!bg-brand-soft" : ""} ${isSel ? "outline outline-2 -outline-offset-2 outline-ink/80" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`grid size-6 place-items-center rounded-full text-[12.5px] num ${isToday ? "bg-ink font-semibold text-surface" : "text-ink-2"}`}>{day.getDate()}</span>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setOpen({ add: key }); }}
                    className="hidden size-6 place-items-center rounded-md text-muted opacity-0 transition hover:bg-surface hover:text-ink group-hover:opacity-100 md:grid"
                    aria-label={`New on ${fmtDate(key, { day: "numeric", month: "long" })}`}
                  >
                    +
                  </button>
                </div>
                {/* Phones: a dot per item (the day's list shows below); wider screens: the items themselves. */}
                <div className="mt-1 flex flex-wrap gap-0.5 md:hidden">
                  {list.slice(0, 6).map((it) => <span key={it.key} className="size-1.5 rounded-full" style={{ background: it.who[0] && it.who[0] !== "Everyone" ? personColour(it.who[0], known.has(first(it.who[0]).toLowerCase())) : "var(--brand)" }} />)}
                </div>
                <div className="mt-0.5 hidden space-y-1 md:block">
                  {shown.map((it) => <Chip key={it.key} it={it} known={known} today={todayStr} onOpen={(x) => setOpen({ item: x })} draggable={it.kind === "entry"} />)}
                  {list.length > shown.length && (
                    <button className="px-1 text-[11.5px] font-medium text-muted hover:text-ink" onClick={(ev) => { ev.stopPropagation(); setSelected(key); }}>
                      +{list.length - shown.length} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-[12px] text-muted">
          {/* Click a person: only their calendar (click again: everyone again). */}
          {people.map((p) => {
            const on = who === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setWho(on ? "all" : p.key)}
                aria-pressed={on}
                title={on ? "Show everyone again" : `Show only ${p.key === EXTERNAL_KEY ? "the external trainers'" : `${first(p.name)}'s`} calendar`}
                className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2 transition ${on ? "bg-surface-2 font-semibold text-ink ring-1 ring-line-strong" : "hover:bg-surface-2 hover:text-ink"} ${who !== "all" && who !== "mine" && !on ? "opacity-50" : ""}`}
              >
                <span className="size-2 rounded-full" style={{ background: p.colour }} />{p.name}{on && <span aria-hidden className="ml-0.5 text-muted">×</span>}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-high" />Day passed — mark it completed</span>
          <span className="ml-auto hidden text-faint md:inline">Double-click a day or press N to add · drag a meeting to move it</span>
        </div>
      </section>

      <aside className="card flex min-h-0 flex-col p-5">
        <DayAgenda date={selected} items={byDate.get(selected) ?? []} known={known} today={todayStr} onAdd={() => setOpen({ add: selected })} onOpen={(it) => setOpen({ item: it })} />
      </aside>

      {open && "add" in open && member && <NewModal date={open.add} member={member} cards={cards} onClose={closeModal} />}
      {open && "item" in open && open.item.kind === "entry" && member && <NewModal date={open.item.date} member={member} cards={cards} entry={open.item.e} onClose={closeModal} />}
      {open && "item" in open && open.item.kind === "training" && member && <TrainingCard t={open.item.t} member={member} cards={cards} onClose={closeModal} />}
    </div>
  );
}

/* ---------------- A training's card, in the calendar ---------------- */

type BoardCards = ReturnType<typeof useBoardCards>;

function TrainingCard({ t, member, cards, onClose }: { t: BoardTraining; member: Member; cards: BoardCards; onClose: () => void }) {
  const card = (t.board === "aed" ? cards.aedBoard : cards.board)?.cards.get(t.id);
  if (!card) {
    return (
      <Shell label="Training" onClose={onClose} side={<div className="p-5 text-[13px] text-muted">Changes show here once the card is loaded.</div>}>
        <Header sub={`${t.docNumber} · ${t.dates.length ? fmtDays(t.dates.join(",")) : "To be decided"}`} title={t.alias || t.customerName} onClose={onClose} />
        <div className="p-6 text-[14px] text-muted">{cards.loading ? "Loading the card…" : <>This training isn&apos;t on your boards. <Link className="font-semibold text-brand hover:underline" href={`/follow-up?q=${encodeURIComponent(t.docNumber)}`}>Find it on the board →</Link></>}</div>
      </Shell>
    );
  }
  if (t.board === "aed") return <AedCardModal card={card} cards={cards.aedBoard!.cards} member={member} options={cards.options} onClose={onClose} />;
  return <CalendarTrainingModal card={card} cards={cards.board!.cards} fulfil={cards.fulBoard?.cards} member={member} options={cards.options} onClose={onClose} />;
}

/**
 * The training as the people giving it need it: when and where, who, the customer's contacts, what's still missing,
 * the money, and what happens after (certificates) — with the board's own actions (Change date, Postpone, To be decided,
 * Training completed, location / email) and the full change log.
 */
function CalendarTrainingModal({ card, cards, fulfil, member, options, onClose }: {
  card: CardView; cards: Map<string, CardView>; fulfil?: Map<string, CardView>; member: Member; options: BoardCards["options"]; onClose: () => void;
}) {
  const { addCardEvents, revertCardEvent, toast, now, cardEvents } = useStore();
  const s = card.schedule;
  const today = ymd(now);
  const busyOn = (dates: string[]) => busyTrainers(dates, cards, card.id);
  const schedule = (value: string, trainers?: string[], mode?: "change", cert?: CertChoice) => addCardEvents(trainingDateEvents(card, value, trainers, mode, cert, member.name));
  const complete = () => {
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "complete_training", by: member.name }]);
    toast({ text: `${card.name} moved to Training completed`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };
  // Another training the same trainer gives on one of these days.
  const clashes = s?.dates.length ? [...busyOn(s.dates).entries()].filter(([n]) => s.trainers.includes(n)) : [];
  const late = s && !s.completed && s.status !== "tbd" && (s.dates.at(-1) ?? "") < today;
  const f = fulfil ? [card.schedule?.on, ...card.historyIds].filter(Boolean).map((id) => fulfil.get(fulfilCardId(id!))).find(Boolean) : undefined;
  const due = cardDue(card);
  const when = (d: string) => {
    const n = daysBetween(startOfDay(now), parseYmd(d));
    return `${fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}${n === 0 ? " · today" : n === 1 ? " · tomorrow" : n > 1 ? ` · in ${n} days` : ""}`;
  };
  return (
    <Shell label={`${card.name} training`} onClose={onClose} side={<ChangeLog cardIds={card.historyIds} cards={cards} member={member} />}>
      <Header
        kind={card.kind}
        sub={`${card.docNumber ?? ""}${s ? ` · Training ${scheduleText(s)}` : ""} · from the calendar`}
        title={card.name}
        onClose={onClose}
        aside={<Link href={`/follow-up?open=${encodeURIComponent(card.id)}`} className="text-[13px] font-semibold text-brand hover:underline">Open on the board →</Link>}
      />
      <div className="space-y-3 p-4">
        {late && (
          <div className="rounded-xl border border-high/30 bg-high-bg px-4 py-2.5 text-[14px] font-medium text-high">
            The training was on {dateLong(s!.dates.at(-1)!)} — mark it completed below so it counts and Shreya gets it for certificates.
          </div>
        )}
        {clashes.length > 0 && (
          <div className="rounded-xl border border-medium/40 bg-medium-bg px-4 py-2.5 text-[14px] font-medium text-medium">
            {clashes.map(([n, other]) => `${n} is also on ${other.name} (${other.docNumber}) that day`).join(" · ")}.
          </div>
        )}
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-3">
            <Section title="At a glance">
              <dl>
                <Row label="When">{s?.dates.length ? <span className="flex flex-col">{s.dates.map((d) => <span key={d} className="num">{when(d)}</span>)}</span> : <span className="text-muted">To be decided</span>}</Row>
                <Row label="Trainers">
                  {s?.trainers.length ? (
                    <span className="flex flex-wrap gap-1.5">{s.trainers.map((n) => <span key={n} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-medium text-ink" style={{ background: tint(personColour(n, TRAINERS.includes(n)), 18) }}><span className="size-2 rounded-full" style={{ background: personColour(n, TRAINERS.includes(n)) }} />{n}</span>)}</span>
                  ) : <span className="text-muted">Not set</span>}
                </Row>
                <Row label="Training">{card.training.map((x) => `${x.name} · ${x.qty} people`).join("; ") || "—"}</Row>
                <Row label="Location">{card.certLocation === undefined ? <span className="text-medium">Not chosen</span> : card.certLocation || card.name}</Row>
                <Row label="Concerned">{card.concernedName ? `${card.concernedName} · ` : ""}{card.concernedEmail ? <a className="text-brand hover:underline" href={`mailto:${card.concernedEmail}`}>{card.concernedEmail}</a> : <span className="text-medium">Email not set</span>}</Row>
                <Row label="Contact">{card.phones.length ? card.phones.slice(0, 2).map((p) => <a key={p.value} className="num mr-3 text-brand hover:underline" href={`tel:${p.value.replace(/\s+/g, "")}`}>{p.value}</a>) : <span className="text-muted">No number</span>}</Row>
                <Row label="Sales person">{card.salespeople.length ? salespersonLabel(card.salespeople) : "—"}</Row>
                <Row label="Reminder emails"><ReminderPlan card={card} events={cardEvents} /></Row>
              </dl>
            </Section>
            <NotesPanel card={card} member={member} heading="Notes" />
            <Section title="After the training">
              {f?.fulfillment ? (
                <p className="flex flex-wrap items-center gap-2 text-[14px] text-ink-2">Certificates (Shreya): <StatePill f={f.fulfillment} /></p>
              ) : (
                <p className="text-[14px] text-muted">{s?.completed ? "On Shreya's Fulfillment board for the gratitude email and certificates." : "Once it's marked completed it goes to Shreya's Fulfillment board for the certificates."}</p>
              )}
            </Section>
          </div>
          <div className="space-y-3">
            <TrainingSection card={card} onSchedule={schedule} onComplete={complete} busyOn={busyOn} onCert={(cert) => addCardEvents(certEvents(card, cert, member.name))} />
            <Section title="Money" aside={due ? <DueChip due={due} /> : undefined}>
              <p className="text-[14px] text-ink-2">
                {card.invoice ? <>Invoice {card.invoice.number}{card.invoice.total !== undefined && <>: <b className="num text-ink">₹{card.invoice.total.toLocaleString("en-IN")}</b></>}</> : <span className="text-muted">Not invoiced yet{card.pi ? ` — ${card.pi.number}` : ""}</span>}
              </p>
            </Section>
            <DocsSection card={card} options={options} />
          </div>
        </div>
      </div>
    </Shell>
  );
}

/**
 * The reminder emails for this training (reminderPlan.ts): the days they go, ✓ once sent, and to whom — or why none
 * go (external trainers only, completed).
 */
function ReminderPlan({ card, events }: { card: CardView; events: import("@/lib/types").CardEvent[] }) {
  const own = useMemo(() => events.filter((e) => e.cardIds.some((id) => card.historyIds.includes(id))).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)), [events, card.historyIds]);
  const info = datesInfo(own);
  const to = reminderRecipients(card.schedule?.trainers ?? [], false);
  if (!info || card.schedule?.completed) return <span className="text-muted">—</span>;
  if (!to.length) return <span className="text-muted">None — no email for {card.schedule?.trainers.join(", ") || "the trainers"} yet</span>;
  const sent = new Set(own.filter((e) => e.kind === "training_reminder").map((e) => e.value));
  const days = reminderDays(info.dates[0].slice(0, 10), istDay(info.at));
  const today = istDay();
  if (!days.length) return <span className="text-muted">None — scheduled too close to the day</span>;
  return (
    <span>
      {days.map((d, i) => {
        const done = sent.has(reminderKey(info.dates, d));
        return <span key={d} className={done ? "font-medium text-low" : d < today ? "text-faint line-through" : "text-ink-2"}>{i > 0 && " · "}{fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}{done && " ✓"}</span>;
      })}
      <span className="text-muted"> → {to.map((x) => x.name.split(" ")[0]).join(", ")}</span>
    </span>
  );
}

/* ---------------- New: a training, an AED training, a meeting or an event ---------------- */

type NewKind = "training" | "aed" | EntryType;

function Popup({ title, sub, onClose, footer, children, width = 760 }: { title: string; sub?: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/30 p-3 backdrop-blur-md sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label={title} className="modal-in flex max-h-[94vh] w-full flex-col rounded-2xl bg-surface shadow-pop" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <h3 className="text-[19px] font-bold tracking-tight text-ink">{title}</h3>
            {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>
      </div>
    </div>
  );
}

function NewModal({ date, member, cards, entry, onClose }: { date: string; member: Member; cards: BoardCards; entry?: CalendarEntry; onClose: () => void }) {
  const boards = boardsFor(member);
  const kinds: { value: NewKind; label: string }[] = entry ? [{ value: "meeting", label: "Meeting" }, { value: "event", label: "Event" }] : [
    ...(boards.includes("training") ? [{ value: "training" as const, label: "Training" }] : []),
    ...(boards.includes("aed") ? [{ value: "aed" as const, label: "AED training" }] : []),
    { value: "meeting", label: "Meeting" },
    { value: "event", label: "Event" },
  ];
  const [kind, setKind] = useState<NewKind>(entry?.type ?? kinds[0].value);
  const tabs = <Segmented size="md" value={kind} onChange={setKind} options={kinds} />;
  if (kind === "training") return <NewTraining date={date} member={member} cards={cards} tabs={tabs} onClose={onClose} />;
  if (kind === "aed") return <NewAedTraining date={date} member={member} cards={cards} tabs={tabs} onClose={onClose} />;
  return <EntryForm date={date} member={member} type={kind} entry={entry} tabs={tabs} onClose={onClose} />;
}

/** A searchable list of deals (or AED invoices): the ready ones to pick, the others greyed with what they still need. */
function DealPicker({ options, value, onPick, placeholder }: { options: { card: CardView; why?: string; sub: string }[]; value?: CardView; onPick: (c: CardView) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const [openList, setOpenList] = useState(!value);
  const needle = q.trim().toLowerCase();
  const list = options.filter((o) => !needle || o.card.search.includes(needle) || (o.card.docNumber ?? "").toLowerCase().includes(needle)).slice(0, 40);
  return (
    <div className="relative">
      {value && !openList ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-ink">{value.name}</span>
          <span className="text-[13px] text-muted">{value.docNumber}</span>
          <button type="button" className={btn.quiet} onClick={() => setOpenList(true)}>Change</button>
        </div>
      ) : (
        <>
          <input autoFocus className={`${inputCls} !h-9 text-[13px]`} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
          {/* In the popup's flow (not floating): a floating list was cut off by the popup's own edge before a deal is picked. */}
          <ul className="no-scrollbar mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1">
            {list.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">Nothing matches.</li>}
            {list.map((o) => (
              <li key={o.card.id}>
                <button
                  type="button"
                  disabled={Boolean(o.why)}
                  onClick={() => { onPick(o.card); setOpenList(false); setQ(""); }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
                  title={o.why}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{o.card.name}</span>
                    <span className="shrink-0 text-[12px] text-muted">{o.card.docNumber}</span>
                  </span>
                  <span className="block truncate text-[12px] text-muted">{o.why ? <span className="font-medium text-medium">{o.why}</span> : o.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Schedule a Training-board deal from the calendar: the same entries (and rules) as the board's own popup. */
function NewTraining({ date, member, cards, tabs, onClose }: { date: string; member: Member; cards: BoardCards; tabs: React.ReactNode; onClose: () => void }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const all = cards.board?.cards;
  const options = useMemo(() => {
    if (!all) return [];
    const open = [...all.values()].filter((c) => (c.kind === "pi" || c.kind === "quote") && !c.mergedInto && !c.deleted && !c.lost && !c.schedule?.completed && (!c.schedule || c.schedule.status === "tbd"));
    return open
      .map((c) => ({
        card: c,
        sub: `${c.training.map((x) => `${x.name} · ${x.qty} people`).join("; ") || "No training on it"}${c.schedule?.status === "tbd" ? " · to be decided" : ""}`,
        why: !c.training.length ? "No training on this document" : !c.canSchedule ? (c.flaggedWith.length ? "Merge it on the board first (Review & merge)" : "Can't be scheduled") : undefined,
      }))
      .sort((a, b) => Number(Boolean(a.why)) - Number(Boolean(b.why)) || (b.card.docDate ?? "").localeCompare(a.card.docDate ?? ""));
  }, [all]);
  const [card, setCard] = useState<CardView | undefined>();
  const [days, setDays] = useState<string[]>([date]);
  const [trainers, setTrainers] = useState<string[]>([]);
  const [cert, setCert] = useState<CertChoice>({ location: null, email: "", name: "" });
  const pick = (c: CardView) => { setCard(c); setCert(certOf(c)); setTrainers([]); };
  const busy = card && all ? busyTrainers(days, all, card.id) : new Map<string, CardView>();
  const chosen = orderTrainers(trainers.filter((t) => !busy.has(t)));
  const valid = Boolean(card) && days.length > 0 && days.every(dateAllowed) && chosen.length > 0 && certReady(cert);
  const save = () => {
    if (!card || !valid) return;
    const evs = addCardEvents(trainingDateEvents(card, daysValue(days), chosen, undefined, cert, member.name));
    const ev = evs[evs.length - 1];
    toast({ text: `${card.name} moved to Training scheduled`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    onClose();
  };
  return (
    <Popup
      title="New"
      sub="A training goes to Training scheduled on the board, with the same rules as there."
      onClose={onClose}
      footer={<><button className={btn.ghost} onClick={onClose}>Cancel</button><button className={btn.primary} disabled={!valid} onClick={save} title={card && !certReady(cert) ? "Choose the certificate location and the concerned person's email first" : undefined}>Schedule training</button></>}
    >
      <div className="px-6 pb-3">{tabs}</div>
      <div className="border-t border-line px-6">
        <FormRow label="Deal" hint="The quotation or PI the training is for" required>
          {cards.loading && !all ? <span className="text-[13px] text-muted">Loading the board…</span> : <DealPicker options={options} value={card} onPick={pick} placeholder="Search customer, alias or quote / PI no." />}
        </FormRow>
        {card && <ScheduleRows card={card} days={days} setDays={setDays} trainers={trainers} setTrainers={setTrainers} cert={cert} setCert={setCert} busy={busy} />}
      </div>
    </Popup>
  );
}

/** Schedule an AED training (date + time) — the AedSmartx board's rule: only once the AED is delivered. */
function NewAedTraining({ date, member, cards, tabs, onClose }: { date: string; member: Member; cards: BoardCards; tabs: React.ReactNode; onClose: () => void }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const options = useMemo(() => {
    const list = cards.aedBoard ? [...cards.aedBoard.cards.values()] : [];
    return list
      .filter((c) => !c.notRequired && !c.schedule?.completed && (!c.schedule || c.schedule.status === "tbd"))
      .map((c) => ({ card: c, sub: `${c.training.map((x) => x.name).join(", ") || "AED"}${c.schedule?.status === "tbd" ? " · to be decided" : ""}`, why: c.delivered ? undefined : "Not delivered yet — the AED must be delivered first" }))
      .sort((a, b) => Number(Boolean(a.why)) - Number(Boolean(b.why)) || (b.card.docDate ?? "").localeCompare(a.card.docDate ?? ""));
  }, [cards.aedBoard]);
  const [card, setCard] = useState<CardView | undefined>();
  const [day, setDay] = useState(date);
  const [time, setTime] = useState("11:00");
  const valid = Boolean(card) && dateAllowed(day) && Boolean(time);
  const save = () => {
    if (!card || !valid) return;
    const s = card.schedule;
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_training_date", value: `${day}T${time}`, before: s ? (s.status === "tbd" ? "TBD" : s.date) : undefined, by: member.name }]);
    toast({ text: `${card.name} moved to Training scheduled (AedSmartx)`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    onClose();
  };
  return (
    <Popup
      title="New"
      sub="An AED training goes to Training scheduled on the AedSmartx board."
      onClose={onClose}
      footer={<><button className={btn.ghost} onClick={onClose}>Cancel</button><button className={btn.primary} disabled={!valid} onClick={save}>Schedule AED training</button></>}
    >
      <div className="px-6 pb-3">{tabs}</div>
      <div className="border-t border-line px-6">
        <FormRow label="AED invoice" hint="Delivered AEDs can be scheduled" required>
          {cards.loading && !cards.aedBoard ? <span className="text-[13px] text-muted">Loading the board…</span> : <DealPicker options={options} value={card} onPick={setCard} placeholder="Search customer or invoice no." />}
        </FormRow>
        <FormRow label="Date & time" hint="Priyanka gives the training" required>
          <span className="flex flex-wrap gap-2">
            <input type="date" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={day} min={minTrainingDate()} onChange={(e) => setDay(e.target.value)} aria-label="Training date" />
            <input type="time" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Training time" />
          </span>
        </FormRow>
      </div>
    </Popup>
  );
}

/** Who's in a meeting / event: team members (default: you), or everyone. */
function PeoplePicker({ value, everyone, onChange }: { value: string[]; everyone: boolean; onChange: (people: string[], everyone: boolean) => void }) {
  const { members } = useStore();
  const names = useMemo(() => [...new Set([...members.map((m) => m.name), "Admin"])].sort((a, b) => a.localeCompare(b)), [members]);
  const chip = (on: boolean) => `inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] transition ${on ? "border-ink/60 bg-surface font-medium text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink"}`;
  return (
    <span className="flex flex-wrap gap-1.5">
      <button type="button" className={chip(everyone)} onClick={() => onChange(value, !everyone)}>
        <span className="size-2 rounded-full bg-brand" />Everyone
      </button>
      {names.map((n) => {
        const on = everyone || value.includes(n);
        return (
          <button key={n} type="button" disabled={everyone} className={`${chip(on)} disabled:opacity-60`} onClick={() => onChange(on ? value.filter((x) => x !== n) : [...value, n], false)}>
            <span className="size-2 rounded-full" style={{ background: personColour(n) }} />{n}
          </button>
        );
      })}
    </span>
  );
}

function EntryForm({ date, member, type, entry, tabs, onClose }: { date: string; member: Member; type: EntryType; entry?: CalendarEntry; tabs: React.ReactNode; onClose: () => void }) {
  const { saveEntry, deleteEntry, customers } = useStore();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [d, setD] = useState(entry?.date ?? date);
  const [allDay, setAllDay] = useState(entry?.allDay ?? false);
  const [start, setStart] = useState(entry?.startTime ?? "10:00");
  const [end, setEnd] = useState(entry?.endTime ?? "11:00");
  const [people, setPeople] = useState<string[]>(entry?.people ?? [member.name]);
  const [everyone, setEveryone] = useState(entry?.everyone ?? false);
  const [customer, setCustomer] = useState(entry?.linkedCustomer ?? "");
  const [notes, setNotes] = useState(entry?.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timed = type === "meeting" || !allDay;
  const valid = Boolean(title.trim() && d && (!timed || (start && (!end || end > start))) && (everyone || people.length));
  const save = () => {
    if (!valid) return;
    saveEntry({
      id: entry?.id ?? newId(),
      type,
      title: title.trim(),
      date: d,
      allDay: !timed,
      startTime: timed ? start : undefined,
      endTime: timed && end ? end : undefined,
      people: everyone ? [] : people,
      everyone: everyone || undefined,
      createdBy: entry?.createdBy ?? member.name,
      description: notes.trim() || undefined,
      linkedCustomer: customer || undefined,
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  };
  return (
    <Popup
      title={entry ? `${TYPE_LABEL[type]}` : "New"}
      sub={entry ? `${entry.createdBy ? `Added by ${entry.createdBy}` : ""}` : "Everyone picked sees it on their calendar and gets a reminder that day."}
      onClose={onClose}
      width={720}
      footer={<>
        {entry && (confirmDelete ? (
          <span className="mr-auto inline-flex items-center gap-1 text-[13px] text-ink-2">
            Delete this {TYPE_LABEL[type].toLowerCase()}?
            <button className={btn.danger} onClick={() => { deleteEntry(entry.id); onClose(); }}>Delete</button>
            <button className={btn.quiet} onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : <button className={`${btn.danger} mr-auto`} onClick={() => setConfirmDelete(true)}>Delete</button>)}
        <button className={btn.ghost} onClick={onClose}>Cancel</button>
        <button className={btn.primary} disabled={!valid} onClick={save}>{entry ? "Save changes" : `Add ${TYPE_LABEL[type].toLowerCase()}`}</button>
      </>}
    >
      <div className="px-6 pb-3">{tabs}</div>
      <div className="border-t border-line px-6">
        <FormRow label="Title" required>
          <input autoFocus className={`${inputCls} !h-9 text-[13px]`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={type === "meeting" ? "Call with client about BLS batch" : "AED stock review"} />
        </FormRow>
        <FormRow label="When" hint={type === "event" ? "A time, or all day" : "Date and time"} required>
          <span className="flex flex-wrap items-center gap-2">
            <input type="date" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={d} onChange={(e) => setD(e.target.value)} aria-label="Date" />
            {timed && <>
              <input type="time" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Starts" />
              <span className="text-[13px] text-muted">to</span>
              <input type="time" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Ends" />
            </>}
            {type === "event" && (
              <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--brand)]" /> All day
              </label>
            )}
          </span>
        </FormRow>
        <FormRow label="Who" hint="They see it and get its reminder" required>
          <PeoplePicker value={people} everyone={everyone} onChange={(p, all) => { setPeople(p); setEveryone(all); }} />
        </FormRow>
        <FormRow label="Customer" hint="Optional">
          <Combobox value={customer} onChange={setCustomer} options={customers} placeholder="Search Zoho customers" noun="customers" customLabel="Add" ariaLabel="Customer" />
        </FormRow>
        <FormRow label="Notes" hint="Optional">
          <textarea className={`${inputCls} h-16 py-2 text-[13px]`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </FormRow>
      </div>
    </Popup>
  );
}
