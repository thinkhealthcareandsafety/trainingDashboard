"use client";

import { useEffect, useMemo, useState } from "react";
import type { FollowUp, FollowUpStatus, FollowUpType, Priority } from "@/lib/types";
import { addDays, daysBetween, fmtDate, fmtTime, relativeDue, startOfDay } from "@/lib/dates";
import { FOLLOWUP_TYPE_LABEL, SOURCE_LABEL, STATUS_LABEL, effectiveStatus, isOpen } from "@/lib/followups";
import { PRIORITY_RANK } from "@/lib/priority";
import { newId, useStore } from "@/lib/store";
import { PageHeader } from "./AppShell";
import { Avatar, Combobox, Field, IconButton, Modal, PriorityBadge, PriorityPicker, Segmented, btn, inputCls, selectCls } from "./ui";

type Row = FollowUp & { eff: FollowUpStatus };
type SortKey = "due" | "priority" | "client" | "created";

const STATUS_DOT: Record<FollowUpStatus, string> = {
  overdue: "bg-high",
  pending: "bg-faint",
  in_progress: "bg-brand",
  snoozed: "bg-medium",
  completed: "bg-low",
  cancelled: "bg-faint",
};

function Status({ s }: { s: FollowUpStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] ${s === "overdue" ? "font-medium text-high" : "text-ink-2"}`}>
      <span className={`size-1.5 rounded-full ${STATUS_DOT[s]}`} aria-hidden />
      {STATUS_LABEL[s]}
    </span>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------------- Create / edit ---------------- */

function FollowUpModal({ open, onClose, initial, owners, customers, preset }: { open: boolean; onClose: () => void; initial: FollowUp | null; owners: string[]; customers: string[]; preset?: Partial<FollowUp> }) {
  const { saveFollowUp } = useStore();
  const [customerName, setCustomer] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<FollowUpType>("call");
  const [dueAt, setDue] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const tomorrow = addDays(startOfDay(new Date()), 1);
    tomorrow.setHours(10);
    setCustomer(initial?.customerName ?? preset?.customerName ?? "");
    setSubject(initial?.subject ?? preset?.subject ?? "");
    setType(initial?.type ?? "call");
    setDue(toLocalInput(initial?.dueAt ?? tomorrow.toISOString()));
    setOwner(initial?.owner ?? preset?.owner ?? "Unassigned");
    setPriority(initial?.priority ?? null);
    setNotes(initial?.notes ?? "");
    setTouched(false);
  }, [open, initial, owners, preset]);

  const valid = Boolean(customerName.trim() && subject.trim() && dueAt && owner.trim() && priority);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const now = new Date().toISOString();
    const iso = new Date(dueAt).toISOString();
    const base: FollowUp = initial ?? {
      id: newId(), customerName: "", subject: "", type: "call", dueAt: iso, owner: "", priority: priority!, status: "pending", source: "manual", createdAt: now, activities: [],
    };
    const rescheduled = initial && initial.dueAt !== iso;
    saveFollowUp(
      {
        ...base,
        customerName: customerName.trim(),
        subject: subject.trim(),
        type,
        dueAt: iso,
        owner: owner.trim(),
        priority: priority!,
        notes: notes.trim() || undefined,
        status: rescheduled && base.status === "snoozed" ? "pending" : base.status,
      },
      initial
        ? { kind: rescheduled ? "rescheduled" : "note", body: rescheduled ? `Rescheduled to ${fmtDate(iso)} ${fmtTime(iso)}` : "Details edited" }
        : { kind: "created", body: "Follow-up created" },
    );
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit follow-up" : "New follow-up"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Client">
          <Combobox value={customerName} onChange={setCustomer} options={customers} placeholder="Search Zoho customers" noun="customers" customLabel="Add" ariaLabel="Client" />
        </Field>
        <Field label="What needs to happen">
          <input autoFocus className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Chase quote for BLS batch" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
              {(Object.keys(FOLLOWUP_TYPE_LABEL) as FollowUpType[]).map((t) => <option key={t} value={t}>{FOLLOWUP_TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <Combobox value={owner} onChange={setOwner} options={owners} placeholder="Who follows up" noun="people" customLabel="Assign to" ariaLabel="Owner" />
          </Field>
        </div>
        <Field label="Due">
          <input type="datetime-local" className={inputCls} value={dueAt} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Priority</span>
          <PriorityPicker value={priority} onChange={setPriority} />
        </div>
        <Field label="Notes (optional)">
          <textarea className={`${inputCls} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {touched && !valid && <p className="text-xs text-high">Add a client, what needs to happen, a due date, an owner and a priority.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary}>{initial ? "Save changes" : "Create follow-up"}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Complete + schedule next ---------------- */

function CompleteModal({ row, onClose }: { row: FollowUp | null; onClose: () => void }) {
  const { saveFollowUp } = useStore();
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState(false);
  const [nextDays, setNextDays] = useState(3);
  useEffect(() => {
    setOutcome("");
    setNext(false);
    setNextDays(3);
  }, [row]);
  if (!row) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    saveFollowUp({ ...row, status: "completed", outcome: outcome.trim() || undefined, completedAt: now }, { kind: "completed", body: outcome.trim() ? `Completed · ${outcome.trim()}` : "Completed" });
    if (next) {
      const due = addDays(startOfDay(new Date()), nextDays);
      due.setHours(10);
      saveFollowUp({
        ...row,
        id: newId(),
        triggerKey: undefined,
        source: "manual",
        status: "pending",
        subject: row.subject,
        dueAt: due.toISOString(),
        outcome: undefined,
        completedAt: undefined,
        createdAt: now,
        demo: undefined,
        activities: [{ id: newId(), kind: "created", body: "Scheduled as the next step", at: now }],
      });
    }
    onClose();
  };

  return (
    <Modal open={!!row} onClose={onClose} title="Complete follow-up">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-3.5 py-3 text-[13px]">
          <div className="font-medium text-ink">{row.subject}</div>
          <div className="text-muted">{row.customerName}</div>
        </div>
        <Field label="Outcome">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {["Interested", "Left voicemail", "Quote sent", "Payment promised", "Not interested"].map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => setOutcome(o)}
                className={`h-7 rounded-md border px-2.5 text-xs font-medium transition ${outcome === o ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:border-line-strong"}`}
              >
                {o}
              </button>
            ))}
          </div>
          <input className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What happened?" />
        </Field>
        <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={next} onChange={(e) => setNext(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Schedule the next follow-up in
          <select className={selectCls} value={nextDays} onChange={(e) => setNextDays(Number(e.target.value))} disabled={!next}>
            {[1, 2, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary}>Mark complete</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Detail drawer ---------------- */

function Drawer({ row, onClose, onEdit, onComplete }: { row: Row | null; onClose: () => void; onEdit: (f: FollowUp) => void; onComplete: (f: FollowUp) => void }) {
  const { saveFollowUp, deleteFollowUp, now } = useStore();
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [row?.id]);
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);
  if (!row) return null;
  const addNote = () => {
    if (!note.trim()) return;
    saveFollowUp(row, { kind: "note", body: note.trim() });
    setNote("");
  };
  const meta: [string, React.ReactNode][] = [
    ["Status", <Status key="s" s={row.eff} />],
    ["Priority", <PriorityBadge key="p" p={row.priority} />],
    ["Due", <span key="d" className={row.eff === "overdue" ? "font-medium text-high" : ""}>{fmtDate(row.dueAt, { weekday: "short", day: "numeric", month: "short" })}, {fmtTime(row.dueAt)} · {relativeDue(row.dueAt, now)}</span>],
    ["Owner", <span key="o" className="inline-flex items-center gap-2"><Avatar name={row.owner} />{row.owner}</span>],
    ["Type", FOLLOWUP_TYPE_LABEL[row.type]],
    ["Source", SOURCE_LABEL[row.source]],
    ["Zoho document", row.linkedDoc ?? "—"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20 backdrop-blur-[1px]" onMouseDown={onClose}>
      <aside className="rise flex h-full w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()} aria-label="Follow-up details">
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <div className="text-[13px] text-muted">{row.customerName}</div>
            <h2 className="mt-0.5 text-[17px] font-semibold leading-snug tracking-tight">{row.subject}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <dl className="divide-y divide-line border-y border-line text-[13px]">
            {meta.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] items-center py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
          {(row.outcome || row.notes) && (
            <div className="mt-5 space-y-3 text-[13px]">
              {row.outcome && <div><div className="mb-1 text-muted">Outcome</div><div className="text-ink-2">{row.outcome}</div></div>}
              {row.notes && <div><div className="mb-1 text-muted">Notes</div><div className="whitespace-pre-wrap text-ink-2">{row.notes}</div></div>}
            </div>
          )}
          <h3 className="mb-3 mt-6 text-[13px] font-medium text-ink-2">Activity</h3>
          <div className="mb-4 flex gap-2">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Log a call, email or note…" />
            <button className={btn.ghost} onClick={addNote}>Log</button>
          </div>
          <ol className="relative space-y-4 pl-5 before:absolute before:bottom-1 before:left-[3px] before:top-1 before:w-px before:bg-line">
            {[...row.activities].reverse().map((a) => (
              <li key={a.id} className="relative text-[13px]">
                <span className="absolute -left-5 top-1.5 size-[7px] rounded-full bg-line-strong ring-2 ring-surface" />
                <div className="text-ink-2">{a.body}</div>
                <div className="text-xs text-faint">{fmtDate(a.at)}, {fmtTime(a.at)}</div>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-6 py-4">
          {isOpen(row.eff) && <button className={btn.primary} onClick={() => onComplete(row)}>Complete</button>}
          <button className={btn.ghost} onClick={() => onEdit(row)}>Edit</button>
          <button className={`${btn.danger} ml-auto`} onClick={() => { deleteFollowUp(row.id); onClose(); }}>Delete</button>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Page ---------------- */

type Group = { key: string; label: string; rows: Row[] };

export function FollowUpBoard({ initialQuery = "", initialOpen = null }: { initialQuery?: string; initialOpen?: string | null }) {
  const { followUps, now, patchFollowUps, data, team, customers: zohoCustomers } = useStore();
  const [preset, setPreset] = useState<Partial<FollowUp> | undefined>(undefined);
  const [q, setQ] = useState(initialQuery);
  const [scope, setScope] = useState<"open" | "overdue" | "today" | "week" | "completed">("open");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [owner, setOwner] = useState("all");
  const [type, setType] = useState<FollowUpType | "all">("all");
  const [sort, setSort] = useState<SortKey>("due");
  const [view, setView] = useState<"list" | "board">("list");
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(initialOpen);
  const [edit, setEdit] = useState<{ open: boolean; row: FollowUp | null }>({ open: false, row: null });
  const openNew = (p?: Partial<FollowUp>) => {
    setPreset(p);
    setEdit({ open: true, row: null });
  };
  const [completing, setCompleting] = useState<FollowUp | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("th.fuView");
      if (v === "board" || v === "list") setView(v);
    } catch {}
  }, []);
  const changeView = (v: "list" | "board") => {
    setView(v);
    try { localStorage.setItem("th.fuView", v); } catch {}
  };

  const rows: Row[] = useMemo(() => followUps.map((f) => ({ ...f, eff: effectiveStatus(f, now) })), [followUps, now]);
  const uniqSorted = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Owners: Zoho Books users + anyone already assigned; "Unassigned" always available.
  const owners = useMemo(() => ["Unassigned", ...uniqSorted([...team, ...rows.map((r) => r.owner)]).filter((o) => o !== "Unassigned")], [team, rows]);
  const customers = useMemo(
    () => uniqSorted([...zohoCustomers, ...(data?.trainings ?? []).map((t) => t.customerName), ...rows.map((r) => r.customerName)]),
    [zohoCustomers, data, rows],
  );

  const endToday = addDays(startOfDay(now), 1);
  const endWeek = addDays(startOfDay(now), 7);
  const inScope = (r: Row, s: typeof scope) =>
    s === "open" ? isOpen(r.eff)
    : s === "overdue" ? r.eff === "overdue"
    : s === "today" ? isOpen(r.eff) && r.eff !== "overdue" && new Date(r.dueAt) < endToday
    : s === "week" ? isOpen(r.eff) && r.eff !== "overdue" && new Date(r.dueAt) < endWeek
    : r.eff === "completed";

  const counts = {
    overdue: rows.filter((r) => inScope(r, "overdue")).length,
    today: rows.filter((r) => inScope(r, "today")).length,
    week: rows.filter((r) => inScope(r, "week")).length,
    done: rows.filter((r) => r.eff === "completed" && r.completedAt && daysBetween(new Date(r.completedAt), now) <= 30).length,
  };
  const closed = rows.filter((r) => r.eff === "completed" && r.completedAt);
  const onTime = closed.length ? Math.round((closed.filter((r) => new Date(r.completedAt!) <= new Date(r.dueAt)).length / closed.length) * 100) : null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => inScope(r, scope))
      .filter((r) => priority === "all" || r.priority === priority)
      .filter((r) => owner === "all" || r.owner === owner)
      .filter((r) => type === "all" || r.type === type)
      .filter((r) => !needle || [r.customerName, r.subject, r.notes, r.linkedDoc, r.owner].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (sort === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.dueAt.localeCompare(b.dueAt);
        if (sort === "client") return a.customerName.localeCompare(b.customerName);
        if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
        return a.dueAt.localeCompare(b.dueAt);
      });
  }, [rows, q, scope, priority, owner, type, sort, endToday, endWeek]);

  // Group by due window when sorted by due date (Overdue / Today / Next 7 days / Later / Done).
  const groups: Group[] = useMemo(() => {
    if (sort !== "due") return [{ key: "all", label: "", rows: filtered }];
    const g: Record<string, Row[]> = { overdue: [], today: [], week: [], later: [], done: [] };
    for (const r of filtered) {
      if (!isOpen(r.eff)) g.done.push(r);
      else if (r.eff === "overdue") g.overdue.push(r);
      else if (new Date(r.dueAt) < endToday) g.today.push(r);
      else if (new Date(r.dueAt) < endWeek) g.week.push(r);
      else g.later.push(r);
    }
    const labels: Record<string, string> = { overdue: "Overdue", today: "Today", week: "Next 7 days", later: "Later", done: "Completed" };
    return Object.entries(g).filter(([, v]) => v.length).map(([k, v]) => ({ key: k, label: labels[k], rows: v }));
  }, [filtered, sort, endToday, endWeek]);

  const drawerRow = rows.find((r) => r.id === drawerId) ?? null;
  const allSel = filtered.length > 0 && filtered.every((r) => selected.includes(r.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const snooze = (r: FollowUp, days = 1) => {
    const until = addDays(startOfDay(new Date()), days);
    until.setHours(9);
    patchFollowUps([r.id], { status: "snoozed", snoozedUntil: until.toISOString(), dueAt: until > new Date(r.dueAt) ? until.toISOString() : r.dueAt }, { kind: "snoozed", body: `Snoozed until ${fmtDate(until)}` });
  };

  const tabs: { k: typeof scope; label: string; n: number | null; dot?: string }[] = [
    { k: "open", label: "All open", n: rows.filter((r) => isOpen(r.eff)).length },
    { k: "overdue", label: "Overdue", n: counts.overdue, dot: "bg-high" },
    { k: "today", label: "Due today", n: counts.today },
    { k: "week", label: "Next 7 days", n: counts.week },
    { k: "completed", label: "Completed", n: counts.done },
  ];

  return (
    <>
      <PageHeader
        title="Follow-ups"
        sub={`Calls and emails to clients. Unpaid invoices, quotes without a reply and new bookings are added for you automatically${onTime !== null ? ` · ${onTime}% done on time` : ""}.`}
        actions={<button className={btn.primary} onClick={() => openNew()}>New follow-up</button>}
      />
      <div className="card overflow-hidden">
        {/* Scope tabs double as the summary */}
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.k}
              role="tab"
              aria-selected={scope === t.k}
              onClick={() => { setScope(t.k); setSelected([]); }}
              className={`relative flex h-12 shrink-0 items-center gap-2 px-3 text-[13.5px] font-medium transition ${scope === t.k ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              {t.dot && t.n ? <span className={`size-1.5 rounded-full ${t.dot}`} /> : null}
              {t.label}
              <span className={`rounded-md px-1.5 text-[12px] num ${scope === t.k ? "bg-surface-2 text-ink" : "text-faint"}`}>{t.n}</span>
              {scope === t.k && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ink" />}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative w-full sm:w-64">
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" strokeLinecap="round" /></svg>
            <input className={`${inputCls} !h-9 pl-8 text-[13px]`} placeholder="Search client, subject, invoice" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} aria-label="Priority">
            <option value="all">Any priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className={selectCls} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
            <option value="all">Any owner</option>
            {owners.map((o) => <option key={o}>{o}</option>)}
          </select>
          <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type">
            <option value="all">Any type</option>
            {(Object.keys(FOLLOWUP_TYPE_LABEL) as FollowUpType[]).map((t) => <option key={t} value={t}>{FOLLOWUP_TYPE_LABEL[t]}</option>)}
          </select>
          <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
            <option value="due">Sort by due date</option>
            <option value="priority">Sort by priority</option>
            <option value="client">Sort by client</option>
            <option value="created">Newest first</option>
          </select>
          <div className="ml-auto">
            <Segmented value={view} onChange={changeView} options={[{ value: "list", label: "List" }, { value: "board", label: "Board" }]} />
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2 text-[13px]">
            <span className="font-medium text-ink">{selected.length} selected</span>
            <button className={btn.quiet} onClick={() => { patchFollowUps(selected, { status: "completed", completedAt: new Date().toISOString() }, { kind: "completed", body: "Completed (bulk)" }); setSelected([]); }}>Mark complete</button>
            <select className={selectCls} value="" onChange={(e) => { if (e.target.value) { patchFollowUps(selected, { priority: e.target.value as Priority }, { kind: "status", body: `Priority set to ${e.target.value}` }); setSelected([]); } }}>
              <option value="" disabled>Set priority</option>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <select className={selectCls} value="" onChange={(e) => { if (e.target.value) { patchFollowUps(selected, { owner: e.target.value }, { kind: "status", body: `Reassigned to ${e.target.value}` }); setSelected([]); } }}>
              <option value="" disabled>Reassign</option>
              {owners.map((o) => <option key={o}>{o}</option>)}
            </select>
            <button className={`${btn.quiet} ml-auto`} onClick={() => setSelected([])}>Clear</button>
          </div>
        )}

        {view === "list" ? (
          filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="text-[14px] font-medium text-ink">Nothing here</div>
              <p className="mt-1 text-[13px] text-muted">No follow-ups match this view.</p>
            </div>
          ) : (
            <table className="w-full table-fixed text-[13.5px]">
              <colgroup>
                <col className="hidden w-11 md:table-column" />
                <col />
                <col className="hidden w-40 md:table-column" />
                <col className="hidden w-44 md:table-column" />
                <col className="hidden w-28 md:table-column" />
                <col className="hidden w-32 md:table-column" />
                <col className="w-28" />
              </colgroup>
              <thead className="hidden text-left text-[12px] font-medium text-muted md:table-header-group">
                <tr className="border-b border-line">
                  <th className="w-11 py-2.5 pl-4">
                    <input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSelected(allSel ? [] : filtered.map((r) => r.id))} className="size-3.5 accent-[var(--brand)]" />
                  </th>
                  <th className="py-2.5 font-medium">Follow-up</th>
                  <th className="py-2.5 font-medium">Due</th>
                  <th className="py-2.5 font-medium">Owner</th>
                  <th className="py-2.5 font-medium">Priority</th>
                  <th className="py-2.5 font-medium">Status</th>
                  <th className="w-28 py-2.5 pr-4" />
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.key}>
                  {g.label && (
                    <tr>
                      <td colSpan={7} className="border-b border-line bg-surface-2/50 px-4 py-1.5 text-[12px] font-medium text-muted">
                        {g.label} <span className="text-faint">· {g.rows.length}</span>
                      </td>
                    </tr>
                  )}
                  {g.rows.map((r) => (
                    <tr key={r.id} onClick={() => setDrawerId(r.id)} className="group cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2/50">
                      <td className="hidden py-3 pl-4 align-top md:table-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.subject}`}
                          checked={selected.includes(r.id)}
                          onChange={() => toggle(r.id)}
                          className={`mt-1 size-3.5 accent-[var(--brand)] transition ${selected.length ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                        />
                      </td>
                      <td className="py-3 pl-4 pr-6 md:pl-0">
                        <div className="truncate font-medium text-ink">{r.subject}</div>
                        <div className="truncate text-[12.5px] text-muted">
                          {r.customerName} · {FOLLOWUP_TYPE_LABEL[r.type]}{r.linkedDoc ? ` · ${r.linkedDoc}` : ""}
                        </div>
                        {/* Mobile meta */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
                          <span className={`text-[12.5px] num ${r.eff === "overdue" ? "font-medium text-high" : "text-muted"}`}>{isOpen(r.eff) ? relativeDue(r.dueAt, now) : fmtDate(r.dueAt)}</span>
                          <PriorityBadge p={r.priority} compact />
                          <span className="text-[12.5px] text-muted">{r.owner}</span>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap py-3 pr-4 md:table-cell">
                        <div className={`num ${r.eff === "overdue" ? "font-medium text-high" : "text-ink-2"}`}>{fmtDate(r.dueAt)}, {fmtTime(r.dueAt)}</div>
                        {isOpen(r.eff) && <div className="text-[12px] text-muted">{relativeDue(r.dueAt, now)}</div>}
                      </td>
                      <td className="hidden py-3 pr-4 md:table-cell">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-2"><Avatar name={r.owner} />{r.owner}</span>
                      </td>
                      <td className="hidden py-3 pr-4 md:table-cell"><PriorityBadge p={r.priority} /></td>
                      <td className="hidden py-3 pr-4 md:table-cell"><Status s={r.eff} /></td>
                      <td className="py-3 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {isOpen(r.eff) && (
                          <span className="inline-flex gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                            <IconButton label="Complete" onClick={() => setCompleting(r)}><path d="M4.5 10.5l3.5 3.5 7.5-8" /></IconButton>
                            <IconButton label="Snooze until tomorrow 9:00" onClick={() => snooze(r)}><circle cx="10" cy="10.5" r="6" /><path d="M10 7.5v3l2 1.5" /></IconButton>
                            <IconButton label="Edit or reschedule" onClick={() => setEdit({ open: true, row: r })}><path d="M13.5 4.5l2 2-8 8H5.5v-2z" /></IconButton>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )
        ) : (
          <div className="grid gap-3 overflow-x-auto p-4 md:grid-cols-4">
            {(["overdue", "pending", "in_progress", "completed"] as FollowUpStatus[]).map((col) => {
              // Same list as the List view (tab, priority, owner, type, search) — just bucketed by status.
              const items = filtered.filter((r) => (col === "pending" ? r.eff === "pending" || r.eff === "snoozed" : r.eff === col));
              return (
                <div
                  key={col}
                  className="min-h-48 rounded-xl bg-surface-2/60 p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/fu");
                    const r = rows.find((x) => x.id === id);
                    if (!r || col === "overdue") return;
                    if (col === "completed") setCompleting(r);
                    else patchFollowUps([id], { status: col as FollowUp["status"] }, { kind: "status", body: `Moved to ${STATUS_LABEL[col]}` });
                  }}
                >
                  <div className="flex items-center justify-between px-2 pb-2 pt-1 text-[12.5px] font-medium text-ink-2">
                    <span className="inline-flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${STATUS_DOT[col]}`} />{STATUS_LABEL[col]}</span>
                    <span className="text-faint num">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <div
                        key={r.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/fu", r.id)}
                        onClick={() => setDrawerId(r.id)}
                        className="cursor-grab rounded-lg border border-line bg-surface p-3 shadow-card transition hover:border-line-strong"
                      >
                        <div className="line-clamp-2 text-[13px] font-medium text-ink">{r.subject}</div>
                        <div className="mt-0.5 truncate text-[12px] text-muted">{r.customerName}</div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <PriorityBadge p={r.priority} compact />
                          <span className={`text-[12px] num ${r.eff === "overdue" ? "font-medium text-high" : "text-muted"}`}>{relativeDue(r.dueAt, now)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Drawer
        row={drawerRow}
        onClose={() => setDrawerId(null)}
        onEdit={(f) => { setDrawerId(null); setEdit({ open: true, row: f }); }}
        onComplete={(f) => { setDrawerId(null); setCompleting(f); }}
      />
      <FollowUpModal open={edit.open} onClose={() => { setEdit({ open: false, row: null }); setPreset(undefined); }} initial={edit.row} owners={owners} customers={customers} preset={preset} />
      <CompleteModal row={completing} onClose={() => setCompleting(null)} />
    </>
  );
}
