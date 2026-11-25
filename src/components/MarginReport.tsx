"use client";

import { useCallback, useEffect, useState } from "react";
import { type Check, type Deal, type Group, M_PEOPLE, M_PERIODS, type MPeriod, type OpenQuote, type Rise, type Tot, WHY } from "@/lib/margin";
import { type PersonKey, inrShort } from "@/lib/overviewMath";
import { Skeleton } from "./ui";

/*
 * The margin report (owner, 25 Nov: "super secretive", at the very top of the Overview; who: roles.ts canSeeMargin, checked
 * again by the server). Loaded only for them. Closed on every visit, and it closes by itself after five idle minutes.
 */

type Top = {
  on: string; total: Tot; last: { profit: number; pct: number | null; label: string } | null;
  months: { key: string; label: string; profit: number; pct: number | null }[];
  years: ({ key: number; label: string } & Tot)[];
  people: ({ key: PersonKey; label: string } & Tot)[];
  training: number; unread: number; refreshedAt: string | null; error?: string;
};
const IDLE_MS = 5 * 60_000;
const pct = (p: number | null) => (p === null ? "—" : `${p.toFixed(1)}%`);
const day = (s: string) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "");
const first = (n: string) => n.trim().split(/\s+/)[0] || "—";
const rs = (n: number | null) => (n === null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const PARTS = [["invoices", "Invoices"], ["quotes", "Open quotations"], ["products", "Products and customers"], ["prices", "Price rises"], ["checks", "Check these costs"]] as const;
type Part = (typeof PARTS)[number][0];
const WORD: Record<MPeriod, string> = { day: "Today", week: "This week", month: "This month", year: "This year", all: "In all years" };

const Lock = () => <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="9" width="12" height="8" rx="2.2" /><path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9" /></svg>;

export default function MarginReport() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let t = setTimeout(() => setOpen(false), IDLE_MS);
    const again = () => { clearTimeout(t); t = setTimeout(() => setOpen(false), IDLE_MS); };
    const hide = () => { if (document.visibilityState === "hidden") setOpen(false); };
    for (const e of ["pointerdown", "keydown", "scroll"] as const) window.addEventListener(e, again, true);
    document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(t); for (const e of ["pointerdown", "keydown", "scroll"] as const) window.removeEventListener(e, again, true); document.removeEventListener("visibilitychange", hide); };
  }, [open]);
  return (
    <section className="card mb-5 overflow-hidden" aria-label="Margin">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/50 sm:px-6">
        <span className="grid size-9 place-items-center rounded-[12px] bg-brand-soft text-brand"><Lock /></span>
        <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-ink">Margin</span><span className="block text-[13px] text-muted">{open ? "Only for you and a few others. Closes by itself." : "Confidential"}</span></span>
        <span className="rounded-full bg-surface-2 px-3.5 py-1.5 text-[13px] font-semibold text-ink">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <Body />}
    </section>
  );
}

async function ask<T>(query: string): Promise<T & { error?: string }> {
  return fetch(`/api/overview/margin?${query}`, { cache: "no-store" }).then(async (r) => (r.status === 404 ? { error: "Not on your account" } : r.json())).catch(() => ({ error: "Couldn't reach the server" }));
}

