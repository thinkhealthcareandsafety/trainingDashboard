"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEntry, EntryType, Priority, Training } from "@/lib/types";
import { addDays, fmtDate, parseYmd, ymd } from "@/lib/dates";
import { PRIORITY_CLASSES, PRIORITY_META, PRIORITY_RANK, highestPriority } from "@/lib/priority";
import { newId, useStore } from "@/lib/store";
import { Combobox, Field, IconButton, Modal, PriorityBadge, PriorityPicker, Segmented, btn, inputCls } from "./ui";

const TYPE_LABEL: Record<EntryType, string> = { meeting: "Meeting", note: "Note", date: "Important date" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRIORITY_VAR: Record<Priority, string> = { high: "var(--high)", medium: "var(--medium)", low: "var(--low)" };

function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = addDays(first, -offset);
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

function sortEntries(a: CalendarEntry, b: CalendarEntry) {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.startTime ?? "").localeCompare(b.startTime ?? "");
}

/* ---------------- Entry modal (create / edit) ---------------- */

function EntryModal({ open, onClose, initial, date }: { open: boolean; onClose: () => void; initial: CalendarEntry | null; date: string }) {
  const { saveEntry, deleteEntry, data, customers: zohoCustomers } = useStore();
  const [type, setType] = useState<EntryType>("meeting");
  const [title, setTitle] = useState("");
  const [d, setD] = useState(date);
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [description, setDescription] = useState("");
  const [customer, setCustomer] = useState("");
  const [reminder, setReminder] = useState<number | null>(30);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(initial?.type ?? "meeting");
    setTitle(initial?.title ?? "");
    setD(initial?.date ?? date);
    setAllDay(initial?.allDay ?? false);
    setStart(initial?.startTime ?? "10:00");
    setEnd(initial?.endTime ?? "11:00");
    setPriority(initial?.priority ?? null); // no default: the user must choose
    setDescription(initial?.description ?? "");
    setCustomer(initial?.linkedCustomer ?? "");
    setReminder(initial?.reminderMinutes ?? 30);
    setConfirmDelete(false);
    setTouched(false);
  }, [open, initial, date]);

  const customers = useMemo(
    () => [...new Set([...zohoCustomers, ...(data?.trainings ?? []).map((t) => t.customerName)])].sort((a, b) => a.localeCompare(b)),
    [zohoCustomers, data],
  );
  const valid = Boolean(title.trim() && priority && d);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const timed = type === "meeting" && !allDay;
    saveEntry({
      id: initial?.id ?? newId(),
      type,
      title: title.trim(),
      date: d,
      allDay: !timed,
      startTime: timed ? start : undefined,
      endTime: timed ? end : undefined,
      priority: priority!,
      description: description.trim() || undefined,
      linkedCustomer: customer || undefined,
      reminderMinutes: reminder,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit entry" : "New entry"}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          size="md"
          value={type}
          onChange={setType}
          options={(Object.keys(TYPE_LABEL) as EntryType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
        />
        <Field label="Title">
          <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Call with client about BLS batch" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className={inputCls} value={d} onChange={(e) => setD(e.target.value)} />
          </Field>
          {type === "meeting" ? (
            <label className="flex items-end gap-2 pb-2.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--brand)]" /> All day
            </label>
          ) : <span />}
        </div>
        {type === "meeting" && !allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts"><input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Ends"><input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        )}
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Priority</span>
          <PriorityPicker value={priority} onChange={setPriority} />
          {touched && !priority && <p className="mt-1.5 text-xs text-high">Choose a priority to save.</p>}
        </div>
        <Field label="Client (optional)">
          <Combobox value={customer} onChange={setCustomer} options={customers} placeholder="Search Zoho customers" noun="customers" customLabel="Add" ariaLabel="Client" />
        </Field>
        <Field label="Notes (optional)">
          <textarea className={`${inputCls} h-20 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Reminder">
          <select className={inputCls} value={reminder ?? ""} onChange={(e) => setReminder(e.target.value ? Number(e.target.value) : null)}>
            <option value="">None</option>
            <option value="15">15 minutes before</option>
            <option value="30">30 minutes before</option>
            <option value="60">1 hour before</option>
            <option value="1440">1 day before</option>
          </select>
        </Field>
        <div className="flex items-center justify-between gap-2 pt-2">
          {initial ? (
            confirmDelete ? (
              <span className="flex items-center gap-1 text-[13px] text-ink-2">
                Delete this entry?
                <button type="button" className={btn.danger} onClick={() => { deleteEntry(initial.id); onClose(); }}>Delete</button>
                <button type="button" className={btn.quiet} onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={touched && !valid}>{initial ? "Save changes" : "Add entry"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Shared data hook ---------------- */

function useCalendarData(filter: Priority | "all", showTrainings: boolean) {
  const { entries, data } = useStore();
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    entries.filter((e) => filter === "all" || e.priority === filter).forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    m.forEach((v) => v.sort(sortEntries));
    return m;
  }, [entries, filter]);
  const trainingsByDate = useMemo(() => {
    const m = new Map<string, Training[]>();
    if (showTrainings) (data?.trainings ?? []).forEach((t) => m.set(t.trainingDate, [...(m.get(t.trainingDate) ?? []), t]));
    return m;
  }, [data, showTrainings]);
  return { byDate, trainingsByDate };
}

/* ---------------- Day agenda ---------------- */

function DayAgenda({ date, entries, trainings, onAdd, onEdit, isToday }: {
  date: string; entries: CalendarEntry[]; trainings: Training[]; onAdd: () => void; onEdit: (e: CalendarEntry) => void; isToday: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-muted">{isToday ? "Today" : fmtDate(date, { weekday: "long" })}</div>
          <div className="text-[15px] font-semibold tracking-tight">{fmtDate(date, { day: "numeric", month: "long" })}</div>
        </div>
        <button className={btn.ghost} onClick={onAdd}>
          <span aria-hidden>+</span> Add
        </button>
      </div>
      {entries.length === 0 && trainings.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          Nothing scheduled.
          <br />
          <button className="mt-1 font-medium text-ink-2 hover:text-ink" onClick={onAdd}>Add a meeting or note</button>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id}>
              <button onClick={() => onEdit(e)} className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2/70">
                <span className="w-12 shrink-0 pt-px text-xs text-muted num">{e.allDay ? "All day" : e.startTime}</span>
                <span className="mt-1 h-4 w-[3px] shrink-0 rounded-full" style={{ background: PRIORITY_VAR[e.priority] }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{e.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {TYPE_LABEL[e.type]}{!e.allDay && e.endTime ? ` · until ${e.endTime}` : ""}{e.linkedCustomer ? ` · ${e.linkedCustomer}` : ""}
                  </span>
                </span>
                <PriorityBadge p={e.priority} compact />
              </button>
            </li>
          ))}
          {trainings.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-2.5">
              <span className="w-12 shrink-0 pt-px text-xs text-muted">Training</span>
              <span className="mt-1 h-4 w-[3px] shrink-0 rounded-full bg-brand" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{t.trainingType}</span>
                <span className="block truncate text-xs text-muted">
                  {t.customerName} · {t.participants} pax{t.trainer && t.trainer !== "None" ? ` · ${t.trainer}` : ""}
                </span>
              </span>
              {t.zohoPriority && <PriorityBadge p={t.zohoPriority} compact />}
            </li>
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

/* ---------------- Mini calendar (dashboard) ---------------- */

export function MiniCalendar() {
  const { now } = useStore();
  const todayStr = ymd(now);
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(todayStr);
  const [modal, setModal] = useState<{ open: boolean; entry: CalendarEntry | null }>({ open: false, entry: null });
  const { byDate, trainingsByDate } = useCalendarData("all", true);
  const days = monthGrid(cursor.getFullYear(), cursor.getMonth());
  // Legend lists only what is actually marked this month.
  const legend = useMemo(() => {
    const inMonth = days.filter((d) => d.getMonth() === cursor.getMonth()).map(ymd);
    const ps = new Set<Priority>();
    let training = false;
    for (const k of inMonth) {
      const top = highestPriority((byDate.get(k) ?? []).map((e) => e.priority));
      if (top) ps.add(top);
      if ((trainingsByDate.get(k) ?? []).length) training = true;
    }
    return { priorities: (["high", "medium", "low"] as Priority[]).filter((p) => ps.has(p)), training };
  }, [days, cursor, byDate, trainingsByDate]);

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
          const hasTraining = (trainingsByDate.get(key) ?? []).length > 0;
          const top = highestPriority(list.map((e) => e.priority));
          const isToday = key === todayStr;
          const isSel = key === selected;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              onDoubleClick={() => { setSelected(key); setModal({ open: true, entry: null }); }}
              className={`relative mx-auto flex size-10 flex-col items-center justify-center rounded-lg text-[13px] transition ${inMonth ? "text-ink" : "text-faint/60"} ${
                top ? PRIORITY_CLASSES[top].bg : "hover:bg-surface-2"
              } ${isSel && !isToday ? "ring-1 ring-ink/70" : ""}`}
              aria-label={`${fmtDate(key, { day: "numeric", month: "long" })}${top ? `, ${PRIORITY_META[top].label} priority` : ""}${hasTraining ? ", training" : ""}`}
            >
              <span className={`grid size-6 place-items-center rounded-full num ${isToday ? "bg-ink font-semibold text-surface" : top ? "font-semibold" : ""}`}>{day.getDate()}</span>
              <span className="absolute bottom-1 flex items-center gap-0.5">
                {top && <span className="size-1 rounded-full" style={{ background: PRIORITY_VAR[top] }} />}
                {hasTraining && <span className="h-[3px] w-2.5 rounded-full bg-brand" />}
              </span>
            </button>
          );
        })}
      </div>
      {(legend.priorities.length > 0 || legend.training) && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          {legend.priorities.map((p) => (
            <span key={p} className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: PRIORITY_VAR[p] }} />{PRIORITY_META[p].label} priority</span>
          ))}
          {legend.training && <span className="inline-flex items-center gap-1"><span className="h-[3px] w-2.5 rounded-full bg-brand" />Training day</span>}
        </div>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <DayAgenda
          date={selected}
          isToday={selected === todayStr}
          entries={byDate.get(selected) ?? []}
          trainings={trainingsByDate.get(selected) ?? []}
          onAdd={() => setModal({ open: true, entry: null })}
          onEdit={(e) => setModal({ open: true, entry: e })}
        />
      </div>
      <EntryModal open={modal.open} onClose={() => setModal({ open: false, entry: null })} initial={modal.entry} date={selected} />
    </section>
  );
}

/* ---------------- Full calendar (calendar page) ---------------- */

export function FullCalendar({ initialDate }: { initialDate?: string }) {
  const { now, entries, saveEntry } = useStore();
  const todayStr = ymd(now);
  const start = initialDate ? parseYmd(initialDate) : now;
  const [cursor, setCursor] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const [selected, setSelected] = useState(initialDate ?? todayStr);
  const [modal, setModal] = useState<{ open: boolean; entry: CalendarEntry | null; date: string }>({ open: false, entry: null, date: todayStr });
  const [filter, setFilter] = useState<Priority | "all">("all");
  const [showTrainings, setShowTrainings] = useState(true);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const { byDate, trainingsByDate } = useCalendarData(filter, showTrainings);
  const days = monthGrid(cursor.getFullYear(), cursor.getMonth());

  // Keyboard: N = new entry on the selected day.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key.toLowerCase() === "n" && !modal.open && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) setModal({ open: true, entry: null, date: selected });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.open, selected]);

  const openNew = (date: string) => setModal({ open: true, entry: null, date });
  const openEdit = (e: CalendarEntry) => setModal({ open: true, entry: e, date: e.date });
  const move = (id: string, date: string) => {
    const e = entries.find((x) => x.id === id);
    if (e && e.date !== date) saveEntry({ ...e, date });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card overflow-hidden" aria-label="Month view">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-64 flex-1">
            <MonthNav large cursor={cursor} setCursor={setCursor} onToday={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(todayStr); }} />
          </div>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[{ value: "all", label: "All" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]}
          />
          <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={showTrainings} onChange={(e) => setShowTrainings(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Zoho trainings
          </label>
          <a
            href="https://calendar.zoho.in"
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13px] font-medium text-ink hover:bg-line"
          >
            Open Zoho Calendar
            <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 5h7v7M15 5 6 14" />
            </svg>
          </a>
        </div>

        <div className="grid grid-cols-7 border-b border-line bg-surface-2/50 text-[12px] font-medium text-muted">
          {WEEKDAYS.map((w) => <div key={w} className="px-3 py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const key = ymd(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const list = byDate.get(key) ?? [];
            const tr = trainingsByDate.get(key) ?? [];
            const top = highestPriority(list.map((e) => e.priority));
            const isToday = key === todayStr;
            const isSel = key === selected;
            const weekend = i % 7 >= 5;
            const items = [...list.map((e) => ({ kind: "e" as const, e })), ...tr.map((t) => ({ kind: "t" as const, t }))];
            const shown = items.slice(0, 3);
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(key)}
                onDoubleClick={() => openNew(key)}
                onKeyDown={(e) => { if (e.key === "Enter") setSelected(key); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                onDrop={(e) => { e.preventDefault(); move(e.dataTransfer.getData("text/entry"), key); setDragOver(null); }}
                className={`group relative min-h-[124px] cursor-pointer border-b border-line p-1.5 text-left transition-colors ${i % 7 !== 6 ? "border-r" : ""} ${
                  top ? PRIORITY_CLASSES[top].bg : weekend ? "bg-surface-2/40" : "bg-surface"
                } ${!inMonth ? "opacity-45" : ""} ${dragOver === key ? "!bg-brand-soft" : ""} ${isSel ? "outline outline-2 -outline-offset-2 outline-ink/80" : ""}`}
                style={top ? { boxShadow: `inset 0 2px 0 ${PRIORITY_VAR[top]}` } : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className={`grid size-6 place-items-center rounded-full text-[12.5px] num ${isToday ? "bg-ink font-semibold text-surface" : "text-ink-2"}`}>{day.getDate()}</span>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); openNew(key); }}
                    className="grid size-6 place-items-center rounded-md text-muted opacity-0 transition hover:bg-surface hover:text-ink group-hover:opacity-100"
                    aria-label={`Add entry on ${fmtDate(key, { day: "numeric", month: "long" })}`}
                  >
                    +
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  {shown.map((it) =>
                    it.kind === "e" ? (
                      <div
                        key={it.e.id}
                        draggable
                        onDragStart={(ev) => ev.dataTransfer.setData("text/entry", it.e.id)}
                        onClick={(ev) => { ev.stopPropagation(); openEdit(it.e); }}
                        className="flex items-center gap-1.5 truncate rounded-md border border-line bg-surface px-1.5 py-[3px] text-[11.5px] text-ink shadow-card hover:border-line-strong"
                        title={`${PRIORITY_META[it.e.priority].label} priority · ${it.e.title}`}
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_VAR[it.e.priority] }} />
                        {it.e.startTime && !it.e.allDay && <span className="text-muted num">{it.e.startTime}</span>}
                        <span className="truncate">{it.e.title}</span>
                      </div>
                    ) : (
                      <div key={it.t.id} className="rounded-md bg-brand-soft px-1.5 py-1 text-[11.5px] leading-tight" title={`${it.t.trainingType} · ${it.t.customerName}`}>
                        <div className="truncate font-medium text-ink">{it.t.trainingType}</div>
                        <div className="truncate text-muted">{it.t.customerName}</div>
                      </div>
                    ),
                  )}
                  {items.length > 3 && <div className="px-1 text-[11.5px] font-medium text-muted">+{items.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[12px] text-muted">
          {(["high", "medium", "low"] as Priority[]).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: PRIORITY_VAR[p] }} />{PRIORITY_META[p].label}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brand-soft ring-1 ring-brand/30" />Zoho training</span>
          <span className="ml-auto hidden text-faint md:inline">Double-click a day or press N to add · drag to move</span>
        </div>
      </section>

      <aside className="card h-fit p-5 xl:sticky xl:top-[60px]">
        <DayAgenda
          date={selected}
          isToday={selected === todayStr}
          entries={byDate.get(selected) ?? []}
          trainings={trainingsByDate.get(selected) ?? []}
          onAdd={() => openNew(selected)}
          onEdit={openEdit}
        />
      </aside>

      <EntryModal open={modal.open} onClose={() => setModal((m) => ({ ...m, open: false }))} initial={modal.entry} date={modal.date} />
    </div>
  );
}
