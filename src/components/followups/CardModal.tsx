"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CardEvent, CardEventKind, Member, Phase, ZohoInvoice, ZohoPayment } from "@/lib/types";
import {
  type CardKind, type CardView, type ContactEntry, type ScheduleStatus, type TrainingSchedule, KIND_LABEL, STAGE_ORDER, STAGE_RANK, TRAINERS,
  type DueStatus, type DueTone, busyTrainers, cardDue, cardLabel, columnQuotes, daysValue, partPaidText, receivedOn, externalTrainers, fmtDays, newestFirst, orderTrainers, refQuoteNumber, completionNotApplied, describeEvent, fmtMonth, isCustomerCard, kindOfId, mergeNotApplied, potentialCardId, normEmail, normPhone, phaseOf, salespersonLabel, sameWords,
} from "@/lib/pipeline";
import { fmtDate, fmtINR, fmtTime } from "@/lib/dates";
import { zohoUrl } from "@/lib/zohoLinks";
import { useStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { Avatar, IconButton, Segmented, btn, inputCls, selectCls } from "../ui";
import { DaysPicker } from "./DaysPicker";
import { celebrate } from "@/lib/confetti";
import { canRevert } from "@/lib/roles";

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

export function Lock() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Locked — synced from Zoho Books">
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

/** Inside the narrow merge panels, sections go flat and labels sit above values. */
const Compact = createContext(false);
/** Merge view with 3 or more cards open: every panel puts labels above values (narrow panels), the same in all of them. */
const Stacked = createContext(false);

/** Inside a popup form, the pickers become rows: label and hint on the left, the control on the right. */
const FormRows = createContext(false);

function FieldRow({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-1.5 border-t border-line py-3.5 first:border-t-0 sm:grid-cols-[208px_minmax(0,1fr)]">
      <div>
        <div className="pt-1.5 text-[13.5px] font-semibold leading-snug text-ink">{label}{required && <span className="text-high"> *</span>}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-muted">{hint}</div>}
      </div>
      <div className="min-w-0 sm:pt-0">{children}</div>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children?: React.ReactNode }) {
  const compact = useContext(Compact);
  return (
    <section className={compact ? "border-t border-line px-1 pt-2.5 first:border-t-0 first:pt-0" : "rounded-2xl border border-line bg-surface px-4 py-3.5"}>
      <div className={`flex items-center justify-between gap-2 ${children ? (compact ? "mb-1.5" : "mb-2") : ""}`}>
        <h3 className={`font-bold tracking-tight text-ink ${compact ? "text-[14px]" : "text-[16px]"}`}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, required, locked, children }: { label: string; required?: boolean; locked?: boolean; children: React.ReactNode }) {
  const compact = useContext(Compact);
  const stacked = useContext(Stacked);
  return (
    // Merge panels: label beside the value with one or two panels; above it once three or more share the width.
    <div className={`grid border-b border-line first:pt-0 last:border-b-0 last:pb-0 ${!compact ? "grid-cols-[150px_1fr] gap-4 py-2" : stacked ? "gap-0.5 py-1.5" : "grid-cols-[118px_1fr] gap-2 py-1.5"}`}>
      <dt className={`flex items-start gap-1 pt-0.5 font-medium text-muted ${compact ? "text-[12px]" : "text-[13px]"}`}>
        {label}
        {required && <span className="text-high">*</span>}
        {locked && <Lock />}
      </dt>
      <dd className={`min-w-0 text-ink-2 break-words ${compact ? "text-[13px]" : "text-[14px]"}`}>{children}</dd>
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

/**
 * Adding an alias: tidy spaces; the same alias in other capitals (or the customer's own name) isn't added twice; one a
 * letter or two away from an existing one ("Rajajinnagar" / "Rajajinagar") asks first — Add again keeps it.
 */
function useAliasInput(aliases: string[], customerName: string, onAdd: (a: string) => void) {
  const [text, setText] = useState("");
  const [warn, setWarn] = useState("");
  const [near, setNear] = useState<string>();
  const add = (fromBlur = false) => {
    const a = tidy(text);
    if (!a) return;
    if (sameWords(a, customerName)) return (setWarn("That's the customer's own name."), setNear(undefined));
    const dup = aliases.find((x) => sameWords(x, a));
    if (dup) return (setWarn(`Already an alias: “${dup}”.`), setNear(undefined));
    const close = closeTo(a, aliases);
    if (close && near !== a) {
      if (!fromBlur) (setNear(a), setWarn(`Close to “${close}” — a typo? Add again to keep “${a}”.`));
      return;
    }
    onAdd(a);
    setText("");
    setWarn("");
    setNear(undefined);
  };
  const change = (v: string) => { setText(v); setWarn(""); setNear(undefined); };
  return { text, change, add, warn };
}

/**
 * The customer's aliases and the concerned person's name, from any board (owner, 15 Oct): neither is required, and both
 * show on every card under the customer's name. An alias is anything the team knows the customer by; the name is only
 * a person.
 */
function CustomerNamesEditor({ card, onClose }: { card: CardView; onClose: () => void }) {
  const { addCardEvents } = useStore();
  const { member } = useSession();
  const [aliases, setAliases] = useState(card.aliases);
  const [name, setName] = useState(card.concernedName ?? "");
  const input = useAliasInput(aliases, card.name, (a) => setAliases([...aliases, a]));
  const why = notAPerson(name);
  const changed = aliases.join("\u0000") !== card.aliases.join("\u0000") || tidy(name) !== (card.concernedName ?? "");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), onClose()); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const save = () => {
    if (!member || why) return;
    const base = { cardIds: [card.id], ref: card.customerId, by: member.name };
    addCardEvents([
      ...card.aliases.filter((a) => !aliases.includes(a)).map((a) => ({ ...base, kind: "remove_alias" as const, value: a })),
      ...aliases.filter((a) => !card.aliases.includes(a)).map((a) => ({ ...base, kind: "add_alias" as const, value: a })),
      ...(tidy(name) !== (card.concernedName ?? "") ? [{ ...base, kind: "set_concerned_name" as const, value: tidy(name), before: card.concernedName ?? "" }] : []),
    ]);
    onClose();
  };
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-label="Aliases and concerned person" className="modal-in w-full max-w-[640px] rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-6 pb-4 pt-5">
          <h3 className="text-[18px] font-bold tracking-tight text-ink">{card.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">Shows on every card of this customer, on every board. Neither is required.</p>
        </div>
        <FormRows.Provider value={true}>
          <div className="border-y border-line px-6">
            <FieldRow label="Aliases" hint="Anything the team knows them by — a person, a hotel, a short name" required={false}>
              <span className="flex flex-wrap items-center gap-1.5">
                {aliases.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-ink-2">
                    {a}
                    <button type="button" aria-label={`Remove alias ${a}`} className="text-faint hover:text-high" onClick={() => setAliases(aliases.filter((x) => x !== a))}>×</button>
                  </span>
                ))}
                <input className={`${inputCls} !h-8 !w-56 text-[13px]`} placeholder="+ Add alias" value={input.text} onChange={(e) => input.change(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), input.add())} aria-label="New alias" />
                <button type="button" className={`${btn.ghost} !h-8 !px-3`} disabled={!input.text.trim()} onClick={() => input.add()}>Add</button>
                {input.warn && <span className="w-full text-[12px] font-medium text-medium">{input.warn}</span>}
              </span>
            </FieldRow>
            <NamePicker value={name} onChange={setName} />
          </div>
        </FormRows.Provider>
        <div className="flex justify-end gap-2 px-6 py-4">
          <button className={btn.ghost} onClick={onClose}>Cancel</button>
          <button className={btn.primary} disabled={!changed || Boolean(why) || Boolean(input.text.trim())} title={input.text.trim() ? "Add or clear the alias you typed first" : undefined} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function CustomerSection({ card }: { card: CardView }) {
  const { member } = useSession();
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [card.id]);
  const close = useCallback(() => setEditing(false), []);
  return (
    <Section
      title="Customer"
      aside={member && !card.deleted && (
        <button type="button" className="text-[12.5px] font-semibold text-brand hover:underline" onClick={() => setEditing(true)} title="Aliases and the concerned person's name — on every card of this customer">
          Aliases &amp; contact person
        </button>
      )}
    >
      <dl>
        <Row label="Customer name" required>
          <div className="text-[15px] font-semibold text-ink">{card.name}</div>
          {card.aliases.length > 0 && <div className="mt-0.5 text-[13px] text-muted">Also known as {card.aliases.join(", ")}</div>}
          {card.concernedName && <div className="mt-0.5 text-[13px] text-muted">Concerned person: <span className="font-medium text-ink-2">{card.concernedName}</span></div>}
        </Row>
        <Row label="Customer type">{card.type ?? <span className="text-faint">—</span>}</Row>
        <Row label="Sector">{card.sector ?? <span className="text-faint">—</span>}</Row>
        <Row label="Created in Zoho" locked>{card.customerSince ? dateLong(card.customerSince) : "—"}</Row>
      </dl>
      {editing && <CustomerNamesEditor card={card} onClose={close} />}
    </Section>
  );
}

