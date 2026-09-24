"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member, PipelineResponse } from "@/lib/types";
import { type CardView, buildBoard } from "@/lib/pipeline";
import { fmtDate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { PageHeader } from "./AppShell";
import { Avatar, btn, inputCls } from "./ui";
import { MembersScreen } from "./followups/MembersScreen";
import { CardModal, FlagBadge, MergeModal } from "./followups/CardModal";

type Stage = "lead" | "quotation" | "performa" | "training" | "training_completed" | "invoiced" | "paid";

const STAGES: { key: Stage; label: string; header: string; dot: string }[] = [
  { key: "lead", label: "Leads", header: "bg-surface-2", dot: "bg-faint" },
  { key: "quotation", label: "Quotations", header: "bg-brand-soft", dot: "bg-brand-2" },
  { key: "performa", label: "Performa invoice", header: "bg-medium-bg", dot: "bg-medium" },
  { key: "training", label: "Training scheduled", header: "bg-brand-soft", dot: "bg-brand" },
  { key: "training_completed", label: "Training completed", header: "bg-low-bg", dot: "bg-low" },
  { key: "invoiced", label: "Invoice sent", header: "bg-medium-bg", dot: "bg-medium" },
  { key: "paid", label: "Payment received", header: "bg-low-bg", dot: "bg-low" },
];

const dateLong = (s: string) => fmtDate(s, { day: "numeric", month: "short", year: "numeric" });

/* ---------------- Zoho pipeline data ---------------- */

function usePipeline() {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as PipelineResponse;
      // If Zoho is unavailable, keep showing the last good data, flagged with the error.
      setData((d) => (json.leads?.length || !d ? json : { ...d, error: json.error ?? "Sync failed" }));
    } catch (e) {
      setData((d) => (d ? { ...d, error: String(e) } : null));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => load(), 3 * 60_000);
    return () => clearInterval(t);
  }, [load]);
  return { data, loading, refresh: () => load(true) };
}

/* ---------------- Cards ---------------- */

function CardShell({ card, onClick, children }: { card: CardView; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`card-hover relative block w-full rounded-xl border bg-surface p-3 text-left shadow-card transition ${card.flaggedWith.length ? "border-high/40" : "border-line"} ${card.deleted ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]" title={card.name}>{card.name}</div>
        {card.flaggedWith.length > 0 && <FlagBadge />}
        {card.deleted && <span className="shrink-0 rounded bg-high-bg px-1 text-[10.5px] font-medium text-high">Deleted</span>}
      </div>
      <div className="mt-1 space-y-0.5 text-[12px] text-muted">{children}</div>
    </button>
  );
}

function LeadCard({ card, onClick }: { card: CardView; onClick: () => void }) {
  return (
    <CardShell card={card} onClick={onClick}>
      {card.customerSince && <div>Created {dateLong(card.customerSince)}</div>}
      <div className="truncate text-ink-2">{card.phones[0]?.value ?? <span className="text-high">No contact number</span>}</div>
      {card.emails[0] && <div className="truncate">{card.emails[0].value}</div>}
      {(card.type || card.sector) && (
        <div className="flex flex-wrap gap-1 pt-1">
          {card.type && <span className="rounded bg-surface-2 px-1.5 py-px text-[11px] text-ink-2">{card.type}</span>}
          {card.sector && <span className="rounded bg-surface-2 px-1.5 py-px text-[11px] text-ink-2">{card.sector}</span>}
        </div>
      )}
    </CardShell>
  );
}

function QuoteCard({ card, onClick }: { card: CardView; onClick: () => void }) {
  const q = card.quote!;
  return (
    <CardShell card={card} onClick={onClick}>
      <div className="font-medium text-ink-2">{q.number}</div>
      <div className="line-clamp-2">Training: <span className="text-ink-2">{q.items.map((i) => i.name).join(", ")}</span></div>
      <div>Quote date: <span className="num text-ink-2">{dateLong(q.date)}</span></div>
    </CardShell>
  );
}

/* ---------------- Column: scrolls on its own; renders more cards as you scroll ---------------- */

const BATCH = 40;

function Column({ stage, cards, onOpen, loading }: { stage: (typeof STAGES)[number]; cards: CardView[]; onOpen: (c: CardView) => void; loading: boolean }) {
  const [shown, setShown] = useState(BATCH);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(BATCH), [cards.length]);
  const onScroll = () => {
    const el = ref.current;
    if (el && el.scrollTop + el.clientHeight > el.scrollHeight - 400 && shown < cards.length) setShown((n) => n + BATCH);
  };
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface-2/60">
      <div className={`flex items-center justify-between gap-2 rounded-t-xl px-3 py-2.5 ${stage.header}`}>
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${stage.dot}`} aria-hidden />
          <span className="truncate text-[13px] font-semibold text-ink">{stage.label}</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface px-1.5 text-[12px] num text-muted">{cards.length}</span>
      </div>
      <div ref={ref} onScroll={onScroll} className={`no-scrollbar overflow-y-auto p-2 ${cards.length ? "space-y-2" : "flex"}`} style={{ height: "calc(100vh - 290px)", minHeight: 420 }}>
        {cards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-center text-[12px] text-faint">
            {loading && (stage.key === "lead" || stage.key === "quotation") ? "Syncing with Zoho Books…" : "No cards"}
          </div>
        ) : (
          cards.slice(0, shown).map((c) =>
            c.kind === "lead" ? <LeadCard key={c.id} card={c} onClick={() => onOpen(c)} /> : <QuoteCard key={c.id} card={c} onClick={() => onOpen(c)} />,
          )
        )}
      </div>
    </div>
  );
}

