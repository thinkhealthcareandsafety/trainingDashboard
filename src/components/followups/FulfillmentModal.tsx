"use client";

import type { Member } from "@/lib/types";
import { type CardView, type FulfilStage, FULFIL_LABEL, FULFIL_STAGES } from "@/lib/pipeline";
import { fmtDate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { btn } from "../ui";
import {
  type BoardOptions, ChainSection, ChangeLog, ContactSection, CustomerSection, DocsSection, Header, NotesPanel, PaymentSection,
  SalesSection, Shell, TrainingSection,
} from "./CardModal";

// Shreya's Fulfillment board: one card per fully paid training invoice, carried over from Payment received with
// everything it had. The certificates move along Payments Done → Certificates Generated → Certificates Sent →
// Gratitude Email sent by hand; each move is logged and can be undone.

type Cards = Map<string, CardView>;
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });

/** The four stages as a stepper: the next one is the main button, any other can be picked too. */
function FulfillmentSection({ card, member }: { card: CardView; member: Member }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const f = card.fulfillment!;
  const at = FULFIL_STAGES.indexOf(f.stage);
  const next = FULFIL_STAGES[at + 1];
  const move = (to: FulfilStage) => {
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_fulfillment", value: to, before: f.stage, by: member.name }]);
    toast({ text: `${card.name} moved to ${FULFIL_LABEL[to]}`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };
  // One compact row (title, steps, then the next move), so the card still fits without scrolling.
  return (
    <section className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-2 text-[16px] font-bold tracking-tight text-ink">Certificates</h3>
        <ol className="flex flex-wrap items-center gap-1.5">
          {FULFIL_STAGES.map((s, i) => {
            const done = i < at;
            const here = i === at;
            return (
              <li key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-faint" aria-hidden>→</span>}
                <button
                  onClick={() => !here && move(s)}
                  disabled={here}
                  title={here ? "Current stage" : `Move to ${FULFIL_LABEL[s]}`}
                  className={`h-8 rounded-full border-2 px-3 text-[12.5px] font-semibold transition ${
                    here ? "border-brand bg-brand-soft text-ink" : done ? "border-low/40 bg-low-bg text-low hover:border-low" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {done ? "✓ " : ""}{FULFIL_LABEL[s]}
                </button>
              </li>
            );
          })}
        </ol>
        <span className="ml-auto flex items-center gap-1.5">
          {f.at && <span className="mr-1 text-[12px] text-muted">Moved by {f.by}, {dateLong(f.at)}</span>}
          {at > 0 && <button className={btn.quiet} onClick={() => move(FULFIL_STAGES[at - 1])}>Back</button>}
          {next ? (
            <button className={btn.primary} onClick={() => move(next)}>Move to {FULFIL_LABEL[next]}</button>
          ) : (
            <span className="text-[13.5px] font-semibold text-low">All done</span>
          )}
        </span>
      </div>
    </section>
  );
}

export function FulfillmentModal({ card, cards, trainingCards, member, options, onClose }: {
  card: CardView; cards: Cards; trainingCards: Cards; member: Member; options: BoardOptions; onClose: () => void;
}) {
  const inv = card.linkedInvoice;
  const paid = card.payments?.at(-1)?.date;
  const sub = `${FULFIL_LABEL[card.fulfillment!.stage]} · Invoice ${inv?.number ?? "—"}${paid ? ` · paid ${dateLong(paid)}` : ""}`;
  // The training card it came from (what was merged into it), shown as on the training board.
  const origin: CardView = { ...card, id: card.historyIds[1], historyIds: card.historyIds.slice(1) };
  // Labels in the change log come from both boards.
  const allCards = new Map([...trainingCards, ...cards]);
  return (
    <Shell label={`${card.name} fulfillment`} onClose={onClose} side={<ChangeLog cardIds={card.historyIds} cards={allCards} member={member} />}>
      <Header sub={sub} title={card.name} onClose={onClose} />
      <div className="space-y-3 p-4">
        <FulfillmentSection card={card} member={member} />
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-3">
            <CustomerSection card={card} />
            <ContactSection card={card} />
            <NotesPanel card={card} member={member} heading={inv?.number ?? card.name} oneLine />
            <ChainSection card={origin} cards={trainingCards} />
            {/* One payment is already in IDs & dates; several get the summary with "Show all PRs". */}
            {(card.payments?.length ?? 0) > 1 && <PaymentSection card={origin} cards={trainingCards} />}
          </div>
          <div className="space-y-3">
            <TrainingSection card={card} />
            <SalesSection card={card} />
            <DocsSection card={card} options={options} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