export function ContactSection({ card }: { card: CardView }) {
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
/** Expected training: a rough month, or an exact date when it's known ("YYYY-MM" / "YYYY-MM-DD"). */
function MonthInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [mode, setMode] = useState<"month" | "date">(value.length === 10 ? "date" : "month");
  const switchTo = (m: "month" | "date") => {
    setMode(m);
    // An exact date keeps its month; a month doesn't guess a day.
    onChange(m === "month" ? value.slice(0, 7) : "");
  };
  const cls = `${inputCls} !h-9 !w-auto text-[13px]`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={mode} onChange={switchTo} options={[{ value: "month", label: "Month" }, { value: "date", label: "Exact date" }]} />
      {mode === "month" ? (
        <input type="month" className={cls} value={value.slice(0, 7)} min={thisMonth()} onChange={(e) => onChange(e.target.value)} aria-label="Expected training month" autoFocus={autoFocus} />
      ) : (
        <input type="date" className={cls} value={value.length === 10 ? value : ""} min={new Date().toLocaleDateString("en-CA")} onChange={(e) => onChange(e.target.value)} aria-label="Expected training date" autoFocus={autoFocus} />
      )}
    </div>
  );
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
                <button className={btn.ghost} onClick={() => { setMonth(expected ?? ""); setEditing(true); }}>{expected ? "Change" : "Set month or date"}</button>
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

/** Invoice payment status: blue due, red overdue, yellow part paid, green paid. The card border matches. */
export const DUE_TONE: Record<DueTone, { border: string; chip: string }> = {
  overdue: { border: "border-high", chip: "bg-high-bg text-high" },
  due: { border: "border-info", chip: "bg-info-bg text-info" },
  part: { border: "border-medium", chip: "bg-medium-bg text-medium" },
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
export function PaymentSection({ card, cards }: { card: CardView; cards: Cards }) {
  const inv = card.kind === "invoice" ? card.invoice : card.kind === "payment" ? card.linkedInvoice : undefined;
  if (!inv) return null;
  const due = cardDue(card);
  const payments = invoicePayments(inv.invoiceId, cards);
  return (
    <Section title="Payment" aside={due && <DueChip due={due} big />}>
      {/* One line, so the modal still fits without scrolling; several payments open in a small window. */}
      <p className="text-[14px] text-ink-2">
        Due <b className="text-ink">{inv.dueDate ? dateLong(inv.dueDate) : "—"}</b>
        {inv.balance !== undefined && inv.balance > 0 && <> · <b className="num text-ink">{fmtINR(inv.balance)}</b> still due</>}
        {payments.length === 0 ? (
          <span className="text-muted"> · not paid yet</span>
        ) : payments.length === 1 ? (
          <span> · Paid <b className="text-ink">{dateLong(payments[0].date)}</b> <span className="text-muted">({fmtINR(payments[0].amount)}{payments[0].tdsWithheld ? ` + TDS ${fmtINR(payments[0].tdsWithheld)}` : ""}, Payment #{payments[0].number})</span></span>
        ) : (
          <> · <PaymentsLink invoice={inv} payments={payments} /></>
        )}
      </p>
    </Section>
  );
}

/** Every payment recorded against an invoice (all instalments), oldest first. */
function invoicePayments(invoiceId: string, cards: Cards) {
  return [...cards.values()].filter((c) => c.kind === "payment" && c.payment?.invoiceId === invoiceId).map((c) => c.payment!)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.number) - Number(b.number));
}

/** "Received ₹1,81,440 in 2 payments · Show all PRs" — the list opens in a small window over the card. */
export function PaymentsLink({ invoice, payments }: { invoice: ZohoInvoice; payments: ZohoPayment[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), setOpen(false)); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const received = payments.reduce((s, p) => s + p.amount, 0);
  const tds = payments.reduce((s, p) => s + (p.tdsWithheld ?? 0), 0);
  const got = receivedOn(payments);
  const total = invoice.total ?? 0;
  return (
    <>
      Received <b className="num text-ink">{fmtINR(received)}</b>{tds > 0 && <> + TDS <b className="num text-ink">{fmtINR(tds)}</b></>} in {payments.length} payment{payments.length === 1 ? "" : "s"}{" "}
      <button className="font-semibold text-brand hover:underline" onClick={() => setOpen(true)}>Show all PRs</button>
      {open && (
        <span className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={() => setOpen(false)}>
          <span role="alertdialog" aria-label="Payments received" className="modal-in block w-full max-w-lg rounded-2xl bg-surface p-5 text-left shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
            <span className="flex items-center justify-between gap-2">
              <span className="text-[16px] font-bold tracking-tight text-ink">Payments received · {invoice.number}</span>
              <button className={btn.quiet} onClick={() => setOpen(false)}>Close</button>
            </span>
            <span className="no-scrollbar mt-3 block max-h-[50vh] overflow-y-auto rounded-xl border border-line">
              {payments.map((p) => (
                <span key={p.paymentId} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-line px-3 py-2 last:border-b-0">
                  <span className="text-[13.5px] font-semibold text-ink">Payment #{p.number}</span>
                  <span className="num text-right text-[13.5px] font-semibold text-low">{fmtINR(p.amount)}</span>
                  <span className="text-[12.5px] text-muted">{dateLong(p.date)}{p.mode && ` · ${p.mode}`}{p.reference && ` · Ref# ${p.reference}`}</span>
                  {(p.tdsWithheld ?? 0) > 0 && <span className="num text-right text-[12.5px] text-muted">+ TDS {fmtINR(p.tdsWithheld!)}</span>}
                </span>
              ))}
            </span>
            {/* Payments + TDS against the invoice total: the invoice merges with its payments only when they match. */}
            <span className="mt-3 flex flex-wrap justify-between gap-2 text-[13.5px] text-ink-2">
              <span>
                Received <b className="num text-ink">{fmtINR(received)}</b>{tds > 0 && <> + TDS <b className="num text-ink">{fmtINR(tds)}</b> = <b className="num text-ink">{fmtINR(got)}</b></>} of <b className="num text-ink">{fmtINR(total)}</b>
              </span>
              {got >= total - 0.5
                ? <span className="font-semibold text-low">Paid in full</span>
                : <span className="font-semibold text-high">{fmtINR(total - got)} still due</span>}
            </span>
          </span>
        </span>
      )}
    </>
  );
}

/** Border: green whenever there's a date (postponed keeps its yellow badge), red when to be decided. */
export const SCHEDULE_TONE: Record<ScheduleStatus, { border: string; chip: string; label: string }> = {
  scheduled: { border: "border-low", chip: "bg-low-bg text-low", label: "Scheduled" },
  postponed: { border: "border-low", chip: "bg-medium-bg text-medium", label: "Postponed" },
  tbd: { border: "border-high", chip: "bg-high-bg text-high", label: "To be decided" },
};

export const scheduleText = (s: TrainingSchedule) => (s.status === "tbd" || !s.dates.length ? "To be decided" : fmtDays(s.dates.join(",")));
const todayYmd = () => new Date().toLocaleDateString("en-CA");

// TEMPORARY (Oct 2026): past training dates are allowed so the team can back-fill old trainings.
// Set to false to go back to “dates can’t be in the past”.
const ALLOW_PAST_TRAINING_DATES = true;
export const minTrainingDate = () => (ALLOW_PAST_TRAINING_DATES ? undefined : todayYmd());
export const dateAllowed = (d: string) => Boolean(d) && (ALLOW_PAST_TRAINING_DATES || d >= todayYmd());

/**
 * Certificates, per training (owner, 15 Oct): the certificate location name printed as "course conducted at" ("" = the
 * customer's own name, null = not chosen yet) and the concerned person's email — both required to schedule — plus the
 * concerned person's name (optional, per customer name, only a person).
 */
export type CertChoice = { location: string | null; email: string; name: string };
type ScheduleFn = (value: string, trainers?: string[], mode?: "change", cert?: CertChoice) => void;

/** What the pickers start from: this training's own, else (a new training) the customer's latest email. */
export const certOf = (card: CardView): CertChoice => ({ location: card.certLocation ?? null, email: card.concernedEmail ?? card.lastEmail ?? "", name: card.concernedName ?? "" });
const tidy = (v: string) => v.trim().replace(/\s+/g, " ");
/** Both chosen: a location (or "Same as original") and a valid email; a name, if given, looks like a person's. */
export const certReady = (c: CertChoice) => c.location !== null && EMAIL_RE.test(c.email.trim()) && !notAPerson(c.name);
const sameCert = (a: CertChoice, b: CertChoice) => a.location === b.location && normEmail(a.email) === normEmail(b.email) && tidy(a.name) === tidy(b.name);

