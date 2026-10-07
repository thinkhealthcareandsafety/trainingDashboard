"use client";

import { useEffect, useState } from "react";
import type { Member } from "@/lib/types";
import { type CardView, aedCardId, aedCustomerId, cardDue, fmtWhen, isAedDelivery } from "@/lib/pipeline";
import { fmtDate } from "@/lib/dates";
import { zohoUrl } from "@/lib/zohoLinks";
import { useStore } from "@/lib/store";
import { celebrate } from "@/lib/confetti";
import { canMarkDelivered, canRevert } from "@/lib/roles";
import { btn, inputCls } from "../ui";
import {
  type BoardOptions, type Draft, ChangeLog, ContactSection, CustomerSection, DueChip, Editor, Header, Lock, Row, SCHEDULE_TONE,
  NotesPanel, Section, Shell, dateAllowed, diff, minTrainingDate,
} from "./CardModal";

// Priyanka's AedSmartx board: one modal per AED invoice. Phase 1 schedules the training (date + time, she trains
// alone so there's no trainer to pick) or marks it not required; phase 2 reschedules / to-be-decided; phase 3 completes.

type Cards = Map<string, CardView>;
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });

// Who marks AEDs as delivered: roles.ts (Arti, Shikha, Sumit, Ashish and Admin — not Priyanka).
/** Arti only marks deliveries (and writes notes): no scheduling, no "not required", no resale. */
const isDeliveryOnly = (m: Member) => m.id !== "admin" && isAedDelivery(m.name);

