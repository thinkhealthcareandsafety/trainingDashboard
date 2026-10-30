"use client";

import { useEffect, useState } from "react";
import type { CardView } from "@/lib/pipeline";
import { cardLabel } from "@/lib/pipeline";
import { canRevert } from "@/lib/roles";
import type { CardEvent, Member } from "@/lib/types";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/dates";
import { btn } from "../ui";
import {
  type BoardOptions, AskLink, ChainSection, ChangeLog, ContactSection, CustomerSection, DocsSection, Editor, FlagBadge, Header, NotesSection, PaymentSection,
  SalesSection, Shell, diff, flagText,
} from "./CardModal";

type Cards = Map<string, CardView>;
const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });
type Draft = Parameters<typeof Editor>[0]["draft"];

/*
 * A Sales board card (owner, 30 Oct: "the modals will change a bit … we would be tracking quotes to payment received"):
 * the Training card's popup without the training block — customer, contacts, notes, merges, payment, sales person,
 * Zoho IDs — and the document itself (its lines, totals, ship-to). Edit / Delete as on the Training board.
 */
export function SalesModal({ card, cards, member, options, onClose, onReviewMerge }: {
  card: CardView; cards: Cards; member: Member; options: BoardOptions; onClose: () => void; onReviewMerge: () => void;
}) {
  const { addCardEvents, revertCardEvent, cardEvents, toast } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setDraft(null); setError(""); setConfirmDelete(false); }, [card.id]);

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
    const [ev] = addCardEvents([{ cardIds: [...new Set([card.id, ...card.historyIds])], kind: "delete", by: member.name }]);
    toast({ text: `Deleted ${cardLabel(card)} — ${card.name} is back in Potential Customers`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    onClose();
  };
  const ownDelete = cardEvents.some((e) => !e.revertedAt && e.kind === "delete" && e.cardIds.includes(card.id));
  const canRestore = cardEvents.some((e) => !e.revertedAt && e.kind === "delete" && e.cardIds.includes(card.id) && canRevert(member, e));
  const restore = () => { const ev = activeEvent((e) => e.kind === "delete" && e.cardIds.includes(card.id)); if (ev) revertCardEvent(ev.id, member.name); };
  const mergeEvent = (fromId: string) => activeEvent((e) => e.kind === "merge" && e.cardIds[0] === fromId && e.cardIds[1] === card.id);
  const unmerge = (fromId: string) => { const ev = mergeEvent(fromId); if (ev) revertCardEvent(ev.id, member.name); };
  const canUnmerge = (fromId: string) => { const ev = mergeEvent(fromId); return Boolean(ev && canRevert(member, ev)); };

  const sub = card.kind === "lead" ? "Zoho customer" : `${card.docNumber} · ${card.docDate ? dateLong(card.docDate) : ""}`;
  const footer = draft ? (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn.primary} onClick={save}>Save changes</button>
      <button className={btn.ghost} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
      {error && <span className="text-[13px] font-medium text-high">{error}</span>}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn.primary} onClick={startEdit} disabled={card.deleted}>Edit</button>
      {card.kind !== "lead" && !card.deleted && (confirmDelete ? (
        <span className="ml-auto inline-flex items-center gap-2 text-[13px] text-muted">
          Delete this card? The customer goes back to Potential Customers (Zoho is not changed).
          <button className={btn.danger} onClick={del}>Delete</button>
          <button className={btn.quiet} onClick={() => setConfirmDelete(false)}>Keep</button>
        </span>
      ) : <button className={`${btn.danger} ml-auto`} onClick={() => setConfirmDelete(true)}>Delete</button>)}
    </div>
  );

  return (
    <Shell label={`${card.name} details`} onClose={onClose} footer={footer} side={<ChangeLog cardIds={card.historyIds} cards={cards} member={member} />}>
      <Header kind={card.kind} sub={sub} title={card.name} flagged={card.flaggedWith.length > 0}
        ask={<AskLink cardId={card.id} title={`${card.name}${card.docNumber ? ` · ${card.docNumber}` : ""}`} search={card.name} />} onClose={onClose} />
      <div className="space-y-3 p-4">
        {card.deleted && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-high-bg px-4 py-3 text-[14px] text-high">
            {ownDelete ? "This card is deleted; the customer is back in Potential Customers." : "Hidden because the card it was merged into was deleted — restore that card to bring it back."}
            {ownDelete && canRestore && <button className="font-semibold underline" onClick={restore}>Restore</button>}
          </div>
        )}
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
            <SalesSection card={card} />
            <DocsSection card={card} options={options} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
