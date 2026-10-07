"use client";

import { useEffect, useState } from "react";
import type { Member } from "@/lib/types";
import type { CardView } from "@/lib/pipeline";
import { type LogiStep, LOGI_COLUMN_LABEL, LOGI_STEP_LABEL } from "@/lib/logistics";
import { fmtDate, fmtINR } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { confettiPop } from "@/lib/confetti";
import { btn, inputCls } from "../ui";
import {
  type BoardOptions, ChainSection, ChangeLog, ContactSection, CustomerSection, DocsSection, Header, NotesPanel, PaymentSection, Section, Shell,
  TrainingSection,
} from "./CardModal";
import { AedDocsSection, AedNotesSection, ItemDescriptionSection } from "./AedModal";

// Arti's Logistics board. AED Delivered Status: mark delivered (then hide the card). From Sent to Logistics on: the
// certificates of a completed training, merged with its paid invoice's payment(s), then packed, shipped and received —
// the current step's choices sit above Merged; every step is logged, and undoing one undoes the steps after it.

type Cards = Map<string, CardView>;
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });
const todayYmd = () => new Date().toLocaleDateString("en-CA");

/** A small question window over the card (Escape or a click outside closes it). */
function Prompt({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), onClose()); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-label={title} className="modal-in w-full max-w-md rounded-2xl bg-surface p-5 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold tracking-tight text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------------- AED Delivered Status ---------------- */

function DeliverySection({ card, member }: { card: CardView; member: Member }) {
  const { cardEvents, addCardEvents, revertCardEvent, toast } = useStore();
  const [askHide, setAskHide] = useState(false);
  useEffect(() => setAskHide(false), [card.id]);
  const deliveredEv = cardEvents.find((e) => !e.revertedAt && e.kind === "set_delivered" && e.cardIds.includes(card.id));
  const hidden = card.logiAed?.hidden;
  const moved = card.logiAed?.moved;
  const hide = () => {
    setAskHide(false);
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "logi_hide", by: member.name }]);
    toast({ text: `${card.docNumber} hidden — bring it back with Unhide cards`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };
  const markDelivered = () => {
    addCardEvents([{ cardIds: [card.id], kind: "set_delivered", by: member.name }]);
    setAskHide(true);
  };
  return (
    <Section title="Delivery">
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 ${card.delivered ? "border-low bg-low-bg" : "border-medium bg-medium-bg"}`}>
        <span className="text-[14px]">
          <b className={card.delivered ? "text-low" : "text-medium"}>{card.delivered ? "Delivered" : "Not delivered yet"}</b>
          {card.delivered && <span className="text-[12.5px] text-muted"> · {card.delivered.by}, {dateLong(card.delivered.at)}</span>}
        </span>
        {deliveredEv ? (
          <button className={`${btn.quiet} !h-8`} onClick={() => revertCardEvent(deliveredEv.id, member.name)}>Undo delivered</button>
        ) : (
          <button className="press inline-flex h-8 items-center justify-center rounded-full bg-low px-3.5 text-[13px] font-semibold text-white hover:brightness-110" onClick={markDelivered}>
            Mark as delivered
          </button>
        )}
      </div>
      {moved && (
        <div className="mt-2 rounded-xl border-2 border-info bg-info-bg px-3 py-2">
          <div className="text-[14px] font-bold text-info">Moved by {moved.by || "the AedSmartx board"}</div>
          <div className="text-[12.5px] text-muted">To {moved.to}{moved.at && ` · ${dateLong(moved.at)}`} on the AedSmartx board</div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        {hidden ? (
          <>
            <span>Hidden from AED Delivered Status · {hidden.by}, {dateLong(hidden.at)}</span>
            <button className={`${btn.ghost} !h-8`} onClick={() => revertCardEvent(hidden.eventId, member.name)}>Unhide</button>
          </>
        ) : (
          <>
            <span>Done with this one? Hide it from the column.</span>
            <button className={`${btn.ghost} !h-8`} onClick={hide}>Hide card</button>
          </>
        )}
      </div>
      {askHide && (
        <Prompt title="Marked as delivered" onClose={() => setAskHide(false)}>
          <p className="mt-1 text-[13.5px] text-muted">Hide {card.docNumber} ({card.name}) from AED Delivered Status? You can bring it back any time with Unhide cards.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className={btn.ghost} onClick={() => setAskHide(false)}>Keep showing</button>
            <button className={btn.primary} onClick={hide} autoFocus>Hide card</button>
          </div>
        </Prompt>
      )}
    </Section>
  );
}

export function LogiAedModal({ card, cards, member, options, onClose }: { card: CardView; cards: Cards; member: Member; options: BoardOptions; onClose: () => void }) {
  const inv = card.invoice!;
  return (
    <Shell label={`${card.name} delivery`} onClose={onClose} side={<ChangeLog cardIds={[card.id]} cards={cards} member={member} kinds={["set_delivered", "logi_hide", "add_note"]} />}>
      <Header kind="invoice" sub={`${inv.number} · ${dateLong(inv.date)} · AED Delivered Status`} title={card.name} onClose={onClose} />
      <div className="grid gap-3 p-4 xl:grid-cols-2">
        <div className="space-y-3">
          <CustomerSection card={card} />
          <ContactSection card={card} />
          <AedNotesSection card={card} member={member} options={options} />
          <AedDocsSection card={card} options={options} />
        </div>
        <div className="space-y-3">
          <DeliverySection card={card} member={member} />
          <ItemDescriptionSection card={card} cards={cards} member={member} noResale />
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- Sent to Logistics → Received by Client ---------------- */

/** Big choice button: selected = coloured, the others plain. */
function Choice({ on, tone, onClick, children }: { on?: boolean; tone: "low" | "medium"; onClick: () => void; children: React.ReactNode }) {
  const cls = on ? (tone === "low" ? "border-low bg-low-bg text-low" : "border-medium bg-medium-bg text-medium") : "border-line text-ink hover:border-line-strong hover:bg-surface-2/60";
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-[13.5px] font-semibold ${cls}`}>
      <span className={`size-3 rounded-full border-2 ${on ? "border-current bg-current" : "border-line-strong"}`} aria-hidden />
      {children}
    </button>
  );
}