/* ---------------- Board ---------------- */

function Board({ member, onSwitch, initialQuery }: { member: Member; onSwitch: () => void; initialQuery: string }) {
  const { cardEvents } = useStore();
  const { data, loading, refresh } = usePipeline();
  const [q, setQ] = useState(initialQuery);
  const [showDeleted, setShowDeleted] = useState(false);
  const [open, setOpen] = useState<{ id: string; merge: boolean } | null>(null);

  const board = useMemo(() => buildBoard(data?.leads ?? [], data?.quotes ?? [], cardEvents), [data, cardEvents]);
  const options = { typeOptions: data?.typeOptions ?? [], sectorOptions: data?.sectorOptions ?? [], orgId: data?.orgId };

  const needle = q.trim().toLowerCase();
  const visible = (c: CardView) => (showDeleted || !c.deleted) && (!needle || c.search.includes(needle));
  const leads = useMemo(() => board.leadCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const quotes = useMemo(() => board.quoteCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const byStage: Record<Stage, CardView[]> = { lead: leads, quotation: quotes, performa: [], training: [], training_completed: [], invoiced: [], paid: [] };
  const deletedCount = [...board.cards.values()].filter((c) => c.deleted).length;

  // A flagged card opens the side-by-side merge view; anything else opens its details.
  const openCard = (c: CardView) => setOpen({ id: c.id, merge: c.flaggedWith.length > 0 });
  const current = open ? board.cards.get(open.id) : undefined;
  let merge: { leadId: string; quoteIds: string[]; initial?: string } | null = null;
  if (current && open?.merge && current.flaggedWith.length) {
    const leadId = current.kind === "lead" ? current.id : current.flaggedWith[0];
    merge = { leadId, quoteIds: board.cards.get(leadId)?.flaggedWith ?? [], initial: current.kind === "quote" ? current.id : undefined };
  }

  return (
    <>
      <PageHeader
        title="Follow-ups"
        sub={`Every client engagement, from lead to payment received · ${leads.length.toLocaleString("en-IN")} leads · ${quotes.length} quotations`}
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-1.5 text-[13px] shadow-card">
            <Avatar name={member.name} />
            <span className="font-medium text-ink">{member.name}</span>
            <button className={btn.quiet} onClick={onSwitch}>Switch</button>
          </span>
        }
      />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative w-full sm:w-72">
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" strokeLinecap="round" /></svg>
            <input className={`${inputCls} !h-9 pl-8 text-[13px]`} placeholder="Search name, alias, phone, email, quote no." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {deletedCount > 0 && (
            <label className="inline-flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              Show deleted ({deletedCount})
            </label>
          )}
          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            {data?.error ? <span className="text-high">Zoho sync issue: {data.error}</span> : data?.syncedAt && <span>Synced {fmtDate(data.syncedAt)}, {new Date(data.syncedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
            <button className={btn.quiet} onClick={refresh} disabled={loading}>{loading ? "Syncing…" : "Sync now"}</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2 p-3">
          {STAGES.map((s) => <Column key={s.key} stage={s} cards={byStage[s.key]} onOpen={openCard} loading={loading && !data} />)}
        </div>
      </div>

      {current && merge && (
        <MergeModal
          key={`merge:${merge.leadId}`}
          leadId={merge.leadId}
          quoteIds={merge.quoteIds}
          initialQuoteId={merge.initial}
          cards={board.cards}
          member={member}
          options={options}
          onClose={() => setOpen(null)}
          onOpen={(id) => setOpen({ id, merge: false })}
        />
      )}
      {current && !merge && (
        <CardModal
          card={current}
          cards={board.cards}
          member={member}
          options={options}
          onClose={() => setOpen(null)}
          onReviewMerge={() => setOpen({ id: current.id, merge: true })}
        />
      )}
    </>
  );
}

/* ---------------- Page: pick a member first, every time Follow-ups opens ---------------- */

export function FollowUpBoard({ initialQuery = "" }: { initialQuery?: string; initialOpen?: string | null }) {
  const [member, setMember] = useState<Member | null>(null);
  if (!member) return <MembersScreen onPick={setMember} />;
  return <Board member={member} onSwitch={() => setMember(null)} initialQuery={initialQuery} />;
}
