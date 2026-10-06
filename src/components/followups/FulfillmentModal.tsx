"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Member } from "@/lib/types";
import { type CardView, type FulfilStage, FULFIL_LABEL } from "@/lib/pipeline";
import { fmtDate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { fireworks } from "@/lib/confetti";
import { btn } from "../ui";
import {
  type BoardOptions, ChainSection, ChangeLog, ContactSection, CustomerSection, DocsSection, Header, NotesPanel, PaymentSection,
  SalesSection, Shell, TrainingSection,
} from "./CardModal";

// Shreya's Fulfillment board: every completed training, carried over from the training board with everything it had
// (alias included). Training Completed → Process on hold → List Received → Certificates Generated → Sent to Logistics,
// moved from the card: the current step's choices sit under Notes. Each move is logged and can be undone.

type Cards = Map<string, CardView>;
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });

/** A tick box that does its step as soon as it's ticked (the next step's choices then take its place). One line each, so the card fits. */
function StepTick({ label, hint, onTick }: { label: string; hint?: string; onTick: () => void }) {
  return (
    <label title={hint} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border-2 border-line px-3.5 text-[13.5px] font-semibold text-ink hover:border-line-strong hover:bg-surface-2/60">
      <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={false} onChange={onTick} />
      {label}
    </label>
  );
}

/** The current step's choices — previous ones disappear as the card moves on. */
function FulfillmentSteps({ card, member }: { card: CardView; member: Member }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const [askLogistics, setAskLogistics] = useState(false);
  useEffect(() => setAskLogistics(false), [card.id]);
  useEffect(() => {
    if (!askLogistics) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), setAskLogistics(false)); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [askLogistics]);
  const f = card.fulfillment!;
  const move = (to: FulfilStage) => {
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_fulfillment", value: to, before: f.stage, by: member.name }]);
    toast({ text: `${card.name} moved to ${FULFIL_LABEL[to]}`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };
  const setWip = (on: boolean) => addCardEvents([{ cardIds: [card.id], kind: "set_wip", value: on ? "on" : "off", by: member.name }]);
  const generated = (alsoLogistics: boolean) => {
    setAskLogistics(false);
    move(alsoLogistics ? "logistics" : "generated");
  };

  return (
    // Title, the current step's choices and who moved it last on one wrapping row, so the card fits without scrolling.
    <section className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-[16px] font-bold tracking-tight text-ink">Certificates</h3>
        {f.stage === "completed" && (
          <>
            <StepTick label="Awaiting List of Participants" hint="Puts the card in Process on hold until the list comes." onTick={() => move("hold")} />
            <StepTick label="List of Names Received" hint="Already have the list? Goes straight to List Received." onTick={() => move("received")} />
          </>
        )}
        {f.stage === "hold" && (
          <>
            <span className="mr-1 text-[14px] font-semibold text-low">Waiting for List</span>
            <StepTick label="List of Names Received" hint="Moves the card to List Received." onTick={() => move("received")} />
          </>
        )}
        {f.stage === "received" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border-2 px-3.5 text-[13.5px] font-semibold ${f.wip ? "border-low bg-low-bg text-low" : "border-line text-ink-2 hover:border-line-strong"}`}>
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={Boolean(f.wip)} onChange={(e) => setWip(e.target.checked)} />
              Work in Progress
            </label>
            <button className={btn.primary} onClick={() => { fireworks(); setAskLogistics(true); }}>Certificates Generated</button>
            {f.wip && <span className="text-[12.5px] text-muted">In progress · {f.wip.by}, {dateLong(f.wip.at)}</span>}
          </div>
        )}
        {f.stage === "generated" && (
          <button className={btn.primary} onClick={() => move("logistics")}>Send to Logistics</button>
        )}
        {f.stage === "logistics" && <span className="text-[14px] font-semibold text-low">All done — sent to Logistics.</span>}
        {f.at && <span className="ml-auto text-[12px] text-muted">{FULFIL_LABEL[f.stage]} · {f.by}, {dateLong(f.at)}</span>}
      </div>

      {askLogistics && (
        <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={() => setAskLogistics(false)}>
          <div role="alertdialog" aria-label="Also send to Logistics?" className="modal-in w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-[17px] font-bold tracking-tight text-ink">Also send to Logistics?</h3>
            <p className="mt-1 text-[13.5px] text-muted">Certificates are generated for {card.name}. Send them to Logistics now, or keep the card in Certificates Generated for later.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btn.ghost} onClick={() => generated(false)}>Let me decide</button>
              <button className={btn.primary} onClick={() => generated(true)} autoFocus>Yes</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function FulfillmentModal({ card, cards, trainingCards, member, options, onClose }: {
  card: CardView; cards: Cards; trainingCards: Cards; member: Member; options: BoardOptions; onClose: () => void;
}) {
  const done = card.schedule?.completed;
  const sub = `${FULFIL_LABEL[card.fulfillment!.stage]} · ${card.docNumber ?? ""}${done ? ` · training completed ${dateLong(done.at)}` : ""}`;
  // The training card it came from (what was merged into it), shown as on the training board.
  const origin: CardView = { ...card, id: card.historyIds[1], historyIds: card.historyIds.slice(1) };
  // Labels in the change log come from both boards.
  const allCards = new Map([...trainingCards, ...cards]);

  // The Payment section (invoice / payment status, once the deal got that far) goes in whichever column is shorter
  // without it — cards differ (long merge chains on the left, multi-day trainings on the right), and the card must fit.
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const payRef = useRef<HTMLDivElement>(null);
  const [payLeft, setPayLeft] = useState(false);
  useLayoutEffect(() => {
    const l = leftRef.current?.offsetHeight ?? 0;
    const r = rightRef.current?.offsetHeight ?? 0;
    const p = payRef.current ? payRef.current.offsetHeight + 12 : 0; // + space-y-3
    if (!p) return;
    const [left, right] = payLeft ? [l - p, r] : [l, r - p];
    const want = left < right;
    if (want !== payLeft) setPayLeft(want);
  }, [card.id, card.fulfillment?.stage, card.fulfillment?.wip, payLeft]);
  const payment = <div ref={payRef}><PaymentSection card={origin} cards={trainingCards} /></div>;

  return (
    <Shell label={`${card.name} fulfillment`} onClose={onClose} side={<ChangeLog cardIds={card.historyIds} cards={allCards} member={member} />}>
      <Header sub={sub} title={card.name} onClose={onClose} />
      <div className="grid items-start gap-3 p-4 xl:grid-cols-2">
        <div ref={leftRef} className="space-y-3">
          <CustomerSection card={card} />
          <ContactSection card={card} />
          <NotesPanel card={card} member={member} heading={card.docNumber ?? card.name} oneLine />
          <FulfillmentSteps card={card} member={member} />
          <ChainSection card={origin} cards={trainingCards} />
          {payLeft && payment}
        </div>
        <div ref={rightRef} className="space-y-3">
          <TrainingSection card={card} />
          {!payLeft && payment}
          <SalesSection card={card} />
          <DocsSection card={card} options={options} />
        </div>
      </div>
    </Shell>
  );
}
