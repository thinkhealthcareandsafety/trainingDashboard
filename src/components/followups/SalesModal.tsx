"use client";

import { useEffect, useState } from "react";
import type { CardView } from "@/lib/pipeline";
import { cardLabel } from "@/lib/pipeline";
import { canRevert } from "@/lib/roles";
import type { CardEvent, Member } from "@/lib/types";
import { useStore } from "@/lib/store";
import { fmtDate, fmtINR } from "@/lib/dates";
import type { SalesDetail } from "@/lib/salesSync";
import { btn } from "../ui";
import {
  type BoardOptions, AskLink, ChainSection, ChangeLog, ContactSection, CustomerSection, DocsSection, Editor, FlagBadge, Header, NotesSection, PaymentSection,
  Lock, Section, SalesSection, Shell, diff, flagText,
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
            <DocumentSection card={card} />
            <DocsSection card={card} options={options} />
          </div>
        </div>
      </div>
    </Shell>
  );
}

/** The Zoho document a card stands for ("estimates:<id>" …): its own, or a payment's invoice. Leads have none. */
function docKey(c: CardView): string | undefined {
  if (c.kind === "quote" && c.quote) return `estimates:${c.quote.estimateId}`;
  if (c.kind === "pi" && c.pi) return `salesorders:${c.pi.salesorderId}`;
  if (c.kind === "invoice" && c.invoice) return `invoices:${c.invoice.invoiceId}`;
  const inv = c.linkedInvoice ?? c.invoice;
  return c.kind === "payment" && inv ? `invoices:${inv.invoiceId}` : undefined;
}
const details = new Map<string, Promise<SalesDetail | { error: string }>>(); // one read per document per page load
const loadDetail = (key: string) => {
  if (!details.has(key)) details.set(key, fetch(`/api/sales?doc=${encodeURIComponent(key)}`).then((r) => r.json()).catch(() => ({ error: "Couldn't reach the server" })));
  return details.get(key)!;
};
const money = (v: number) => fmtINR(v);
/** "CGST9" → "CGST 9%" (Zoho's tax names). */
const taxName = (n: string) => n.replace(/^([A-Za-z]+)\s*(\d+(?:\.\d+)?)$/, "$1 $2%");

/**
 * The document itself, like Zoho Books shows it (owner, 30 Oct: "the items … their hsn code, qty, rate, gst, amount …
 * ship to address … a click to open thing"): read when the card opens (Zoho once, then kept — salesSync.ts).
 */
function DocumentSection({ card }: { card: CardView }) {
  const key = docKey(card);
  const [d, setD] = useState<SalesDetail | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    setD(null);
    if (key) loadDetail(key).then((x) => live && setD(x));
    return () => { live = false; };
  }, [key]);
  if (!key) return null;
  const title = card.kind === "payment" ? "Invoice" : card.kind === "quote" ? "Quotation" : card.kind === "pi" ? "Performa invoice" : "Invoice";
  const aside = <span className="inline-flex items-center gap-1 text-[12px] text-faint"><Lock /> from Zoho Books</span>;
  if (!d) return <Section title={title} aside={aside}><div className="h-24 animate-pulse rounded-lg bg-surface-2" /></Section>;
  if ("error" in d) return <Section title={title} aside={aside}><p className="text-[13px] text-high">{d.error}</p></Section>;
  const row = "flex justify-between gap-3";
  return (
    <Section title={`${title} · ${d.number}`} aside={aside}>
      <table className="w-full table-fixed text-[13px]">
        <thead className="text-left text-[11.5px] text-muted">
          <tr className="border-b border-line">
            <th className="w-[44%] pb-1.5 font-medium">Item &amp; description</th><th className="pb-1.5 font-medium">HSN/SAC</th><th className="w-[9%] pb-1.5 text-right font-medium">Qty</th>
            <th className="pb-1.5 text-right font-medium">Rate</th><th className="w-[10%] pb-1.5 text-right font-medium">GST</th><th className="pb-1.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i} className="border-b border-line align-top last:border-b-0">
              <td className="py-1.5 pr-2">
                <div className="font-medium text-ink [overflow-wrap:anywhere]">{l.name}</div>
                {l.description && <div className="line-clamp-2 whitespace-pre-line text-[12px] text-muted" title={l.description}>{l.description}</div>}
              </td>
              <td className="num py-1.5 pr-1 text-ink-2">{l.hsn ?? "—"}</td>
              <td className="num py-1.5 text-right text-ink-2">{l.qty}{l.unit ? <span className="block text-[11px] text-muted">{l.unit}</span> : null}</td>
              <td className="num py-1.5 text-right text-ink-2">{money(l.rate)}</td>
              <td className="num py-1.5 text-right text-ink-2">{l.gst === undefined ? "—" : `${l.gst}%`}</td>
              <td className="num py-1.5 text-right font-medium text-ink">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-2 w-full max-w-[17rem] space-y-0.5 border-t border-line pt-2 text-[13px]">
        <div className={row}><span className="text-muted">Sub total</span><span className="num text-ink-2">{money(d.subTotal)}</span></div>
        {d.discount ? <div className={row}><span className="text-muted">Discount</span><span className="num text-ink-2">−{money(d.discount)}</span></div> : null}
        {d.shipping ? <div className={row}><span className="text-muted">Shipping</span><span className="num text-ink-2">{money(d.shipping)}</span></div> : null}
        {d.taxes.map((t) => <div key={t.name} className={row}><span className="text-muted">{taxName(t.name)}</span><span className="num text-ink-2">{money(t.amount)}</span></div>)}
        {d.adjustment ? <div className={row}><span className="text-muted">Adjustment</span><span className="num text-ink-2">{money(d.adjustment)}</span></div> : null}
        <div className={`${row} border-t border-line pt-1 text-[14px] font-bold text-ink`}><span>Total</span><span className="num">{money(d.total)}</span></div>
      </div>
      {d.shipTo && (
        <details className="group mt-2 border-t border-line pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 20 20" className="size-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7.5 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Ship to
          </summary>
          <div className="mt-1 pl-5 text-[13px] leading-snug text-ink-2">
            {d.shipTo.attention && <div className="font-medium text-ink">{d.shipTo.attention}</div>}
            {d.shipTo.lines.map((l, i) => <div key={i}>{l}</div>)}
            {d.shipTo.phone && <div className="num">{d.shipTo.phone}</div>}
            {d.placeOfSupply && <div className="text-muted">Place of supply: {d.placeOfSupply}</div>}
          </div>
        </details>
      )}
    </Section>
  );
}
