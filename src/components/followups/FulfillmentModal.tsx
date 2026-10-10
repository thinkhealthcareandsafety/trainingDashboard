"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Member } from "@/lib/types";
import { type CardView, FULFIL_LABEL } from "@/lib/pipeline";
import { fmtDate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import {
  type BoardOptions, ChainSection, ChangeLog, ContactSection, CustomerSection, DocsSection, Header, NotesPanel, PaymentSection,
  SalesSection, Shell, TrainingSection, certEvents,
} from "./CardModal";
import { FulfilActions, ReplyPopup } from "./FulfilCerts";

// Shreya's Fulfillment board: every completed training, carried over from the training board with everything it had
// (alias included). Training Completed → Gratitude Email Sent → Certificates Generated → Sent to Logistics: the gratitude
// email, the replies and the certificates sit under the Training box (FulfilCerts.tsx). Every move is logged and can be undone.

type Cards = Map<string, CardView>;
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });

export function FulfillmentModal({ card, cards, trainingCards, member, options, onClose }: {
  card: CardView; cards: Cards; trainingCards: Cards; member: Member; options: BoardOptions; onClose: () => void;
}) {
  const { addCardEvents } = useStore();
  const done = card.schedule?.completed;
  const f = card.fulfillment!;
  const sub = `${FULFIL_LABEL[f.stage]} · ${card.docNumber ?? ""}${done ? ` · training completed ${dateLong(done.at)}` : ""}`;
  // The training card it came from (what was merged into it), shown as on the training board.
  const origin: CardView = { ...card, id: card.historyIds[1], historyIds: card.historyIds.slice(1) };
  // Labels in the change log come from both boards.
  const allCards = new Map([...trainingCards, ...cards]);

  // A starred card opens on its reply first.
  const [reply, setReply] = useState(false);
  useEffect(() => setReply(Boolean(f.star)), [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [card.id, f.stage, f.replies.length, Boolean(f.certs), payLeft]);
  const payment = <div ref={payRef}><PaymentSection card={origin} cards={trainingCards} /></div>;

  return (
    <Shell label={`${card.name} fulfillment`} onClose={onClose} side={<ChangeLog cardIds={card.historyIds} cards={allCards} member={member} />}>
      <Header sub={sub} title={card.name} onClose={onClose} />
      <div className="grid items-start gap-3 p-4 xl:grid-cols-2">
        <div ref={leftRef} className="space-y-3">
          <CustomerSection card={card} />
          <ContactSection card={card} />
          <NotesPanel card={card} member={member} heading={card.docNumber ?? card.name} oneLine />
          <ChainSection card={origin} cards={trainingCards} />
          {payLeft && payment}
        </div>
        <div ref={rightRef} className="space-y-3">
          <TrainingSection
            card={card}
            needEmail
            onCert={(cert) => addCardEvents(certEvents(card, cert, member.name))}
            footer={<FulfilActions card={card} member={member} onShowReply={() => setReply(true)} />}
          />
          {!payLeft && payment}
          <SalesSection card={card} />
          <DocsSection card={card} options={options} />
        </div>
      </div>
      {reply && f.replies.length > 0 && <ReplyPopup card={card} member={member} onClose={() => setReply(false)} />}
    </Shell>
  );
}
