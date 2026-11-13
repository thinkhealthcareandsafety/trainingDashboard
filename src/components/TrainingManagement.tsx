"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/dates";
import type { TrainingQuote } from "@/lib/trainingManager";
import { type Proposal, fmtProposalDate } from "@/lib/portalRules";
import { Modal, Skeleton, btn, inputCls, selectCls } from "./ui";
import { QuoteStory } from "./QuoteStory";
import { PerformaEditor } from "./PerformaEditor";
import type { TrainingSort, TrainingSortKey } from "@/lib/uiPrefs";
import type { HistoryLine, SentEmail } from "@/lib/quoteStory";

// Training Management (docs/TRAINING_MANAGER_PLAN.md): the training-only quotes and their Training Manager — the
// coordinator, the login (step 8), the date they proposed (step 5, the row glows green) and the attendee list (steps 6–7).
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const STATUS: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", invoiced: "Invoiced", expired: "Expired" };

type Portal = { status: string; proposal: Proposal | null; history: Proposal[]; registered: number; loginSentAt: string | null; lastLogin: string | null; confirmed: { at: string; by: string; salesorderId: string; number: string; emailedAt?: string; zohoAt?: string; zohoBy?: string; board?: Board } | null; rejected: { at: string; by: string; reason: string; zoho: "declined" | "failed" } | null };
type Board = { state: "scheduled" | "skipped" | "failed" | "notlive"; note: string; at: string; value?: string };
type Quote = TrainingQuote & { portal: Portal | null };
type Person = { th: string; name: string; phone: string; email: string; source: "typed" | "excel" | "qr"; addedAt: string; duplicate: boolean };

const portalStatus = (x: Quote) => x.portal?.status ?? (x.coordinator ? "Login not sent" : "No coordinator");
const proposed = (x: Quote) => Boolean(x.portal?.proposal) && !x.portal?.confirmed && !x.portal?.rejected;
const rejected = (x: Quote) => Boolean(x.portal?.rejected);
const glow = (x: Quote) => (proposed(x) ? 2 : rejected(x) ? 1 : 0);

