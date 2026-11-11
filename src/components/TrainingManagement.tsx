"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/dates";
import type { TrainingQuote } from "@/lib/trainingManager";
import { Modal, Skeleton, inputCls } from "./ui";
import { QuoteStory } from "./QuoteStory";
import type { HistoryLine, SentEmail } from "@/lib/quoteStory";

// Training Management (docs/TRAINING_MANAGER_PLAN.md step 1): the training-only quotes — read-only for now. The
// coordinator, portal status and participants columns arrive with steps 2–7.
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const STATUS: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", invoiced: "Invoiced", expired: "Expired" };

export function TrainingManagement() {
  const [quotes, setQuotes] = useState<TrainingQuote[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<TrainingQuote | null>(null);

  useEffect(() => {
    fetch("/api/training-management").then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? "Couldn't load the training quotes");
      setQuotes(j.quotes);
    }).catch(() => setError("Couldn't load the training quotes"));
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!quotes || !t) return quotes ?? [];
    return quotes.filter((x) => [x.customer, x.number, x.contact?.name, x.coordinator?.name, ...x.lines.map((l) => l.name)].some((s) => s?.toLowerCase().includes(t)));
  }, [quotes, q]);

  if (error) return <p className="rounded-xl border border-line bg-surface p-4 text-[14px] text-high">{error}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-sm`} placeholder="Search customer, quote or training" value={q} onChange={(e) => setQ(e.target.value)} />
        {quotes && <span className="text-[13px] text-muted">{shown.length} of {quotes.length} training quotes</span>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[1.4fr_0.8fr_1.6fr_0.6fr_0.7fr_0.6fr] gap-3 border-b border-line px-4 py-2.5 text-[12px] font-medium uppercase tracking-wide text-faint md:grid">
          <span>Customer</span><span>Quote</span><span>Training</span><span className="text-right">Expected</span><span className="text-right">Total</span><span>Status</span>
        </div>
        {!quotes && <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
        {quotes && !shown.length && <p className="p-6 text-center text-[14px] text-muted">{quotes.length ? "Nothing matches that search." : "No training-only quotes yet."}</p>}
        {shown.map((x) => (
          <button key={x.id} type="button" onClick={() => setOpen(x)}
            className="grid w-full grid-cols-2 gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-left text-[14px] last:border-b-0 hover:bg-surface-2 md:grid-cols-[1.4fr_0.8fr_1.6fr_0.6fr_0.7fr_0.6fr] md:items-center">
            <span className="font-medium text-ink">{x.customer}</span>
            <span className="text-right text-muted md:text-left">{x.number} · {fmtDate(x.date)}</span>
            <span className="col-span-2 text-ink-2 md:col-span-1">{x.lines.map((l) => l.name).join(", ")}</span>
            <span className="text-muted md:text-right"><span className="md:hidden">Expected </span>{x.expected || "—"}</span>
            <span className="text-right text-ink-2">{inr(x.total)}</span>
            <span className="col-span-2 text-[13px] text-muted md:col-span-1">{STATUS[x.status] ?? x.status}</span>
          </button>
        ))}
      </div>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.number} · ${open.customer}` : ""} top size="xl">
        {open && <Detail x={open} />}
      </Modal>
    </div>
  );
}

/** The quotation's story, the same as on Quotations (owner, 11 Nov: "those are all the same thing"). */
type StoryQuote = { id: string; number: string; date: string; status: string; total: number; history: HistoryLine[]; emails: SentEmail[]; error?: string };

function Detail({ x }: { x: TrainingQuote }) {
  const [story, setStory] = useState<StoryQuote | null>(null);
  useEffect(() => {
    fetch(`/api/quotations?view=${x.id}`).then((r) => r.json()).then(setStory).catch(() => setStory({ error: "Couldn't reach the server" } as StoryQuote));
  }, [x.id]);
  const row = (k: string, v: React.ReactNode) => <div className="flex gap-3 py-1.5 text-[14px]"><span className="w-32 shrink-0 text-muted">{k}</span><span className="min-w-0 break-words text-ink">{v || "—"}</span></div>;
  const card = "rounded-2xl border border-line bg-surface-2/40 p-4";
  const label = "text-[12.5px] font-bold uppercase tracking-wide text-muted";
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <section className={card}>
          <p className={label}>Customer</p>
          <div className="mt-1">
            {row("Customer", x.customer)}
            {row("Contact", x.contact?.name)}
            {row("Email", x.contact?.email && <a className="text-brand hover:underline" href={`mailto:${x.contact.email}`}>{x.contact.email}</a>)}
            {row("Phone", x.contact?.phone)}
            {row("Quote", `${x.number} · ${fmtDate(x.date, { day: "numeric", month: "short", year: "numeric" })} · ${STATUS[x.status] ?? x.status}`)}
            {row("Expected", x.expected ? `${x.expected} participants` : "")}
            {row("Coordinator", x.coordinator ? <>{x.coordinator.name} <span className="text-muted">· {x.coordinator.phone} · </span><a className="text-brand hover:underline" href={`mailto:${x.coordinator.email}`}>{x.coordinator.email}</a></> : <span className="text-muted">Added when the quote is emailed from Quotations</span>)}
          </div>
        </section>
        <section className="space-y-3">
          {x.lines.map((l, i) => (
            <div key={i} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold">{l.name}</h3>
                <span className="text-[13px] text-muted">{l.qty} × {inr(l.rate)} = {inr(l.total)}</span>
              </div>
              {l.description && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{l.description}</p>}
            </div>
          ))}
        </section>
      </div>
      {!story ? <p className="text-[14px] text-muted">Getting the story of this quotation…</p>
        : story.error ? <p className="text-[14px] text-high">{story.error}</p>
        : <QuoteStory quote={story} training />}
    </div>
  );
}
