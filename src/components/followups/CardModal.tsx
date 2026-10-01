"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CardEvent, CardEventKind, Member, Phase } from "@/lib/types";
import {
  type CardKind, type CardView, type ContactEntry, type ScheduleStatus, type TrainingSchedule, KIND_LABEL, STAGE_ORDER, STAGE_RANK, TRAINERS,
  type DueStatus, type DueTone, busyTrainers, cardDue, cardLabel, columnQuotes, newestFirst, refQuoteNumber, completionNotApplied, describeEvent, fmtMonth, isCustomerCard, kindOfId, mergeNotApplied, potentialCardId, normEmail, normPhone, phaseOf, salespersonLabel,
} from "@/lib/pipeline";
import { fmtDate, fmtINR, fmtTime } from "@/lib/dates";
import { zohoUrl } from "@/lib/zohoLinks";
import { useStore } from "@/lib/store";
import { Avatar, IconButton, btn, inputCls, selectCls } from "../ui";

export type BoardOptions = { typeOptions: string[]; sectorOptions: string[]; orgId?: string };
type Cards = Map<string, CardView>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });

/** Colour per stage, matching the board's column headers. */
export const STAGE_TONE: Record<CardKind, { chip: string; head: string; ring: string }> = {
  potential: { chip: "bg-surface-2 text-brand", head: "bg-surface-2", ring: "border-brand/30" },
  lead: { chip: "bg-surface-2 text-ink-2", head: "bg-surface-2", ring: "border-line-strong" },
  quote: { chip: "bg-brand-soft text-brand", head: "bg-brand-soft", ring: "border-brand/40" },
  pi: { chip: "bg-medium-bg text-medium", head: "bg-medium-bg", ring: "border-medium/40" },
  invoice: { chip: "bg-medium-bg text-medium", head: "bg-medium-bg", ring: "border-medium/40" },
  payment: { chip: "bg-low-bg text-low", head: "bg-low-bg", ring: "border-low/40" },
};

/* ---------------- Small pieces ---------------- */