/** Saved on the set_training_date entry itself — the server refuses a date without them. */
export const certFields = (c: CertChoice) => ({ location: tidy(c.location ?? ""), email: c.email.trim() });

/**
 * Words that make a "concerned person's name" a company or a place — that belongs in Alias (or the location). Also no
 * digits or emails. Returns why, or "" when it reads like a person.
 */
const PLACE_WORDS = /\b(hotels?|resorts?|spa|villas?|ltd|limited|pvt|private|llp|inc|company|corp|corporation|group|hospitals?|university|college|school|institute|services|solutions|technologies|india|marriott|westin|hyatt|sheraton|fairfield|courtyard|novotel|radisson|oberoi|itc|plaza|towers?|mall|office|branch|campus|pune|mumbai|bengaluru|bangalore|delhi|hyderabad|chennai|goa)\b/i;
export function notAPerson(name: string): string {
  const n = tidy(name);
  if (!n) return "";
  if (/[@\d]/.test(n)) return "Only a person's name here — no numbers or emails.";
  const w = n.match(PLACE_WORDS)?.[0];
  return w ? `“${w}” looks like a company or place — only a person's name here (add places as an Alias).` : "";
}

/** Two spellings of the same thing ("Rajajinnagar" / "Rajajinagar"): at most 2 letters apart, ignoring case and spaces. */
export function closeTo(v: string, list: string[]): string | undefined {
  const a = tidy(v).toLowerCase();
  if (a.length < 5) return list.find((x) => sameWords(x, v));
  const dist = (s: string, t: string) => {
    if (Math.abs(s.length - t.length) > 2) return 3;
    let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
    for (let i = 1; i <= s.length; i++) {
      const cur = [i];
      for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[t.length];
  };
  return list.find((x) => dist(a, tidy(x).toLowerCase()) <= 2);
}

/**
 * The entries a choice makes. The location and email belong to this training: with a new date they ride on the
 * set_training_date entry (`onDate`), otherwise they're their own entries — on the training's card (Shreya: on her
 * Fulfillment card). The concerned person's name goes to every card under the customer's name.
 */
export function certEvents(card: CardView, cert: CertChoice | undefined, by: string, onDate = false): Omit<CardEvent, "id" | "at">[] {
  if (!cert) return [];
  const target = card.id.startsWith("fulfil:") ? card.id : card.schedule?.on ?? card.id;
  const base = { cardIds: [target], ref: card.customerId, by };
  const location = cert.location === null ? null : tidy(cert.location);
  const email = cert.email.trim();
  const name = tidy(cert.name);
  return [
    ...(!onDate && location !== null && !card.certLocked && location !== (card.certLocation ?? null) ? [{ ...base, kind: "set_cert_location" as const, value: location, before: card.certLocation ?? "" }] : []),
    ...(!onDate && email && normEmail(email) !== normEmail(card.concernedEmail ?? "") ? [{ ...base, kind: "set_training_email" as const, value: email, before: card.concernedEmail ?? "" }] : []),
    ...(name !== (card.concernedName ?? "") ? [{ cardIds: [card.id], ref: card.customerId, by, kind: "set_concerned_name" as const, value: name, before: card.concernedName ?? "" }] : []),
  ];
}

/** A picker's own row: label, what it's used for, then the control. */
function PickerRow({ label, hint, required = true, children }: { label: string; hint: string; required?: boolean; children: React.ReactNode }) {
  if (useContext(FormRows)) {
    return (
      <FieldRow label={label} hint={hint[0].toUpperCase() + hint.slice(1)} required={required}>
        <span className="flex flex-wrap items-center gap-1.5">{children}</span>
      </FieldRow>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[12px] font-bold uppercase tracking-wide text-brand">{label}{required && <span className="text-high"> *</span>}</span>
      <span className="text-[12px] text-muted">({hint})</span>
      <span className="inline-flex flex-wrap items-center gap-1.5">{children}</span>
    </div>
  );
}

/** Certificate location name, the concerned person's email and name, each on its own row. */
function CertPickers({ card, value, onChange }: { card: CardView; value: CertChoice; onChange: (v: CertChoice) => void }) {
  const pickers = <>
    <LocationPicker card={card} value={value.location} onChange={(location) => onChange({ ...value, location })} />
    <EmailPicker card={card} value={value.email} onChange={(email) => onChange({ ...value, email })} />
    <NamePicker value={value.name} onChange={(name) => onChange({ ...value, name })} />
  </>;
  return useContext(FormRows) ? pickers : <div className="space-y-1.5">{pickers}</div>;
}

/** The concerned person's name — optional, only a person; greets them in the gratitude email, on every card of the customer. */
function NamePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const rows = useContext(FormRows);
  const why = notAPerson(value);
  return (
    <PickerRow label="Concerned person’s name" hint="optional — only a person; greets them in the gratitude email" required={false}>
      <input
        className={`${inputCls} !h-8 ${pickerWidth(rows, "!w-56")} text-[13px]`}
        placeholder="e.g. Roohi Khanna"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Concerned person's name"
        aria-invalid={Boolean(why)}
        maxLength={80}
      />
      {why && <span className="w-full text-[12px] font-medium text-high">{why}</span>}
    </PickerRow>
  );
}

/** The dropdowns: one width inside a popup form, as narrow as their text in the inline schedule row. */
const pickerWidth = (rows: boolean, inline: string) => (rows ? "w-full max-w-[360px]" : inline);

/**
 * The concerned person's email for this training: the customer's latest one, one of their emails ("Same as original"
 * — there can be several), or a new one.
 */
export function EmailPicker({ card, value, onChange }: { card: CardView; value: string; onChange: (v: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const NEW = "\u0000new";
  const own = card.emails.find((e) => normEmail(e.value) === normEmail(value))?.value;
  const last = card.lastEmail && !card.emails.some((e) => normEmail(e.value) === normEmail(card.lastEmail!)) ? card.lastEmail : undefined;
  const ok = EMAIL_RE.test(text.trim());
  const use = () => { if (ok) { onChange(text.trim()); setAdding(false); } };
  const rows = useContext(FormRows);
  return (
    <PickerRow label="Concerned person’s email" hint="for this training — the gratitude email and the List of Participants">
      {adding ? (
        <>
          <input
            type="email"
            className={`${inputCls} !h-8 !w-56 text-[13px]`}
            placeholder="name@company.com"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); use(); } }}
            aria-label="New email"
            autoFocus
          />
          <button type="button" className={`${btn.ghost} !h-8 !px-3`} disabled={!ok} onClick={use}>Use email</button>
          <button type="button" className={`${btn.quiet} !h-8`} onClick={() => setAdding(false)}>Cancel</button>
        </>
      ) : (
        <select
          className={`${selectCls} !h-8 ${pickerWidth(rows, "w-auto max-w-[300px]")} truncate`}
          value={own ?? value}
          onChange={(e) => (e.target.value === NEW ? (setText(""), setAdding(true)) : onChange(e.target.value))}
          aria-label="Concerned person's email"
        >
          <option value="" disabled>Select an email…</option>
          {last && <optgroup label="Used last time"><option value={last}>{last}</option></optgroup>}
          {card.emails.length > 0 && (
            <optgroup label="Same as original">
              {card.emails.map((e) => <option key={e.value} value={e.value}>{e.value}</option>)}
            </optgroup>
          )}
          {value && !own && value !== last && <option value={value}>{value}</option>}
          <option value={NEW}>+ Add new…</option>
        </select>
      )}
    </PickerRow>
  );
}

/**
 * Certificate location name (printed as "course conducted at"), for this training: the customer's own name, a location
 * used before, one of their aliases, or a new one. A new one close to an existing spelling asks first.
 */
