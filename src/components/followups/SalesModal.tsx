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
  Compact, Lock, Section, SalesSection, Shell, diff, flagText,
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
      {/* Wide screens: one window, no scrolling (owner, 3 Nov: "fit in one window") — the top row keeps its height, the
          document takes what's left and only its lines scroll when there are many. Phones scroll as before. */}
      <div className="xl:flex xl:h-full xl:flex-col">
      <Header kind={card.kind} sub={sub} title={card.name} flagged={card.flaggedWith.length > 0}
        ask={<AskLink cardId={card.id} title={`${card.name}${card.docNumber ? ` · ${card.docNumber}` : ""}`} search={card.name} />} onClose={onClose} />
      <div className="space-y-3 p-4 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:gap-3 xl:space-y-0">
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
        {/* Owner, 3 Nov: "customer details | IDs and dates, then the quote / PI / invoice … in a table" — the document gets
            the whole width, the customer folds away until clicked. */}
        {/* Two columns of the same height: each column's last box stretches, so the bottoms line up (owner, 3 Nov). */}
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="flex flex-col gap-3 [&>*:last-child]:flex-1">
            <CustomerFold card={card} open={Boolean(draft)}>
              {draft ? <Editor card={card} draft={draft} setDraft={setDraft} options={options} /> : <><CustomerSection card={card} /><ContactSection card={card} /></>}
            </CustomerFold>
            <SalesSection card={card} />
            <PaymentSection card={card} cards={cards} />
            <NotesSection card={card} member={member} options={options} />
          </div>
          <div className="flex flex-col gap-3 [&>*:last-child]:flex-1">
            <ChainSection card={card} cards={cards} onUnmerge={unmerge} canUnmerge={canUnmerge} />
            <DocsSection card={card} options={options} dense />
          </div>
        </div>
        <DocumentSection card={card} />
      </div>
      </div>
    </Shell>
  );
}

/** Customer + contact, folded to one line until clicked (open while editing). */
function CustomerFold({ card, open, children }: { card: CardView; open: boolean; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [card.id]);
  const isOpen = open || shown;
  const gist = [card.type, card.sector, card.phones[0]?.value, card.emails[0]?.value].filter(Boolean).join(" · ");
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button type="button" aria-expanded={isOpen} disabled={open} onClick={() => setShown(!isOpen)}
        className="flex w-full min-w-0 items-center gap-2 rounded-2xl px-4 py-3.5 text-left hover:bg-surface-2/60">
        <svg viewBox="0 0 20 20" className={`size-4 shrink-0 text-muted transition ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7.5 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h3 className="shrink-0 text-[16px] font-bold tracking-tight text-ink">Customer details</h3>
        {!isOpen && <span className="ml-auto min-w-0 truncate text-[13px] text-muted" title={gist}>{gist}</span>}
      </button>
      {isOpen && <div className="space-y-2.5 px-4 pb-3.5"><Compact.Provider value={true}>{children}</Compact.Provider></div>}
    </section>
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
  // Number columns take only the width they need, so the item's name gets the rest.
  const th = "w-px whitespace-nowrap px-2.5 py-2 text-[12px] font-semibold text-muted";
  const td = "num w-px whitespace-nowrap px-2.5 py-2 text-[13.5px] text-ink-2";
  return (
    // Its own box (not Section) so it can fill what's left of the window and let only the lines scroll.
    <section className="rounded-2xl border border-line bg-surface px-4 py-3.5 xl:flex xl:min-h-0 xl:flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-[16px] font-bold tracking-tight text-ink">
          {`${title} · ${d.number}`}
          <span className="ml-2 text-[13px] font-medium text-muted">{d.lines.length} item{d.lines.length === 1 ? "" : "s"}</span>
        </h3>
        {aside}
      </div>
      {/* Wide screens: the totals sit beside the lines, so the lines get the height (owner, 3 Nov: "fit in one window"). */}
      <div className="xl:grid xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_17rem] xl:grid-rows-[minmax(0,1fr)] xl:items-start xl:gap-4">
      {/* A real table (owner, 3 Nov: "it will look better in a table"): ruled cells, a header band. At least ~3 lines
          show; more scroll inside the box under a header that stays. */}
      <div className="no-scrollbar overflow-auto rounded-xl border border-line xl:max-h-full xl:min-h-[15rem]">
        <table className="w-full min-w-[600px] border-collapse">
          <thead className="sticky top-0 z-[1] bg-surface-2 text-left">
            <tr className="border-b border-line">
              <th className={`${th} text-right`}>#</th>
              <th className="px-2.5 py-2 text-[12px] font-semibold text-muted">Item &amp; description</th>
              <th className={th}>HSN/SAC</th>
              <th className={`${th} text-right`}>Qty</th>
              <th className={`${th} text-right`}>Rate</th>
              <th className={`${th} text-right`}>GST</th>
              <th className={`${th} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} className="border-b border-line align-top last:border-b-0 even:bg-surface-2/40">
                <td className={`${td} text-right text-muted`}>{i + 1}</td>
                <td className="px-2.5 py-2">
                  <div className="text-[13.5px] font-semibold text-ink [overflow-wrap:anywhere]">{l.name}</div>
                  {l.description && <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-[12.5px] leading-snug text-muted" title={l.description}>{l.description}</div>}
                </td>
                <td className={td}>{l.hsn ?? "—"}</td>
                <td className={`${td} text-right`}>{l.qty}{l.unit ? <span className="ml-1 text-[12px] text-muted">{l.unit}</span> : null}</td>
                <td className={`${td} text-right`}>{money(l.rate)}</td>
                <td className={`${td} text-right`}>{l.gst === undefined ? "—" : `${l.gst}%`}</td>
                <td className={`${td} text-right font-semibold text-ink`}>{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2.5 space-y-2 xl:mt-0">
      <div className="ml-auto w-full max-w-[22rem] space-y-0.5 rounded-xl border border-line px-3 py-2 text-[13.5px] xl:max-w-none">
        <div className={row}><span className="text-muted">Sub total</span><span className="num text-ink-2">{money(d.subTotal)}</span></div>
        {d.discount ? <div className={row}><span className="text-muted">Discount</span><span className="num text-ink-2">−{money(d.discount)}</span></div> : null}
        {d.shipping ? <div className={row}><span className="text-muted">Shipping</span><span className="num text-ink-2">{money(d.shipping)}</span></div> : null}
        {d.taxes.map((t) => <div key={t.name} className={row}><span className="text-muted">{taxName(t.name)}</span><span className="num text-ink-2">{money(t.amount)}</span></div>)}
        {d.adjustment ? <div className={row}><span className="text-muted">Adjustment</span><span className="num text-ink-2">{money(d.adjustment)}</span></div> : null}
        <div className={`${row} border-t border-line pt-1 text-[14px] font-bold text-ink`}><span>Total</span><span className="num">{money(d.total)}</span></div>
      </div>
      <ShipTo d={d} />
      </div>
      </div>
    </section>
  );
}

function ShipTo({ d }: { d: SalesDetail }) {
  if (!d.shipTo) return <span />;
  return (
        <details className="group px-3">
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
  );
}