function AedTrainingSection({ card, member }: { card: CardView; member: Member }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const s = card.schedule;
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // "Change date" corrects the date/time (earlier or later) and keeps the label; "Postpone" marks it postponed.
  const [changing, setChanging] = useState(false);
  useEffect(() => setPicking(false), [card.id]);
  // With a date set, a new one is a postponement or a correction ("Change date"); from nothing or TBD it's scheduling.
  const postponing = Boolean(s && s.status !== "tbd");
  const value = date && time ? `${date}T${time}` : "";
  const valid = dateAllowed(date) && Boolean(time) && value !== s?.date;

  const record = (kind: "set_training_date" | "complete_training" | "set_not_required", value?: string, mode?: "change") => {
    const before = kind === "set_training_date" && s ? (s.status === "tbd" ? "TBD" : s.date) : undefined;
    return addCardEvents([{ cardIds: [card.id], kind, value, before, by: member.name, ...(mode ? { mode } : {}) }])[0];
  };
  const undoToast = (text: string, id: string) => toast({ text, actionLabel: "Undo", onAction: () => revertCardEvent(id, member.name) });
  const open = (change = false) => {
    const [d, t] = (postponing ? s!.date ?? "" : "").split("T");
    setDate(d ?? "");
    setTime(t ?? "");
    setChanging(change);
    setPicking(true);
  };
  const schedule = () => {
    if (!valid) return;
    const ev = record("set_training_date", value, changing ? "change" : undefined);
    if (!s) undoToast(`${card.name} moved to Training scheduled`, ev.id);
    setPicking(false);
  };

  // Delivery: Arti, Shikha, Sumit, Ashish and Admin mark (or unmark) an AED as delivered; everyone else sees the status (kept to one line).
  const deliveredBy = useStore().cardEvents.find((e) => !e.revertedAt && e.kind === "set_delivered" && e.cardIds.includes(card.id));
  // Marking is for the delivery team; undoing it only for whoever marked it (or Admin).
  const canDeliver = canMarkDelivered(member) && (!deliveredBy || canRevert(member, deliveredBy));
  // Arti only marks deliveries: no scheduling, no "not required". Nobody schedules before the AED is delivered.
  const deliveryOnly = isDeliveryOnly(member);
  const deliveredEv = useStore().cardEvents.find((e) => !e.revertedAt && e.kind === "set_delivered" && e.cardIds.includes(card.id));
  const markDelivered = () => {
    if (deliveredEv) return revertCardEvent(deliveredEv.id, member.name);
    const ev = addCardEvents([{ cardIds: [card.id], kind: "set_delivered", by: member.name }])[0];
    undoToast(`${card.docNumber} marked as delivered — ready for scheduling`, ev.id);
  };
  const tone = card.notRequired ? "border-high" : s ? SCHEDULE_TONE[s.status].border : "border-transparent";
  return (
    <Section title="Training">
      {!card.notRequired && (
        <div className={`mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3 py-1 ${card.delivered ? "border-low bg-low-bg" : "border-medium bg-medium-bg"}`}>
          <span className="text-[13.5px]" title={card.delivered ? undefined : "Arti, Shikha, Sumit, Ashish or Admin marks it once the AED is delivered — then the training can be scheduled"}>
            <b className={card.delivered ? "text-low" : "text-medium"}>{card.delivered ? "Delivered — ready for scheduling" : "Not delivered yet"}</b>
            {card.delivered && <span className="text-[12px] text-muted"> · {card.delivered.by}, {dateLong(card.delivered.at)}</span>}
          </span>
          {canDeliver && (
            <button
              className={card.delivered ? `${btn.quiet} !h-7` : "press inline-flex h-7 items-center justify-center rounded-full bg-low px-3 text-[12.5px] font-semibold text-white hover:brightness-110"}
              onClick={markDelivered}
            >
              {card.delivered ? "Undo delivered" : "Mark as delivered"}
            </button>
          )}
        </div>
      )}
      <div className={`rounded-xl border-2 bg-brand-soft px-4 py-2.5 ${tone}`}>
        <div className="text-[12px] font-bold uppercase tracking-wide text-brand">Training date &amp; time</div>
        {card.notRequired ? (
          <div className="mt-0.5 text-[20px] font-semibold text-high">Training not required</div>
        ) : s ? (
          <div className={`mt-0.5 flex flex-wrap items-center gap-2 text-[20px] font-semibold ${s.status === "tbd" ? "text-high" : "text-ink"}`}>
            <span className="num">{s.status === "tbd" || !s.date ? "To be decided" : fmtWhen(s.date)}</span>
            {s.completed ? (
              <span className="rounded-md bg-low px-1.5 py-0.5 text-[11.5px] font-bold text-white">Completed</span>
            ) : (
              s.status !== "tbd" && <span className={`rounded-md px-1.5 py-0.5 text-[11.5px] font-bold ${SCHEDULE_TONE[s.status].chip}`}>{SCHEDULE_TONE[s.status].label}</span>
            )}
          </div>
        ) : (
          <div className="mt-0.5 text-[20px] font-semibold text-faint">Not scheduled</div>
        )}
        {s?.completed && <p className="mt-1 text-[13px] text-muted">Completed · marked by {s.completed.by} on {dateLong(s.completed.at)}</p>}
        {card.notRequired && (
          <p className="mt-1 text-[13px] text-muted">
            {card.reseller ? "The customer is marked as a Reseller — untick it under Item description to bring their invoices back."
              : card.resale ? "This invoice is marked for resale — untick it under Item description to bring it back."
              : "To bring it back, revert “Training not required” in Changes."}
          </p>
        )}

        {!card.notRequired && !s?.completed && deliveryOnly && (
          <p className="mt-1.5 text-[13px] text-muted">{card.delivered ? "Delivered — the training team schedules it from here." : "Mark it as delivered once the AED reaches the customer — then the training can be scheduled."}</p>
        )}
        {!card.notRequired && !s?.completed && !deliveryOnly && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {picking ? (
              <>
                <input type="date" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={date} min={minTrainingDate()} onChange={(e) => setDate(e.target.value)} aria-label="Training date" autoFocus />
                <input type="time" className={`${inputCls} !h-9 !w-auto text-[13px]`} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Training time" />
                <button className={btn.primary} onClick={schedule} disabled={!valid}>{changing ? "Change date" : postponing ? "Postpone" : "Schedule"}</button>
                <button className={btn.quiet} onClick={() => setPicking(false)}>Cancel</button>
              </>
            ) : !s ? (
              <>
                {card.delivered ? (
                  <button className={btn.primary} onClick={() => open()}>Schedule training</button>
                ) : (
                  <button disabled title="Mark the AED as delivered first" className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13px] font-semibold text-muted">
                    <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
                    Schedule training
                  </button>
                )}
                <button
                  className="press inline-flex h-9 items-center justify-center rounded-full border border-high/40 bg-surface px-4 text-[13px] font-semibold text-high hover:bg-high-bg"
                  onClick={() => undoToast(`${card.name} moved to Training not required`, record("set_not_required").id)}
                >
                  Training not required
                </button>
              </>
            ) : (
              <>
                {postponing && <button className={btn.ghost} onClick={() => open(true)} title="Correct the date or time — earlier or later — without marking it postponed">Change date</button>}
                {postponing || card.delivered ? (
                  <button className={postponing ? btn.ghost : btn.primary} onClick={() => open()}>{postponing ? "Postpone" : "Schedule training"}</button>
                ) : (
                  // To be decided, not delivered yet: same rule as a first schedule.
                  <button disabled title="Mark the AED as delivered first" className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-full bg-surface-2 px-4 text-[13px] font-semibold text-muted">Schedule training</button>
                )}
                {s.status !== "tbd" && <button className={btn.ghost} onClick={() => record("set_training_date", "TBD")}>To be decided</button>}
                {s.date && (
                  <button
                    className="press inline-flex h-9 items-center justify-center rounded-full bg-low px-4 text-[13px] font-semibold text-white hover:brightness-110"
                    onClick={(e) => { celebrate(e.currentTarget); undoToast(`${card.name} moved to Training completed`, record("complete_training").id); }}
                  >
                    Training completed
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

/** Notes: the clickable invoice, then the team's notes (shared with the training board). */
export function AedNotesSection({ card, member, options }: { card: CardView; member: Member; options: BoardOptions }) {
  const inv = card.invoice!;
  return (
    <NotesPanel card={card} member={member} heading={inv.number}>
      <p className="text-[14px] text-ink-2">
        Invoice{" "}
        <a href={zohoUrl("invoice", inv.invoiceId, options.orgId)} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">{inv.number}</a>
        {" "}— open it in Zoho Books.
      </p>
    </NotesPanel>
  );
}

/**
 * Resale: this one invoice was bought for resale, or the whole customer is a reseller (every AED invoice of theirs,
 * now and later). Either moves the invoice to Training not required; unticking reverts it.
 */
function ResaleOptions({ card, cards, member }: { card: CardView; cards: Cards; member: Member }) {
  const { cardEvents, addCardEvents, revertCardEvent, toast } = useStore();
  const reseller = cardEvents.find((e) => !e.revertedAt && e.kind === "set_reseller" && e.ref === card.customerId);
  const resale = cardEvents.find((e) => !e.revertedAt && e.kind === "set_resale" && e.cardIds.includes(card.id));
  const theirs = [...cards.values()].filter((c) => c.customerId === card.customerId).map((c) => c.id);
  const undo = (text: string, id: string) => toast({ text, actionLabel: "Undo", onAction: () => revertCardEvent(id, member.name) });

  const toggleInvoice = () => {
    if (resale) return revertCardEvent(resale.id, member.name);
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_resale", before: card.docNumber, by: member.name }]);
    undo(`${card.docNumber} marked for resale — moved to Training not required`, ev.id);
  };
  const toggleCustomer = () => {
    if (reseller) return revertCardEvent(reseller.id, member.name);
    const [ev] = addCardEvents([{ cardIds: [aedCustomerId(card.customerId), ...theirs], kind: "set_reseller", ref: card.customerId, before: card.name, by: member.name }]);
    undo(`${card.name} marked as a Reseller — ${theirs.length} invoice${theirs.length === 1 ? "" : "s"} moved to Training not required`, ev.id);
  };
  // Resale moves invoices to Training not required — not for Arti (she only marks deliveries).
  // Unticking is reverting: only whoever ticked it (or Admin).
  const locked = isDeliveryOnly(member) || Boolean(resale && !canRevert(member, resale)) || Boolean(reseller && !canRevert(member, reseller));
  const box = (on: boolean) => `flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13.5px] ${locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${on ? "border-high/40 bg-high-bg" : `border-line ${locked ? "" : "hover:border-line-strong"}`}`;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">Mark for resale — moves to Training not required</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={box(Boolean(resale))}>
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--high)]" checked={Boolean(resale)} onChange={toggleInvoice} disabled={locked} />
          <span>
            <b className={resale ? "text-high" : "text-ink"}>This invoice is for resale</b>
            <span className="block text-[12.5px] text-muted">Only this invoice</span>
          </span>
        </label>
        <label className={box(Boolean(reseller))}>
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--high)]" checked={Boolean(reseller)} onChange={toggleCustomer} disabled={locked} />
          <span>
            <b className={reseller ? "text-high" : "text-ink"}>Customer is a Reseller</b>
            <span className="block text-[12.5px] text-muted">All {theirs.length} AED invoice{theirs.length === 1 ? "" : "s"}, now and later</span>
          </span>
        </label>
      </div>
    </div>
  );
}

/** The AED itself, read from its invoice description, plus the extras sold with it. */
export function ItemDescriptionSection({ card, cards, member, noResale }: { card: CardView; cards: Cards; member: Member; noResale?: boolean }) {
  const [allSerials, setAllSerials] = useState(false);
  const aed = card.aed;
  if (!aed) return null;
  const missing = <span className="text-faint">Not in description</span>;
  return (
    <Section title="Item description">
      <div className="space-y-2.5">
        {aed.lines.map((l, i) => {
          const shown = allSerials ? l.serials : l.serials.slice(0, 8);
          return (
            <div key={i} className="rounded-xl border border-line px-3.5 py-2.5">
              <div className="text-[15px] font-semibold leading-snug text-ink">
                {l.name} <span className="num text-[13px] font-medium text-muted">× {l.qty}</span>
              </div>
              {l.model && <div className="text-[12.5px] text-muted">{l.model}</div>}
              {/* Year and expiries side by side, so the modal fits without scrolling. */}
              <div className="mt-2 grid grid-cols-3 gap-3 border-b border-line pb-2">
                {([
                  ["Year of manufacturing", l.year ? [l.year] : []],
                  ["Battery expiry", l.batteryExpiry.map(dateLong)],
                  ["Pads expiry", l.padsExpiry.map(dateLong)],
                ] as [string, string[]][]).map(([label, values]) => (
                  <div key={label} className="min-w-0">
                    <div className="text-[12px] font-medium text-muted">{label}</div>
                    <div className="text-[14px] text-ink-2">{values.length ? values.map((v) => <div key={v}>{v}</div>) : missing}</div>
                  </div>
                ))}
              </div>
              <dl className="mt-1">
                <Row label="Serial numbers">
                  {l.serials.length === 0 ? missing : (
                    <>
                      <span className="font-semibold text-ink">{l.serials.length} total</span>
                      {l.serials.length !== l.qty && <span className="ml-2 text-[12.5px] font-medium text-medium">({l.qty} units on the invoice)</span>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {shown.map((sn) => <span key={sn} className="num rounded bg-surface-2 px-1.5 py-px text-[12px] text-ink-2">{sn}</span>)}
                        {l.serials.length > 8 && (
                          <button className="rounded px-1.5 text-[12px] font-semibold text-brand hover:underline" onClick={() => setAllSerials((v) => !v)}>
                            {allSerials ? "Show less" : `+${l.serials.length - 8} more`}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </Row>
              </dl>
            </div>
          );
        })}
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {aed.extras.map((x) => {
            const on = x.found.length > 0;
            return (
              <div key={x.key} className="flex items-start gap-2 text-[13.5px]" title={on ? `Found: ${x.found.join(", ")}` : "Not on this invoice"}>
                <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${on ? "border-low bg-low text-white" : "border-line-strong"}`} aria-hidden>
                  {on && <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
                </span>
                <span className={on ? "text-ink" : "text-muted"}>
                  {x.label}
                  {on && <span className="block text-[11.5px] text-muted">{x.found.map((f) => (f === "AED description" ? "in the AED description" : f)).join(" · ")}</span>}
                </span>
              </div>
            );
          })}
        </div>
        {!noResale && <ResaleOptions card={card} cards={cards} member={member} />}
      </div>
    </Section>
  );
}

export function AedDocsSection({ card, options }: { card: CardView; options: BoardOptions }) {
  const inv = card.invoice!;
  const due = cardDue(card);
  return (
    <Section title="IDs & dates" aside={<span className="inline-flex items-center gap-1 text-[12px] text-faint"><Lock /> from Zoho Books — read only</span>}>
      <dl>
        <Row label="Sales person">{card.invoice?.salesperson ?? <span className="text-faint">—</span>}</Row>
        <Row label="Sales Order / PI">{inv.reference ?? <span className="text-faint">—</span>}</Row>
        <Row label="Invoice">
          <a href={zohoUrl("invoice", inv.invoiceId, options.orgId)} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">{inv.number}</a> · {dateLong(inv.date)}
        </Row>
        <Row label="Due date">
          {inv.dueDate ? dateLong(inv.dueDate) : "—"}
          {due && <span className="ml-2"><DueChip due={due} /></span>}
        </Row>
      </dl>
    </Section>
  );
}

export function AedCardModal({ card, cards, member, options, onClose }: { card: CardView; cards: Cards; member: Member; options: BoardOptions; onClose: () => void }) {
  const { addCardEvents } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(null); setError(""); }, [card.id]);
  const inv = card.invoice!;

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
  const footer = draft ? (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn.primary} onClick={save}>Save changes</button>
      <button className={btn.ghost} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
      {error && <span className="text-[13px] font-medium text-high">{error}</span>}
    </div>
  ) : (
    <button className={btn.primary} onClick={startEdit}>Edit</button>
  );

  return (
    <Shell label={`${card.name} details`} onClose={onClose} footer={footer} side={<ChangeLog cardIds={[card.id, aedCustomerId(card.customerId)]} cards={cards} member={member} />}>
      <Header kind="invoice" sub={`${inv.number} · ${dateLong(inv.date)} · AedSmartx`} title={card.name} onClose={onClose} />
      <div className="grid gap-3 p-4 xl:grid-cols-2">
        <div className="space-y-3">
          {draft ? <Editor card={card} draft={draft} setDraft={setDraft} options={options} /> : <><CustomerSection card={card} /><ContactSection card={card} /></>}
          <AedNotesSection card={card} member={member} options={options} />
          <AedDocsSection card={card} options={options} />
        </div>
        <div className="space-y-3">
          <AedTrainingSection card={card} member={member} />
          <ItemDescriptionSection card={card} cards={cards} member={member} />
        </div>
      </div>
    </Shell>
  );
}