function LocationPicker({ card, value, onChange }: { card: CardView; value: string | null; onChange: (v: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [near, setNear] = useState<string>();
  const NEW = "\u0000new";
  const NONE = "\u0000none";
  const used = card.certLocations ?? [];
  const aliases = card.aliases.filter((a) => !used.some((u) => sameWords(u, a)));
  const known = [...used, ...aliases];
  const rows = useContext(FormRows);
  const label = "Certificate location name";
  const hint = "printed on the certificates as “course conducted at” — for this training";
  if (card.certLocked) {
    return (
      <PickerRow label={label} hint="locked — the certificates are made">
        <span className="text-[13px] font-semibold text-ink">{value || card.name}</span>
      </PickerRow>
    );
  }
  const use = (force = false) => {
    const t = tidy(text);
    if (!t) return;
    const same = known.find((x) => sameWords(x, t)) ?? (sameWords(card.name, t) ? "" : undefined);
    if (same !== undefined) return (onChange(same), setAdding(false), setNear(undefined));
    const close = force ? undefined : closeTo(t, [...known, card.name]);
    if (close) return setNear(close);
    onChange(t);
    setAdding(false);
    setNear(undefined);
  };
  return (
    <PickerRow label={label} hint={hint}>
      {adding ? (
        <>
          <input
            className={`${inputCls} !h-8 !w-56 text-[13px]`}
            placeholder="e.g. JW Marriott Mumbai Sahar"
            value={text}
            onChange={(e) => { setText(e.target.value); setNear(undefined); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); use(Boolean(near)); } }}
            aria-label="New certificate location name"
            autoFocus
          />
          <button type="button" className={`${btn.ghost} !h-8 !px-3`} disabled={!text.trim()} onClick={() => use(Boolean(near))}>{near ? "Keep mine" : "Use location"}</button>
          <button type="button" className={`${btn.quiet} !h-8`} onClick={() => { setAdding(false); setNear(undefined); }}>Cancel</button>
          {near && (
            <span className="w-full text-[12px] font-medium text-medium">
              Close to “{near}” — a typo?{" "}
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => { onChange(near === card.name ? "" : near); setAdding(false); setNear(undefined); }}>Use “{near}”</button>
            </span>
          )}
        </>
      ) : (
        <select
          className={`${selectCls} !h-8 ${pickerWidth(rows, "w-auto max-w-[260px]")} truncate`}
          value={value ?? NONE}
          onChange={(e) => (e.target.value === NEW ? (setText(""), setNear(undefined), setAdding(true)) : onChange(e.target.value))}
          aria-label="Certificate location name"
          title={value === null ? "Choose the name printed on the certificates" : value || `Same as original: ${card.name}`}
        >
          {value === null && <option value={NONE} disabled>Select…</option>}
          <option value="">Same as original — {card.name}</option>
          {used.length > 0 && <optgroup label="Used before">{used.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>}
          {aliases.length > 0 && <optgroup label="Aliases">{aliases.map((a) => <option key={a} value={a}>{a}</option>)}</optgroup>}
          {value && !known.includes(value) && <option value={value}>{value} (new)</option>}
          <option value={NEW}>+ New location…</option>
        </select>
      )}
    </PickerRow>
  );
}
type BusyFn = (dates: string[]) => Map<string, CardView>;

const chipCls = (on: boolean, off?: boolean) =>
  `inline-flex h-8 items-center gap-1.5 rounded-full border bg-surface px-2.5 text-[13px] ${off ? "cursor-not-allowed border-line text-faint" : on ? "cursor-pointer border-brand font-medium text-ink" : "cursor-pointer border-line text-ink-2 hover:border-line-strong"}`;

/**
 * Trainer checkboxes; anyone already running another training on one of the days is greyed out.
 * "External trainer" takes any name; names typed before (on any card) come back as suggestions.
 */
