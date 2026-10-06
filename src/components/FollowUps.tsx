"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AedResponse, Member, PipelineResponse } from "@/lib/types";
import { type CardView, FULFIL_LABEL, STAGE_RANK, buildAedBoard, buildFulfillmentBoard, isAedBoardUser, isFulfilmentUser, buildBoard, cardDue, fmtMonth, isCustomerCard, mergeCandidates, zohoNotices } from "@/lib/pipeline";
import { fmtDate, fmtINR } from "@/lib/dates";
import { ZOHO_SYNCED, useStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { Avatar, Modal, Segmented, btn, inputCls } from "./ui";
import { AedCardModal } from "./followups/AedModal";
import { FulfillmentModal } from "./followups/FulfillmentModal";
import { type DateFilterValue, DateFilterButton, matchesDateFilter } from "./followups/DateFilter";
import { AddPotentialModal, CardModal, DUE_TONE, DueChip, FlagBadge, MergeModal, SCHEDULE_TONE, scheduleText } from "./followups/CardModal";

type Stage = "lead" | "quotation" | "performa" | "training" | "training_completed" | "invoiced" | "paid" | "lost" | "potential"
  | "aed_invoices" | "aed_training" | "aed_completed" | "aed_not_required"
  | "ful_completed" | "ful_hold" | "ful_received" | "ful_generated" | "ful_logistics";

const STAGES: { key: Stage; label: string; header: string; dot: string }[] = [
  { key: "lead", label: "Leads", header: "bg-surface-2", dot: "bg-faint" },
  { key: "quotation", label: "Quotations", header: "bg-brand-soft", dot: "bg-brand-2" },
  { key: "performa", label: "Performa invoice", header: "bg-medium-bg", dot: "bg-medium" },
  { key: "training", label: "Training scheduled", header: "bg-brand-soft", dot: "bg-brand" },
  { key: "training_completed", label: "Training completed", header: "bg-low-bg", dot: "bg-low" },
  { key: "invoiced", label: "Invoice sent", header: "bg-medium-bg", dot: "bg-medium" },
  { key: "paid", label: "Payment received", header: "bg-low-bg", dot: "bg-low" },
  { key: "lost", label: "Deal lost", header: "bg-high-bg", dot: "bg-high" },
  { key: "potential", label: "Potential training", header: "bg-surface-2", dot: "bg-brand" },
];

/** AedSmartx Training board (Priyanka): AED invoices → Training scheduled → Training completed, or not required. */
const AED_STAGES: { key: Stage; label: string; header: string; dot: string }[] = [
  { key: "aed_invoices", label: "Invoices sent", header: "bg-medium-bg", dot: "bg-medium" },
  { key: "aed_training", label: "Training scheduled", header: "bg-brand-soft", dot: "bg-brand" },
  { key: "aed_completed", label: "Training completed", header: "bg-low-bg", dot: "bg-low" },
  { key: "aed_not_required", label: "Training not required", header: "bg-high-bg", dot: "bg-high" },
];
/** Fulfillment board (Shreya): certificates for completed trainings, carried over from the training board. */
const FULFIL_COLUMNS: { key: Stage; label: string; header: string; dot: string }[] = [
  { key: "ful_completed", label: FULFIL_LABEL.completed, header: "bg-surface-2", dot: "bg-faint" },
  { key: "ful_hold", label: FULFIL_LABEL.hold, header: "bg-low-bg", dot: "bg-low" },
  { key: "ful_received", label: FULFIL_LABEL.received, header: "bg-medium-bg", dot: "bg-medium" },
  { key: "ful_generated", label: FULFIL_LABEL.generated, header: "bg-brand-soft", dot: "bg-brand-2" },
  { key: "ful_logistics", label: FULFIL_LABEL.logistics, header: "bg-low-bg", dot: "bg-brand" },
];

type BoardKind = "training" | "aed" | "fulfil";
const BOARD_LABEL: Record<BoardKind, string> = { training: "Training", aed: "AedSmartx", fulfil: "Fulfillment" };
/**
 * Who sees which board. Priyanka and Arti: AedSmartx only. Shreya: Fulfillment only. Ashish: Training + AedSmartx.
 * Sumit and Shikha: all three. Admin: everything. Anyone else: Training.
 */
function boardsFor(m: Member): BoardKind[] {
  if (m.id === "admin") return ["training", "aed", "fulfil"];
  const n = m.name.trim();
  if (isAedBoardUser(n)) return ["aed"];
  if (isFulfilmentUser(n)) return ["fulfil"];
  if (/^(sumit|shikha)\b/i.test(n)) return ["training", "aed", "fulfil"];
  if (/^ashish\b/i.test(n)) return ["training", "aed"];
  return ["training"];
}

// As many columns as fit at MIN_COL_W (enough for the column name); the rest slide in with ◀ ▶,
// the arrow keys or a swipe. A wide screen shows every column.
const MIN_COL_W = 184;
const GAP_PX = 8; // gap-2
const MIN_COL_H = 280;

/** How many columns fit in the board's width, and which one is first on screen. */
function useColumnWindow(total: number) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [perView, setPerView] = useState(Math.min(7, total));
  const [offset, setOffset] = useState(0);
  // Never below 0: right after switching boards, perView can briefly be larger than the new column count.
  const maxOffset = Math.max(0, total - perView);

  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => setPerView(Math.max(1, Math.min(total, Math.floor((el.clientWidth + GAP_PX) / (MIN_COL_W + GAP_PX)))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);
  useEffect(() => setOffset((o) => Math.max(0, Math.min(o, maxOffset))), [maxOffset]);

  const move = useCallback((step: number) => setOffset((o) => Math.max(0, Math.min(maxOffset, o + step))), [maxOffset]);

  // ← / → move the board, unless someone is typing or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("[role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      move(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // Horizontal swipe on touch screens; vertical swipes keep scrolling the column.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      const start = touch.current;
      touch.current = null;
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) move(dx < 0 ? 1 : -1);
    },
  };
  return { viewRef, perView, offset, maxOffset, move, swipe };
}