/* Column sort (owner, 12 Nov): click a header for ascending / descending; each person's choice is kept as their default. */
const STATUS_ORDER = ["Accepted", "Rejected", "Performa draft", "Confirmed", "Logged in", "Login sent", "Login not sent", "No coordinator"];
const SORTS: Record<TrainingSortKey, { label: string; first: "asc" | "desc"; value: (x: Quote) => string | number; right?: boolean }> = {
  customer: { label: "Customer", first: "asc", value: (x) => x.customer.toLowerCase() },
  quote: { label: "Quote", first: "desc", value: (x) => `${x.date} ${x.number}` },
  training: { label: "Training", first: "asc", value: (x) => x.lines.map((l) => l.name).join(", ").toLowerCase() },
  expected: { label: "Expected", first: "desc", value: (x) => x.expected, right: true },
  total: { label: "Total", first: "desc", value: (x) => x.total, right: true },
  status: { label: "Training Manager", first: "asc", value: (x) => STATUS_ORDER.indexOf(portalStatus(x)) },
};
function sortQuotes(list: Quote[], sort: TrainingSort): Quote[] {
  // Default: accepted (waiting for us) first, then rejected, then newest first as the server sends them.
  if (!sort) return [...list].sort((a, b) => glow(b) - glow(a));
  const v = SORTS[sort.key].value, k = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * k; });
}
const savePref = (value: TrainingSort) => fetch("/api/ui-prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "trainingsSort", value }) }).catch(() => undefined);
const STATUS_TONE: Record<string, string> = {
  "No coordinator": "text-faint", "Login not sent": "text-medium", "Login sent": "text-ink-2", "Logged in": "text-ink-2", "Accepted": "font-semibold text-low", "Performa draft": "text-medium", "Confirmed": "text-ink-2", "Rejected": "font-semibold text-high",
};

export function TrainingManagement() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<TrainingSort>(null);
  useEffect(() => {
    fetch("/api/ui-prefs").then((r) => r.json()).then((j: { prefs?: { trainingsSort?: TrainingSort } }) => { if (j.prefs?.trainingsSort) setSort(j.prefs.trainingsSort); }).catch(() => undefined);
  }, []);
  const sortBy = (key: TrainingSortKey) => {
    const next: TrainingSort = sort?.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: SORTS[key].first };
    setSort(next); savePref(next);
  };
  const resetSort = () => { setSort(null); savePref(null); };

  const load = () => fetch("/api/training-management").then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Couldn't load the training quotes");
    setQuotes(j.quotes);
  }).catch(() => setError("Couldn't load the training quotes"));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = quotes ?? [];
    const sorted = sortQuotes(list, sort);
    if (!t) return sorted;
    return sorted.filter((x) => [x.customer, x.number, x.contact?.name, x.coordinator?.name, portalStatus(x), ...x.lines.map((l) => l.name)].some((s) => s?.toLowerCase().includes(t)));
  }, [quotes, q, sort]);
  const open = quotes?.find((x) => x.id === openId) ?? null;
  const waiting = quotes?.filter(proposed).length ?? 0;
  const lost = quotes?.filter((x) => Boolean(x.portal?.rejected)).length ?? 0;

  if (error) return <p className="rounded-xl border border-line bg-surface p-4 text-[14px] text-high">{error}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-sm`} placeholder="Search customer, quote, training or status" value={q} onChange={(e) => setQ(e.target.value)} />
        {quotes && <span className="text-[13px] text-muted">{shown.length} of {quotes.length} training quotes</span>}
        <select className={`${selectCls} md:hidden`} value={sort ? `${sort.key}:${sort.dir}` : ""} aria-label="Sort" onChange={(e) => { const [k, d] = e.target.value.split(":"); if (!k) return resetSort(); const next = { key: k as TrainingSortKey, dir: d as "asc" | "desc" }; setSort(next); savePref(next); }}>
          <option value="">Default order</option>
          {(Object.keys(SORTS) as TrainingSortKey[]).flatMap((k) => [<option key={`${k}a`} value={`${k}:asc`}>{SORTS[k].label} ↑</option>, <option key={`${k}d`} value={`${k}:desc`}>{SORTS[k].label} ↓</option>])}
        </select>
        {sort && <button type="button" className={`${btn.quiet} hidden md:inline-flex`} onClick={resetSort}>Default order</button>}
        {waiting > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-low-bg px-2.5 py-1 text-[12.5px] font-semibold text-low"><span className="size-2 animate-pulse rounded-full bg-low" />{waiting} accepted, waiting for you</span>}
        {lost > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-high-bg px-2.5 py-1 text-[12.5px] font-semibold text-high"><span className="size-2 rounded-full bg-high" />{lost} rejected</span>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[1.3fr_0.8fr_1.5fr_0.5fr_0.7fr_0.9fr] gap-3 border-b border-line px-4 py-1.5 text-[12px] font-medium uppercase tracking-wide text-faint md:grid" role="row">
          {(Object.keys(SORTS) as TrainingSortKey[]).map((k) => {
            const on = sort?.key === k;
            return (
              <button key={k} type="button" onClick={() => sortBy(k)} aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"} title={`Sort by ${SORTS[k].label.toLowerCase()}`}
                className={`-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 uppercase tracking-wide hover:bg-surface-2 hover:text-ink ${SORTS[k].right ? "justify-end" : ""} ${on ? "text-ink" : ""}`}>
                {SORTS[k].label}
                <svg viewBox="0 0 12 12" className={`size-3 shrink-0 transition ${on ? "opacity-100" : "opacity-30"} ${on && sort!.dir === "asc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4.5 6 7.5 9 4.5" /></svg>
              </button>
            );
          })}
        </div>
        {!quotes && <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
        {quotes && !shown.length && <p className="p-6 text-center text-[14px] text-muted">{quotes.length ? "Nothing matches that search." : "No training-only quotes yet."}</p>}
        {shown.map((x) => (
          <button key={x.id} type="button" onClick={() => setOpenId(x.id)}
            className={`grid w-full grid-cols-2 gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-left text-[14px] last:border-b-0 md:grid-cols-[1.3fr_0.8fr_1.5fr_0.5fr_0.7fr_0.9fr] md:items-center ${proposed(x) ? "bg-low-bg/50 shadow-[inset_0_0_0_2px_var(--low),0_0_14px_color-mix(in_srgb,var(--low)_28%,transparent)] hover:bg-low-bg" : rejected(x) ? "bg-high-bg/50 shadow-[inset_0_0_0_2px_var(--high),0_0_14px_color-mix(in_srgb,var(--high)_24%,transparent)] hover:bg-high-bg" : "hover:bg-surface-2"}`}>
            <span className="font-medium text-ink">{x.customer}</span>
            <span className="text-right text-muted md:text-left">{x.number} · {fmtDate(x.date)}</span>
            <span className="col-span-2 text-ink-2 md:col-span-1">{x.lines.map((l) => l.name).join(", ")}</span>
            <span className="text-muted md:text-right"><span className="md:hidden">Expected </span>{x.expected || "—"}</span>
            <span className="text-right text-ink-2">{inr(x.total)}</span>
            <span className={`col-span-2 text-[13px] md:col-span-1 ${STATUS_TONE[portalStatus(x)] ?? "text-muted"}`}>
              {portalStatus(x)}{x.portal?.proposal ? ` · ${fmtProposalDate(x.portal.proposal.dates[0])}` : ""}{x.portal && x.portal.registered > 0 ? ` · ${x.portal.registered} registered` : ""}
            </span>
          </button>
        ))}
      </div>
      <Modal open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? `${open.number} · ${open.customer}` : ""} top size="xl">
        {open && <Detail x={open} onChanged={load} />}
      </Modal>
    </div>
  );
}

