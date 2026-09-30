"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member, PipelineResponse } from "@/lib/types";
import { type CardView, buildBoard, flagGroup, zohoNotices } from "@/lib/pipeline";
import { fmtDate, fmtINR } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { Avatar, btn, inputCls } from "./ui";
import { MembersScreen } from "./followups/MembersScreen";
import { CardModal, FlagBadge, MergeModal, SCHEDULE_TONE, scheduleText } from "./followups/CardModal";

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

/* ---------------- Cards: one box per customer, their documents inside ---------------- */

const flagged = (c: CardView) => c.flaggedWith.length > 0;

function ItemShell({ card, onClick, children }: { card: CardView; onClick: () => void; children: React.ReactNode }) {
  // Training scheduled: green = date, yellow = postponed, red = to be decided.
  const border = card.schedule ? `border-2 ${SCHEDULE_TONE[card.schedule.status].border}` : `border hover:border-line-strong ${flagged(card) ? "border-high/40" : "border-line"}`;
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-lg bg-surface px-2.5 py-2 text-left text-[12px] text-muted transition hover:shadow-card ${border} ${card.deleted ? "opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

function LeadItem({ card, onClick }: { card: CardView; onClick: () => void }) {
  return (
    <ItemShell card={card} onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <span>{card.customerSince ? `Created ${dateLong(card.customerSince)}` : "Lead"}</span>
        {flagged(card) && <FlagBadge />}
        {card.deleted && <DeletedTag />}
      </div>
      <div className="mt-0.5 truncate text-ink-2">{card.phones[0]?.value ?? <span className="text-high">No contact number</span>}</div>
      {card.emails[0] && <div className="truncate">{card.emails[0].value}</div>}
      {(card.type || card.sector) && (
        <div className="flex flex-wrap gap-1 pt-1">
          {card.type && <span className="rounded bg-surface-2 px-1.5 py-px text-[11px] text-ink-2">{card.type}</span>}
          {card.sector && <span className="rounded bg-surface-2 px-1.5 py-px text-[11px] text-ink-2">{card.sector}</span>}
        </div>
      )}
    </ItemShell>
  );
}

/** A quotation, PI, invoice or payment: number, training, date. */
function DocItem({ card, onClick }: { card: CardView; onClick: () => void }) {
  const pay = card.payment;
  return (
    <ItemShell card={card} onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-ink">{card.docNumber}</span>
        {flagged(card) && <FlagBadge />}
        {card.deleted && <DeletedTag />}
      </div>
      {pay && (
        <div className="mt-0.5">
          <span className="num font-semibold text-low">{fmtINR(pay.amount)}</span> · {dateLong(pay.date)}
          <div className="truncate">Invoice {pay.invoiceNumber}</div>
        </div>
      )}
      <div className="mt-0.5 line-clamp-2">{card.training.map((t) => t.name).join(", ")}</div>
      {card.schedule ? (
        <>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`num font-semibold ${card.schedule.status === "tbd" ? "text-high" : "text-ink"}`}>{scheduleText(card.schedule)}</span>
          {card.schedule.completed ? (
            <span className="rounded bg-low px-1 text-[10.5px] font-bold text-white">Completed</span>
          ) : (
            card.schedule.status !== "tbd" && <span className={`rounded px-1 text-[10.5px] font-bold ${SCHEDULE_TONE[card.schedule.status].chip}`}>{SCHEDULE_TONE[card.schedule.status].label}</span>
          )}
        </div>
        {card.piSkipped && <div className="mt-0.5 text-[11px] italic">PI not applicable</div>}
        </>
      ) : (
        !pay && card.docDate && <div className="num text-ink-2">{dateLong(card.docDate)}</div>
      )}
      {card.readyToSchedule && <div className="mt-1 text-[11px] font-semibold text-low">Ready to schedule</div>}
    </ItemShell>
  );
}

const DeletedTag = () => <span className="shrink-0 rounded bg-high-bg px-1 text-[10.5px] font-medium text-high">Deleted</span>;

function CustomerBox({ cards, onOpen }: { cards: CardView[]; onOpen: (c: CardView) => void }) {
  const any = cards.some(flagged);
  return (
    <div className={`rounded-xl border bg-surface p-2 shadow-card ${any ? "border-high/40" : "border-line"}`}>
      <div className="flex items-start justify-between gap-2 px-1 pb-1.5 pt-0.5">
        <div className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]" title={cards[0].name}>{cards[0].name}</div>
        {cards.length > 1 && <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[11px] num text-muted">{cards.length}</span>}
      </div>
      <div className="space-y-1.5 rounded-lg bg-surface-2/70 p-1.5">
        {cards.map((c) => (c.kind === "lead" ? <LeadItem key={c.id} card={c} onClick={() => onOpen(c)} /> : <DocItem key={c.id} card={c} onClick={() => onOpen(c)} />))}
      </div>
    </div>
  );
}

/* ---------------- Column: scrolls on its own; renders more boxes as you scroll ---------------- */

const BATCH = 40;

function Column({ stage, cards, onOpen, loading }: { stage: (typeof STAGES)[number]; cards: CardView[]; onOpen: (c: CardView) => void; loading: boolean }) {
  const [shown, setShown] = useState(BATCH);
  const [flaggedFirst, setFlaggedFirst] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(BATCH), [cards.length, flaggedFirst]);

  // One box per customer, in the column's order (newest first); flagged boxes on top when asked.
  const groups = useMemo(() => {
    const byCustomer = new Map<string, CardView[]>();
    for (const c of cards) byCustomer.set(c.customerId, [...(byCustomer.get(c.customerId) ?? []), c]);
    const list = [...byCustomer.values()];
    return flaggedFirst ? [...list.filter((g) => g.some(flagged)), ...list.filter((g) => !g.some(flagged))] : list;
  }, [cards, flaggedFirst]);
  const flaggedCount = cards.filter(flagged).length;

  const onScroll = () => {
    const el = ref.current;
    if (el && el.scrollTop + el.clientHeight > el.scrollHeight - 400 && shown < groups.length) setShown((n) => n + BATCH);
  };
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface-2/60">
      <div className={`flex items-center justify-between gap-1.5 rounded-t-xl px-3 py-2.5 ${stage.header}`}>
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${stage.dot}`} aria-hidden />
          <span className="truncate text-[13px] font-semibold text-ink">{stage.label}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1">
          {flaggedCount > 0 && (
            <button
              onClick={() => { setFlaggedFirst((v) => !v); ref.current?.scrollTo({ top: 0 }); }}
              aria-pressed={flaggedFirst}
              title={flaggedFirst ? "Back to newest first" : "Show flagged first"}
              className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold transition ${flaggedFirst ? "bg-high text-white" : "bg-high-bg text-high hover:brightness-95"}`}
            >
              F <span className="num font-semibold">{flaggedCount}</span>
            </button>
          )}
          <span className="rounded-full bg-surface px-1.5 text-[12px] num text-muted">{cards.length}</span>
        </span>
      </div>
      <div ref={ref} onScroll={onScroll} className={`no-scrollbar overflow-y-auto p-2 ${cards.length ? "space-y-2" : "flex"}`} style={{ height: "var(--fu-col-h)", minHeight: 360 }}>
        {cards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-center text-[12px] text-faint">
            {loading && ["lead", "quotation", "performa", "invoiced", "paid"].includes(stage.key) ? "Syncing with Zoho Books…" : "No cards"}
          </div>
        ) : (
          groups.slice(0, shown).map((g) => <CustomerBox key={g[0].customerId} cards={g} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

/* ---------------- Board ---------------- */

function Board({ member, onSwitch, initialQuery }: { member: Member; onSwitch: () => void; initialQuery: string }) {
  const { cardEvents, recordCardEvents } = useStore();
  const { data, loading, refresh } = usePipeline();
  const [q, setQ] = useState(initialQuery);
  const [showDeleted, setShowDeleted] = useState(false);
  const [open, setOpen] = useState<{ id: string; merge: boolean } | null>(null);

  const board = useMemo(() => buildBoard(data?.leads ?? [], data?.quotes ?? [], data?.pis ?? [], data?.invoices ?? [], data?.payments ?? [], cardEvents), [data, cardEvents]);
  const options = { typeOptions: data?.typeOptions ?? [], sectorOptions: data?.sectorOptions ?? [], orgId: data?.orgId };

  // A merged quote/PI that disappeared from Zoho moves its cards apart — log why, once.
  // Only trust a complete, error-free Zoho snapshot so a failed sync never looks like a deletion.
  useEffect(() => {
    if (!data || data.source !== "zoho" || data.error || !data.leads.length) return;
    recordCardEvents(zohoNotices(cardEvents, board.exists, board.cards));
  }, [data, board, cardEvents, recordCardEvents]);

  const needle = q.trim().toLowerCase();
  const visible = (c: CardView) => (showDeleted || !c.deleted) && (!needle || c.search.includes(needle));
  const leads = useMemo(() => board.leadCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const quotes = useMemo(() => board.quoteCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const pis = useMemo(() => board.piCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheduled = useMemo(() => board.scheduledCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const completed = useMemo(() => board.completedCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const invoiced = useMemo(() => board.invoiceCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const paid = useMemo(() => board.paymentCards.filter(visible), [board, needle, showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const byStage: Record<Stage, CardView[]> = { lead: leads, quotation: quotes, performa: pis, training: scheduled, training_completed: completed, invoiced, paid };
  const deletedCount = [...board.cards.values()].filter((c) => c.deleted).length;

  // A flagged card opens the side-by-side merge view; anything else opens its details.
  const openCard = (c: CardView) => setOpen({ id: c.id, merge: c.flaggedWith.length > 0 });
  const current = open ? board.cards.get(open.id) : undefined;
  const mergeGroup = current && open?.merge && current.flaggedWith.length ? flagGroup(current.id, board.cards) : null;

  return (
    <div className="fu-page">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-tight">Follow-ups</h1>
          <p className="text-[12.5px] text-muted">
            {leads.length.toLocaleString("en-IN")} leads · {quotes.length} quotations · {pis.length} performa invoices · {scheduled.length} scheduled · {completed.length} completed · {invoiced.length} invoices · {paid.length} payments
            {data?.windowStart && <> · documents since {fmtDate(data.windowStart, { day: "numeric", month: "short", year: "numeric" })}</>}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-1.5 text-[13px] shadow-card">
          <Avatar name={member.name} />
          <span className="font-medium text-ink">{member.name}</span>
          <button className={btn.quiet} onClick={onSwitch}>Switch</button>
        </span>
      </div>
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

      {current && mergeGroup && (
        <MergeModal
          key={`merge:${current.id}`}
          group={mergeGroup}
          initialId={current.id}
          cards={board.cards}
          member={member}
          options={options}
          onClose={() => setOpen(null)}
          onOpen={(id) => setOpen({ id, merge: false })}
        />
      )}
      {current && !mergeGroup && (
        <CardModal
          card={current}
          cards={board.cards}
          member={member}
          options={options}
          onClose={() => setOpen(null)}
          onReviewMerge={() => setOpen({ id: current.id, merge: true })}
        />
      )}
    </div>
  );
}

/* ---------------- Page: pick a member first, every time Follow-ups opens ---------------- */

export function FollowUpBoard({ initialQuery = "" }: { initialQuery?: string; initialOpen?: string | null }) {
  const [member, setMember] = useState<Member | null>(null);
  if (!member) return <MembersScreen onPick={setMember} />;
  return <Board member={member} onSwitch={() => setMember(null)} initialQuery={initialQuery} />;
}