/** Column height that makes the board end at the bottom of the window, whatever the header wraps to. */
function useFitHeight() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [colH, setColH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const fit = () => {
      const body = page.querySelector<HTMLElement>("[data-col-body]");
      const main = page.parentElement;
      if (!body || !main) return;
      // Space the layout keeps below the page (bottom tab bar on small screens), net of the page's own margin.
      const reserve = parseFloat(getComputedStyle(main).paddingBottom) + parseFloat(getComputedStyle(page).marginBottom);
      const bottom = page.getBoundingClientRect().bottom + window.scrollY;
      const next = Math.max(MIN_COL_H, Math.floor(body.clientHeight + window.innerHeight - reserve - bottom));
      setColH((h) => (h === next ? h : next));
    };
    fit();
    const late = setTimeout(fit, 600); // after the page's entry animation
    const ro = new ResizeObserver(fit);
    ro.observe(page);
    window.addEventListener("resize", fit);
    return () => {
      clearTimeout(late);
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
  return { pageRef, colH };
}

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
    const onSynced = () => load();
    window.addEventListener(ZOHO_SYNCED, onSynced);
    return () => {
      clearInterval(t);
      window.removeEventListener(ZOHO_SYNCED, onSynced);
    };
  }, [load]);
  return { data, loading, refresh: () => load(true) };
}

/** AED invoices (current fiscal year) — fetched only while the AedSmartx board is showing. */
function useAedInvoices(enabled: boolean) {
  const [data, setData] = useState<AedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aed${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as AedResponse;
      setData((d) => (json.invoices?.length || !d ? json : { ...d, error: json.error ?? "Sync failed" }));
    } catch (e) {
      setData((d) => (d ? { ...d, error: String(e) } : null));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => load(), 5 * 60_000);
    const onSynced = () => load();
    window.addEventListener(ZOHO_SYNCED, onSynced);
    return () => {
      clearInterval(t);
      window.removeEventListener(ZOHO_SYNCED, onSynced);
    };
  }, [enabled, load]);
  return { data, loading, refresh: () => load(true) };
}

/** Which board is showing, for members with more than one — remembered per browser. */
function useBoardChoice(allowed: BoardKind[]): [BoardKind, (b: BoardKind) => void] {
  const [picked, setPicked] = useState<BoardKind | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("th.board") as BoardKind | null;
      setPicked(saved ?? (localStorage.getItem("th.aedBoard") === "1" ? "aed" : null)); // older browsers remembered only the AED switch
    } catch {}
  }, []);
  const set = (b: BoardKind) => {
    setPicked(b);
    try {
      localStorage.setItem("th.board", b);
    } catch {}
  };
  // Only boards this member may open; otherwise their first one.
  return [picked && allowed.includes(picked) ? picked : allowed[0], set];
}

/* ---------------- Cards: one box per customer, their documents inside ---------------- */