export function FlagBadge() {
  return (
    <span title="Flagged: this client is in more than one column — open to merge" className="grid size-5 shrink-0 place-items-center rounded-md bg-high-bg text-[11px] font-bold text-high">
      F
    </span>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Locked — synced from Zoho Books">
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

/** Inside the narrow merge panels, sections go flat and labels sit above values. */
const Compact = createContext(false);

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  const compact = useContext(Compact);
  return (
    <section className={compact ? "border-t border-line px-1 pt-2.5 first:border-t-0 first:pt-0" : "rounded-2xl border border-line bg-surface px-4 py-3.5"}>
      <div className={`flex items-center justify-between gap-2 ${compact ? "mb-1.5" : "mb-2"}`}>
        <h3 className={`font-bold tracking-tight text-ink ${compact ? "text-[14px]" : "text-[16px]"}`}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, required, locked, children }: { label: string; required?: boolean; locked?: boolean; children: React.ReactNode }) {
  const compact = useContext(Compact);
  return (
    <div className={`grid border-b border-line first:pt-0 last:border-b-0 last:pb-0 ${compact ? "grid-cols-[118px_1fr] gap-2 py-1.5" : "grid-cols-[150px_1fr] gap-4 py-2"}`}>
      <dt className={`flex items-start gap-1 pt-0.5 font-medium text-muted ${compact ? "text-[12px]" : "text-[13px]"}`}>
        {label}
        {required && <span className="text-high">*</span>}
        {locked && <Lock />}
      </dt>
      <dd className={`min-w-0 text-ink-2 [overflow-wrap:anywhere] ${compact ? "text-[13px]" : "text-[14px]"}`}>{children}</dd>
    </div>
  );
}

function SourceTag({ phases }: { phases: Phase[] }) {
  return <span className="rounded-full bg-surface-2 px-2 py-px text-[11px] font-medium text-muted">from {phases.join(" · ")}</span>;
}

function Entries({ entries, empty, missing }: { entries: ContactEntry[]; empty: string; missing?: boolean }) {
  if (!entries.length) return <span className={missing ? "font-medium text-high" : "text-faint"}>{empty}</span>;
  return (
    <ul className="space-y-1">
      {entries.map((e, i) => (
        <li key={e.value} className="flex flex-wrap items-center gap-2">
          <span className={`min-w-0 [overflow-wrap:anywhere] ${i === 0 ? "font-semibold text-ink" : ""}`}>{e.value}</span>
          <SourceTag phases={e.phases} />
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Read-only sections (the same for every phase) ---------------- */

function CustomerSection({ card }: { card: CardView }) {
  return (
    <Section title="Customer">
      <dl>
        <Row label="Customer name" required>
          <div className="text-[15px] font-semibold text-ink">{card.name}</div>
          {card.aliases.length > 0 && <div className="mt-0.5 text-[13px] text-muted">Also known as {card.aliases.join(", ")}</div>}
        </Row>
        <Row label="Customer type">{card.type ?? <span className="text-faint">—</span>}</Row>
        <Row label="Sector">{card.sector ?? <span className="text-faint">—</span>}</Row>
        <Row label="Created in Zoho" locked>{card.customerSince ? dateLong(card.customerSince) : "—"}</Row>
      </dl>
    </Section>
  );
}

function ContactSection({ card }: { card: CardView }) {
  return (
    <Section title="Contact">
      <dl>
        <Row label="Email"><Entries entries={card.emails} empty="—" /></Row>
        <Row label="Contact number" required><Entries entries={card.phones} empty="Missing — add one" missing /></Row>
      </dl>
    </Section>
  );
}

const thisMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);

/** Month picker for the rough training date ("vague": a month, not a day). */
function MonthInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return <input type="month" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={value} min={thisMonth()} onChange={(e) => onChange(e.target.value)} aria-label="Expected training month" autoFocus={autoFocus} />;
}

/** Potential training: the rough month the training might happen, changeable any time. */
function PotentialSection({ card, onChange }: { card: CardView; onChange?: (month: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState("");
  const expected = card.potential?.expected;
  const save = () => {
    onChange?.(month);
    setEditing(false);
  };
  return (
    <Section title="Potential training">
      <div className="rounded-xl bg-brand-soft px-4 py-3">
        <div className="text-[12px] font-bold uppercase tracking-wide text-brand">Expected training (approx.)</div>
        <div className={`mt-0.5 text-[20px] font-semibold ${expected ? "text-ink" : "text-faint"}`}>{expected ? fmtMonth(expected) : "Not set"}</div>
        {onChange && !card.deleted && !card.mergedInto && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <MonthInput value={month} onChange={setMonth} autoFocus />
                <button className={btn.primary} onClick={save} disabled={month === (expected ?? "")}>Save</button>
                <button className={btn.quiet} onClick={() => setEditing(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button className={btn.ghost} onClick={() => { setMonth(expected ?? ""); setEditing(true); }}>{expected ? "Change month" : "Set month"}</button>
                {expected && <button className={btn.quiet} onClick={() => onChange("")}>Clear</button>}
              </>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        {card.potential && <>Added by {card.potential.addedBy} on {dateLong(card.potential.addedAt)}. </>}
        Stays here until it&apos;s merged into one of this customer&apos;s quotations — you choose which. A new quotation (dated on or after the day it was added) flags it automatically.
      </p>
    </Section>
  );
}

/** Invoice payment status, coloured like Zoho Books: red overdue, blue due, green paid. The card border matches. */
export const DUE_TONE: Record<DueTone, { border: string; chip: string }> = {
  overdue: { border: "border-high", chip: "bg-high-bg text-high" },
  due: { border: "border-info", chip: "bg-info-bg text-info" },
  paid: { border: "border-low", chip: "bg-low text-white" },
};
export function DueChip({ due, big }: { due: DueStatus; big?: boolean }) {
  return (
    <span className={`inline-block rounded font-bold uppercase tracking-wide ${big ? "px-1.5 py-0.5 text-[11.5px]" : "px-1 text-[10.5px]"} ${DUE_TONE[due.tone].chip}`}>
      {due.partlyPaid ? "Part paid · " : ""}{due.label}
    </span>
  );
}

/** Invoice / payment: when the invoice is due, how much is left, and the payments recorded against it. */
function PaymentSection({ card, cards }: { card: CardView; cards: Cards }) {
  const inv = card.kind === "invoice" ? card.invoice : card.kind === "payment" ? card.linkedInvoice : undefined;
  if (!inv) return null;
  const due = cardDue(card);
  const payments = [...cards.values()].filter((c) => c.kind === "payment" && c.payment?.invoiceId === inv.invoiceId).sort((a, b) => a.payment!.date.localeCompare(b.payment!.date));
  return (
    <Section title="Payment" aside={due && <DueChip due={due} big />}>
      {/* One line, so the modal still fits without scrolling. */}
      <p className="text-[14px] text-ink-2">
        Due <b className="text-ink">{inv.dueDate ? dateLong(inv.dueDate) : "—"}</b>
        {inv.balance !== undefined && inv.balance > 0 && <> · <b className="num text-ink">{fmtINR(inv.balance)}</b> still due</>}
        {payments.length === 0
          ? <span className="text-muted"> · not paid yet</span>
          : payments.map((p) => <span key={p.id}> · Paid <b className="text-ink">{dateLong(p.payment!.date)}</b> <span className="text-muted">({fmtINR(p.payment!.amount)}, {p.docNumber})</span></span>)}
      </p>
    </Section>
  );
}

/** Border: green whenever there's a date (postponed keeps its yellow badge), red when to be decided. */
export const SCHEDULE_TONE: Record<ScheduleStatus, { border: string; chip: string; label: string }> = {
  scheduled: { border: "border-low", chip: "bg-low-bg text-low", label: "Scheduled" },
  postponed: { border: "border-low", chip: "bg-medium-bg text-medium", label: "Postponed" },
  tbd: { border: "border-high", chip: "bg-high-bg text-high", label: "To be decided" },
};

export const scheduleText = (s: TrainingSchedule) => (s.status === "tbd" || !s.date ? "To be decided" : dateLong(s.date));
const todayYmd = () => new Date().toLocaleDateString("en-CA");

type ScheduleFn = (value: string, trainers?: string[]) => void;
type BusyFn = (date: string) => Map<string, CardView>;

/** Trainer checkboxes; anyone already running another training that day is greyed out. */
function TrainerPicker({ selected, onChange, busy }: { selected: string[]; onChange: (t: string[]) => void; busy: Map<string, CardView> }) {
  const taken = TRAINERS.filter((t) => busy.has(t));
  return (
    <div>
      <div role="group" aria-label="Trainers" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-wide text-brand">Trainers</span>
        {TRAINERS.map((t) => {
          const other = busy.get(t);
          const on = selected.includes(t) && !other;
          return (
            <label
              key={t}
              title={other ? `Already training ${other.name} on this date` : undefined}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border bg-surface px-2.5 text-[13px] ${other ? "cursor-not-allowed border-line text-faint" : on ? "cursor-pointer border-brand font-medium text-ink" : "cursor-pointer border-line text-ink-2 hover:border-line-strong"}`}
            >
              <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={on} disabled={Boolean(other)} onChange={(e) => onChange(e.target.checked ? [...selected, t] : selected.filter((x) => x !== t))} />
              {t}
            </label>
          );
        })}
      </div>
      {taken.length > 0 && (
        <p className="mt-1 text-[12.5px] text-muted">
          {taken.map((t) => `${t} is already training ${busy.get(t)!.name}`).join("; ")} on this date.
        </p>
      )}
    </div>
  );
}

/** Training date next to "No. of People", with postpone (calendar), trainers and to-be-decided. */
function ScheduleBlock({ card, onSchedule, onComplete, busyOn, compact }: { card: CardView; onSchedule?: ScheduleFn; onComplete?: () => void; busyOn?: BusyFn; compact?: boolean }) {
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState("");
  const [trainers, setTrainers] = useState<string[]>([]);
  const s = card.schedule;
  // Changing an existing date is postponing; from nothing or TBD it's scheduling.
  const postponing = Boolean(s && s.status !== "tbd");
  const big = compact ? "text-[16px]" : "text-[20px]";
  const busy = busyOn?.(date) ?? new Map<string, CardView>();
  const chosen = trainers.filter((t) => !busy.has(t));
  // Same date as now: only the trainers change.
  const sameDate = postponing && date === s?.date;
  const unchanged = sameDate && chosen.length === s!.trainers.length && chosen.every((t) => s!.trainers.includes(t));
  const valid = Boolean(date) && date >= todayYmd() && chosen.length > 0 && !unchanged;
  const open = () => {
    setDate(postponing ? s!.date ?? "" : "");
    setTrainers(s?.trainers ?? []);
    setPicking(true);
  };
  const close = () => {
    setPicking(false);
    setDate("");
    setTrainers([]);
  };
  const save = () => {
    if (!valid) return;
    onSchedule?.(date, TRAINERS.filter((t) => chosen.includes(t)));
    close();
  };
  // Two grid cells: the date sits next to "No. of People"; the buttons get their own full-width row.
  return (
    <>
    <div>
      <div className="text-[12px] font-bold uppercase tracking-wide text-brand">Training date</div>
      {s ? (
        <div className={`mt-0.5 flex flex-wrap items-center gap-2 font-semibold ${s.status === "tbd" ? "text-high" : "text-ink"} ${big}`}>
          <span className="num">{scheduleText(s)}</span>
          {s.completed ? (
            <span className="rounded-md bg-low px-1.5 py-0.5 text-[11.5px] font-bold text-white">Completed</span>
          ) : (
            s.status !== "tbd" && <span className={`rounded-md px-1.5 py-0.5 text-[11.5px] font-bold ${SCHEDULE_TONE[s.status].chip}`}>{SCHEDULE_TONE[s.status].label}</span>
          )}
        </div>
      ) : (
        <div className={`mt-0.5 font-semibold text-faint ${big}`}>Not set</div>
      )}
      {s?.date && (
        <p className="mt-1 text-[13px] text-ink-2">
          <span className="font-semibold">Trainers:</span> {s.trainers.length ? s.trainers.join(", ") : <span className="text-muted">not set</span>}
        </p>
      )}
      {s?.completed && (
        <p className="mt-1.5 text-[13px] text-muted">Completed · marked by {s.completed.by} on {dateLong(s.completed.at)}</p>
      )}
      {onSchedule && !s && !card.canSchedule && card.flaggedWith.length > 0 && (
        <p className="mt-1.5 text-[13px] text-muted">Merge the flagged cards first, then the training can be scheduled.</p>
      )}
    </div>
      {onSchedule && card.canSchedule && !s?.completed && (
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          {picking ? (
            <div className="w-full space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={date} min={todayYmd()} onChange={(e) => setDate(e.target.value)} aria-label={postponing ? "New training date" : "Training date"} autoFocus />
                <button className={btn.primary} onClick={save} disabled={!valid}>{sameDate ? "Save trainers" : postponing ? "Postpone" : "Schedule"}</button>
                <button className={btn.quiet} onClick={close}>Cancel</button>
              </div>
              <TrainerPicker selected={trainers} onChange={setTrainers} busy={busy} />
            </div>
          ) : (
            <>
              <button className={postponing ? btn.ghost : btn.primary} onClick={open}>{postponing ? "Postpone" : "Schedule training"}</button>
              {s?.status !== "tbd" && <button className={btn.ghost} onClick={() => onSchedule("TBD")}>To be decided</button>}
              {s?.date && onComplete && (card.kind === "quote" ? (
                <button disabled title="Create the PI first" className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13px] font-semibold text-muted">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
                  Training completed
                </button>
              ) : (
                <button className="press inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-low px-4 text-[13px] font-semibold text-white hover:brightness-110" onClick={onComplete}>
                  Training completed
                </button>
              ))}
            </>
          )}
          {!picking && s?.date && card.kind === "quote" && (
            <p className="w-full text-[13px] font-medium text-medium">
              Create the PI in Zoho Books for {card.docNumber} before marking the training completed — then merge Quote → PI here.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function TrainingSection({ card, compact, onSchedule, onComplete, busyOn }: { card: CardView; compact?: boolean; onSchedule?: ScheduleFn; onComplete?: () => void; busyOn?: BusyFn }) {
  const quoted = card.kind === "pi" ? card.linkedQuote : undefined;
  const showSchedule = card.kind !== "lead" && Boolean(card.schedule || onSchedule);
  return (
    <Section title="Training">
      {card.training.length === 0 ? (
        <p className="text-[14px] text-muted">No training yet — it appears once a quotation is sent.</p>
      ) : (
        <div className="space-y-3">
          {card.training.map((t, i) => {
            const expected = quoted?.items.find((x) => x.name === t.name)?.qty;
            const tone = card.schedule ? SCHEDULE_TONE[card.schedule.status].border : "border-transparent";
            // Narrow merge panels: training and head-count side by side on one line.
            if (compact) {
              return (
                <div key={i} className={`grid grid-cols-[1fr_auto] items-end gap-3 rounded-xl border-2 bg-brand-soft px-3 py-2 ${tone}`}>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-brand">Type of Training</div>
                    <div className="text-[14px] font-semibold leading-snug text-ink">{t.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-brand">{card.peopleLabel.replace("No. of People", "People")}</div>
                    <div className="num text-[16px] font-semibold text-ink">{t.qty}</div>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className={`rounded-xl border-2 bg-brand-soft ${tone} ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
                <div className="text-[12px] font-bold uppercase tracking-wide text-brand">Type of Training</div>
                <div className={`mt-0.5 font-semibold leading-snug text-ink ${compact ? "text-[16px]" : "text-[20px]"}`}>{t.name}</div>
                <div className={`mt-2 grid gap-x-4 gap-y-2.5 ${showSchedule && i === 0 ? "sm:grid-cols-2" : ""}`}>
                  <div>
                    <div className="text-[12px] font-bold uppercase tracking-wide text-brand">{card.peopleLabel}</div>
                    <div className={`num mt-0.5 font-semibold text-ink ${compact ? "text-[16px]" : "text-[20px]"}`}>
                      {t.qty}
                      {expected !== undefined && expected !== t.qty && <span className="ml-2 text-[13px] font-medium text-muted">({expected} expected at quotation)</span>}
                    </div>
                  </div>
                  {showSchedule && i === 0 && <ScheduleBlock card={card} onSchedule={onSchedule} onComplete={onComplete} busyOn={busyOn} compact={compact} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/** Pops up over a merged, unflagged PI that has no training date yet. */
function SchedulePrompt({ card, onSchedule, onLater, busyOn }: { card: CardView; onSchedule: ScheduleFn; onLater: () => void; busyOn: BusyFn }) {
  const [date, setDate] = useState("");
  const [trainers, setTrainers] = useState<string[]>([]);
  const busy = busyOn(date);
  const chosen = TRAINERS.filter((t) => trainers.includes(t) && !busy.has(t));
  return (
    <div className="fade-in absolute inset-0 z-20 grid place-items-center bg-black/25 p-4 backdrop-blur-[2px]" onMouseDown={onLater}>
      <div role="alertdialog" aria-label="Ready for training" className="modal-in w-full max-w-md rounded-2xl border-2 border-low bg-surface p-6 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-[12px] font-bold uppercase tracking-wide text-low">Ready for training</div>
        <h3 className="mt-1 text-[18px] font-bold leading-snug tracking-tight text-ink">{card.name} is ready</h3>
        <p className="mt-1.5 text-[14px] text-muted">
          Everything is merged into {card.docNumber}{card.training[0] ? ` for ${card.training[0].name} (${card.training[0].qty} people)` : ""}. Would you like to schedule their training right now?
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Enter date:</span>
          <input type="date" className={inputCls} value={date} min={todayYmd()} onChange={(e) => setDate(e.target.value)} autoFocus />
        </label>
        <div className="mt-3">
          <TrainerPicker selected={trainers} onChange={setTrainers} busy={busy} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btn.ghost} onClick={onLater}>Later</button>
          <button className={btn.primary} disabled={!date || date < todayYmd() || !chosen.length} onClick={() => onSchedule(date, chosen)}>Schedule training</button>
        </div>
      </div>
    </div>
  );
}

function SalesSection({ card }: { card: CardView }) {
  return (
    <Section title="Sales person" aside={<Lock />}>
      <p className="text-[15px] font-medium text-ink">{card.salespeople.length ? salespersonLabel(card.salespeople) : <span className="font-normal text-faint">—</span>}</p>
    </Section>
  );
}

function DocsSection({ card, options }: { card: CardView; options: BoardOptions }) {
  const q = card.linkedQuote;
  const p = card.pi ?? card.linkedPI;
  const inv = card.invoice ?? card.linkedInvoice;
  const pay = card.payment;
  const PENDING = "To be created";
  const rows: [string, string | undefined, string | undefined, string | undefined][] = [
    ["Quote", q?.number, q?.date, q ? zohoUrl("estimate", q.estimateId, options.orgId) : undefined],
    card.piSkipped && card.kind === "quote"
      ? ["Sales Order / PI", PENDING, PENDING, undefined]
      : ["Sales Order / PI", p?.number, p?.date, p ? zohoUrl("salesorder", p.salesorderId, options.orgId) : undefined],
    ["Invoice", inv?.number, inv?.date, inv ? zohoUrl("invoice", inv.invoiceId, options.orgId) : undefined],
    ["Payment Received", pay?.number, pay?.date, pay ? zohoUrl("payment", pay.paymentId, options.orgId) : undefined],
  ];
  const status = pay ? undefined : card.invoice?.status ?? card.pi?.status ?? card.quote?.status;
  return (
    <Section title="IDs & dates" aside={<span className="inline-flex items-center gap-1 text-[12px] text-faint"><Lock /> from Zoho Books — read only</span>}>
      <table className="w-full text-[14px]">
        <thead className="text-left text-[12px] font-medium text-muted">
          <tr className="border-b border-line"><th className="pb-2 font-medium">Document</th><th className="pb-2 font-medium">Number</th><th className="pb-2 font-medium">Date</th></tr>
        </thead>
        <tbody>
          {rows.map(([k, no, date, href]) => (
            <tr key={k} className="border-b border-line last:border-b-0">
              <td className="py-2.5 pr-3 font-medium text-muted">{k}</td>
              <td className="py-2.5 pr-3 text-ink-2">
                {no === PENDING ? <span className="italic text-muted">{no}</span> : no ? (href ? <a href={href} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">{no}</a> : no) : <span className="text-faint">—</span>}
              </td>
              <td className="num py-2.5 text-ink-2">{date === PENDING ? <span className="italic text-muted">{date}</span> : date ? dateLong(date) : <span className="text-faint">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {status && <p className="mt-3 text-[12.5px] text-muted">Zoho status: <span className="font-medium capitalize text-ink-2">{status.replace(/_/g, " ")}</span></p>}
      {pay && (
        <p className="mt-3 text-[12.5px] text-muted">
          Amount received: <span className="num font-semibold text-ink-2">{fmtINR(pay.amount)}</span>{pay.mode && <> · {pay.mode}</>}{pay.reference && <> · Ref# {pay.reference}</>}
        </p>
      )}
    </Section>
  );
}

function NotesSection({ card, options }: { card: CardView; options: BoardOptions }) {
  const q = card.quote;
  if (!card.piSkipped && !card.piMissing && !card.waitingOn && !card.lost) return null;
  return (
    <Section title="Notes">
      <div className="space-y-2.5 text-[14px] text-ink-2">
        {card.lost && q && (
          <p className="rounded-lg border border-high/30 bg-high-bg px-3 py-2.5">
            <b className="text-high">Deal lost.</b> This quotation was declined in Zoho Books. Please click{" "}
            <a href={zohoUrl("estimate", q.estimateId, options.orgId)} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
              {q.number}
            </a>{" "}
            for further reference.
          </p>
        )}
        {card.piMissing && q && card.piSkipped && (
          <p className="rounded-lg border border-high/30 bg-high-bg px-3 py-2.5">
            <b className="text-high">PI required.</b> The training was scheduled straight from the quotation. Create and save a PI in Zoho Books for{" "}
            <a href={zohoUrl("estimate", q.estimateId, options.orgId)} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
              {q.number}
            </a>{" "}
            before marking the training completed.
            <span className="block text-[12.5px] text-muted">Put {q.number} in the PI&apos;s reference field; once it syncs, merge Quote → PI here and complete the training on the PI.</span>
          </p>
        )}
        {card.piMissing && q && !card.piSkipped && (
          <p className="rounded-lg border border-high/30 bg-high-bg px-3 py-2.5">
            <b className="text-high">PI missing.</b> A Performa Invoice is required for the proper functioning of the cycle. Please create and save a PI in Zoho Books for this quotation:{" "}
            <a href={zohoUrl("estimate", q.estimateId, options.orgId)} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
              {q.number}
            </a>
            <span className="block text-[12.5px] text-muted">Put {q.number} in the PI&apos;s reference field so it links back to this card.</span>
          </p>
        )}
        {card.waitingOn && (
          <p className="rounded-lg border border-medium/40 bg-medium-bg px-3 py-2.5">
            <b className="text-medium">Not linked yet.</b> {card.waitingOn}
          </p>
        )}
      </div>
    </Section>
  );
}

/** Lead → Quote → PI trail of what was merged into this card, with unmerge on each direct merge. */
function ChainSection({ card, cards, onUnmerge }: { card: CardView; cards: Cards; onUnmerge?: (fromId: string) => void }) {
  if (card.historyIds.length < 2) return null;
  const chain = [...card.historyIds].map((id) => cards.get(id)).filter((c): c is CardView => !!c).sort((a, b) => STAGE_RANK[a.kind] - STAGE_RANK[b.kind]);
  return (
    <Section title="Merged">
      <div className="flex flex-wrap items-center gap-2">
        {chain.map((c, i) => (
          <span key={c.id} className="inline-flex items-center gap-2">
            {/* Lead and Potential training sit side by side (+); later stages follow (→). */}
            {i > 0 && <span className="text-faint">{STAGE_RANK[c.kind] === STAGE_RANK[chain[i - 1].kind] ? "+" : "→"}</span>}
            <span className={`rounded-lg px-2.5 py-1 text-[13px] font-medium ${STAGE_TONE[c.kind].chip}`}>{KIND_LABEL[c.kind]} · {isCustomerCard(c.kind) ? c.lead?.name : c.docNumber}</span>
          </span>
        ))}
      </div>
      {onUnmerge && card.mergedFrom.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.mergedFrom.map((id) => (
            <button key={id} className={btn.quiet} onClick={() => onUnmerge(id)}>Unmerge {isCustomerCard(kindOfId(id)) ? KIND_LABEL[kindOfId(id)] : cardLabel(cards.get(id))}</button>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------------- Change log (the modal's extension) ---------------- */

export function ChangeLog({ cardIds, cards, member }: { cardIds: string[]; cards: Cards; member: Member }) {
  const { cardEvents, revertCardEvent } = useStore();
  const ids = new Set(cardIds);
  const list = cardEvents.filter((e) => e.cardIds.some((id) => ids.has(id))).sort((a, b) => b.at.localeCompare(a.at));
  const labelOf = (id: string) => cardLabel(cards.get(id));
  return (
    <div className="p-5">
      <h3 className="text-[16px] font-bold tracking-tight text-ink">Changes</h3>
      <p className="mb-4 text-[12.5px] text-muted">Who changed what. Every change can be reverted.</p>
      {list.length === 0 ? (
        <p className="text-[13px] text-faint">No changes yet.</p>
      ) : (
        <ol className="space-y-2.5">
          {list.map((e) => {
            const zoho = e.kind === "zoho_change";
            return (
              <li key={e.id} className={`rounded-xl border p-3 text-[13px] ${zoho ? "border-medium/40 bg-medium-bg" : "border-line bg-surface"} ${e.revertedAt ? "opacity-60" : ""}`}>
                <div className={e.revertedAt ? "text-muted line-through" : "text-ink-2"}>{describeEvent(e, labelOf)}</div>
                {completionNotApplied(e) && (
                  <div className="mt-1 text-[12px] font-medium text-medium">Not applied — training is completed on the PI. Create the PI in Zoho Books, merge Quote → PI, then mark it completed.</div>
                )}
                {mergeNotApplied(e, cards) && (
                  <div className="mt-1 text-[12px] font-medium text-medium">Not applied — the invoice wasn&apos;t merged with its completed training first. Merge step by step, then merge it with the payment again.</div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                    <Avatar name={e.by} />
                    <span className="truncate">{e.by} · {fmtDate(e.at)}, {fmtTime(e.at)}</span>
                  </span>
                  {!e.revertedAt && !zoho && (
                    <button className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold text-brand hover:bg-brand-soft" onClick={() => revertCardEvent(e.id, member.name)}>
                      Revert
                    </button>
                  )}
                </div>
                {e.revertedAt && <div className="mt-1 text-[12px] text-muted">Reverted by {e.revertedBy} · {fmtDate(e.revertedAt)}, {fmtTime(e.revertedAt)}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ---------------- Modal shell: wide; locks the page behind it ---------------- */

function Shell({ label, onClose, side, footer, overlay, children }: { label: string; onClose: () => void; side: React.ReactNode; footer?: React.ReactNode; overlay?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    // No background scrolling (and no page scrollbar) while a card is open.
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = prev; };
  }, []);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-2 backdrop-blur-md sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={label}
        className="modal-in relative flex h-[94vh] w-[min(1720px,98vw)] flex-col overflow-hidden rounded-[24px] bg-surface-2 shadow-pop md:flex-row"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {overlay}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-line bg-surface px-6 py-3.5">{footer}</div>}
        </div>
        <aside className="no-scrollbar max-h-[30vh] shrink-0 overflow-y-auto border-t border-line bg-surface md:max-h-none md:w-[360px] md:border-l md:border-t-0">{side}</aside>
      </div>
    </div>
  );
}

function Header({ kind, sub, title, flagged, onClose }: { kind?: CardKind; sub: string; title: string; flagged?: boolean; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-6 pb-3 pt-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {kind && <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide ${STAGE_TONE[kind].chip}`}>{KIND_LABEL[kind]}</span>}
          <span className="text-[13px] font-medium text-muted">{sub}</span>
        </div>
        <h2 className="mt-1 flex items-center gap-2 text-[22px] font-bold leading-tight tracking-tight text-ink">
          <span className="[overflow-wrap:anywhere]">{title}</span>
          {flagged && <FlagBadge />}
        </h2>
      </div>
      <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
    </div>
  );
}

/* ---------------- Editing ---------------- */

type EntryDraft = ContactEntry & { isNew?: boolean };
type Draft = { name: string; aliases: string[]; emails: EntryDraft[]; phones: EntryDraft[]; type: string; sector: string };

function EntryEditor({ label, required, entries, onChange, keyOf, validate, phase, placeholder }: {
  label: string; required?: boolean; entries: EntryDraft[]; onChange: (e: EntryDraft[]) => void;
  keyOf: (v: string) => string; validate: (v: string) => string | null; phase: Phase; placeholder: string;
}) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const add = () => {
    const x = v.trim();
    const bad = validate(x);
    if (bad) return setErr(bad);
    if (entries.some((e) => keyOf(e.value) === keyOf(x))) return setErr("Already on this card.");
    onChange([{ value: x, phases: [phase], at: new Date().toISOString(), isNew: true }, ...entries]);
    setV("");
    setErr("");
  };
  return (
    <Row label={label} required={required}>
      <ul className="mb-2 space-y-1.5">
        {entries.map((e) => (
          <li key={e.value} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 text-ink [overflow-wrap:anywhere]">{e.value}</span>
            <SourceTag phases={e.phases} />
            <button type="button" aria-label={`Remove ${e.value}`} className="ml-auto rounded px-1.5 text-faint hover:bg-surface-2 hover:text-high" onClick={() => onChange(entries.filter((x) => x !== e))}>×</button>
          </li>
        ))}
        {entries.length === 0 && <li className={required ? "text-high" : "text-faint"}>{required ? "At least one is required" : "None"}</li>}
      </ul>
      <div className="flex gap-2">
        <input className={`${inputCls} !h-9 text-[13px]`} value={v} placeholder={placeholder} onChange={(e) => { setV(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <button type="button" className={btn.ghost} onClick={add}>Add</button>
      </div>
      {err && <p className="mt-1 text-[12px] text-high">{err}</p>}
    </Row>
  );
}

function Editor({ card, draft, setDraft, options }: { card: CardView; draft: Draft; setDraft: (d: Draft) => void; options: BoardOptions }) {
  const [alias, setAlias] = useState("");
  const addAlias = () => {
    const a = alias.trim();
    if (a && !draft.aliases.includes(a) && a !== draft.name) setDraft({ ...draft, aliases: [...draft.aliases, a] });
    setAlias("");
  };
  const withCurrent = (opts: string[], cur: string) => (cur && !opts.includes(cur) ? [cur, ...opts] : opts);
  const phase = phaseOf(card.kind);
  return (
    <>
      <Section title="Customer">
        <dl>
          <Row label="Customer name" required>
            <input className={`${inputCls} !h-9 text-[14px]`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Customer name" />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {draft.aliases.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-ink-2">
                  {a}
                  <button type="button" aria-label={`Remove alias ${a}`} className="text-faint hover:text-high" onClick={() => setDraft({ ...draft, aliases: draft.aliases.filter((x) => x !== a) })}>×</button>
                </span>
              ))}
              <input className="h-8 min-w-[160px] flex-1 rounded-md border border-dashed border-line bg-transparent px-2 text-[13px] focus:border-brand focus:outline-none" placeholder="+ Add alias (optional)" value={alias} onChange={(e) => setAlias(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())} onBlur={addAlias} />
            </div>
          </Row>
          <Row label="Customer type">
            <select className={`${selectCls} w-full`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} aria-label="Customer type">
              <option value="">—</option>
              {withCurrent(options.typeOptions, draft.type).map((o) => <option key={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="Sector">
            <select className={`${selectCls} w-full`} value={draft.sector} onChange={(e) => setDraft({ ...draft, sector: e.target.value })} aria-label="Sector">
              <option value="">—</option>
              {withCurrent(options.sectorOptions, draft.sector).map((o) => <option key={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="Created in Zoho" locked>{card.customerSince ? dateLong(card.customerSince) : "—"}</Row>
        </dl>
      </Section>
      <Section title="Contact">
        <dl>
          <EntryEditor label="Email" entries={draft.emails} onChange={(emails) => setDraft({ ...draft, emails })} keyOf={normEmail} phase={phase} placeholder="name@company.com"
            validate={(x) => (EMAIL_RE.test(x) ? null : "Enter a valid email.")} />
          <EntryEditor label="Contact number" required entries={draft.phones} onChange={(phones) => setDraft({ ...draft, phones })} keyOf={normPhone} phase={phase} placeholder="+91 98765 43210"
            validate={(x) => (/^[+\d\s()-]+$/.test(x) && x.replace(/\D/g, "").length >= 7 ? null : "Enter a valid number.")} />
        </dl>
      </Section>
    </>
  );
}

/** Turn the edited draft into one event per change, so each can be reverted on its own. */
function diff(card: CardView, d: Draft, by: string): Omit<CardEvent, "id" | "at">[] {
  const base = { cardIds: [card.id], by };
  const out: Omit<CardEvent, "id" | "at">[] = [];
  const ev = (kind: CardEventKind, extra: Partial<CardEvent>) => out.push({ ...base, kind, ...extra });
  if (d.name.trim() !== card.name) ev("set_name", { value: d.name.trim(), before: card.name });
  for (const a of card.aliases) if (!d.aliases.includes(a)) ev("remove_alias", { value: a });
  for (const a of d.aliases) if (!card.aliases.includes(a)) ev("add_alias", { value: a });
  const keep = (list: EntryDraft[], key: (v: string) => string) => new Set(list.filter((e) => !e.isNew).map((e) => key(e.value)));
  const keptEmails = keep(d.emails, normEmail);
  const keptPhones = keep(d.phones, normPhone);
  for (const e of card.emails) if (!keptEmails.has(normEmail(e.value))) ev("remove_email", { value: e.value });
  for (const p of card.phones) if (!keptPhones.has(normPhone(p.value))) ev("remove_phone", { value: p.value });
  for (const e of [...d.emails].reverse()) if (e.isNew) ev("add_email", { value: e.value, phase: e.phases[0] });
  for (const p of [...d.phones].reverse()) if (p.isNew) ev("add_phone", { value: p.value, phase: p.phases[0] });
  if (d.type !== (card.type ?? "")) ev("set_type", { value: d.type, before: card.type ?? "" });
  if (d.sector !== (card.sector ?? "")) ev("set_sector", { value: d.sector, before: card.sector ?? "" });
  return out;
}

const flagText = (card: CardView, cards: Cards) => {
  const kinds = [...new Set(card.flaggedWith.map((id) => cards.get(id)?.kind).filter(Boolean))] as CardKind[];
  return kinds.map((k) => `${KIND_LABEL[k]}s`).join(" and ");
};

/* ---------------- Card modal (the same modal for every phase) ---------------- */

export function CardModal({ card, cards, member, options, onClose, onReviewMerge }: {
  card: CardView; cards: Cards; member: Member; options: BoardOptions; onClose: () => void; onReviewMerge: () => void;
}) {
  const { addCardEvents, revertCardEvent, cardEvents, toast } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prompt, setPrompt] = useState(card.readyToSchedule);
  useEffect(() => { setDraft(null); setError(""); setConfirmDelete(false); setPrompt(card.readyToSchedule); }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = (value: string, trainers?: string[]) => {
    const s = card.schedule;
    const before = s ? (s.status === "tbd" ? "TBD" : s.date) : undefined;
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_training_date", value, before, by: member.name, ...(value !== "TBD" ? { trainers } : {}) }]);
    if (!s) {
      const skip = card.kind === "quote" ? " — create its PI before completing" : "";
      toast({ text: `${card.name} moved to Training scheduled${skip}`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    }
    setPrompt(false);
  };
  const busyOn = (date: string) => busyTrainers(date, cards, card.id);
  const setExpected = (month: string) => {
    addCardEvents([{ cardIds: [card.id], kind: "set_potential_date", value: month, before: card.potential?.expected ?? "", by: member.name }]);
  };
  const complete = () => {
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "complete_training", by: member.name }]);
    toast({ text: `${card.name} moved to Training completed`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };

  const startEdit = () => setDraft({
    name: card.name, aliases: [...card.aliases], emails: card.emails.map((e) => ({ ...e })), phones: card.phones.map((p) => ({ ...p })),
    type: card.type ?? "", sector: card.sector ?? "",
  });

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Customer name is required.");
    if (!draft.phones.length) return setError("At least one contact number is required.");
    addCardEvents(diff(card, draft, member.name));
    setDraft(null);
    setError("");
  };

  const activeEvent = (pred: (e: CardEvent) => boolean) => cardEvents.find((e) => !e.revertedAt && pred(e));
  const del = () => {
    // Recorded on everything merged into this card too, so the lead that returns to Leads shows why.
    const [ev] = addCardEvents([{ cardIds: [...new Set([card.id, ...card.historyIds])], kind: "delete", by: member.name }]);
    const text = card.kind === "potential" ? `Removed ${card.name} from Potential training` : `Deleted ${cardLabel(card)} — ${card.name} is back in Leads`;
    toast({ text, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    onClose();
  };
  const ownDelete = cardEvents.some((e) => !e.revertedAt && e.kind === "delete" && e.cardIds.includes(card.id));
  const restore = () => {
    const ev = activeEvent((e) => e.kind === "delete" && e.cardIds.includes(card.id));
    if (ev) revertCardEvent(ev.id, member.name);
  };
  const unmerge = (fromId: string) => {
    const ev = activeEvent((e) => e.kind === "merge" && e.cardIds[0] === fromId && e.cardIds[1] === card.id);
    if (ev) revertCardEvent(ev.id, member.name);
  };

  const sub = card.kind === "lead"
    ? "Zoho customer"
    : card.kind === "potential" ? `Zoho customer${card.potential?.expected ? ` · training expected around ${fmtMonth(card.potential.expected)}` : ""}`
    : `${card.docNumber} · ${card.docDate ? dateLong(card.docDate) : ""}${
        !card.schedule ? ""
        : card.schedule.completed ? ` · Training completed ${scheduleText(card.schedule)}`
        : card.schedule.status === "tbd" ? " · Training to be decided"
        : ` · Training ${scheduleText(card.schedule)} (${SCHEDULE_TONE[card.schedule.status].label})`}`;
  const footer = draft ? (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn.primary} onClick={save}>Save changes</button>
      <button className={btn.ghost} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
      {error && <span className="text-[13px] font-medium text-high">{error}</span>}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn.primary} onClick={startEdit} disabled={card.deleted}>Edit</button>
      {/* Leads are the Zoho customers themselves, so only quote/PI cards can be deleted. */}
      {card.kind !== "lead" && !card.deleted && (confirmDelete ? (
        <span className="ml-auto inline-flex items-center gap-2 text-[13px] text-muted">
          {card.kind === "potential" ? "Remove from Potential training? (Zoho is not changed.)" : "Delete this card? The customer goes back to Leads (Zoho is not changed)."}
          <button className={btn.danger} onClick={del}>Delete</button>
          <button className={btn.quiet} onClick={() => setConfirmDelete(false)}>Keep</button>
        </span>
      ) : (
        <button className={`${btn.danger} ml-auto`} onClick={() => setConfirmDelete(true)}>Delete</button>
      ))}
    </div>
  );

  return (
    <Shell
      label={`${card.name} details`}
      onClose={onClose}
      footer={footer}
      side={<ChangeLog cardIds={card.historyIds} cards={cards} member={member} />}
      overlay={prompt && card.readyToSchedule && <SchedulePrompt card={card} onSchedule={schedule} onLater={() => setPrompt(false)} busyOn={busyOn} />}
    >
      <Header kind={card.kind} sub={sub} title={card.name} flagged={card.flaggedWith.length > 0} onClose={onClose} />
      <div className="space-y-3 p-4">
        {card.deleted && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-high-bg px-4 py-3 text-[14px] text-high">
            {ownDelete ? (card.kind === "potential" ? "Removed from Potential training." : "This card is deleted; the customer is back in Leads.") : "Hidden because the card it was merged into was deleted — restore that card to bring it back."}
            {ownDelete && <button className="font-semibold underline" onClick={restore}>Restore</button>}
          </div>
        )}
        {card.kind === "potential" && !card.flaggedWith.length && !card.mergedInto && !card.deleted && (() => {
          const n = columnQuotes(card.customerId, cards).length;
          return n > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-surface px-4 py-3 text-[14px] text-ink-2">
              <span>{card.name} has {n} quotation{n > 1 ? "s" : ""} in Quotations — choose which one this card merges into.</span>
              <button className="shrink-0 font-semibold text-brand hover:underline" onClick={onReviewMerge}>Choose &amp; merge</button>
            </div>
          );
        })()}
        {card.flaggedWith.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-high/30 bg-surface px-4 py-3 text-[14px] text-ink-2">
            <span className="inline-flex items-center gap-2"><FlagBadge /> This client is also in {flagText(card, cards)}.</span>
            <button className="font-semibold text-brand hover:underline" onClick={onReviewMerge}>Review &amp; merge</button>
          </div>
        )}
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-3">
            {draft ? <Editor card={card} draft={draft} setDraft={setDraft} options={options} /> : <><CustomerSection card={card} /><ContactSection card={card} /></>}
            <NotesSection card={card} options={options} />
            <ChainSection card={card} cards={cards} onUnmerge={unmerge} />
            <PaymentSection card={card} cards={cards} />
          </div>
          <div className="space-y-3">
            {card.kind === "potential" ? (
              <PotentialSection card={card} onChange={setExpected} />
            ) : (
              <TrainingSection card={card} onSchedule={card.kind !== "lead" ? schedule : undefined} onComplete={complete} busyOn={busyOn} />
            )}
            <SalesSection card={card} />
            <DocsSection card={card} options={options} />
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- Review & merge: the same client across Lead → Quote → PI ---------------- */

function PhasePanel({ kind, list, selected, onSelect, cards, onOpen }: {
  kind: CardKind; list: CardView[]; selected: CardView; onSelect: (id: string) => void; cards: Cards; onOpen: (id: string) => void;
}) {
  return (
    <section className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-surface ${STAGE_TONE[kind].ring}`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-3 ${STAGE_TONE[kind].head}`}>
        <h3 className="text-[16px] font-bold tracking-tight text-ink">{KIND_LABEL[kind]}</h3>
        <button className="text-[13px] font-semibold text-brand hover:underline" onClick={() => onOpen(selected.id)}>Open &amp; edit</button>
      </div>
      {list.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
          {list.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)} className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium ${c.id === selected.id ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:bg-line"}`}>
              {c.docNumber ?? c.name}
              {c.docDate && <span className="ml-1 opacity-70">· {fmtDate(c.docDate, { day: "numeric", month: "short" })}</span>}
              {/* Quotations are listed newest first; tag the newest so the right one is easy to pick. */}
              {kind === "quote" && c.id === list[0].id && <span className="ml-1.5 rounded bg-low px-1 py-px text-[10.5px] font-bold uppercase tracking-wide text-white">New</span>}
            </button>
          ))}
        </div>
      )}
      <Compact.Provider value={true}>
      <div className="space-y-2.5 p-3">
        {selected.docNumber && (
          <div className="px-1 text-[14px] text-muted">
            <span className="font-semibold text-ink">{selected.docNumber}</span>{selected.docDate && ` · ${dateLong(selected.docDate)}`}
            {selected.pi?.reference && <span className="block text-[12.5px]">References {selected.pi.reference}</span>}
          </div>
        )}
        <CustomerSection card={selected} />
        <ContactSection card={selected} />
        {kind === "potential" && <PotentialSection card={selected} />}
        {!isCustomerCard(kind) && <TrainingSection card={selected} compact />}
        {!isCustomerCard(kind) && <SalesSection card={selected} />}
        <ChainSection card={selected} cards={cards} />
      </div>
      </Compact.Provider>
    </section>
  );
}

export function MergeModal({ group, initialId, cards, member, options, onClose, onOpen }: {
  group: string[]; initialId: string; cards: Cards; member: Member; options: BoardOptions; onClose: () => void; onOpen: (cardId: string) => void;
}) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const members = group.map((id) => cards.get(id)).filter((c): c is CardView => !!c);
  const byKind = Object.fromEntries(STAGE_ORDER.map((k) => [k, members.filter((c) => c.kind === k)])) as Record<CardKind, CardView[]>;
  byKind.quote.sort(newestFirst);
  const kinds = STAGE_ORDER.filter((k) => byKind[k].length);
  // Opened from a Potential training card: just pick the quotation it goes into (see mergeCandidates).
  const potentialMode = cards.get(initialId)?.kind === "potential";

  const linked = (a?: CardView, b?: CardView) => Boolean(a && b && a.flaggedWith.includes(b.id));
  // Start from the clicked card and pick its linked partners: a quote's PI is the one referencing it.
  const [sel, setSel] = useState<Record<CardKind, string | undefined>>(() => {
    const clicked = cards.get(initialId);
    const s: Record<CardKind, string | undefined> = { potential: undefined, lead: undefined, quote: undefined, pi: undefined, invoice: undefined, payment: undefined };
    if (clicked) s[clicked.kind] = clicked.id;
    const partner = (k: CardKind, of?: string) => byKind[k].find((c) => of && c.flaggedWith.includes(of))?.id;
    s.quote ??= partner("quote", s.potential) ?? partner("quote", s.pi) ?? partner("quote", s.lead) ?? byKind.quote[0]?.id;
    s.pi ??= partner("pi", s.quote) ?? partner("pi", s.lead) ?? byKind.pi[0]?.id;
    s.lead ??= partner("lead", s.quote) ?? partner("lead", s.pi) ?? byKind.lead[0]?.id;
    s.potential ??= partner("potential", s.quote) ?? partner("potential", s.pi) ?? byKind.potential[0]?.id;
    s.invoice ??= partner("invoice", s.pi) ?? partner("invoice", s.quote) ?? byKind.invoice[0]?.id;
    s.pi ??= partner("pi", s.invoice);
    s.payment ??= partner("payment", s.invoice) ?? byKind.payment[0]?.id;
    s.invoice ??= partner("invoice", s.payment);
    return s;
  });
  const chosen = (k: CardKind) => byKind[k].find((c) => c.id === sel[k]) ?? byKind[k][0];
  // A quotation and a PI are only ever shown side by side when the PI's Zoho reference cites that quotation.
  const piOf = (q?: CardView) => (q ? byKind.pi.find((p) => refQuoteNumber(p.pi) === q.docNumber) : undefined);
  const quoteOf = (p?: CardView) => {
    const ref = refQuoteNumber(p?.pi);
    return ref ? byKind.quote.find((q) => q.docNumber === ref) : undefined;
  };
  const lead = chosen("lead");
  const potential = chosen("potential");
  const quote = chosen("quote");
  const picked = byKind.pi.find((c) => c.id === sel.pi);
  // A PI citing no quotation on the board stays when clicked; otherwise the PI is the selected quotation's.
  const orphanPI = picked && !quoteOf(picked) ? picked : undefined;
  const pi = quote ? piOf(quote) ?? orphanPI : chosen("pi");
  // No PI references the selected quotation: no PI panel (nor the invoice / payment after it).
  const shownKinds = kinds.filter((k) => pi || !(k === "pi" || k === "invoice" || k === "payment"));
  const invoice = pi ? chosen("invoice") : undefined;
  const payment = pi ? chosen("payment") : undefined;
  const selectCard = (k: CardKind, id: string) =>
    setSel((s) => {
      const next = { ...s, [k]: id };
      // Choosing a quotation brings up the PI that references it (or hides the PI panel if none does).
      if (k === "quote") {
        const p = piOf(byKind.quote.find((q) => q.id === id));
        next.pi = p?.id;
        if (p) next.invoice = byKind.invoice.find((v) => v.flaggedWith.includes(p.id))?.id ?? next.invoice;
      }
      // Choosing a PI brings up the quotation it references.
      if (k === "pi") next.quote = quoteOf(byKind.pi.find((p) => p.id === id))?.id ?? next.quote;
      // Choosing a PI brings up the invoice that references it.
      if (k === "pi") next.invoice = byKind.invoice.find((v) => v.flaggedWith.includes(id))?.id ?? next.invoice;
      // Choosing an invoice brings up the payment received against it.
      if (k === "invoice") next.payment = byKind.payment.find((v) => v.flaggedWith.includes(id))?.id ?? next.payment;
      return next;
    });

  const merge = (steps: [CardView, CardView][]) => {
    const evs = addCardEvents(steps.map(([from, to]) => ({ cardIds: [from.id, to.id], kind: "merge", before: cardLabel(from), value: cardLabel(to), by: member.name })));
    const target = steps[steps.length - 1][1];
    toast({
      text: steps.map(([f, t]) => `${KIND_LABEL[f.kind]} → ${KIND_LABEL[t.kind]}`).join(", ") + ` merged into ${cardLabel(target)}`,
      actionLabel: "Undo",
      onAction: () => evs.forEach((e) => revertCardEvent(e.id, member.name)),
    });
    onOpen(target.id);
  };

  // Only linked pairs can merge: Lead ↔ Quote by customer; Quote ↔ PI and completed PI ↔ Invoice by reference.
  // The customer's lead and Potential training card (either or both) merge in together.
  // A Potential training card can go into any of its customer's quotations in the Quotations column (the one you pick).
  const potentialFits = (to?: CardView) => Boolean(potential && to && (linked(potential, to)
    || (to.kind === "quote" && to.customerId === potential.customerId && !to.mergedInto && !to.deleted && !to.lost && !to.schedule)));
  const firsts = (to?: CardView) => [lead, potential].filter((c): c is CardView => Boolean(c) && (c!.kind === "potential" ? potentialFits(to) : linked(c, to)));
  const who = (list: CardView[]) => list.map((c) => (c.kind === "lead" ? "Lead" : "Potential")).join(" + ");
  const intoQuote = firsts(quote);
  const intoPI = firsts(pi);
  const lq = intoQuote.length > 0;
  const qp = linked(quote, pi);
  const lp = intoPI.length > 0;
  const actions: { label: string; steps: [CardView, CardView][]; primary?: boolean }[] = [];
  if (lq && qp) actions.push({ label: `Merge ${who(intoQuote)} → Quote → PI`, steps: [...intoQuote.map((c): [CardView, CardView] => [c, quote!]), [quote!, pi!]], primary: true });
  if (lq) actions.push({ label: `Merge ${who(intoQuote)} → Quote`, steps: intoQuote.map((c): [CardView, CardView] => [c, quote!]), primary: !qp });
  if (qp) actions.push({ label: "Merge Quote → PI", steps: [[quote!, pi!]], primary: !lq });
  if (lp) actions.push({ label: `Merge ${who(intoPI)} → PI`, steps: intoPI.map((c): [CardView, CardView] => [c, pi!]), primary: !lq && !qp });
  // Step by step: the invoice joins its payment only after (or together with) its completed training.
  const invPay = linked(invoice, payment);
  const invoiceReady = Boolean(invoice?.mergedFrom.some((id) => { const k = cards.get(id)?.kind; return k && !isCustomerCard(k); }));
  if (linked(pi, invoice) && invPay) actions.push({ label: "Merge PI → Invoice → Payment Received", steps: [[pi!, invoice!], [invoice!, payment!]], primary: true });
  if (linked(quote, invoice) && invPay) actions.push({ label: "Merge Quote → Invoice → Payment Received", steps: [[quote!, invoice!], [invoice!, payment!]], primary: true });
  if (linked(pi, invoice)) actions.push({ label: "Merge PI → Invoice", steps: [[pi!, invoice!]], primary: !invPay });
  if (linked(quote, invoice)) actions.push({ label: "Merge Quote → Invoice", steps: [[quote!, invoice!]], primary: !invPay });
  if (invPay && invoiceReady) actions.push({ label: "Merge Invoice → Payment Received", steps: [[invoice!, payment!]], primary: true });
  // PI / invoice links don't apply when a Potential training card is only choosing its quotation.
  const unlinked = potentialMode ? "" : invoice && payment && !linked(invoice, payment)
    ? payment.payment?.invoiceId === invoice.invoice?.invoiceId
      ? `Merge ${invoice.docNumber} with its completed training first — step by step, the invoice can only be merged with ${payment.docNumber} after that.`
      : `${payment.docNumber} is applied to invoice ${payment.payment?.invoiceNumber}, not ${invoice.docNumber} — only the invoice a payment is recorded against can be merged with it.`
    : pi && invoice && !linked(pi, invoice)
    ? `${invoice.docNumber} references ${invoice.invoice?.reference || "no PI"}, not ${pi.docNumber} — only an invoice that references a PI (with completed training) can be merged with it.`
    : quote && pi && !qp ? `${pi.docNumber} references ${pi.pi?.reference || "no quotation"}, not ${quote.docNumber} — only a PI that references a quotation can be merged with it.` : "";

  const name = lead?.name ?? potential?.name ?? quote?.name ?? pi?.name ?? invoice?.name ?? payment?.name ?? "";
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-[12.5px] text-muted">
        {unlinked && <span className="mb-1 block font-medium text-high">{unlinked}</span>}
        Merging carries the name, aliases, emails and numbers forward into the later card; the earlier card leaves its column. Each merge is recorded in Changes and can be reverted (unmerged) any time.
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.label} className={a.primary ? btn.primary : btn.ghost} onClick={() => merge(a.steps)}>{a.label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <Shell label="Review and merge" onClose={onClose} footer={footer} side={<ChangeLog cardIds={members.flatMap((c) => c.historyIds)} cards={cards} member={member} />}>
      <Header sub={`Same client in ${shownKinds.map((k) => KIND_LABEL[k]).join(", ")}`} title={name} flagged onClose={onClose} />
      <div className="flex items-stretch gap-2 p-3">
        {shownKinds.map((k, i) => (
          <div key={k} className="flex min-w-0 flex-1 items-stretch gap-2">
            {i > 0 && <div className="grid w-6 shrink-0 place-items-center text-[20px] font-bold text-faint" aria-hidden>→</div>}
            <PhasePanel kind={k} list={byKind[k]} selected={(k === "pi" ? pi : chosen(k))!} onSelect={(id) => selectCard(k, id)} cards={cards} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </Shell>
  );
}


/* ---------------- Potential training: add a Zoho customer by hand ---------------- */

/** Search over every active Zoho customer (the list Leads is built from); name, alias, phone or email. */
function CustomerSearch({ customers, taken, onPick }: { customers: CardView[]; taken: Set<string>; onPick: (c: CardView) => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return [];
    const hits = customers.filter((c) => c.search.includes(needle));
    const starts = (c: CardView) => c.name.toLowerCase().startsWith(needle);
    return [...hits.filter(starts), ...hits.filter((c) => !starts(c))].slice(0, 40);
  }, [customers, needle]);
  const first = results.find((c) => !taken.has(c.customerId));
  return (
    <div>
      <div className="relative">
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" strokeLinecap="round" /></svg>
        <input
          className={`${inputCls} !h-9 pl-8 text-[14px]`}
          placeholder={`Search ${customers.length.toLocaleString("en-IN")} Zoho customers — name, phone or email`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && first && (e.preventDefault(), onPick(first))}
          aria-label="Search customer"
          autoFocus
        />
      </div>
      {needle && (
        <ul className="no-scrollbar mt-2 max-h-[44vh] overflow-y-auto rounded-xl border border-line bg-surface">
          {results.length === 0 && <li className="px-3 py-3 text-[13px] text-muted">No Zoho customer matches “{q.trim()}”.</li>}
          {results.map((c) => {
            const already = taken.has(c.customerId);
            return (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  disabled={already}
                  onClick={() => onPick(c)}
                  className="block w-full px-3 py-2 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ink">{c.name}</span>
                    {already && <span className="shrink-0 rounded bg-surface-2 px-1.5 py-px text-[11px] font-medium text-muted">Already in Potential training</span>}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {[c.phones[0]?.value, c.emails[0]?.value, c.customerSince && `Created ${dateLong(c.customerSince)}`].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export function AddPotentialModal({ cards, member, onClose }: { cards: Cards; member: Member; onClose: () => void }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const [picked, setPicked] = useState<CardView | null>(null);
  const [month, setMonth] = useState("");
  const customers = useMemo(() => [...cards.values()].filter((c) => c.kind === "lead").sort((a, b) => a.name.localeCompare(b.name)), [cards]);
  // One open Potential training card per customer.
  const taken = useMemo(() => new Set([...cards.values()].filter((c) => c.kind === "potential" && !c.deleted && !c.mergedInto).map((c) => c.customerId)), [cards]);

  const add = () => {
    if (!picked || taken.has(picked.customerId)) return;
    const [ev] = addCardEvents([{ cardIds: [potentialCardId(newId())], kind: "add_potential", ref: picked.customerId, value: month || undefined, by: member.name }]);
    toast({ text: `Added ${picked.name} to Potential training`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    onClose();
  };

  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn.primary} onClick={add} disabled={!picked}>Add to Potential training</button>
      <button className={btn.ghost} onClick={onClose}>Cancel</button>
      {!picked && <span className="text-[13px] text-muted">Pick a customer to continue.</span>}
    </div>
  );
  const side = (
    <div className="p-5">
      <h3 className="text-[16px] font-bold tracking-tight text-ink">Changes</h3>
      <p className="text-[12.5px] text-muted">Once the card is added, every change to it shows here and can be reverted.</p>
    </div>
  );

  return (
    <Shell label="Add potential training" onClose={onClose} footer={footer} side={side}>
      <Header kind="potential" sub="New card · pick a Zoho customer" title={picked?.name ?? "Add a customer"} onClose={onClose} />
      <div className="grid gap-3 p-4 xl:grid-cols-2">
        <div className="space-y-3">
          <Section title="Customer">
            <dl>
              <Row label="Customer name" required>
                {picked ? (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-semibold text-ink">{picked.name}</span>
                    <button className={`${btn.quiet} shrink-0`} onClick={() => setPicked(null)}>Change</button>
                  </div>
                ) : (
                  <CustomerSearch customers={customers} taken={taken} onPick={setPicked} />
                )}
              </Row>
              {picked && (
                <>
                  <Row label="Customer type">{picked.type ?? <span className="text-faint">—</span>}</Row>
                  <Row label="Sector">{picked.sector ?? <span className="text-faint">—</span>}</Row>
                  <Row label="Created in Zoho" locked>{picked.customerSince ? dateLong(picked.customerSince) : "—"}</Row>
                </>
              )}
            </dl>
          </Section>
          {picked && <ContactSection card={picked} />}
        </div>
        <div className="space-y-3">
          <Section title="Potential training">
            <div className="rounded-xl bg-brand-soft px-4 py-3">
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-brand">Expected training (approx.)</div>
              <div className="flex flex-wrap items-center gap-2">
                <MonthInput value={month} onChange={setMonth} />
                {month && <button className={btn.quiet} onClick={() => setMonth("")}>Clear</button>}
              </div>
            </div>
            <p className="mt-2 text-[13px] text-muted">
              Optional — a rough month, kept for reminders later; change it any time. The card stays in Potential training until a new quotation for this customer syncs from Zoho Books, then it can be merged into it like a lead.
            </p>
          </Section>
        </div>
      </div>
    </Shell>
  );
}