/** The quotation's story, the same as on Quotations (owner, 11 Nov: "those are all the same thing"). */
type StoryQuote = { id: string; number: string; date: string; status: string; total: number; history: HistoryLine[]; emails: SentEmail[]; error?: string };

const card = "rounded-2xl border border-line bg-surface-2/40 p-4";
const label = "text-[12.5px] font-bold uppercase tracking-wide text-muted";

function Detail({ x, onChanged }: { x: Quote; onChanged: () => void }) {
  const [story, setStory] = useState<StoryQuote | null>(null);
  useEffect(() => {
    fetch(`/api/quotations?view=${x.id}`).then((r) => r.json()).then(setStory).catch(() => setStory({ error: "Couldn't reach the server" } as StoryQuote));
  }, [x.id]);
  const row = (k: string, v: React.ReactNode) => <div className="flex gap-3 py-1.5 text-[14px]"><span className="w-32 shrink-0 text-muted">{k}</span><span className="min-w-0 break-words text-ink">{v || "—"}</span></div>;
  return (
    <div className="space-y-5">
      {x.portal?.rejected && <RejectedCard id={x.id} r={x.portal.rejected} onChanged={onChanged} />}
      {x.portal?.proposal && !x.portal?.rejected && <ProposalCard p={x.portal.proposal} history={x.portal.history} expected={x.expected} confirmed={x.portal.confirmed} />}
      {x.portal?.confirmed && (
        <section className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={label}>Performa</p>
            {x.portal.confirmed.board && <BoardLine b={x.portal.confirmed.board} />}
          </div>
          <div className="mt-2"><PerformaEditor id={x.id} onChanged={onChanged} /></div>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <section className={card}>
            <p className={label}>Customer</p>
            <div className="mt-1">
              {row("Customer", x.customer)}
              {row("Contact", x.contact?.name)}
              {row("Email", x.contact?.email && <a className="text-brand hover:underline" href={`mailto:${x.contact.email}`}>{x.contact.email}</a>)}
              {row("Phone", x.contact?.phone)}
              {row("Quote", `${x.number} · ${fmtDate(x.date, { day: "numeric", month: "short", year: "numeric" })} · ${STATUS[x.status] ?? x.status}`)}
              {row("Expected", x.expected ? `${x.expected} participants` : "")}
            </div>
          </section>
          <TrainingManagerCard x={x} onChanged={onChanged} />
        </div>
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
      <ParticipantList x={x} />
      {!story ? <p className="text-[14px] text-muted">Getting the story of this quotation…</p>
        : story.error ? <p className="text-[14px] text-high">{story.error}</p>
        : <QuoteStory quote={story} training actions={piAction(x, onChanged)} />}
    </div>
  );
}

/**
 * The story's Performa box (owner, 13 Nov: "in the story I should only see the option to convert to PI"): Convert to PI
 * once the coordinator accepted with a date; right after, until the sync brings the Performa in, its number.
 */
function piAction(x: Quote, onChanged: () => void): Record<string, React.ReactNode> | undefined {
  const p = x.portal;
  if (!p?.proposal || p.rejected) return undefined;
  if (p.confirmed) return { pi: <p className="truncate text-[13px] font-semibold text-ink">{p.confirmed.number} · Draft made</p> };
  return { pi: <ConvertToPi id={x.id} p={p.proposal} onChanged={onChanged} /> };
}

function ConvertToPi({ id, p, onChanged }: { id: string; p: Proposal; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const convert = async () => {
    if (!window.confirm(`Convert to PI? The quotation becomes a Draft Performa in Zoho (training at ${p.headcount} people, Training Date ${fmtProposalDate(p.dates[0])}), and the coordinator can't change the date any more. You check it, then Mark confirmed.`)) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept", id }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "Couldn't convert it");
    onChanged();
  };
  return (
    <div className="space-y-1.5">
      <button type="button" className={btn.primary} disabled={busy} onClick={convert}>{busy ? "Making it in Zoho…" : "Convert to PI"}</button>
      {msg ? <p className="line-clamp-2 text-[12.5px] text-high" role="alert" title={msg}>{msg}</p> : <p className="text-[12.5px] text-muted">Confirm with the client first.</p>}
    </div>
  );
}

/** What Mark confirmed did on the Training board. */
function BoardLine({ b }: { b: Board }) {
  const days = (b.value ?? "").split(",").filter(Boolean).map((d) => fmtDate(`${d.slice(0, 10)}T00:00:00`, { day: "numeric", month: "short" }));
  if (b.state === "scheduled") return <span className="text-[13px] text-low">On the Training board: {days.join(", ")} · trainers to add</span>;
  return <span className={`text-[13px] ${b.state === "failed" ? "text-high" : "text-muted"}`}>{b.note}</span>;
}

/** The coordinator rejected the quotation (owner, 12 Nov): why, when; Zoho marked it Declined (or retry); Reopen if they change their mind. */
function RejectedCard({ id, r, onChanged }: { id: string; r: NonNullable<Portal["rejected"]>; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const post = async (action: "reopen" | "decline") => {
    if (action === "reopen" && !window.confirm("Reopen this quotation? The coordinator can accept or reject it again, and Zoho shows it as Sent.")) return;
    setBusy(action); setMsg("");
    const res = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id }) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setBusy("");
    if (!j.ok) return setMsg(j.error ?? "Couldn't do it");
    onChanged();
  };
  return (
    <section className="rounded-2xl border-2 border-high bg-high-bg/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-high">Rejected by the coordinator</p>
        <span className="text-[12.5px] text-muted">{fmtDate(r.at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {r.by}</span>
      </div>
      <p className="mt-1.5 text-[14px] text-ink-2">{r.reason ? <>&ldquo;{r.reason}&rdquo;</> : "No reason given."}</p>
      <p className="mt-1 text-[13px] text-muted">{r.zoho === "declined" ? "Marked Declined in Zoho." : "Zoho couldn't be marked Declined."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {r.zoho === "failed" && <button type="button" className={btn.ghost} disabled={Boolean(busy)} onClick={() => post("decline")}>{busy === "decline" ? "Marking…" : "Mark Declined in Zoho"}</button>}
        <button type="button" className={btn.ghost} disabled={Boolean(busy)} onClick={() => post("reopen")}>{busy === "reopen" ? "Reopening…" : "Reopen the quotation"}</button>
      </div>
      {msg && <p className="mt-2 text-[13px] text-high" role="alert">{msg}</p>}
    </section>
  );
}

/** Step 5, our side: what the coordinator proposed, with the earlier values struck through. */
function ProposalCard({ p, history, expected, confirmed }: { p: Proposal; history: Proposal[]; expected: number; confirmed: Portal["confirmed"] }) {
  const prev = history.at(-1);
  const differs = expected > 0 && p.headcount !== expected;
  // Convert to PI lives in the story's Performa box now (owner, 13 Nov); this card only shows what the coordinator gave.
  return (
    <section className={confirmed ? "rounded-2xl border border-line bg-surface-2/40 p-4" : "rounded-2xl border-2 border-low bg-low-bg/50 p-4 shadow-[0_0_0_4px_color-mix(in_srgb,var(--low)_12%,transparent)]"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-[15px] font-semibold ${confirmed ? "text-ink" : "text-low"}`}>{confirmed ? `Date accepted by ${confirmed.by}, ${fmtDate(confirmed.at, { day: "numeric", month: "short" })}` : "Accepted by the coordinator"}</p>
        <span className="text-[12.5px] text-muted">{fmtDate(p.at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{history.length ? ` · changed ${history.length} time${history.length > 1 ? "s" : ""}` : ""}</span>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <p className={label}>On{p.tentative && <span className="ml-2 rounded bg-medium-bg px-1.5 py-0.5 text-[11px] text-medium">Tentative</span>}</p>
          {p.dates.map((d) => <p key={d.date} className="mt-1 text-[14.5px] font-medium">{fmtProposalDate(d)}</p>)}
          {prev && JSON.stringify(prev.dates) !== JSON.stringify(p.dates) && prev.dates.map((d) => <p key={d.date} className="text-[13px] text-muted line-through">{fmtProposalDate(d)}</p>)}
        </div>
        <div>
          <p className={label}>At</p>
          <p className="mt-1 text-[14.5px] font-medium">{p.location}</p>
          {prev && prev.location !== p.location && <p className="text-[13px] text-muted line-through">{prev.location}</p>}
        </div>
        <div>
          <p className={label}>Attending</p>
          <p className={`mt-1 text-[14.5px] font-medium ${differs ? "text-medium" : ""}`}>{p.headcount} people{differs ? ` (quote: ${expected})` : ""}</p>
          {prev && prev.headcount !== p.headcount && <p className="text-[13px] text-muted line-through">{prev.headcount} people</p>}
        </div>
      </div>
      {!confirmed && <p className="mt-3 text-[12.5px] text-muted">Convert to PI from the Performa box in the story below.</p>}
    </section>
  );
}

/** The coordinator and their login (step 8): add or change the coordinator, Send login / Resend login. */
function TrainingManagerCard({ x, onChanged }: { x: Quote; onChanged: () => void }) {
  const [editing, setEditing] = useState(!x.coordinator);
  const [co, setCo] = useState({ name: x.coordinator?.name ?? "", email: x.coordinator?.email ?? "", phone: x.coordinator?.phone ?? "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const post = async (body: object) => {
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: x.id, ...body }) }).catch(() => null);
    return r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
  };
  const saveCo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("co"); setMsg("");
    const j = await post({ action: "coordinator", ...co });
    setBusy("");
    if (!j.ok) return setMsg(j.error ?? "Couldn't save the coordinator");
    setEditing(false); setMsg("Coordinator saved, also on the customer in Zoho."); onChanged();
  };
  const sendLogin = async () => {
    const again = Boolean(x.portal?.loginSentAt);
    if (!window.confirm(`Send the Training Manager login to ${x.coordinator?.email}? It carries a fresh password (any earlier one stops working), unless they chose their own; then it only gives the link.`)) return;
    setBusy("login"); setMsg("");
    const j = await post({ action: "sendlogin" });
    setBusy("");
    if (!j.ok) return setMsg(j.error ?? "Couldn't send the login");
    setMsg("Login sent from learn@thinkhealth.in."); onChanged();
  };
  const p = x.portal;
  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={label}>Training Manager</p>
        <span className="text-[12.5px] text-muted">{portalStatus(x)}</span>
      </div>
      {editing ? (
        <form onSubmit={saveCo} className="mt-2 space-y-2">
          <input className={inputCls} placeholder="Coordinator's name" value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} />
          <input className={inputCls} placeholder="Email" type="email" value={co.email} onChange={(e) => setCo({ ...co, email: e.target.value })} />
          <input className={inputCls} placeholder="Mobile number" inputMode="tel" value={co.phone} onChange={(e) => setCo({ ...co, phone: e.target.value })} />
          <p className="text-[12.5px] text-muted">Saved on {x.customer} in Zoho as &ldquo;Training Coordinator&rdquo;. They see this training when they sign in.</p>
          <div className="flex gap-2">
            <button className={btn.primary} disabled={busy === "co"}>{busy === "co" ? "Saving…" : "Save coordinator"}</button>
            {x.coordinator && <button type="button" className={btn.ghost} onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      ) : x.coordinator && (
        <div className="mt-1.5 text-[14px]">
          <p className="font-medium text-ink">{x.coordinator.name}</p>
          <p className="flex flex-wrap gap-x-3 text-muted"><a className="text-brand hover:underline" href={`mailto:${x.coordinator.email}`}>{x.coordinator.email}</a><span>{x.coordinator.phone}</span></p>
          <p className="mt-1.5 text-[13px] text-muted">
            {p?.loginSentAt ? `Login sent ${fmtDate(p.loginSentAt, { day: "numeric", month: "short" })}` : "Login not sent yet"}
            {p?.lastLogin ? ` · last signed in ${fmtDate(p.lastLogin, { day: "numeric", month: "short" })}` : p?.loginSentAt ? " · hasn't signed in yet" : ""}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={busy === "login"} onClick={sendLogin}>{busy === "login" ? "Sending…" : p?.loginSentAt ? "Resend login" : "Send login"}</button>
            <button type="button" className={btn.ghost} onClick={() => setEditing(true)}>Change coordinator</button>
          </div>
        </div>
      )}
      {msg && <p className={`mt-2 text-[13px] ${/saved|sent/i.test(msg) && !/couldn/i.test(msg) ? "text-low" : "text-high"}`} role="status">{msg}</p>}
    </section>
  );
}

const SOURCE: Record<Person["source"], string> = { typed: "Typed", excel: "Excel", qr: "QR" };

/** Steps 6–7, our side: the attendee list the coordinator built, downloadable. */
function ParticipantList({ x }: { x: Quote }) {
  const [list, setList] = useState<Person[] | null>(null);
  useEffect(() => {
    fetch(`/api/training-management?people=${x.id}`).then((r) => r.json()).then((j) => setList(j.list ?? [])).catch(() => setList([]));
  }, [x.id]);
  const confirmed = x.portal?.proposal?.headcount ?? x.expected;
  const download = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = "﻿" + [["TH ID", "Name", "Phone", "Email", "Added by", "Added on"], ...(list ?? []).map((p) => [p.th, p.name, p.phone, p.email, SOURCE[p.source], p.addedAt.slice(0, 10)])].map((r) => r.map(esc).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `Participants ${x.number} ${x.customer}.csv`;
    a.click();
  };
  if (!list) return null;
  const dups = list.filter((p) => p.duplicate).length;
  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={label}>Participants · {list.length} registered{confirmed ? ` of ${confirmed}` : ""}{dups ? ` · ${dups} with the same phone` : ""}</p>
        {list.length > 0 && <button type="button" className={btn.quiet} onClick={download}>Download (Excel)</button>}
      </div>
      {list.length === 0 ? <p className="mt-1.5 text-[13.5px] text-muted">None yet. The coordinator adds them on the Training Manager: typed, from Excel, or by their QR code.</p> : (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface [scrollbar-width:thin]">
          <table className="w-full text-[13.5px]">
            <tbody>
              {list.map((p) => (
                <tr key={p.th} className={`border-b border-line last:border-b-0 ${p.duplicate ? "bg-medium-bg/60" : ""}`}>
                  <td className="w-16 px-3 py-1.5 text-muted">{p.th}</td>
                  <td className="px-2 py-1.5 font-medium">{p.name}</td>
                  <td className="px-2 py-1.5 text-ink-2">{p.phone}</td>
                  <td className="hidden px-2 py-1.5 text-muted sm:table-cell">{p.email}</td>
                  <td className="px-3 py-1.5 text-right text-muted">{SOURCE[p.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