const flagged = (c: CardView) => c.flaggedWith.length > 0;
/** AedSmartx: delivered and waiting for a training date. */
const isReady = (c: CardView) => Boolean(c.aed && c.delivered && !c.schedule && !c.notRequired);

/**
 * Fulfillment board borders: Training Completed plain; Process on hold green; List Received green once Work in
 * progress, else yellow; Certificates Generated and Sent to Logistics green.
 */
function fulfilBorder(c: CardView): string {
  const f = c.fulfillment!;
  if (f.stage === "completed") return "border hover:border-line-strong border-line";
  if (f.stage === "received") return `border-2 ${f.wip ? "border-low" : "border-medium"}`;
  return "border-2 border-low";
}

function ItemShell({ card, onClick, children }: { card: CardView; onClick: () => void; children: React.ReactNode }) {
  // Invoices / payments: red overdue, blue due, green paid. Training scheduled: green = date, red = to be decided.
  const due = card.aed ? undefined : cardDue(card);
  // AedSmartx: not required = red; scheduled = the training date's colour; before that green once delivered, else yellow.
  const border = card.fulfillment ? fulfilBorder(card) : card.notRequired ? "border-2 border-high" : card.aed && card.schedule ? `border-2 ${SCHEDULE_TONE[card.schedule.status].border}`
    : card.aed ? `border-2 ${card.delivered ? "border-low" : "border-medium"}` : due ? `border-2 ${DUE_TONE[due.tone].border}` : card.schedule ? `border-2 ${SCHEDULE_TONE[card.schedule.status].border}` : `border hover:border-line-strong ${flagged(card) ? "border-high/40" : "border-line"}`;
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

/** A customer added by hand to Potential training: when the training might happen. */
function PotentialItem({ card, onClick }: { card: CardView; onClick: () => void }) {
  const expected = card.potential?.expected;
  return (
    <ItemShell card={card} onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <span>
          Expected <span className={`num font-semibold ${expected ? "text-ink" : "text-faint"}`}>{expected ? fmtMonth(expected) : "not set"}</span>
        </span>
        {flagged(card) && <FlagBadge />}
        {card.deleted && <DeletedTag />}
      </div>
      <div className="mt-0.5 truncate text-ink-2">{card.phones[0]?.value ?? <span className="text-high">No contact number</span>}</div>
      {card.potential && <div className="truncate text-[11px]">Added by {card.potential.addedBy.split(" ")[0]}</div>}
    </ItemShell>
  );
}

/** A quotation, PI, invoice or payment: number, training, date. */
function DocItem({ card, onClick }: { card: CardView; onClick: () => void }) {
  const pay = card.payment;
  // AedSmartx cards show delivery instead of payment status; Fulfillment cards show where the certificates are.
  const due = card.aed || card.fulfillment ? undefined : cardDue(card);
  const f = card.fulfillment;
  return (
    <ItemShell card={card} onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-ink">{card.docNumber}</span>
        {flagged(card) && <FlagBadge />}
        {card.deleted && <DeletedTag />}
      </div>
      {pay && (card.payments?.length ?? 0) > 1 ? (
        // An invoice paid in instalments, merged: the total and how many payments, latest date.
        <div className="mt-0.5">
          <span className="num font-semibold text-low">{fmtINR(card.payments!.reduce((s, p) => s + p.amount, 0))}</span> · {card.payments!.length} payments
          <div className="truncate">Last {dateLong(card.payments!.at(-1)!.date)} · Invoice {pay.invoiceNumber}</div>
        </div>
      ) : pay && (
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
            (!due || card.aed) && <span className="rounded bg-low px-1 text-[10.5px] font-bold text-white">Completed</span>
          ) : (
            card.schedule.status !== "tbd" && <span className={`rounded px-1 text-[10.5px] font-bold ${SCHEDULE_TONE[card.schedule.status].chip}`}>{SCHEDULE_TONE[card.schedule.status].label}</span>
          )}
        </div>
        {card.schedule.trainers.length > 0 && <div className="mt-0.5 truncate text-[11px] text-ink-2">{card.schedule.trainers.map((t) => t.split(" ")[0]).join(", ")}</div>}
        {f && card.schedule.underName && <div className="mt-0.5 truncate text-[11px] text-ink-2">Under name: <span className="font-semibold">{card.schedule.underName}</span></div>}
        {card.piSkipped && card.kind === "quote" && <div className="mt-0.5 text-[11px] font-semibold text-medium">PI needed</div>}
        </>
      ) : (
        !pay && card.docDate && <div className="num text-ink-2">{dateLong(card.docDate)}</div>
      )}
      {card.notRequired && (
        <div className="mt-1">
          <span className="rounded bg-high-bg px-1 text-[10.5px] font-bold uppercase tracking-wide text-high">Training not required</span>
          {(card.reseller || card.resale) && <span className="ml-1 text-[11px] text-ink-2">{card.reseller ? "Reseller" : "For resale"}</span>}
        </div>
      )}
      {due && <div className="mt-1"><DueChip due={due} /></div>}
      {card.aed && !card.notRequired && !card.schedule && (
        <div className="mt-1">
          <span className={`rounded px-1 text-[10.5px] font-bold uppercase tracking-wide ${card.delivered ? "bg-low-bg text-low" : "bg-medium-bg text-medium"}`}>
            {card.delivered ? "Ready for Scheduling" : "Not delivered yet"}
          </span>
        </div>
      )}
      {card.readyToSchedule && <div className="mt-1 text-[11px] font-semibold text-low">Ready to schedule</div>}
      {f && f.stage !== "completed" && (
        <div className={`mt-1 text-[11.5px] font-semibold ${f.stage === "received" && !f.wip ? "text-medium" : "text-low"}`}>
          {f.stage === "hold" ? "Waiting for List" : f.stage === "received" ? (f.wip ? "Work in progress" : "List received") : f.stage === "generated" ? "Certificates generated" : "Sent to Logistics"}
        </div>
      )}
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
        {cards.map((c) =>
          c.kind === "lead" ? <LeadItem key={c.id} card={c} onClick={() => onOpen(c)} />
          : c.kind === "potential" ? <PotentialItem key={c.id} card={c} onClick={() => onOpen(c)} />
          : <DocItem key={c.id} card={c} onClick={() => onOpen(c)} />,
        )}
      </div>
    </div>
  );
}