/** "Has the shipment reached the client?" — Yes (confetti, Received by Client in green) or an expected date (yellow). */
function ReachedPrompt({ card, onAnswer, onClose }: { card: CardView; onAnswer: (value: string, from?: Element) => void; onClose: () => void }) {
  const [date, setDate] = useState(card.logistics?.expected ?? "");
  return (
    <Prompt title="Has the shipment reached the client?" onClose={onClose}>
      <p className="mt-1 text-[13.5px] text-muted">{card.name} · {card.docNumber}</p>
      <button className="press mt-4 inline-flex h-10 w-full items-center justify-center rounded-full bg-low text-[14px] font-semibold text-white hover:brightness-110" onClick={(e) => onAnswer("received", e.currentTarget)} autoFocus>
        Yes, it has reached
      </button>
      <div className="mt-3 rounded-xl border border-line p-3">
        <div className="text-[13px] font-semibold text-ink-2">Not yet — expected on</div>
        <div className="mt-2 flex gap-2">
          <input type="date" className={`${inputCls} !h-9 flex-1 text-[13px]`} value={date} min={todayYmd()} onChange={(e) => setDate(e.target.value)} aria-label="Expected date" />
          <button className={btn.ghost} disabled={!date} onClick={() => onAnswer(`expected:${date}`)}>Set date</button>
        </div>
      </div>
      <div className="mt-3 text-right"><button className={btn.quiet} onClick={onClose}>Ask me later</button></div>
    </Prompt>
  );
}