function TrainerPicker({ selected, onChange, busy, days, after }: { selected: string[]; onChange: (t: string[]) => void; busy: Map<string, CardView>; days: number; after?: React.ReactNode }) {
  const { cardEvents } = useStore();
  const externals = selected.filter((t) => !TRAINERS.includes(t));
  const [external, setExternal] = useState(externals.length > 0);
  const [name, setName] = useState("");
  // The name box closes after a name is added (one row less); "+" opens it again.
  const [addingMore, setTyping] = useState(false);
  const typing = addingMore || externals.length === 0;
  const known = useMemo(() => externalTrainers(cardEvents), [cardEvents]);
  const needle = name.trim().toLowerCase();
  const has = (n: string) => selected.some((t) => t.toLowerCase() === n.toLowerCase());
  const suggestions = known.filter((n) => !has(n) && (!needle || n.toLowerCase().includes(needle))).slice(0, 8);
  const taken = selected.filter((t) => busy.has(t)).concat(TRAINERS.filter((t) => busy.has(t) && !selected.includes(t)));
  const add = (raw: string) => {
    const n = raw.trim().replace(/\s+/g, " ");
    if (!n) return;
    const own = TRAINERS.find((t) => t.toLowerCase() === n.toLowerCase()); // typed one of ours: tick them instead
    if (!has(own ?? n)) onChange([...selected, own ?? n]);
    setName("");
    setTyping(false);
  };
  const toggleExternal = (on: boolean) => {
    setExternal(on);
    if (!on) onChange(selected.filter((t) => TRAINERS.includes(t)));
  };
  const rows = useContext(FormRows);
  const body = (
    <div>
      <div role="group" aria-label="Trainers" className="flex flex-wrap items-center gap-1.5">
        {!rows && <span className="mr-1 text-[12px] font-bold uppercase tracking-wide text-brand">Trainers</span>}
        {TRAINERS.map((t) => {
          const other = busy.get(t);
          const on = selected.includes(t) && !other;
          return (
            <label key={t} title={other ? `Already training ${other.name} then` : undefined} className={chipCls(on, Boolean(other))}>
              <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={on} disabled={Boolean(other)} onChange={(e) => onChange(e.target.checked ? [...selected, t] : selected.filter((x) => x !== t))} />
              {t}
            </label>
          );
        })}
        <label className={chipCls(external)}>
          <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={external} onChange={(e) => toggleExternal(e.target.checked)} />
          External trainer
        </label>
        {/* Same wrapping row, so the modal grows as little as possible. */}
        {external && <>
          {externals.map((t) => {
            const other = busy.get(t);
            return (
              <span key={t} title={other ? `Already training ${other.name} then` : undefined} className={`inline-flex h-8 items-center gap-1 rounded-full border bg-surface pl-2.5 pr-1 text-[13px] ${other ? "border-line text-faint line-through" : "border-brand font-medium text-ink"}`}>
                {t}
                <button type="button" className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={() => onChange(selected.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                  <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
                </button>
              </span>
            );
          })}
          {typing ? (
            <span className="flex items-center gap-1.5">
              <input
                className={`${inputCls} !h-8 !w-48 text-[13px]`}
                placeholder="External trainer's name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(name); } }}
                aria-label="External trainer's name"
                autoFocus
              />
              <button type="button" className={`${btn.ghost} !h-8 !px-3`} onClick={() => add(name)} disabled={!name.trim()}>Add</button>
            </span>
          ) : (
            <button type="button" className="grid size-8 place-items-center rounded-full border border-dashed border-line-strong text-muted hover:border-brand hover:text-ink" onClick={() => setTyping(true)} aria-label="Add another external trainer" title="Add another external trainer">
              <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M10 4.5v11M4.5 10h11" /></svg>
            </button>
          )}
          {typing && suggestions.length > 0 && <span className="text-[12px] text-muted">Used before:</span>}
          {typing && suggestions.map((n) => (
            <button key={n} type="button" onClick={() => add(n)} className="h-6 rounded-full border border-line bg-surface px-2 text-[12px] text-ink-2 hover:border-brand hover:text-ink">
              + {n}
            </button>
          ))}
        </>}
        {/* e.g. the name the training is under — in the same wrapping row, so it rarely needs a row of its own. */}
        {after && <span className="ml-1">{after}</span>}
      </div>
      {taken.length > 0 && (() => {
        const text = `${taken.map((t) => `${t} is already training ${busy.get(t)!.name}`).join("; ")} on ${days > 1 ? "one of these dates" : "this date"}.`;
        return <p className="mt-1 truncate text-[12.5px] text-muted" title={text}>{text}</p>;
      })()}
    </div>
  );
  return rows ? <FieldRow label="Trainers" hint="One or more — nobody can be on two trainings in a day">{body}</FieldRow> : body;
}

/** Training date next to "No. of People", with postpone (calendar), trainers and to-be-decided. */
function ScheduleBlock({ card, onSchedule, onComplete, busyOn, compact, onEditing }: { card: CardView; onSchedule?: ScheduleFn; onComplete?: () => void; busyOn?: BusyFn; compact?: boolean; onEditing?: (on: boolean) => void }) {
  const [picking, setPicking] = useState(false);
  const [days, setDays] = useState<string[]>([]);
  const [trainers, setTrainers] = useState<string[]>([]);
  const [cert, setCert] = useState<CertChoice>(certOf(card));
  const [certOpen, setCertOpen] = useState(false);
  const closeCertOpen = useCallback(() => setCertOpen(false), []);
  const s = card.schedule;
  // With a date set, a new one is a postponement or a correction ("Change date"); from nothing or TBD it's scheduling.
  const postponing = Boolean(s && s.status !== "tbd");
  const big = compact ? "text-[16px]" : "text-[20px]";
  const busy = busyOn?.(days) ?? new Map<string, CardView>();
  const chosen = trainers.filter((t) => !busy.has(t));
  // Same days as now: only the trainers, the location, the email or the name change.
  const sameDate = postponing && daysValue(days) === s!.dates.join(",");
  const unchanged = sameDate && chosen.length === s!.trainers.length && chosen.every((t) => s!.trainers.includes(t)) && sameCert(cert, certOf(card));
  const valid = days.length > 0 && days.every(dateAllowed) && chosen.length > 0 && certReady(cert) && !unchanged;
  // "Change date" corrects the date (earlier or later) and keeps the label; "Postpone" marks it postponed.
  const [changing, setChanging] = useState(false);
  const open = (change = false) => {
    setDays(postponing ? s!.dates : []);
    setTrainers(s?.trainers ?? []);
    setCert(certOf(card)); // this training's own (a new one: the location is asked, the email starts at the customer's latest)
    setChanging(change);
    setPicking(true);
    onEditing?.(true);
  };
  const close = () => {
    setPicking(false);
    onEditing?.(false);
    setChanging(false);
    setDays([]);
    setTrainers([]);
  };
  const save = () => {
    if (!valid) return;
    onSchedule?.(daysValue(days), orderTrainers(chosen), changing && !sameDate ? "change" : undefined, cert);
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
        <p className="mt-1.5 text-[13px] text-muted">Completed by {s.completed.by} · {dateLong(s.completed.at)}</p>
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
                <DaysPicker value={days} onChange={setDays} min={minTrainingDate()} label={postponing ? "New training dates" : "Training dates"} autoOpen={!postponing} />
                <button className={`${btn.primary} shrink-0`} onClick={save} disabled={!valid} title={certReady(cert) ? undefined : "Choose the certificate location and the concerned person's email first"}>{sameDate ? "Save" : changing ? "Change date" : postponing ? "Postpone" : "Schedule"}</button>
                <button className={`${btn.quiet} shrink-0`} onClick={close}>Cancel</button>
                {/* On this row so the card doesn't grow; opens the labelled pickers — saved with the training date. */}
                <button
                  type="button"
                  className={`ml-auto shrink-0 text-[13px] font-semibold hover:underline ${certReady(cert) ? "text-brand" : "text-high"}`}
                  onClick={() => setCertOpen(true)}
                  title={`Certificate location: ${cert.location === null ? "not chosen" : cert.location || `Same as original (${card.name})`} · Concerned email: ${cert.email || "not set"}${cert.name.trim() ? ` · ${cert.name.trim()}` : ""}`}
                >
                  {certReady(cert) ? <>Location &amp; email{sameCert(cert, certOf(card)) ? "" : " ✓"}</> : <>Location &amp; email required *</>}
                </button>
              </div>
              <TrainerPicker selected={trainers} onChange={setTrainers} busy={busy} days={days.length} />
              {certOpen && (
                <CertEditor card={card} initial={cert} saveLabel="Use" note={`Saved with the training date — the location and email for this training; the concerned person's name on every card of ${card.name}.`}
                  onSave={setCert} onClose={closeCertOpen} />
              )}
            </div>
          ) : (
            <>
              {postponing && <button className={btn.ghost} onClick={() => open(true)} title="Correct the date — earlier or later — without marking it postponed">Change date</button>}
              <button className={postponing ? btn.ghost : btn.primary} onClick={() => open()}>{postponing ? "Postpone" : "Schedule training"}</button>
              {s?.status !== "tbd" && <button className={btn.ghost} onClick={() => onSchedule("TBD")}>To be decided</button>}
              {s?.date && onComplete && (card.kind === "quote" ? (
                <button disabled title="Create the PI first" className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13px] font-semibold text-muted">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
                  Training completed
                </button>
              ) : (
                <button className="press inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-low px-4 text-[13px] font-semibold text-white hover:brightness-110" onClick={(e) => { celebrate(e.currentTarget); onComplete(); }}>
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

/**
 * Under the head-count: this training's certificate location name and concerned person's email (and name), with Change
 * when the viewer may set them. `needEmail`: say it's needed (Fulfillment — certificates go nowhere without it).
 */
function CertLines({ card, onChange, needEmail }: { card: CardView; onChange?: () => void; needEmail?: boolean }) {
  return (
    <>
      {card.schedule && (
        <p className="mt-0.5 truncate text-[12.5px] leading-snug text-ink-2" title={card.certLocation === undefined && !card.certLocked ? "Not chosen yet — printed on the certificates" : `Certificate location: ${card.certLocation || card.name}`}>
          <span className="font-semibold">Location:</span>{" "}
          {card.certLocation === undefined && !card.certLocked ? <span className={needEmail ? "font-medium text-medium" : "text-muted"}>not chosen</span> : card.certLocation || <span className="text-muted">same as customer name</span>}
        </p>
      )}
      <p className="mt-0.5 flex min-w-0 items-baseline gap-1 text-[12.5px] leading-snug text-ink-2">
        <span className="shrink-0 font-semibold">{card.concernedName ? "Concerned:" : "Concerned email:"}</span>
        {card.concernedName && <span className="shrink-0 font-medium text-ink">{card.concernedName}{card.concernedEmail ? " ·" : ""}</span>}
        {card.concernedEmail
          ? <span className="truncate" title={card.concernedEmail}>{card.concernedEmail}</span>
          : <span className={needEmail ? "font-medium text-medium" : "text-muted"} title={needEmail ? "Needed for the gratitude email and the certificates" : undefined}>not set</span>}
        {onChange && <button type="button" className="ml-1 shrink-0 font-semibold text-brand hover:underline" onClick={onChange}>Change</button>}
      </p>
    </>
  );
}

/**
 * Change this training's certificate location and concerned email (and the customer's concerned person's name) on
 * their own. A popup over the card, so the card itself doesn't grow and start scrolling.
 */
export function CertEditor({ card, initial, saveLabel = "Save", note, onSave, onClose }: {
  card: CardView; initial?: CertChoice; saveLabel?: string; note?: string; onSave: (cert: CertChoice) => void; onClose: () => void;
}) {
  const start = initial ?? certOf(card);
  const [cert, setCert] = useState<CertChoice>(start);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), onClose()); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-label="Certificate details" className="modal-in w-full max-w-[640px] rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-6 pb-4 pt-5">
          <h3 className="text-[18px] font-bold tracking-tight text-ink">Certificate details</h3>
          <p className="mt-0.5 text-[13px] text-muted">{note ?? `Location and email: this training only. The concerned person's name: every card of ${card.name}.`}</p>
        </div>
        <FormRows.Provider value={true}>
          <div className="border-y border-line px-6"><CertPickers card={card} value={cert} onChange={setCert} /></div>
        </FormRows.Provider>
        <div className="flex justify-end gap-2 px-6 py-4">
          <button className={btn.ghost} onClick={onClose}>Cancel</button>
          <button className={btn.primary} disabled={!certReady(cert) || (sameCert(cert, start) && saveLabel !== "Use")} onClick={() => { onSave(cert); onClose(); }}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function TrainingSection({ card, compact, onSchedule, onComplete, busyOn, onCert, needEmail, footer }: {
  card: CardView; compact?: boolean; onSchedule?: ScheduleFn; onComplete?: () => void; busyOn?: BusyFn;
  /** Set the alias for certificates and the concerned email (no training date needed). */
  onCert?: (cert: CertChoice) => void;
  needEmail?: boolean;
  /** Under the training (Fulfillment: the gratitude email and the certificates). */
  footer?: React.ReactNode;
}) {
  const quoted = card.kind === "pi" ? card.linkedQuote : undefined;
  const showSchedule = card.kind !== "lead" && Boolean(card.schedule || onSchedule);
  // While the date is being edited, its pickers show the alias and email — the lines under the head-count step aside (no scrolling).
  const [editing, setEditing] = useState(false);
  const [certEditing, setCertEditing] = useState(false);
  useEffect(() => setCertEditing(false), [card.id]);
  const closeCert = useCallback(() => setCertEditing(false), []);
  const showCert = !compact && !isCustomerCard(card.kind);
  const stacked = useContext(Stacked);
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
                <div key={i} className={`grid gap-x-3 gap-y-1.5 rounded-xl border-2 bg-brand-soft px-3 py-2 ${stacked ? "" : "grid-cols-[1fr_auto] items-end"} ${tone}`}>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-brand">Type of Training</div>
                    <div className="text-[14px] font-semibold leading-snug text-ink">{t.name}</div>
                  </div>
                  <div className={stacked ? "" : "text-right"}>
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
                    {i === 0 && showCert && !editing && (
                      <CertLines card={card} needEmail={needEmail} onChange={onCert ? () => setCertEditing(true) : undefined} />
                    )}
                  </div>
                  {showSchedule && i === 0 && <ScheduleBlock card={card} onSchedule={onSchedule} onComplete={onComplete} busyOn={busyOn} compact={compact} onEditing={setEditing} />}
                  {i === 0 && certEditing && onCert && <CertEditor card={card} onSave={onCert} onClose={closeCert} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {footer}
    </Section>
  );
}

/** Pops up over a merged, unflagged PI that has no training date yet. */
function SchedulePrompt({ card, onSchedule, onLater, busyOn }: { card: CardView; onSchedule: ScheduleFn; onLater: () => void; busyOn: BusyFn }) {
  const [days, setDays] = useState<string[]>([]);
  const [trainers, setTrainers] = useState<string[]>([]);
  const [cert, setCert] = useState<CertChoice>(certOf(card));
  const busy = busyOn(days);
  const chosen = orderTrainers(trainers.filter((t) => !busy.has(t)));
  return (
    <div className="fade-in absolute inset-0 z-20 grid place-items-center bg-black/25 p-4 backdrop-blur-[2px]" onMouseDown={onLater}>
      <div role="alertdialog" aria-label="Ready for training" className="modal-in w-full max-w-[680px] rounded-2xl border-2 border-low bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-6 pb-4 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h3 className="min-w-0 text-[19px] font-bold leading-snug tracking-tight text-ink">{card.name} is ready</h3>
            <span className="mt-0.5 shrink-0 rounded-full bg-low-bg px-2.5 py-0.5 text-[12px] font-semibold text-low">Ready for training</span>
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
            Everything is merged into <b className="font-semibold text-ink">{card.docNumber}</b>
            {card.training[0] && <> for <b className="font-semibold text-ink">{card.training[0].name}</b> ({card.training[0].qty} people)</>}. Would you like to schedule their training right now?
          </p>
        </div>
        <FormRows.Provider value={true}>
          <div className="border-y border-line px-6">
            <FieldRow label="Training dates" hint="Click each day, or drag for a range">
              <DaysPicker value={days} onChange={setDays} min={minTrainingDate()} label="Training dates" />
            </FieldRow>
            <TrainerPicker selected={trainers} onChange={setTrainers} busy={busy} days={days.length} />
            <LocationPicker card={card} value={cert.location} onChange={(location) => setCert({ ...cert, location })} />
            <EmailPicker card={card} value={cert.email} onChange={(email) => setCert({ ...cert, email })} />
            <NamePicker value={cert.name} onChange={(name) => setCert({ ...cert, name })} />
          </div>
        </FormRows.Provider>
        <div className="flex justify-end gap-2 px-6 py-4">
          <button className={btn.ghost} onClick={onLater}>Later</button>
          <button className={btn.primary} disabled={!days.length || !days.every(dateAllowed) || !chosen.length || !certReady(cert)} title={certReady(cert) ? undefined : "Choose the certificate location and the concerned person's email first"} onClick={() => onSchedule(daysValue(days), chosen, undefined, cert)}>Schedule training</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Invoices from before the dashboard (dated up to BACKFILL_UNTIL): the training happened but was never marked here.
 * One step records it on the invoice date — on the invoice's PI (or the invoice itself when there's no PI) — scheduled
 * and completed, so it goes on to Fulfillment; then the deal moves on and stays there (owner, 12 Oct): PI → Invoice, and
 * Invoice → Payment received when the invoice has a payment (a part-paid one waits until it's paid in full, as merges do).
 * Trainers may be left "Not recorded". Undo takes everything back.
 */
function BackfillCompletion({ card, cards, member, busyOn }: { card: CardView; cards: Cards; member: Member; busyOn: BusyFn }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const b = card.backfill!;
  const [open, setOpen] = useState(false);
  const [trainers, setTrainers] = useState<string[]>([]);
  const [unknown, setUnknown] = useState(false);
  useEffect(() => { setOpen(false); setTrainers([]); setUnknown(false); }, [card.id]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), setOpen(false)); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const busy = busyOn([b.date]);
  const chosen = orderTrainers(trainers.filter((t) => !busy.has(t)));
  const day = dateLong(b.date);
  const elsewhere = b.cardId !== card.id;
  const pi = elsewhere ? cards.get(b.cardId) : undefined;
  // The invoice's payments still on their own; it merges into the newest (the others fold in with it).
  const payments = [...cards.values()]
    .filter((c) => c.kind === "payment" && !c.mergedInto && !c.deleted && c.payment && c.payment.invoiceId === card.invoice?.invoiceId)
    .sort((x, y) => y.payment!.date.localeCompare(x.payment!.date) || Number(y.payment!.number) - Number(x.payment!.number));
  const payment = payments[0];
  const endsIn = payment ? "Payment Received" : "Invoice sent";
  const save = () => {
    const merge = (from: CardView, to: CardView) => ({ cardIds: [from.id, to.id], kind: "merge" as const, before: cardLabel(from), value: cardLabel(to), by: member.name });
    const evs = addCardEvents([
      { cardIds: [b.cardId], kind: "set_training_date", value: b.date, trainers: unknown ? [] : chosen, mode: "invoice", by: member.name },
      { cardIds: [b.cardId], kind: "complete_training", mode: "invoice", by: member.name },
      ...(pi ? [merge(pi, card)] : []),
      ...(payment ? [merge(card, payment)] : []),
    ]);
    setOpen(false);
    toast({ text: `${card.name}: training completed on ${day} — moved to ${endsIn}, and on Fulfillment`, actionLabel: "Undo", onAction: () => revertCardEvent(evs.map((e) => e.id), member.name) });
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3 py-2.5">
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
        <b className="font-semibold text-ink">Trained before the dashboard?</b> Invoiced {day} — complete the training on that date{elsewhere ? <> (recorded on {b.on})</> : null}.
      </p>
      <button className={`${btn.primary} shrink-0`} onClick={() => setOpen(true)}>Completed on invoice date</button>
      {open && (
        <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={() => setOpen(false)}>
          <div role="alertdialog" aria-label="Completed on invoice date" className="modal-in w-full max-w-[680px] rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-6 pb-4 pt-5">
              <h3 className="text-[18px] font-bold tracking-tight text-ink">Completed on invoice date</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
                <b className="font-semibold text-ink">{card.name}</b> — the training is recorded as given and completed on the invoice date{elsewhere ? <>, on <b className="font-semibold text-ink">{b.on}</b></> : null}, and
                the deal moves on to <b className="font-semibold text-ink">{endsIn}</b>{pi || payment ? <> ({[pi && `${pi.docNumber} → ${card.docNumber}`, payment && `${card.docNumber} → ${payment.docNumber}${payments.length > 1 ? ` + ${payments.length - 1} more` : ""}`].filter(Boolean).join(", ")})</> : null}. It also shows on Fulfillment.
              </p>
            </div>
            <FormRows.Provider value={true}>
              <div className="border-y border-line px-6">
                <FieldRow label="Training date" hint={`The date of invoice ${card.docNumber}`}>
                  <span className="num inline-flex h-8 items-center text-[14px] font-semibold text-ink">{day}</span>
                </FieldRow>
                <TrainerPicker
                  selected={trainers}
                  onChange={(t) => { setTrainers(t); if (t.length) setUnknown(false); }}
                  busy={busy}
                  days={1}
                  after={
                    <label className={chipCls(unknown)}>
                      <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={unknown} onChange={(e) => { setUnknown(e.target.checked); if (e.target.checked) setTrainers([]); }} />
                      Not recorded
                    </label>
                  }
                />
              </div>
            </FormRows.Provider>
            <div className="flex justify-end gap-2 px-6 py-4">
              <button className={btn.ghost} onClick={() => setOpen(false)}>Cancel</button>
              <button className={btn.primary} disabled={!chosen.length && !unknown} title={!chosen.length && !unknown ? "Pick the trainers, or Not recorded" : undefined} onClick={save}>Mark completed on {day}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SalesSection({ card }: { card: CardView }) {
  const who = card.salespeople.length ? salespersonLabel(card.salespeople) : <span className="font-normal text-faint">—</span>;
  // Narrow merge panels: the name under the title.
  if (useContext(Compact)) return <Section title="Sales person" aside={<Lock />}><p className="text-[13px] font-medium text-ink">{who}</p></Section>;
  return (
    // One line: the name sits beside the title (read-only, from Zoho).
    <Section title="Sales person" aside={
      <span className="flex min-w-0 items-center gap-2 text-right text-[14px] font-medium text-ink">
        {who}
        <Lock />
      </span>
    } />
  );
}

export function DocsSection({ card, options }: { card: CardView; options: BoardOptions }) {
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

const noteWhen = (at: string) => `${fmtDate(at, { day: "numeric", month: "short" })}, ${new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;

/**
 * Notes typed by the team: the latest one on the card; writing a note and reading all of them happen in a small window
 * on top of the card, so the card itself always fits without scrolling. Authors can remove their own notes (removal stays
 * in Changes). Shared by both boards; `children` is what the board shows above the latest note.
 */
export function NotesPanel({ card, member, heading, oneLine, children }: { card: CardView; member: Member; heading: string; oneLine?: boolean; children?: React.ReactNode }) {
  const { addCardEvents, revertCardEvent } = useStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  useEffect(() => { setOpen(false); setText(""); }, [card.id]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), setOpen(false)); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const notes = card.notes ?? [];
  const latest = notes[0];
  const save = () => {
    const t = text.trim();
    if (!t) return;
    addCardEvents([{ cardIds: [card.id], kind: "add_note", value: t, by: member.name }]);
    setText("");
  };
  return (
    // No notes yet: said beside the title, so an empty Notes section stays one line.
    <Section title="Notes" aside={<span className="inline-flex items-center gap-3">{!latest && !children && <span className="text-[13px] text-faint">No notes yet</span>}<button className="text-[13px] font-semibold text-brand hover:underline" onClick={() => setOpen(true)}>+ Add a note</button></span>}>
      {children}
      {latest && oneLine ? (
        // Training board: the latest note on one line (the left column is the tight one); the full text is in All notes.
        <div className={`${children ? "mt-2" : ""} flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-[13.5px] text-ink-2`}>
          <span className="min-w-0 flex-1 truncate" title={latest.text}>{latest.text}</span>
          <span className="shrink-0 text-[11.5px] text-muted">{latest.by.split(" ")[0]} · {noteWhen(latest.at)}</span>
          <button className="shrink-0 text-[11.5px] font-semibold text-brand hover:underline" onClick={() => setOpen(true)}>{notes.length > 1 ? `All notes (${notes.length})` : "Open"}</button>
        </div>
      ) : latest ? (
        <div className={`${children ? "mt-2" : ""} rounded-lg bg-surface-2 px-3 py-1.5 text-[13.5px] text-ink-2`}>
          <div className="line-clamp-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{latest.text}</div>
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted">
            <span>{latest.by} · {noteWhen(latest.at)}</span>
            <button className="font-semibold text-brand hover:underline" onClick={() => setOpen(true)}>{notes.length > 1 ? `All notes (${notes.length})` : "Open"}</button>
          </div>
        </div>
      ) : null}
      {open && (
        <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={() => setOpen(false)}>
          <div role="alertdialog" aria-label="Notes" className="modal-in flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-surface p-5 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-bold tracking-tight text-ink">Notes · {heading}</h3>
              <button className={btn.quiet} onClick={() => setOpen(false)}>Close</button>
            </div>
            <textarea
              className={`${inputCls} mt-3 min-h-[80px] py-2 text-[13.5px]`}
              placeholder={`Write a note for ${heading}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}
              autoFocus
            />
            <div className="mt-2 flex items-center gap-2">
              <button className={btn.primary} onClick={save} disabled={!text.trim()}>Save note</button>
              <span className="ml-auto text-[11.5px] text-faint">Ctrl + Enter to save</span>
            </div>
            <ul className="no-scrollbar mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {notes.length === 0 && <li className="text-[13px] text-faint">No notes yet.</li>}
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-surface-2 px-3 py-2 text-[13.5px] text-ink-2">
                  <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{n.text}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-muted">
                    <span>{n.by} · {noteWhen(n.at)}</span>
                    {(n.by === member.name || member.id === "admin") && <button className="font-medium hover:text-high" onClick={() => revertCardEvent(n.id, member.name)}>Remove</button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Notes: what the board itself flags (PI missing, deal lost, not linked yet), then the team's own notes. */
function NotesSection({ card, member, options }: { card: CardView; member: Member; options: BoardOptions }) {
  const q = card.quote;
  const flagged = Boolean(card.piSkipped || card.piMissing || card.waitingOn || card.lost);
  return (
    <NotesPanel card={card} member={member} heading={isCustomerCard(card.kind) ? card.name : card.docNumber ?? card.name} oneLine>
      {flagged && <div className="space-y-2.5 text-[14px] text-ink-2">
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
      </div>}
    </NotesPanel>
  );
}

/** Lead → Quote → PI trail of what was merged into this card, with unmerge on each direct merge. */
export function ChainSection({ card, cards, onUnmerge, canUnmerge }: { card: CardView; cards: Cards; onUnmerge?: (fromId: string) => void; canUnmerge?: (fromId: string) => boolean }) {
  if (card.historyIds.length < 2) return null;
  // An invoice's instalments travel together: one "Payment Received · n payments" chip, no unmerge of their own
  // (unmerging the invoice separates them again).
  const instalments = card.kind === "payment" && (card.payments?.length ?? 0) > 1;
  const chain = [...card.historyIds].map((id) => cards.get(id)).filter((c): c is CardView => !!c && (!instalments || c.kind !== "payment" || c.id === card.id))
    .sort((a, b) => STAGE_RANK[a.kind] - STAGE_RANK[b.kind]);
  // Only merges you made can be unmerged (Admin: any).
  const unmergeable = card.mergedFrom.filter((id) => kindOfId(id) !== "payment" && (!canUnmerge || canUnmerge(id)));
  return (
    <Section
      title="Merged"
      // Unmerge sits in the header so the section takes one row less (Notes sits above it).
      aside={onUnmerge && unmergeable.length > 0 && (
        <span className="flex flex-wrap justify-end gap-x-3">
          {unmergeable.map((id) => (
            <button key={id} className="text-[13px] font-medium text-muted hover:text-ink hover:underline" onClick={() => onUnmerge(id)}>Unmerge {isCustomerCard(kindOfId(id)) ? KIND_LABEL[kindOfId(id)] : cardLabel(cards.get(id))}</button>
          ))}
        </span>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {chain.map((c, i) => (
          <span key={c.id} className="inline-flex items-center gap-2">
            {/* Lead and Potential training sit side by side (+); later stages follow (→). */}
            {i > 0 && <span className="text-faint">{STAGE_RANK[c.kind] === STAGE_RANK[chain[i - 1].kind] ? "+" : "→"}</span>}
            <span className={`rounded-lg px-2.5 py-1 text-[13px] font-medium ${STAGE_TONE[c.kind].chip}`}>{KIND_LABEL[c.kind]} · {isCustomerCard(c.kind) ? c.lead?.name : instalments && c.id === card.id ? `${card.payments!.length} payments` : c.docNumber}</span>
          </span>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Change log (the modal's extension) ---------------- */

export function ChangeLog({ cardIds, cards, member, kinds }: { cardIds: string[]; cards: Cards; member: Member; kinds?: CardEventKind[] }) {
  const { cardEvents, revertCardEvent } = useStore();
  const ids = new Set(cardIds);
  // `kinds`: only these changes (e.g. Logistics shows an AED card's delivery, hide and notes — not Priyanka's training steps).
  const list = cardEvents.filter((e) => e.cardIds.some((id) => ids.has(id)) && (!kinds || kinds.includes(e.kind))).sort((a, b) => b.at.localeCompare(a.at));
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
                  <div className="mt-1 text-[12px] font-medium text-medium">{mergeNotApplied(e, cards)}</div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                    <Avatar name={e.by} />
                    <span className="truncate">{e.by} · {fmtDate(e.at)}, {fmtTime(e.at)}</span>
                  </span>
                  {!e.revertedAt && !zoho && canRevert(member, e) && (
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

export function Shell({ label, onClose, side, footer, overlay, children }: { label: string; onClose: () => void; side: React.ReactNode; footer?: React.ReactNode; overlay?: React.ReactNode; children: React.ReactNode }) {
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

export function Header({ kind, sub, title, flagged, aside, onClose }: { kind?: CardKind; sub: string; title: string; flagged?: boolean; aside?: React.ReactNode; onClose: () => void }) {
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
      <div className="flex shrink-0 items-center gap-4">
        {aside}
        <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
      </div>
    </div>
  );
}

/* ---------------- Editing ---------------- */

type EntryDraft = ContactEntry & { isNew?: boolean };
export type Draft = { name: string; aliases: string[]; emails: EntryDraft[]; phones: EntryDraft[]; type: string; sector: string };

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
        <button type="button" className={`${btn.ghost} shrink-0`} onClick={add}>Add</button>
      </div>
      {err && <p className="mt-1 text-[12px] text-high">{err}</p>}
    </Row>
  );
}

export function Editor({ card, draft, setDraft, options }: { card: CardView; draft: Draft; setDraft: (d: Draft) => void; options: BoardOptions }) {
  const alias = useAliasInput(draft.aliases, draft.name, (a) => setDraft({ ...draft, aliases: [...draft.aliases, a] }));
  const withCurrent = (opts: string[], cur: string) => (cur && !opts.includes(cur) ? [cur, ...opts] : opts);
  const phase = phaseOf(card.kind);
  return (
    <>
      <Section title="Customer">
        <dl>
          <Row label="Customer name" required>
            {/* The customer's name is their identity in Zoho Books (it links every card to them) — never edited here. */}
            <div className="flex items-center gap-1.5 text-[15px] font-semibold text-ink" title="The customer name comes from Zoho Books and can't be changed here — add an alias instead">
              {draft.name} <span className="text-faint"><Lock /></span>
            </div>
            <div className="text-[12px] text-muted">From Zoho Books — can&apos;t be changed. Add an alias instead.</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {draft.aliases.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-ink-2">
                  {a}
                  <button type="button" aria-label={`Remove alias ${a}`} className="text-faint hover:text-high" onClick={() => setDraft({ ...draft, aliases: draft.aliases.filter((x) => x !== a) })}>×</button>
                </span>
              ))}
              <input className="h-8 min-w-[160px] flex-1 rounded-md border border-dashed border-line bg-transparent px-2 text-[13px] focus:border-brand focus:outline-none" placeholder="+ Add alias (optional)" value={alias.text} onChange={(e) => alias.change(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), alias.add())} onBlur={() => alias.add(true)} />
              {alias.warn && <span className="w-full text-[12px] font-medium text-medium">{alias.warn}</span>}
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
export function diff(card: CardView, d: Draft, by: string): Omit<CardEvent, "id" | "at">[] {
  const base = { cardIds: [card.id], by };
  const out: Omit<CardEvent, "id" | "at">[] = [];
  const ev = (kind: CardEventKind, extra: Partial<CardEvent>) => out.push({ ...base, kind, ...extra });
  // Aliases belong to the customer (every card of theirs shows them), so the event names the customer too.
  for (const a of card.aliases) if (!d.aliases.includes(a)) ev("remove_alias", { value: a, ref: card.customerId });
  for (const a of d.aliases) if (!card.aliases.includes(a)) ev("add_alias", { value: a, ref: card.customerId });
  const keep = (list: EntryDraft[], key: (v: string) => string) => new Set(list.filter((e) => !e.isNew).map((e) => key(e.value)));
  const keptEmails = keep(d.emails, normEmail);
  const keptPhones = keep(d.phones, normPhone);
  // Numbers and emails also belong to the customer: added or removed here, they change on every card under that name.
  for (const e of card.emails) if (!keptEmails.has(normEmail(e.value))) ev("remove_email", { value: e.value, ref: card.customerId });
  for (const p of card.phones) if (!keptPhones.has(normPhone(p.value))) ev("remove_phone", { value: p.value, ref: card.customerId });
  for (const e of [...d.emails].reverse()) if (e.isNew) ev("add_email", { value: e.value, phase: e.phases[0], ref: card.customerId });
  for (const p of [...d.phones].reverse()) if (p.isNew) ev("add_phone", { value: p.value, phase: p.phases[0], ref: card.customerId });
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

  const schedule = (value: string, trainers?: string[], mode?: "change", cert?: CertChoice) => {
    const s = card.schedule;
    const before = s ? (s.status === "tbd" ? "TBD" : s.dates.join(",")) : undefined;
    // Same days and trainers: only the location / email / name changed — no new date entry.
    const sameRun = Boolean(s) && value !== "TBD" && before === value && (trainers ?? []).length === s!.trainers.length && (trainers ?? []).every((t) => s!.trainers.includes(t));
    const evs = addCardEvents([
      ...certEvents(card, cert, member.name, !sameRun),
      // The location and email ride on the date entry (the server refuses a date without them).
      ...(sameRun ? [] : [{ cardIds: [card.id], kind: "set_training_date" as const, value, before, by: member.name, ...(value !== "TBD" ? { trainers, ...(cert ? certFields(cert) : {}) } : {}), ...(mode ? { mode } : {}) }]),
    ]);
    const ev = evs[evs.length - 1];
    if (!s) {
      const skip = card.kind === "quote" ? " — create its PI before completing" : "";
      toast({ text: `${card.name} moved to Training scheduled${skip}`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    }
    setPrompt(false);
  };
  const busyOn = (dates: string[]) => busyTrainers(dates, cards, card.id);
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
  const canRestore = cardEvents.some((e) => !e.revertedAt && e.kind === "delete" && e.cardIds.includes(card.id) && canRevert(member, e));
  const restore = () => {
    const ev = activeEvent((e) => e.kind === "delete" && e.cardIds.includes(card.id));
    if (ev) revertCardEvent(ev.id, member.name);
  };
  const mergeEvent = (fromId: string) => activeEvent((e) => e.kind === "merge" && e.cardIds[0] === fromId && e.cardIds[1] === card.id);
  const unmerge = (fromId: string) => {
    const ev = mergeEvent(fromId);
    if (ev) revertCardEvent(ev.id, member.name);
  };
  const canUnmerge = (fromId: string) => { const ev = mergeEvent(fromId); return Boolean(ev && canRevert(member, ev)); };

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
            {ownDelete && canRestore && <button className="font-semibold underline" onClick={restore}>Restore</button>}
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
            <NotesSection card={card} member={member} options={options} />
            <ChainSection card={card} cards={cards} onUnmerge={unmerge} canUnmerge={canUnmerge} />
            <PaymentSection card={card} cards={cards} />
          </div>
          <div className="space-y-3">
            {card.kind === "potential" ? (
              <PotentialSection card={card} onChange={setExpected} />
            ) : (
              <TrainingSection card={card} onSchedule={card.kind !== "lead" ? schedule : undefined} onComplete={complete} busyOn={busyOn}
                onCert={card.deleted ? undefined : (cert) => addCardEvents(certEvents(card, cert, member.name))}
                footer={card.backfill && !card.deleted ? <BackfillCompletion card={card} cards={cards} member={member} busyOn={busyOn} /> : undefined} />
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
      <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-4 py-3 ${STAGE_TONE[kind].head}`}>
        <h3 className="min-w-0 text-[16px] font-bold leading-tight tracking-tight text-ink">{KIND_LABEL[kind]}</h3>
        <button className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-brand hover:underline" onClick={() => onOpen(selected.id)}>Open &amp; edit</button>
      </div>
      {kind === "payment" && list.length > 1 && selected.linkedInvoice ? (
        // An invoice's payments all merge together (into the newest), so no picking — just what's included.
        <div className="border-b border-line px-4 py-2.5 text-[13px] text-ink-2">
          All {list.length} payments merge together · <PaymentsLink invoice={selected.linkedInvoice} payments={list.map((c) => c.payment!)} />
        </div>
      ) : list.length > 1 && (
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
  // An invoice's payments (instalments) all merge together, into the newest one.
  byKind.payment.sort((a, b) => b.payment!.date.localeCompare(a.payment!.date) || Number(b.payment!.number) - Number(a.payment!.number));
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
  // No PI references the selected quotation: no PI panel (nor the invoice / payment after it). Without a quotation in
  // the group — e.g. after Merge PI → Invoice, when the invoice already holds its PI — the invoice and payment still show.
  const afterPI = Boolean(pi) || !quote;
  const shownKinds = kinds.filter((k) => afterPI || !(k === "pi" || k === "invoice" || k === "payment"));
  const invoice = afterPI ? chosen("invoice") : undefined;
  const payment = afterPI ? chosen("payment") : undefined;
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
      onAction: () => revertCardEvent(evs.map((e) => e.id), member.name),
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
  // Several instalments: the invoice goes into the newest payment and the others come along.
  const prs = byKind.payment.filter((c) => c.payment?.invoiceId === invoice?.invoice?.invoiceId).length;
  const payLabel = prs > 1 ? `Payment Received (${prs} payments)` : "Payment Received";
  if (linked(pi, invoice) && invPay) actions.push({ label: `Merge PI → Invoice → ${payLabel}`, steps: [[pi!, invoice!], [invoice!, payment!]], primary: true });
  if (linked(quote, invoice) && invPay) actions.push({ label: `Merge Quote → Invoice → ${payLabel}`, steps: [[quote!, invoice!], [invoice!, payment!]], primary: true });
  if (linked(pi, invoice)) actions.push({ label: "Merge PI → Invoice", steps: [[pi!, invoice!]], primary: !invPay });
  if (linked(quote, invoice)) actions.push({ label: "Merge Quote → Invoice", steps: [[quote!, invoice!]], primary: !invPay });
  if (invPay && invoiceReady) actions.push({ label: `Merge Invoice → ${payLabel}`, steps: [[invoice!, payment!]], primary: true });
  // PI / invoice links don't apply when a Potential training card is only choosing its quotation.
  const unlinked = potentialMode ? "" : invoice && payment && !linked(invoice, payment)
    ? payment.payment?.invoiceId === invoice.invoice?.invoiceId
      ? !invoice.paidInFull
        ? `${partPaidText(invoice.invoice!, invoice.received ?? 0)} — it can be merged with its payments once they add up to the invoice total.`
        : `Merge ${invoice.docNumber} with its completed training first — step by step, the invoice can only be merged with ${payment.docNumber} after that.`
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
      <Stacked.Provider value={shownKinds.length >= 3}>
      <div className="flex items-stretch gap-2 p-3">
        {shownKinds.map((k, i) => (
          <div key={k} className="flex min-w-0 flex-1 items-stretch gap-2">
            {i > 0 && <div className="grid w-6 shrink-0 place-items-center text-[20px] font-bold text-faint" aria-hidden>→</div>}
            <PhasePanel kind={k} list={byKind[k]} selected={(k === "pi" ? pi : chosen(k))!} onSelect={(id) => selectCard(k, id)} cards={cards} onOpen={onOpen} />
          </div>
        ))}
      </div>
      </Stacked.Provider>
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
              Optional — a rough month, or an exact date if it's known; kept for reminders later and changeable any time. The card stays in Potential training until a new quotation for this customer syncs from Zoho Books, then it can be merged into it like a lead.
            </p>
          </Section>
        </div>
      </div>
    </Shell>
  );
}
