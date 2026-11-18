"use client";

import { useEffect, useState } from "react";
import type { SprintCard, SprintsBoard as Board } from "@/lib/sprintsRules";
import { Skeleton } from "./ui";

/*
 * Zoho Sprints on the dashboard (owner, 18 Nov: "the whole Zoho Sprints embedded into the dashboard"). Zoho Sprints
 * can't be framed, so this draws project P5's board from its API: the active sprint (tabs when several run), one
 * column per status in Zoho's colours, each card with its number, name, owners and due date. Refreshes every 30 s.
 */

type Data = { connected: boolean; canConnect: boolean; scopes: string; board?: Board; error?: string };

const day = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function SprintsBoard() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState("");
  const [tab, setTab] = useState(0);
  const load = () => fetch("/api/sprints", { cache: "no-store" }).then(async (r) => {
    const j = (await r.json().catch(() => null)) as Data | null;
    if (j) { setData(j); setFailed(""); } else setFailed("Couldn't reach the server");
  }).catch(() => setFailed("Couldn't reach the server"));
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return failed ? <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{failed}</p> : <Skeleton className="h-[520px]" />;
  if (!data.connected) return <Connect canConnect={data.canConnect} scopes={data.scopes} onDone={load} />;
  const b = data.board;
  const sprint = b?.sprints[Math.min(tab, (b?.sprints.length ?? 1) - 1)];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {b && b.sprints.length > 1 && (
          <div className="flex rounded-xl bg-surface-2 p-1">
            {b.sprints.map((s, k) => (
              <button key={s.id} type="button" onClick={() => setTab(k)} className={`h-8 rounded-lg px-3 text-[13px] font-medium ${k === tab ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{s.name}</button>
            ))}
          </div>
        )}
        {sprint && (
          <p className="text-[13.5px] text-ink-2">
            <span className="font-semibold text-ink">{sprint.backlog ? "Backlog" : sprint.name}</span>
            {sprint.backlog ? " · no sprint is running" : sprint.start && sprint.end ? ` · ${day(sprint.start)} – ${day(sprint.end)}` : ""}
            {" · "}{sprint.columns.reduce((n, c) => n + c.cards.length, 0)} items
          </p>
        )}
        <span className="flex-1" />
        {b && <span className="num text-[12.5px] text-faint">Updated {new Date(b.fetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
        <a href={b?.boardUrl ?? "https://sprints.zoho.in/workspace/thinkhealth#P5/board"} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">
          Open in Zoho Sprints
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h7v7M13 3 4 12" /></svg>
        </a>
      </div>
      {data.error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{data.error}</p>}
      {sprint ? (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {sprint.columns.map((c) => (
            <section key={c.id} className="flex w-[280px] shrink-0 flex-col rounded-2xl bg-surface-2/70 lg:w-auto lg:min-w-[240px] lg:flex-1">
              <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2">{c.name}</h2>
                <span className="num rounded-full bg-surface px-2 py-0.5 text-[12px] font-semibold text-muted">{c.cards.length}</span>
              </header>
              <ul className="no-scrollbar flex max-h-[calc(100vh-260px)] flex-col gap-2 overflow-y-auto px-2.5 pb-3">
                {c.cards.length === 0 && <li className="px-1 py-3 text-[12.5px] text-faint">Nothing here</li>}
                {c.cards.map((card) => <Card key={card.id} card={card} accent={c.color} href={b!.boardUrl} />)}
              </ul>
            </section>
          ))}
        </div>
      ) : !data.error && <p className="card p-6 text-[14px] text-muted">No sprint is running and the backlog is empty.</p>}
    </div>
  );
}

function Card({ card, accent, href }: { card: SprintCard; accent: string; href: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="block rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm transition hover:border-line-strong" style={{ borderLeft: `3px solid ${accent}` }} title="Open in Zoho Sprints">
        <p className="num text-[11.5px] font-semibold text-faint">{card.no}</p>
        <p className="mt-0.5 text-[13.5px] font-medium leading-snug text-ink">{card.name}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {card.owners.length ? (
              <>
                <span className="flex -space-x-1.5">
                  {card.owners.slice(0, 3).map((o) => <span key={o} className="grid size-6 place-items-center rounded-full bg-brand-soft text-[10.5px] font-bold text-brand ring-2 ring-surface" title={o}>{initials(o)}</span>)}
                </span>
                <span className="truncate text-[12px] text-muted">{card.owners.join(", ")}</span>
              </>
            ) : <span className="text-[12px] text-faint">Unassigned</span>}
          </span>
          {card.due && <span className={`num shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold ${card.overdue ? "bg-high-bg text-high" : "bg-surface-2 text-muted"}`} title={card.overdue ? "Overdue" : "Due"}>{day(card.due)}</span>}
        </div>
      </a>
    </li>
  );
}

/** Zoho Sprints' one-time connection: Admin (or Shikha) pastes a code from the Zoho API console. */
function Connect({ canConnect, scopes, onDone }: { canConnect: boolean; scopes: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connect = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/sprints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "connect", code }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone();
  };
  if (!canConnect) return <p className="card p-6 text-[14px] text-muted">Zoho Sprints isn&apos;t connected yet. Admin or Shikha connects it once here.</p>;
  return (
    <section className="card max-w-3xl px-5 py-5">
      <h2 className="text-[16px] font-semibold text-ink">Connect Zoho Sprints (once)</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-ink-2">
        <li>Open the Zoho API console (api-console.zoho.in) as a Zoho user who is in the thinkhealth Sprints workspace.</li>
        <li>Open the same Self Client as Zoho Books → Generate Code, with this scope:<br /><span className="num select-all break-all font-semibold text-ink">{scopes}</span></li>
        <li>Pick 10 minutes, create it, and paste the code here.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input className="h-10 w-80 max-w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink" placeholder="1000.xxxx…" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) connect(); }} aria-label="Zoho code" />
        <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-brand-ink disabled:opacity-50" disabled={busy || !code.trim()} onClick={connect}>
          {busy && <svg viewBox="0 0 24 24" width="14" height="14" className="animate-spin" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>}
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
    </section>
  );
}