/** The current step's choices (above Merged) — earlier ones disappear as the card moves on. */
function LogisticsSteps({ card, cards, member, onSwitch }: { card: CardView; cards: Cards; member: Member; onSwitch: (id: string) => void }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const l = card.logistics!;
  const [ready, setReady] = useState(false);
  const [pick, setPick] = useState<LogiStep | null>(null);
  const waitsForReply = l.step === "ship_dispatched" || l.step === "expected";
  const [asking, setAsking] = useState(waitsForReply);
  useEffect(() => { setReady(false); setPick(null); }, [card.id, l.step]);
  // Opening a dispatched card (or one still expected) asks whether it has reached the client.
  useEffect(() => setAsking(waitsForReply), [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const undoable = (text: string, id: string) => toast({ text, actionLabel: "Undo", onAction: () => revertCardEvent(id, member.name) });
  const step = (value: string, moveText?: string) => {
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_logistics", value, before: l.step, by: member.name }]);
    if (moveText) undoable(moveText, ev.id);
  };
  const answer = (value: string, from?: Element) => {
    setAsking(false);
    if (value === "received") {
      confettiPop(from);
      step("received", `${card.name} reached the client — moved to Received by Client`);
    } else step(value, `${card.name} moved to Received by Client — expected ${dateLong(value.slice("expected:".length))}`);
  };
  const merge = () => {
    const [stlId, payId] = l.column === "stl" ? [card.id, l.partnerId!] : [l.partnerId!, card.id];
    const pay = cards.get(payId);
    const [ev] = addCardEvents([{ cardIds: [stlId, payId], kind: "logi_merge", value: pay?.linkedInvoice?.number ?? pay?.docNumber, before: card.docNumber, by: member.name }]);
    undoable(`${card.name} merged — moved to Payment Received`, ev.id);
    onSwitch(stlId);
  };
  const partner = l.partnerId ? cards.get(l.partnerId) : undefined;
  const paidLine = (p: CardView) => {
    const ps = p.payments ?? (p.payment ? [p.payment] : []);
    return `${ps.length > 1 ? `${ps.length} payments` : `Payment #${ps[0]?.number ?? ""}`} · Invoice ${p.linkedInvoice?.number ?? ""} · ${fmtINR(ps.reduce((s, x) => s + x.amount, 0))} · paid in full`;
  };
  const mergeBtn = <button className={btn.primary} onClick={merge}>Merge &amp; move to Payment Received</button>;

  let body: React.ReactNode;
  if (l.column === "stl") {
    body = partner ? (
      <>
        <span className="text-[13.5px] text-ink-2"><b className="text-low">Payment received</b> — {paidLine(partner)}</span>
        {mergeBtn}
      </>
    ) : <span className="text-[13.5px] font-medium text-medium">{l.waiting}</span>;
  } else if (l.column === "payment" && !l.merged) {
    body = partner ? (
      <>
        <span className="text-[13.5px] text-ink-2"><b className="text-low">Certificates sent to Logistics</b> for this training</span>
        {mergeBtn}
      </>
    ) : (
      <span className="text-[13.5px]">
        <b className="text-medium">Waiting for Certificates</b>
        <span className="text-muted"> — {l.certStage ? `now in ${l.certStage} on the Fulfillment board` : "not on the Fulfillment board yet"}</span>
      </span>
    );
  } else if (l.column === "payment") {
    body = (
      <>
        <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border-2 px-3.5 text-[13.5px] font-semibold ${ready ? "border-low bg-low-bg text-low" : "border-line text-ink hover:border-line-strong"}`}>
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={ready} onChange={(e) => setReady(e.target.checked)} />
          Ready for Packaging?
        </label>
        <button className={btn.primary} disabled={!ready} onClick={() => step("packages", `${card.name} moved to Packages`)}>Confirm</button>
      </>
    );
  } else if (l.column === "packages") {
    body = (
      <>
        <Choice tone="low" on={l.step === "pack_process"} onClick={() => l.step !== "pack_process" && step("pack_process")}>Packaging in Process</Choice>
        <Choice tone="medium" on={l.step === "pack_hold"} onClick={() => l.step !== "pack_hold" && step("pack_hold")}>On hold</Choice>
        <button className={btn.primary} onClick={() => step("shipments", `${card.name} moved to Shipments`)}>Ready to Dispatch</button>
      </>
    );
  } else if (l.column === "shipments") {
    const chosen = pick ?? (l.step === "ship_dispatched" || l.step === "ship_hold" ? l.step : null);
    body = (
      <>
        <Choice tone="low" on={chosen === "ship_dispatched"} onClick={() => setPick("ship_dispatched")}>Dispatched</Choice>
        <Choice tone="medium" on={chosen === "ship_hold"} onClick={() => setPick("ship_hold")}>On hold</Choice>
        <button className={btn.primary} disabled={!pick || pick === l.step} onClick={() => pick && step(pick, pick === "ship_dispatched" ? `${card.name} dispatched` : undefined)}>Confirm</button>
        {l.step === "ship_dispatched" && <button className={btn.ghost} onClick={() => setAsking(true)}>Has it reached?</button>}
      </>
    );
  } else {
    body = l.step === "received" ? (
      <span className="text-[14px] font-semibold text-low">Reached the client</span>
    ) : (
      <>
        <span className="text-[14px] font-semibold text-medium">Expected {l.expected ? dateLong(l.expected) : "—"}</span>
        <button className="press inline-flex h-9 items-center justify-center rounded-full bg-low px-4 text-[13px] font-semibold text-white hover:brightness-110" onClick={(e) => answer("received", e.currentTarget)}>Reached</button>
        <button className={btn.ghost} onClick={() => setAsking(true)}>Change date</button>
      </>
    );
  }

  const last = l.step ? `${LOGI_STEP_LABEL[l.step]} · ${l.by}, ${dateLong(l.at!)}` : l.merged ? `Merged · ${l.merged.by}, ${dateLong(l.merged.at)}` : undefined;
  return (
    <section className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-[16px] font-bold tracking-tight text-ink">Logistics</h3>
        {body}
        {last && <span className="ml-auto text-[12px] text-muted">{last}</span>}
      </div>
      {asking && <ReachedPrompt card={card} onAnswer={answer} onClose={() => setAsking(false)} />}
    </section>
  );
}

/** Where it ships: the invoice's ship-to address and phone. */
function ShipToSection({ card }: { card: CardView }) {
  const inv = card.linkedInvoice ?? card.invoice;
  return (
    <Section title="Ship to">
      {inv?.shipTo ? (
        <p className="text-[14px] leading-snug text-ink-2">
          {inv.shipTo}
          {inv.shipPhone && <span className="block text-[13px] text-muted">Phone {inv.shipPhone}</span>}
        </p>
      ) : (
        <p className="text-[14px] text-faint">{inv ? `No ship-to address on invoice ${inv.number}` : "No invoice yet"}</p>
      )}
    </Section>
  );
}

export function LogisticsModal({ card, cards, trainingCards, member, options, onClose, onSwitch }: {
  card: CardView; cards: Cards; trainingCards: Cards; member: Member; options: BoardOptions; onClose: () => void; onSwitch: (id: string) => void;
}) {
  const l = card.logistics!;
  // The card it's built from, as on the training board (its merge chain, payments and documents).
  const origin = l.origin.fulfillment ? { ...l.origin, historyIds: l.origin.historyIds.slice(1) } : l.origin;
  const allCards = new Map([...trainingCards, ...cards]);
  const pi = origin.pi ?? origin.linkedPI;
  const sub = `${LOGI_COLUMN_LABEL[l.column]}${pi ? ` · ${pi.number}` : card.docNumber ? ` · ${card.docNumber}` : ""}`;
  return (
    <Shell label={`${card.name} logistics`} onClose={onClose} side={<ChangeLog cardIds={card.historyIds} cards={allCards} member={member} />}>
      <Header sub={sub} title={card.name} flagged={card.flaggedWith.length > 0} onClose={onClose} />
      <div className="grid items-start gap-3 p-4 xl:grid-cols-2">
        <div className="space-y-3">
          <CustomerSection card={card} />
          <ContactSection card={card} />
          <NotesPanel card={card} member={member} heading={pi?.number ?? card.docNumber ?? card.name} oneLine />
          <LogisticsSteps card={card} cards={cards} member={member} onSwitch={onSwitch} />
          <ChainSection card={origin} cards={trainingCards} />
        </div>
        <div className="space-y-3">
          <TrainingSection card={card} />
          <ShipToSection card={origin} />
          <PaymentSection card={origin} cards={trainingCards} />
          <DocsSection card={origin} options={options} />
        </div>
      </div>
    </Shell>
  );
}