function Body() {
  const [who, setWho] = useState<PersonKey>("all");
  const [kind, setKind] = useState<MPeriod>("month");
  const [top, setTop] = useState<Top | null>(null);
  const [error, setError] = useState("");
  const [part, setPart] = useState<Part>("invoices");
  const load = useCallback(async () => {
    const j = await ask<Top>(`who=${who}&period=${kind}`);
    if (j.error) setError(j.error); else { setError(""); setTop(j); }
  }, [who, kind]);
  useEffect(() => { let stop = false; void (async () => { const j = await ask<Top>(`who=${who}&period=${kind}`); if (stop) return; if (j.error) setError(j.error); else { setError(""); setTop(j); } })(); return () => { stop = true; }; }, [who, kind]);
  const tab = (on: boolean) => `h-9 shrink-0 rounded-full px-4 text-[13px] font-medium ${on ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink"}`;
  return (
    <div className="space-y-5 border-t border-line/70 px-5 pb-6 pt-5 sm:px-6">
      <div className="flex flex-wrap gap-3">
        <div role="group" aria-label="Whose margin" className="no-scrollbar flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1">{M_PEOPLE.map((p) => <button key={p.key} type="button" aria-pressed={who === p.key} onClick={() => setWho(p.key)} className={tab(who === p.key)}>{p.label}</button>)}</div>
        <div role="group" aria-label="Period" className="no-scrollbar flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1">{M_PERIODS.map((p) => <button key={p.key} type="button" aria-pressed={kind === p.key} onClick={() => setKind(p.key)} className={tab(kind === p.key)}>{p.label}</button>)}</div>
      </div>
      {error && <p className="flex flex-wrap items-center gap-3 rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}<button type="button" className="font-semibold underline" onClick={() => void load()}>Try again</button></p>}
      {!top ? !error && <Skeleton className="h-[320px]" /> : <Summary t={top} who={who} kind={kind} pick={setWho} />}
      {top && (
        <div>
          <div role="group" aria-label="Details" className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {PARTS.map(([k, label]) => <button key={k} type="button" aria-pressed={part === k} onClick={() => setPart(k)} className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-medium ${part === k ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>{label}{k === "checks" && top.total.skippedLines > 0 ? ` ${top.total.skippedLines}` : ""}</button>)}
          </div>
          <Details key={`${part}|${who}|${kind}`} part={part} who={who} kind={kind} />
        </div>
      )}
    </div>
  );
}

/** The one plain sentence. */
function sentence(t: Top, name: string, kind: MPeriod): string {
  const x = t.total, who = name === "Company" ? "we" : name;
  if (!x.invoices) return x.skipped > 0 ? `${WORD[kind]} ${who} sold ${inrShort(x.skipped)} of goods, but no line has a cost to trust yet.` : `${WORD[kind]} there is no goods invoice${name === "Company" ? "" : ` by ${name}`} yet.`;
  const s = `${WORD[kind]} ${who} made ${inrShort(x.profit)} on ${inrShort(x.sale)} of goods: ₹${((x.pct ?? 0)).toFixed(0)} of every ₹100`;
  if (!t.last || t.last.pct === null || x.pct === null) return `${s}.`;
  const d = x.pct - t.last.pct;
  return `${s}, ${Math.abs(d) < 0.5 ? "the same as" : `₹${Math.abs(d).toFixed(0)} ${d > 0 ? "more" : "less"} than`} ${t.last.label.replace(/^the same days/, "the same days")}.`;
}

function Summary({ t, who, kind, pick }: { t: Top; who: PersonKey; kind: MPeriod; pick: (p: PersonKey) => void }) {
  const x = t.total, name = M_PEOPLE.find((p) => p.key === who)!.label;
  const up = t.last ? x.profit >= t.last.profit : true;
  const best = Math.max(1, ...t.people.map((p) => Math.abs(p.profit)));
  const bars = kind === "all" ? t.years.map((y) => ({ key: String(y.key), label: y.label.replace("FY ", ""), profit: y.profit, pct: y.pct })) : t.months;
  const tall = Math.max(1, ...bars.map((b) => Math.abs(b.profit)));
  return (
    <div className="space-y-5">
      <p className="max-w-[70ch] text-[17px] font-medium leading-snug text-ink">{sentence(t, name, kind)}</p>
      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.6fr)_minmax(260px,1fr)]">
        <div className="rounded-[20px] bg-surface-2/60 px-5 py-4">
          <p className="text-[13.5px] font-medium text-muted">{name} · {WORD[kind].toLowerCase()}</p>
          <p className={`num mt-1 text-[38px] font-semibold leading-none tracking-[-0.03em] ${x.profit < 0 ? "text-high" : "text-ink"}`}>{inrShort(x.profit)}</p>
          <p className="num mt-2 text-[20px] font-semibold text-brand">{pct(x.pct)}</p>
          {t.last && <p className={`num mt-3 text-[13px] ${up ? "text-low" : "text-high"}`}>{up ? "▲" : "▼"} {inrShort(t.last.profit)} · {pct(t.last.pct)} {t.last.label}</p>}
          <dl className="num mt-4 space-y-1 text-[13px] text-ink-2">
            <div className="flex justify-between gap-3"><dt className="text-muted">Sold (before GST)</dt><dd>{inrShort(x.sale)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Cost us</dt><dd>{inrShort(x.cost)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Left out, cost doubtful</dt><dd>{inrShort(x.skipped)}</dd></div>
            {t.training > 0 && <div className="flex justify-between gap-3"><dt className="text-muted">Trainings (no cost, apart)</dt><dd>{inrShort(t.training)}</dd></div>}
            {x.estimated > 0 && <div className="flex justify-between gap-3"><dt className="text-muted">Too new, cost estimated</dt><dd>{inrShort(x.estimated)}</dd></div>}
          </dl>
        </div>
        <figure className="min-w-0 rounded-[20px] bg-surface-2/60 px-4 py-4">
          <figcaption className="px-1 text-[13.5px] font-medium text-muted">{kind === "all" ? "Margin each year" : "Margin each month, the last 12"}</figcaption>
          <div className="mt-3 flex h-[210px] items-end gap-1.5 sm:gap-2">
            {bars.map((b) => (
              <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${b.label}: ${inrShort(b.profit)} · ${pct(b.pct)}`}>
                <span className="num text-[11px] font-semibold text-ink-2">{b.pct === null ? "" : `${b.pct.toFixed(0)}%`}</span>
                <span className={`w-full max-w-[44px] rounded-[8px] ${b.profit < 0 ? "bg-high" : "bg-brand"}`} style={{ height: `${Math.max(b.profit ? 2 : 0, (Math.abs(b.profit) / tall) * 74)}%` }} />
                <span className="num max-w-full truncate text-[11px] text-muted">{b.label}</span>
              </div>
            ))}
          </div>
        </figure>
        <div className="rounded-[20px] bg-surface-2/60 px-5 py-4">
          <p className="text-[13.5px] font-medium text-muted">Who made it · {WORD[kind].toLowerCase()}</p>
          <ul className="mt-3 space-y-3.5">
            {t.people.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => pick(p.key)} className="block w-full text-left">
                  <span className="flex items-baseline justify-between gap-3"><span className={`text-[14.5px] font-semibold ${who === p.key ? "text-brand" : "text-ink"}`}>{p.label}</span><span className="num text-[13.5px] text-ink-2">{inrShort(p.profit)} · {pct(p.pct)}</span></span>
                  <span className="mt-1.5 block h-2.5 rounded-full bg-line"><span className={`block h-full rounded-full ${p.profit < 0 ? "bg-high" : "bg-brand"}`} style={{ width: `${p.profit ? Math.max(2, (Math.abs(p.profit) / best) * 100) : 0}%` }} /></span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] text-muted">Others’ sales count only in the company.{t.unread ? ` ${t.unread} new ${t.unread === 1 ? "invoice" : "invoices"} not read yet.` : ""}</p>
        </div>
      </div>
    </div>
  );
}

type Payload = { deals?: Deal[]; quotes?: OpenQuote[]; items?: Group[]; brands?: Group[]; customers?: Group[]; rises?: Rise[]; checks?: Check[]; freight?: { charged: number; cost: number }; error?: string };

function Details({ part, who, kind }: { part: Part; who: PersonKey; kind: MPeriod }) {
  const [d, setD] = useState<Payload | null>(null);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"" | "loss" | "thin" | "none">("");
  const [all, setAll] = useState(false);
  useEffect(() => { let stop = false; void ask<Payload>(`who=${who}&period=${kind}&part=${part}`).then((j) => { if (!stop) setD(j); }); return () => { stop = true; }; }, [part, who, kind]);
  if (!d) return <Skeleton className="mt-3 h-[200px]" />;
  if (d.error) return <p className="mt-3 rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{d.error}</p>;
  const has = (...s: string[]) => { const k = q.trim().toLowerCase(); return !k || s.some((x) => x.toLowerCase().includes(k)); };
  const search = <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" className="h-9 w-52 rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted" />;
  const more = (n: number) => !all && n > 40 && <button type="button" onClick={() => setAll(true)} className="mt-3 rounded-full bg-surface-2 px-4 py-2 text-[13px] font-medium text-ink hover:bg-line">Show all {n}</button>;
  const cut = <T,>(l: T[]) => (all ? l : l.slice(0, 40));
  const empty = (s: string) => <p className="mt-4 text-[13.5px] text-muted">{s}</p>;

  if (part === "invoices") {
    const deals = d.deals ?? [];
    const list = deals.filter((x) => (!only || x.tone === only) && has(x.invoice, x.customer, x.person));
    const n = (t: string) => deals.filter((x) => x.tone === t).length;
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">{search}{([["", "All", deals.length], ["loss", "At a loss", n("loss")], ["thin", "Under 10%", n("thin")], ["none", "Cost to check", n("none")]] as const).map(([k, label, c]) => <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={`num h-9 rounded-full px-3.5 text-[13px] font-medium ${only === k ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"}`}>{label} {c}</button>)}</div>
        {!list.length ? empty("No invoices here.") : <ul className="mt-2 divide-y divide-line/70">{cut(list).map((x) => <Line key={x.invoice} title={`${x.invoice} · ${x.customer}`} sub={`${day(x.date)} · ${first(x.person)} · sold ${inrShort(x.sale || x.skipped)}${x.sale ? `, cost ${inrShort(x.cost)}` : ""}${x.skipped && x.sale ? ` · ${inrShort(x.skipped)} left out` : ""}${x.estimated ? " · cost estimated" : ""}`} value={x.tone === "none" ? null : x.profit} p={x.pct} tone={x.tone} note={x.tone === "none" ? "Cost to check" : undefined} />)}</ul>}
        {more(list.length)}
      </div>
    );
  }
  if (part === "quotes") {
    const list = (d.quotes ?? []).filter((x) => has(x.quote, x.customer, x.person));
    const thin = list.filter((x) => x.thin).length;
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-3">{search}<p className="num text-[13px] text-muted">{list.length} waiting for an answer, {thin ? <span className="font-semibold text-high">{thin} under 10%</span> : "none under 10%"} · at what the goods cost us lately</p></div>
        {!list.length ? empty("No open quotations.") : <ul className="mt-2 divide-y divide-line/70">{cut(list).map((x) => <Line key={x.quote} title={`${x.quote} · ${x.customer}`} sub={`${day(x.date)} · ${first(x.person)} · ${inrShort(x.total)}${x.sale < x.total * 0.99 ? `, cost known for ${inrShort(x.sale)}` : ""}`} value={x.pct === null ? null : x.profit} p={x.pct} tone={x.pct === null ? "none" : x.profit < 0 ? "loss" : x.thin ? "thin" : "ok"} note={x.pct === null ? "No cost known" : undefined} />)}</ul>}
        {more(list.length)}
      </div>
    );
  }
  if (part === "products") return (
    <div className="mt-3 grid gap-6 lg:grid-cols-2">
      <Bars title="What earns the most" list={(d.items ?? []).slice(0, 12)} />
      <Bars title="Who earns us the most" list={(d.customers ?? []).slice(0, 12)} />
      <Bars title="Sells a lot, earns little" list={(d.items ?? []).filter((g) => g.thin).sort((a, b) => b.sale - a.sale).slice(0, 8)} thin />
      <Bars title="Big customers on a thin margin" list={(d.customers ?? []).filter((g) => g.thin).sort((a, b) => b.sale - a.sale).slice(0, 8)} thin />
      <Bars title="Brands" list={(d.brands ?? []).slice(0, 10)} />
    </div>
  );
  if (part === "prices") {
    const list = d.rises ?? [];
    return (
      <div className="mt-3">
        <p className="text-[13px] text-muted">Bought 5% or more dearer than the time before, in the last 180 days. Company-wide, the same for every period.</p>
        {!list.length ? empty("No price rises.") : <ul className="mt-2 divide-y divide-line/70">{cut(list).map((x) => (
          <li key={x.item} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
            <span className="min-w-0 flex-1 basis-[240px]"><span className="block truncate text-[14px] font-medium text-ink">{x.item}</span><span className="num block text-[12.5px] text-muted">{day(x.date)} · cost {rs(x.was)} → {rs(x.now)} · sold at {rs(x.sellWas)} → {rs(x.sellNow)}</span></span>
            <span className="num text-[14px] font-semibold text-high">+{x.pct.toFixed(0)}%</span>
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${x.passedOn ? "bg-low-bg text-low" : x.sellNow === null ? "bg-surface-2 text-ink-2" : "bg-high-bg text-high"}`}>{x.passedOn ? "Our price rose too" : x.sellNow === null ? "Not sold since" : "Our price didn’t"}</span>
          </li>))}</ul>}
        {more(list.length)}
      </div>
    );
  }
  const list = (d.checks ?? []).filter((x) => has(x.invoice, x.customer, x.item, WHY[x.why]));
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">{search}<p className="text-[13px] text-muted">Left out of the margin until the cost is put right in Zoho.{d.freight && (d.freight.charged || d.freight.cost) ? <span className="num"> Packing and freight, kept apart: charged {inrShort(d.freight.charged)}, cost {inrShort(d.freight.cost)}.</span> : null}</p></div>
      {!list.length ? empty("Nothing to check.") : <ul className="mt-2 divide-y divide-line/70">{cut(list).map((x, i) => (
        <li key={`${x.invoice}|${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
          <span className="min-w-0 flex-1 basis-[240px]"><span className="block truncate text-[14px] font-medium text-ink">{x.item}</span><span className="num block truncate text-[12.5px] text-muted">{x.invoice} · {x.customer} · {day(x.date)} · {first(x.person)}</span></span>
          <span className="num text-[13px] text-ink-2">sold {rs(x.sale)} · cost {rs(x.cost)}</span>
          <span className="rounded-full bg-medium-bg px-2.5 py-1 text-[12px] font-semibold text-ink-2">{WHY[x.why]}</span>
        </li>))}</ul>}
      {more(list.length)}
    </div>
  );
}

function Line({ title, sub, value, p, tone, note }: { title: string; sub: string; value: number | null; p: number | null; tone: Deal["tone"]; note?: string }) {
  const c = { loss: "bg-high-bg text-high", thin: "bg-medium-bg text-ink", ok: "bg-low-bg text-low", none: "bg-surface-2 text-ink-2" }[tone];
  return (
    <li className="flex items-center gap-2.5 py-3 sm:gap-4">
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-ink sm:truncate">{title}</span><span className="num block text-[12.5px] text-muted sm:truncate">{sub}</span></span>
      {value !== null && <span className={`num shrink-0 text-[14px] font-semibold ${value < 0 ? "text-high" : "text-ink"}`}>{inrShort(value)}</span>}
      <span className={`num min-w-[64px] shrink-0 rounded-full px-2.5 py-1 sm:min-w-[92px] text-center text-[12.5px] font-semibold ${c}`}>{note ?? pct(p)}</span>
    </li>
  );
}

function Bars({ title, list, thin }: { title: string; list: Group[]; thin?: boolean }) {
  const max = Math.max(1, ...list.map((g) => Math.abs(thin ? g.sale : g.profit)));
  return (
    <div className="min-w-0">
      <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
      {!list.length ? <p className="mt-2 text-[13px] text-muted">None in this period.</p> : <ul className="mt-2.5 space-y-2.5">{list.map((g) => (
        <li key={g.name}>
          <span className="flex items-baseline justify-between gap-3 text-[13.5px]"><span className="min-w-0 truncate text-ink">{g.name}</span><span className="num shrink-0 text-ink-2">{thin ? `sold ${inrShort(g.sale)}` : inrShort(g.profit)} · <span className={g.pct !== null && g.pct < 15 ? "font-semibold text-high" : ""}>{pct(g.pct)}</span></span></span>
          <span className="mt-1 block h-2 rounded-full bg-line"><span className={`block h-full rounded-full ${thin ? "bg-medium" : g.profit < 0 ? "bg-high" : "bg-brand"}`} style={{ width: `${Math.max(2, (Math.abs(thin ? g.sale : g.profit) / max) * 100)}%` }} /></span>
        </li>))}</ul>}
    </div>
  );
}