/* ---------------- Column: scrolls on its own; renders more boxes as you scroll ---------------- */

const BATCH = 40;

function Column({ stage, cards, onOpen, onAdd, loading, filtered }: { stage: (typeof STAGES)[number]; cards: CardView[]; onOpen: (c: CardView) => void; onAdd?: () => void; loading: boolean; filtered: boolean }) {
  const [shown, setShown] = useState(BATCH);
  const [flaggedFirst, setFlaggedFirst] = useState(false);
  // AedSmartx: "R" shows only the cards that are Ready for Scheduling (delivered, not scheduled yet).
  const [readyOnly, setReadyOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(BATCH), [cards.length, flaggedFirst, readyOnly]);

  // One box per customer, in the column's order (newest first); flagged boxes on top when asked.
  const groups = useMemo(() => {
    const byCustomer = new Map<string, CardView[]>();
    for (const c of cards) byCustomer.set(c.customerId, [...(byCustomer.get(c.customerId) ?? []), c]);
    const list = [...byCustomer.values()];
    const pick = readyOnly ? list.map((g) => g.filter(isReady)).filter((g) => g.length) : list;
    return flaggedFirst ? [...pick.filter((g) => g.some(flagged)), ...pick.filter((g) => !g.some(flagged))] : pick;
  }, [cards, flaggedFirst, readyOnly]);
  const flaggedCount = cards.filter(flagged).length;
  const readyCount = cards.filter(isReady).length;
  useEffect(() => { if (!readyCount) setReadyOnly(false); }, [readyCount]);

  const onScroll = () => {
    const el = ref.current;
    if (el && el.scrollTop + el.clientHeight > el.scrollHeight - 400 && shown < groups.length) setShown((n) => n + BATCH);
  };
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface-2/60">
      {/* Fixed two-line height: a long name wraps instead of being cut off on narrow columns. */}
      <div className={`flex min-h-[52px] items-center justify-between gap-1.5 rounded-t-xl px-3 py-1.5 ${stage.header}`}>
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${stage.dot}`} aria-hidden />
          <span data-col-name className="line-clamp-2 text-[13px] font-semibold leading-tight text-ink">{stage.label}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1">
          {readyCount > 0 && (
            <button
              onClick={() => { setReadyOnly((v) => !v); ref.current?.scrollTo({ top: 0 }); }}
              aria-pressed={readyOnly}
              title={readyOnly ? "Show all cards" : "Show only cards ready for scheduling"}
              className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold transition ${readyOnly ? "bg-low text-white" : "bg-low-bg text-low hover:brightness-95"}`}
            >
              R <span className="num font-semibold">{readyCount}</span>
            </button>
          )}
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
          {onAdd && (
            <button onClick={onAdd} aria-label={`Add to ${stage.label}`} title={`Add a customer to ${stage.label}`} className="grid size-6 place-items-center rounded-md bg-brand text-brand-ink shadow-card hover:brightness-110">
              <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M10 4.5v11M4.5 10h11" /></svg>
            </button>
          )}
        </span>
      </div>
      <div ref={ref} onScroll={onScroll} className={`no-scrollbar overflow-y-auto p-2 ${cards.length ? "space-y-2" : "flex"}`} data-col-body style={{ height: "var(--fu-col-h)" }}>
        {cards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-center text-[12px] text-faint">
            {loading && ["lead", "quotation", "performa", "invoiced", "paid", "lost", "aed_invoices"].includes(stage.key) ? "Syncing with Zoho Books…" : filtered ? "No cards in these dates" : stage.key === "potential" ? "Add customers who might train later with +" : "No cards"}
          </div>
        ) : (
          groups.slice(0, shown).map((g) => <CustomerBox key={g[0].customerId} cards={g} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

/** ◀ / ▶ — slides the board one column left or right. */
function SlideButton({ dir, disabled, onClick }: { dir: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Show columns to the left" : "Show columns to the right"}
      title={dir === "left" ? "Previous column" : "Next column"}
      className="grid size-7 place-items-center rounded-md border border-line bg-surface text-ink-2 transition hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-line disabled:hover:text-ink-2"
    >
      <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor" aria-hidden>
        {dir === "left" ? <path d="M7.5 1 2 5l5.5 4z" /> : <path d="M2.5 1 8 5 2.5 9z" />}
      </svg>
    </button>
  );
}

/** "Clear logs" (Admin only): wipe the Changes log for everything, one customer, or one deal cycle — PIN confirmed. */
type ClearTarget = { key: string; label: string; sub?: string; ids: string[]; count: number };

function ClearLogs({ member, cards }: { member: Member; cards: Map<string, CardView> }) {
  const { cardEvents, clearCardEvents, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "customer" | "cycle">("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => { setOpen(false); setPin(""); setError(""); setQuery(""); setPicked(null); setScope("all"); }, []);

  // Cards added to Potential training are never cleared, so they don't count.
  const clearable = useMemo(() => cardEvents.filter((e) => e.kind !== "add_potential"), [cardEvents]);
  const countFor = (ids: string[]) => {
    const set = new Set(ids);
    return clearable.filter((e) => e.cardIds.some((id) => set.has(id))).length;
  };

  // Customers with entries in the log: every card of theirs (lead, potential, documents).
  const customers = useMemo((): ClearTarget[] => {
    if (!open) return [];
    const ids = new Map<string, string[]>();
    for (const c of cards.values()) ids.set(c.customerId, [...(ids.get(c.customerId) ?? []), c.id]);
    const withLog = new Set(clearable.flatMap((e) => e.cardIds.map((id) => cards.get(id)?.customerId)).filter((x): x is string => !!x));
    return [...withLog]
      .map((cid) => {
        const own = ids.get(cid) ?? [];
        const name = cards.get(`lead:${cid}`)?.name ?? cards.get(own[0])?.name ?? cid;
        return { key: cid, label: name, ids: own, count: countFor(own) };
      })
      .filter((t) => t.count > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [open, cards, clearable]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deal cycles with entries: the documents merged into one chain (quote → PI → invoice → payment), found from any of them.
  const cycles = useMemo((): ClearTarget[] => {
    if (!open) return [];
    const top = (c: CardView) => {
      let x = c;
      while (x.mergedInto && cards.get(x.mergedInto)) x = cards.get(x.mergedInto)!;
      return x;
    };
    const holders = new Map<string, CardView>();
    for (const e of clearable) for (const id of e.cardIds) {
      const c = cards.get(id);
      if (c && !isCustomerCard(c.kind)) holders.set(top(c).id, top(c));
    }
    return [...holders.values()]
      .map((h) => {
        // Documents only: the customer's lead/potential card keeps its own edits.
        const docs = h.historyIds.map((id) => cards.get(id)).filter((c): c is CardView => !!c && !isCustomerCard(c.kind)).sort((a, b) => STAGE_RANK[a.kind] - STAGE_RANK[b.kind]);
        const ids = docs.map((c) => c.id);
        return { key: h.id, label: docs.map((c) => c.docNumber).join(" → "), sub: h.name, ids, count: countFor(ids) };
      })
      .filter((t) => t.count > 0)
      .sort((a, b) => a.sub!.localeCompare(b.sub!) || a.label.localeCompare(b.label));
  }, [open, cards, clearable]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = scope === "customer" ? customers : scope === "cycle" ? cycles : [];
  const needle = query.trim().toLowerCase();
  const shown = needle ? list.filter((t) => `${t.label} ${t.sub ?? ""}`.toLowerCase().includes(needle)) : list;
  const target = list.find((t) => t.key === picked);
  const total = scope === "all" ? clearable.length : target?.count ?? 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || busy || total === 0) return;
    setBusy(true);
    setError("");
    const res = await clearCardEvents(pin, member.name, scope === "all" ? undefined : target!.ids);
    setBusy(false);
    if (!res.ok) return void (setError(res.error ?? "Couldn't clear the logs"), setPin(""));
    const what = scope === "all" ? "Logs cleared" : scope === "customer" ? `Logs cleared for ${target!.label}` : `Logs cleared for ${target!.label}`;
    close();
    toast({ text: `${what} — ${res.cleared ?? 0} changes removed` });
  };

  return (
    <>
      <button className={`${btn.danger} !h-8 !px-3`} onClick={() => setOpen(true)} title="Clear the change log (admin, PIN required)">
        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
        Clear logs
      </button>
      <Modal open={open} onClose={close} title="Clear logs" wide>
        <form onSubmit={submit}>
          <Segmented
            value={scope}
            onChange={(v) => { setScope(v); setPicked(null); setQuery(""); setError(""); }}
            options={[{ value: "all", label: "Everything" }, { value: "customer", label: "One customer" }, { value: "cycle", label: "One deal cycle" }]}
          />
          {scope === "all" ? (
            <p className="mt-4 text-[13.5px] text-ink-2">
              Removes all <b>{clearable.length}</b> entries in the Changes log for everyone — every edit, merge, deletion and training date. Cards go back to exactly what Zoho Books shows; customers added to Potential training stay.
            </p>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-[13px] text-muted">
                {scope === "customer"
                  ? "Removes every change on this customer's cards — lead, quotations, PIs, invoices and payments."
                  : "Removes every change on one deal's documents (quotation → PI → invoice → payment): merges, training dates, edits. The documents go back to separate cards as Zoho shows them; the lead's own edits stay."}
              </p>
              <input
                className={`${inputCls} !h-9 text-[13px]`}
                placeholder={scope === "customer" ? `Search ${customers.length} customer${customers.length === 1 ? "" : "s"} with changes` : `Search ${cycles.length} deal cycle${cycles.length === 1 ? "" : "s"} — customer, quote, PI or invoice no.`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <ul className="no-scrollbar mt-2 max-h-[240px] overflow-y-auto rounded-xl border border-line">
                {shown.length === 0 && <li className="px-3 py-3 text-[13px] text-muted">{list.length ? "No match." : "Nothing in the log yet."}</li>}
                {shown.map((t) => (
                  <li key={t.key} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      onClick={() => { setPicked(t.key); setError(""); }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2 ${picked === t.key ? "bg-high-bg" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{t.label}</span>
                        {t.sub && <span className="block truncate text-[12px] text-muted">{t.sub}</span>}
                      </span>
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 text-[12px] num text-muted">{t.count} change{t.count === 1 ? "" : "s"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Admin PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className={`${inputCls} num tracking-[0.3em]`}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
            />
          </label>
          {error && <p className="mt-2 text-[13px] font-medium text-high">{error}</p>}
          <div className="mt-5 flex items-center justify-end gap-2">
            {scope !== "all" && <span className="mr-auto text-[13px] text-muted">{target ? <>Clears <b>{target.count}</b> change{target.count === 1 ? "" : "s"}</> : "Pick one above"}</span>}
            <button type="button" className={btn.ghost} onClick={close}>Cancel</button>
            <button type="submit" className={`${btn.primary} !bg-high !text-white`} disabled={!pin || busy || total === 0}>{busy ? "Clearing…" : "Clear logs"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/* ---------------- Board ---------------- */

function Board({ member, onSignOut, initialQuery }: { member: Member; onSignOut: () => void; initialQuery: string }) {
  const { cardEvents, recordCardEvents } = useStore();
  const pipeline = usePipeline();
  const { data } = pipeline;
  const allowed = boardsFor(member);
  const [boardKind, setBoardKind] = useBoardChoice(allowed);
  const aedMode = boardKind === "aed";
  const fulfilMode = boardKind === "fulfil";
  const aed = useAedInvoices(aedMode);
  // Loading state and sync errors follow the board that's showing (Fulfillment is built from the training data).
  const { loading } = aedMode ? aed : pipeline;
  const sync = aedMode ? aed.data : data;
  const stages = aedMode ? AED_STAGES : fulfilMode ? FULFIL_COLUMNS : STAGES;
  const [q, setQ] = useState(initialQuery);
  const [showDeleted, setShowDeleted] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterValue | null>(null);
  const [open, setOpen] = useState<{ id: string; merge: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const { viewRef, perView, offset, maxOffset, move, swipe } = useColumnWindow(stages.length);
  const { pageRef, colH } = useFitHeight();

  const board = useMemo(() => buildBoard(data?.leads ?? [], data?.quotes ?? [], data?.pis ?? [], data?.invoices ?? [], data?.payments ?? [], cardEvents), [data, cardEvents]);
  const aedBoard = useMemo(() => (aedMode ? buildAedBoard(data?.leads ?? [], aed.data?.invoices ?? [], cardEvents) : null), [aedMode, data, aed.data, cardEvents]);
  const fulBoard = useMemo(() => (fulfilMode ? buildFulfillmentBoard(board, cardEvents) : null), [fulfilMode, board, cardEvents]);
  const options = { typeOptions: data?.typeOptions ?? [], sectorOptions: data?.sectorOptions ?? [], orgId: data?.orgId };

  // A merged quote/PI that disappeared from Zoho moves its cards apart — log why, once.
  // Only trust a complete, error-free Zoho snapshot so a failed sync never looks like a deletion.
  useEffect(() => {
    if (!data || data.source !== "zoho" || data.error || !data.leads.length) return;
    recordCardEvents(zohoNotices(cardEvents, board.exists, board.cards));
  }, [data, board, cardEvents, recordCardEvents]);

  const needle = q.trim().toLowerCase();
  const visible = (c: CardView) => (showDeleted || !c.deleted) && (!needle || c.search.includes(needle)) && matchesDateFilter(c, dateFilter);
  const leads = useMemo(() => board.leadCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const quotes = useMemo(() => board.quoteCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const pis = useMemo(() => board.piCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheduled = useMemo(() => board.scheduledCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const completed = useMemo(() => board.completedCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const invoiced = useMemo(() => board.invoiceCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const paid = useMemo(() => board.paymentCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = useMemo(() => board.lostCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const potential = useMemo(() => board.potentialCards.filter(visible), [board, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const aedCols = useMemo(() => {
    if (!aedBoard) return { aed_invoices: [], aed_training: [], aed_completed: [], aed_not_required: [] };
    return {
      aed_invoices: aedBoard.invoiceCards.filter(visible),
      aed_training: aedBoard.scheduledCards.filter(visible),
      aed_completed: aedBoard.completedCards.filter(visible),
      aed_not_required: aedBoard.notRequiredCards.filter(visible),
    };
  }, [aedBoard, needle, showDeleted, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const fulCols = useMemo(() => {
    if (!fulBoard) return { ful_completed: [], ful_hold: [], ful_received: [], ful_generated: [], ful_logistics: [] };
    return {
      ful_completed: fulBoard.completedCards.filter(visible),
      ful_hold: fulBoard.holdCards.filter(visible),
      ful_received: fulBoard.receivedCards.filter(visible),
      ful_generated: fulBoard.generatedCards.filter(visible),
      ful_logistics: fulBoard.logisticsCards.filter(visible),
    };
  }, [fulBoard, needle, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const byStage: Record<Stage, CardView[]> = { lead: leads, quotation: quotes, performa: pis, training: scheduled, training_completed: completed, invoiced, paid, lost, potential, ...aedCols, ...fulCols };
  const deletedCount = [...board.cards.values()].filter((c) => c.deleted).length;
  const switchBoard = (b: BoardKind) => { setBoardKind(b); setOpen(null); };

  // A flagged card opens the side-by-side merge view; anything else opens its details.
  const openCard = (c: CardView) => setOpen({ id: c.id, merge: c.flaggedWith.length > 0 });
  const current = open ? (aedMode ? aedBoard?.cards : fulfilMode ? fulBoard?.cards : board.cards)?.get(open.id) : undefined;
  const candidates = current && open?.merge && boardKind === "training" ? mergeCandidates(current.id, board.cards) : [];
  const mergeGroup = candidates.length > 1 ? candidates : null;

  return (
    <div ref={pageRef} className="fu-page" style={colH ? ({ "--fu-col-h": `${colH}px` } as React.CSSProperties) : undefined}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-tight">{aedMode ? "AedSmartx Training" : fulfilMode ? "Fulfillment" : "Follow-ups"}</h1>
          <p className="text-[12.5px] text-muted">
            {fulfilMode ? (
              <>
                {fulCols.ful_completed.length} training completed · {fulCols.ful_hold.length} on hold · {fulCols.ful_received.length} list received · {fulCols.ful_generated.length} certificates generated · {fulCols.ful_logistics.length} sent to logistics
                {" "}· completed trainings from the training board
              </>
            ) : aedMode ? (
              <>
                {aedCols.aed_invoices.length} invoices · {aedCols.aed_training.length} scheduled · {aedCols.aed_completed.length} completed · {aedCols.aed_not_required.length} not required
                {aed.data?.windowStart && <> · AED invoices since {fmtDate(aed.data.windowStart, { day: "numeric", month: "short", year: "numeric" })}</>}
              </>
            ) : <>
            {leads.length.toLocaleString("en-IN")} leads · {quotes.length} quotations · {pis.length} performa invoices · {scheduled.length} scheduled · {completed.length} completed · {invoiced.length} invoices · {paid.length} payments · {lost.length} lost · {potential.length} potential
            {data?.windowStart && <> · documents since {fmtDate(data.windowStart, { day: "numeric", month: "short", year: "numeric" })}</>}
            </>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {member.id === "admin" && <ClearLogs member={member} cards={board.cards} />}
          <span className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-1.5 text-[13px] shadow-card">
            <Avatar name={member.name} />
            <span className="font-medium text-ink">{member.name}</span>
            <button className={btn.quiet} onClick={onSignOut}>Sign out</button>
          </span>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative w-full sm:w-72">
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" strokeLinecap="round" /></svg>
            <input className={`${inputCls} !h-9 pl-8 text-[13px]`} placeholder="Search name, alias, phone, email, quote no." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {boardKind === "training" && deletedCount > 0 && (
            <label className="inline-flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              Show deleted ({deletedCount})
            </label>
          )}
          <DateFilterButton value={dateFilter} onChange={setDateFilter} />
          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            {/* Sync now, last and next sync live in the sidebar (every page); the board only flags a problem. */}
            {sync?.error && <span className="text-high">Zoho sync issue: {sync.error}</span>}
            <span className="inline-flex items-center gap-1">
              <SlideButton dir="left" disabled={offset === 0} onClick={() => move(-1)} />
              <SlideButton dir="right" disabled={offset >= maxOffset} onClick={() => move(1)} />
            </span>
            {allowed.length > 1 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[12px] text-muted">Board</span>
                <Segmented value={boardKind} onChange={switchBoard} options={allowed.map((b) => ({ value: b, label: BOARD_LABEL[b] }))} />
              </span>
            )}
          </div>
        </div>
        {/* perView columns fill the width; the track slides one column (width + gap) per step. */}
        <div className="p-3">
          <div ref={viewRef} className="overflow-clip" {...swipe}>
            <div
              className="grid grid-flow-col gap-2 transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{
                gridAutoColumns: `calc((100% - ${perView - 1} * ${GAP_PX}px) / ${perView})`,
                transform: `translateX(calc(-${offset} * ((100% - ${perView - 1} * ${GAP_PX}px) / ${perView} + ${GAP_PX}px)))`,
              }}
            >
              {stages.map((s, i) => (
                <div key={s.key} className="grid min-w-0" inert={i < offset || i >= offset + perView}>
                  <Column stage={s} cards={byStage[s.key]} onOpen={openCard} onAdd={s.key === "potential" && data ? () => setAdding(true) : undefined} loading={loading && !sync} filtered={Boolean(dateFilter)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {adding && <AddPotentialModal cards={board.cards} member={member} onClose={() => setAdding(false)} />}
      {current && aedMode && <AedCardModal card={current} cards={aedBoard!.cards} member={member} options={options} onClose={() => setOpen(null)} />}
      {current && fulfilMode && <FulfillmentModal card={current} cards={fulBoard!.cards} trainingCards={board.cards} member={member} options={options} onClose={() => setOpen(null)} />}
      {current && boardKind === "training" && mergeGroup && (
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
      {current && boardKind === "training" && !mergeGroup && (
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
  // The app shell shows the sign-in screen until someone is signed in.
  const { member, signOut } = useSession();
  if (!member) return null;
  return <Board member={member} onSignOut={signOut} initialQuery={initialQuery} />;
}
