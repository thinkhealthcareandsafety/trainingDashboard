"use client";

import { type CardView, cardDue, kindOfId } from "@/lib/pipeline";

/*
 * Where a card stands, as a row of steps in its modal's header (owner, 22 Oct — like Fulfillment's): done steps ticked,
 * the current one ringed, later ones grey, a skipped one struck through. The current step takes a colour when something
 * is off — amber (to be decided, postponed, on hold, part paid), red (deal lost, overdue), purple (training not required).
 */

export type Step = { label: string; state: "done" | "here" | "todo" | "skipped"; tone?: "warn" | "bad" | "purple"; title?: string };

const TONE = {
  brand: { ring: "border-brand", dot: "bg-brand", text: "text-ink" },
  warn: { ring: "border-medium", dot: "bg-medium", text: "text-medium" },
  bad: { ring: "border-high", dot: "bg-high", text: "text-high" },
  purple: { ring: "border-purple", dot: "bg-purple", text: "text-purple" },
};

export function StepTracker({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="hidden items-center gap-1.5 lg:flex" aria-label={label}>
      {steps.map((s, i) => {
        const tone = TONE[s.tone ?? "brand"];
        const reached = s.state === "done" || s.state === "here" || s.state === "skipped";
        return (
          <li key={i} className="flex items-center gap-1.5" aria-current={s.state === "here" ? "step" : undefined} title={s.title}>
            {i > 0 && <span className={`h-px w-5 ${reached ? "bg-brand" : "bg-line"}`} aria-hidden />}
            <span className={`grid size-[18px] shrink-0 place-items-center rounded-full ${s.state === "done" ? "bg-brand text-brand-ink" : s.state === "here" ? `border-2 ${tone.ring}` : "border border-line-strong"}`} aria-hidden>
              {s.state === "done" && <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>}
              {s.state === "here" && <span className={`size-1.5 rounded-full ${tone.dot}`} />}
            </span>
            <span className={`whitespace-nowrap text-[12.5px] ${s.state === "here" ? `font-semibold ${tone.text}` : s.state === "done" ? "text-ink-2" : "text-faint"} ${s.state === "skipped" ? "line-through decoration-faint" : ""}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * `at` = the current step; earlier ones are done unless listed as skipped (struck through, with why) or unknown (grey —
 * e.g. a payment not merged with its invoice yet can't say what happened before it).
 */
function build(labels: string[], at: number, skipped: Map<number, string> = new Map(), here: Partial<Step> = {}, unknown: Map<number, string> = new Map()): Step[] {
  return labels.map((label, i) =>
    i === at ? { label, state: "here", ...here }
    : i > at ? { label, state: "todo" }
    : skipped.has(i) ? { label, state: "skipped", title: skipped.get(i) }
    : unknown.has(i) ? { label, state: "todo", title: unknown.get(i) }
    : { label, state: "done" },
  );
}

/** Training board: Lead → Quotation → PI → Scheduled → Completed → Invoice → Paid. None for leads and potential cards. */
export function trainingSteps(card: CardView): Step[] | null {
  const AT = { quote: 1, pi: 2, invoice: 5, payment: 6 } as const;
  if (!(card.kind in AT)) return null;
  const kinds = new Set(card.historyIds.map(kindOfId));
  const s = card.schedule;
  let at: number = AT[card.kind as keyof typeof AT];
  if ((card.kind === "quote" || card.kind === "pi") && s) at = s.completed ? 4 : 3;
  // Struck through only when it's known the step was skipped; grey when this card can't tell (nothing merged into it yet).
  const skipped = new Map<number, string>();
  const unknown = new Map<number, string>();
  const notMerged = "Not merged into this card yet";
  const hasPI = kinds.has("pi") || Boolean(card.linkedPI);
  if (at > 1 && !kinds.has("quote") && !card.linkedQuote) {
    if (hasPI) skipped.set(1, "No quotation — the PI came first");
    else unknown.set(1, notMerged);
  }
  if (at > 2 && !hasPI) {
    if (card.kind === "quote" || card.piSkipped) skipped.set(2, "Scheduled straight from the quotation — no PI");
    else unknown.set(2, notMerged);
  }
  if (at > 4 && !s?.completed) {
    if (hasPI) {
      skipped.set(3, "Not scheduled on the dashboard");
      skipped.set(4, "Not marked completed on the dashboard");
    } else {
      unknown.set(3, notMerged);
      unknown.set(4, notMerged);
    }
  }
  if (at > 5 && !kinds.has("invoice") && !card.linkedInvoice) unknown.set(5, notMerged);
  const due = cardDue(card)?.tone;
  const here: Partial<Step> =
    card.lost ? { label: "Lost", tone: "bad", title: "Quotation declined in Zoho Books" }
    : at === 3 && s?.status === "tbd" ? { label: "To be decided", tone: "warn" }
    : at === 3 && s?.status === "postponed" ? { label: "Postponed", tone: "warn" }
    : at === 5 && due === "overdue" ? { label: "Overdue", tone: "bad" }
    : at >= 5 && due === "part" ? { label: "Part paid", tone: "warn" }
    : {};
  return build(["Lead", "Quotation", "PI", "Scheduled", "Completed", "Invoice", "Paid"], at, skipped, here, unknown);
}

/** AedSmartx board: Invoice → Delivered → Contacted → Scheduled → Completed (or "Not required", purple). */
export function aedSteps(card: CardView): Step[] {
  const s = card.schedule;
  const contacted = Boolean(card.outreach?.inProcess);
  if (card.notRequired) {
    return [
      { label: "Invoice", state: "done" },
      card.delivered ? { label: "Delivered", state: "done" } : { label: "Delivered", state: "skipped", title: "Not marked delivered" },
      { label: "Not required", state: "here", tone: "purple", title: card.reseller ? "Reseller — no training" : card.resale ? "Bought for resale" : "Training not required" },
    ];
  }
  const at = s?.completed ? 4 : s ? 3 : contacted ? 2 : card.delivered ? 1 : 0;
  const skipped = new Map<number, string>();
  if (at > 1 && !card.delivered) skipped.set(1, "Not marked delivered");
  if (at > 2 && !contacted) skipped.set(2, "Scheduled without the Contacted step");
  const here: Partial<Step> = at === 3 && s?.status === "tbd" ? { label: "To be decided", tone: "warn" } : at === 3 && s?.status === "postponed" ? { label: "Postponed", tone: "warn" } : {};
  return build(["Invoice", "Delivered", "Contacted", "Scheduled", "Completed"], at, skipped, here);
}

/** Logistics board, training cards: Sent to Logistics → Payment → Packing → Shipped → Received. None for AED delivery cards. */
export function logisticsSteps(card: CardView): Step[] | null {
  const l = card.logistics;
  if (!l || l.column === "aed") return null;
  const AT = { stl: 0, payment: 1, packages: 2, shipments: 3, received: 4 } as const;
  const at = AT[l.column];
  const labels = ["Sent to Logistics", "Payment", "Packing", "Shipped", "Received"];
  const here: Partial<Step> =
    l.step === "pack_hold" || l.step === "ship_hold" ? { label: "On hold", tone: "warn" }
    : l.column === "received" && l.step === "expected" ? { label: l.expected ? `Expected ${new Date(`${l.expected}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Expected", tone: "warn" }
    : {};
  const steps = build(labels, at, new Map(), here);
  // A payment waiting for its certificates: they haven't reached Logistics yet.
  if (l.column === "payment" && !l.merged) steps[0] = { label: labels[0], state: "todo", title: l.certStage ? `Certificates: ${l.certStage}` : "Certificates not sent to Logistics yet" };
  return steps;
}
