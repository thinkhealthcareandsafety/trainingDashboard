/*
 * The story of a quotation (owner, 11 Nov): one box per phase, start to finish, each phase's status inside its box —
 * not "created" / "emailed" as phases of their own. Every quotation: Quotation → Performa invoice → Invoice → Payment
 * received. A training quotation also has Training scheduled / completed (between Performa and Invoice) and, after the
 * payment, Gratitude email → Certificates generated → Sent to Logistics → Packed → Shipped → Received by client (the end:
 * the certificates reached them). Phases not reached yet show ahead (greyed); a declined / expired quote stops there.
 *
 * Links: a Performa is the quote's when its reference cites the quote number (or Zoho's history says the quote was
 * converted to it); an invoice is the deal's when its reference cites the Performa (or the quote, when the Performa was
 * skipped); payments are the ones applied to those invoices. Training, certificates and logistics come from the boards.
 */
import type { ZohoInvoice, ZohoPayment, ZohoPI } from "./types";
import type { FulfilInfo, TrainingSchedule } from "./pipeline";

export type HistoryLine = { text: string; by: string | null; when: string };
export type SentEmail = { at: string; by: string; to: string[] };
export type PhaseState = "done" | "ahead" | "stopped";
export type Phase = { key: string; title: string; state: PhaseState; status?: string; tone?: "good" | "bad" | "warn" | "info"; lines: string[] };

/** Zoho's automation, not something a person did to the quote. */
export const isAutomation = (h: HistoryLine) => /custom function|workflow/i.test(h.text);
const rupees = (s: string) => s.replace(/Rs\.?\s*/gi, "₹").replace(/\.00\b/g, "");
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const cap = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const cites = (ref: string | undefined, num: string) => Boolean(ref && num && ref.toLowerCase().includes(num.toLowerCase()));

export type StoryInput = {
  quote: { id: string; number: string; date: string; status: string; total: number; history: HistoryLine[]; emails: SentEmail[]; rejection?: { at: string; reason: string } | null };
  training: boolean;
  /** The Sales copy (every quote, Performa, invoice and payment); null while loading. */
  docs: { pis: ZohoPI[]; invoices: ZohoInvoice[]; payments: ZohoPayment[] } | null;
  /** Training quotes, from the boards: its schedule, its certificates, and the logistics step ("packages", "ship_dispatched", "received" …). */
  schedule?: TrainingSchedule;
  fulfil?: FulfilInfo;
  logiStep?: string;
  /** The training board's card for the deal: the invoices and payments it holds (a skipped Performa leaves no reference to follow). */
  board?: { invoices: ZohoInvoice[]; payments: ZohoPayment[]; piSkipped: boolean };
  /** The Performa our Trainings page made (Convert to PI / Mark confirmed), shown even before a Zoho copy has it (13 Nov). */
  piHint?: { number: string; status: string; date: string };
  today: string;
};

/** The Performa, invoices and payments behind a quotation. */
export function dealOf(input: Pick<StoryInput, "quote" | "docs" | "board">) {
  const { quote, docs, board } = input;
  if (!docs) return { pi: undefined, invoices: board?.invoices ?? [], payments: board?.payments ?? [] };
  const converted = [...quote.history].map((h) => h.text.match(/converted to sales order\s+(\S+?)\.?$/i)?.[1]).find(Boolean);
  const pi = docs.pis.find((p) => p.number === converted) ?? docs.pis.find((p) => cites(p.reference, quote.number));
  const toInvoice = [...quote.history].map((h) => h.text.match(/converted to invoice\s+(\S+?)\.?$/i)?.[1]).filter(Boolean);
  const linked = docs.invoices.filter((i) => (pi ? cites(i.reference, pi.number) : false) || cites(i.reference, quote.number) || toInvoice.includes(i.number));
  const invoices = [...new Map([...linked, ...(board?.invoices ?? [])].map((i) => [i.invoiceId, docs.invoices.find((d) => d.invoiceId === i.invoiceId) ?? i])).values()];
  const ids = new Set(invoices.map((i) => i.invoiceId));
  const payments = [...new Map([...docs.payments.filter((p) => ids.has(p.invoiceId)), ...(board?.payments ?? [])].map((p) => [`${p.paymentId}:${p.invoiceId}`, p])).values()].sort((a, b) => a.date.localeCompare(b.date));
  return { pi, invoices, payments };
}

export function storyPhases(input: StoryInput): Phase[] {
  const { quote, training, schedule, fulfil, logiStep, today } = input;
  const real = [...quote.history].reverse().filter((h) => h.text.trim() && !isAutomation(h)); // oldest first
  const { pi, invoices, payments } = dealOf(input);

  // 1. The quotation: status, amount, made, emailed, price change.
  const created = real.find((h) => /created for/i.test(h.text));
  const changes = real.map((h) => h.text.match(/amount changed from\s+(\S+)\s+to\s+(\S+?)\.?$/i)).filter((m): m is RegExpMatchArray => Boolean(m));
  const ours = quote.emails[0]; // newest first
  const zohoSent = real.filter((h) => /emailed to/i.test(h.text)).at(-1);
  const qLines = [
    inr(quote.total),
    `Made ${day(quote.date)}${created?.by ? ` by ${created.by}` : ""}`,
    ours ? `Emailed to ${ours.to.join(", ")} · ${new Date(ours.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
      : zohoSent ? `${zohoSent.text.replace(/^quote\s+/i, "").replace(/^\w/, (c) => c.toUpperCase())} · ${zohoSent.when}` : "",
    changes.length ? `Price changed ${rupees(changes[0][1])} → ${rupees(changes.at(-1)![2])}` : "",
  ].filter(Boolean);
  const qs = quote.status.toLowerCase();
  // Rejected by the coordinator on the portal (owner, 12 Nov): the story is just "sent" and "rejected".
  if (quote.rejection) {
    return [
      { key: "quote", title: "Quotation", state: "done", status: "Sent", tone: "info", lines: [quote.number, ...qLines] },
      { key: "rejected", title: "Rejected", state: "stopped", status: "By the coordinator", tone: "bad", lines: [quote.rejection.reason ? `“${quote.rejection.reason}”` : "No reason given", day(quote.rejection.at)].filter(Boolean) },
    ];
  }
  const lost = qs === "declined" || qs === "expired";
  const phases: Phase[] = [{ key: "quote", title: "Quotation", state: lost ? "stopped" : "done", status: cap(qs), tone: lost ? "bad" : qs === "accepted" || qs === "invoiced" ? "good" : "info", lines: [quote.number, ...qLines] }];
  if (lost) return phases;

  // 2. Performa invoice. Zoho's "open" is what Zoho shows as Confirmed; confirmed (or further) is green (owner, 13 Nov).
  const piTone = (status: string): Phase["tone"] => (status === "draft" ? "info" : "good");
  const hint = !pi && input.piHint ? input.piHint : null;
  phases.push(pi
    ? { key: "pi", title: "Performa invoice", state: "done", status: pi.status === "open" ? "Confirmed" : cap(pi.status), tone: piTone(pi.status), lines: [pi.number, pi.total ? inr(pi.total) : "", day(pi.date)].filter(Boolean) }
    : hint ? { key: "pi", title: "Performa invoice", state: "done", status: hint.status === "open" ? "Confirmed" : cap(hint.status), tone: piTone(hint.status), lines: [hint.number, day(hint.date)].filter(Boolean) }
    : input.board?.piSkipped ? { key: "pi", title: "Performa invoice", state: "done", status: "Skipped", tone: "info", lines: ["Went straight from the quotation"] }
    : { key: "pi", title: "Performa invoice", state: "ahead", lines: [] });

  // 3. Training (training quotes).
  if (training) {
    const dates = schedule?.dates?.length ? schedule.dates : schedule?.date ? [schedule.date] : [];
    phases.push(schedule && schedule.status !== "tbd" && dates.length
      ? { key: "scheduled", title: "Training scheduled", state: "done", status: schedule.status === "postponed" ? "Postponed" : "Scheduled", tone: schedule.status === "postponed" ? "warn" : "info",
          lines: [dates.map((d) => day(d)).join(", "), schedule.trainers.length ? `Trainer: ${schedule.trainers.join(", ")}` : ""].filter(Boolean) }
      : { key: "scheduled", title: "Training scheduled", state: "ahead", lines: schedule?.status === "tbd" ? ["Date to be decided"] : [] });
    phases.push(schedule?.completed
      ? { key: "completed", title: "Training completed", state: "done", status: "Completed", tone: "good", lines: [day(schedule.completed.at), schedule.people ? `${schedule.people} people` : ""].filter(Boolean) }
      : { key: "completed", title: "Training completed", state: "ahead", lines: [] });
  }

  // 4. Invoice: Paid / Overdue by N days / Due in N days.
  const owed = invoices.reduce((s, i) => s + (i.balance ?? 0), 0);
  const dueOf = (i: ZohoInvoice) => {
    if ((i.balance ?? 0) <= 0 && (i.total ?? 0) > 0) return "Paid";
    if (!i.dueDate) return cap(i.status);
    const days = Math.round((Date.parse(i.dueDate) - Date.parse(today)) / 86_400_000);
    return days < 0 ? `Overdue by ${-days} day${days === -1 ? "" : "s"}` : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
  };
  phases.push(invoices.length
    ? { key: "invoice", title: "Invoice", state: "done", status: invoices.length === 1 ? dueOf(invoices[0]) : owed > 0 ? `${inr(owed)} still to pay` : "Paid",
        tone: owed <= 0 ? "good" : invoices.some((i) => dueOf(i).startsWith("Overdue")) ? "bad" : "info",
        lines: invoices.flatMap((i) => [`${i.number}${i.total ? ` · ${inr(i.total)}` : ""}`, i.dueDate ? `Due ${day(i.dueDate)}` : ""]).filter(Boolean) }
    : { key: "invoice", title: "Invoice", state: "ahead", lines: [] });

  // 5. Payment received (the end, for anything but training).
  const paid = payments.reduce((s, p) => s + p.amount + (p.tdsWithheld ?? 0), 0);
  phases.push(payments.length
    ? { key: "payment", title: "Payment received", state: "done", status: owed <= 0 ? "Paid in full" : "Part paid", tone: owed <= 0 ? "good" : "warn",
        lines: [inr(paid), ...payments.map((p) => `${inr(p.amount)} · ${day(p.date)}`)].slice(0, 4) }
    : { key: "payment", title: "Payment received", state: "ahead", lines: [] });
  if (!training) return phases;

  // 6. Certificates and their journey to the client.
  const order = ["completed", "gratitude", "generated", "logistics"];
  const at = order.indexOf(fulfil?.stage ?? "");
  const reached = (stage: string) => at >= order.indexOf(stage);
  phases.push(fulfil?.email || reached("gratitude")
    ? { key: "gratitude", title: "Gratitude email", state: "done", status: "Sent", tone: "info", lines: [fulfil?.email ? `To ${fulfil.email.to}` : "", fulfil?.email ? day(fulfil.email.at) : ""].filter(Boolean) }
    : { key: "gratitude", title: "Gratitude email", state: "ahead", lines: [] });
  phases.push(fulfil?.certs || reached("generated")
    ? { key: "certs", title: "Certificates generated", state: "done", status: fulfil?.certStatus === "hold" ? "On hold" : "Done", tone: fulfil?.certStatus === "hold" ? "warn" : "good",
        lines: [fulfil?.certs ? `${fulfil.certs.rows.length} certificates` : "", fulfil?.certs ? day(fulfil.certs.at) : ""].filter(Boolean) }
    : { key: "certs", title: "Certificates generated", state: "ahead", lines: [] });
  phases.push(reached("logistics")
    ? { key: "stl", title: "Sent to Logistics", state: "done", status: "Sent", tone: "info", lines: [fulfil?.at ? day(fulfil.at) : ""].filter(Boolean) }
    : { key: "stl", title: "Sent to Logistics", state: "ahead", lines: [] });
  const step = logiStep ?? "";
  const packed = /^pack|^ship|^expected|^received/.test(step), shipped = /^ship|^expected|^received/.test(step), received = step === "received";
  phases.push({ key: "packed", title: "Packed", state: packed ? "done" : "ahead", status: packed ? (step === "pack_hold" ? "On hold" : step === "pack_process" ? "Packing" : "Packed") : undefined, tone: step === "pack_hold" ? "warn" : "info", lines: [] });
  phases.push({ key: "shipped", title: "Shipped", state: shipped ? "done" : "ahead", status: shipped ? (step === "ship_hold" ? "On hold" : step.startsWith("expected") ? "On the way" : "Dispatched") : undefined, tone: step === "ship_hold" ? "warn" : "info", lines: [] });
  phases.push({ key: "received", title: "Received by client", state: received ? "done" : "ahead", status: received ? "Received" : undefined, tone: "good", lines: [] });
  return phases;
}
