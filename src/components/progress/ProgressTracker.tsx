"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIES, type PtRequest, type Who, ago, availability, bySeverity, canDo, cellKey, counts, focusOf, fmtSpan,
  isAdminId, isBlocker, isEscalated, isSevere, matrix, nextPingAt, teamDay, teamStamp, teamTime, waitingMs,
} from "@/lib/progress/model";
import { btn } from "../ui";
import { CategoryChip, PersonAvatar, UrgentPill, edgeOf, firstName } from "./bits";
import { RequestDetail } from "./RequestDetail";
import { type RequestDraft, RequestForm } from "./RequestForm";
import { TodoBoard } from "./TodoBoard";
import { type Snapshot, call, useProgress } from "./useProgress";

/*
 * Progress tracker (Reports → Progress tracker; PROGRESS-TRACKER-PLAN.md). Answers three questions at a glance:
 * who is waiting on whom (Dependency & Hand-off Board — "Waiting on you", the Blocked Work matrix), what got done
 * (check-ins, requests resolved), and what everyone is on / when they were last active (status cards).
 * Desktop fits the screen with no page scroll (each panel scrolls on its own); phones stack [A4, A7].
 */

type Filter = { kind: "blockers" } | { kind: "handoffs" } | { kind: "pair"; from: string; to: string } | { kind: "to"; id: string } | { kind: "from"; id: string } | null;
type Open = { kind: "request"; id: string } | { kind: "new"; draft?: RequestDraft } | null;
type View = "todo" | "done" | "updates";

/** Desktop: the panels fill the screen to a 16 px margin, taking back the page's bottom padding (like the Calendar). */
function useFitHeight(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  const [pull, setPull] = useState(0);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      if (window.innerWidth < 1024) return setH(null);
      const main = el.closest("main");
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      setPull(Math.max(0, pad - 16));
      const next = Math.max(360, Math.floor(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 16));
      setH((x) => (x === next ? x : next));
    };
    fit();
    const late = setTimeout(fit, 600); // after the page's entry animation
    window.addEventListener("resize", fit);
    // The counts row above can wrap to two lines (narrower screens) after the first measure.
    const above = ref.current?.previousElementSibling;
    const ro = above ? new ResizeObserver(fit) : null;
    if (above) ro!.observe(above);
    return () => { clearTimeout(late); window.removeEventListener("resize", fit); ro?.disconnect(); };
  }, [ready]); // the panels only exist once the data is in
  return { ref, h, pull };
}

export function ProgressTracker({ initialTask, initialRequest }: { initialTask?: RequestDraft; initialRequest?: string }) {
  const { snap, error } = useProgress();
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const [filter, setFilter] = useState<Filter>(null);
  const [onlyActive, setOnlyActive] = useState(false);
  const [open, setOpen] = useState<Open>(initialTask ? { kind: "new", draft: initialTask } : null);
  // Everyone's to-do (owner, 26 Oct) or the requests + check-ins view; remembered per browser.
  const [view, setView] = useState<View>(() => { try { const v = localStorage.getItem("th.progress.view"); return v === "updates" || v === "done" ? v : "todo"; } catch { return "todo"; } });
  useEffect(() => { try { localStorage.setItem("th.progress.view", view); } catch {} }, [view]);
  const showUpdates = (f: Filter) => { setFilter(f); setView("updates"); };
  const wantRequest = useRef(initialRequest);
  const fit = useFitHeight(Boolean(snap));

  // ?task= / ?request= came with the link: handled once; the address goes back to the plain page.
  useEffect(() => { if (initialTask || initialRequest) router.replace("/reports/progress-tracker"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!snap || !wantRequest.current) return;
    if (snap.requests.some((r) => r.id === wantRequest.current)) setOpen({ kind: "request", id: wantRequest.current });
    wantRequest.current = undefined;
  }, [snap]);
  // A pop-up notice clicked while the page is already open.
  useEffect(() => {
    const onOpen = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (id) setOpen({ kind: "request", id }); };
    window.addEventListener("th:progress-open", onOpen);
    return () => window.removeEventListener("th:progress-open", onOpen);
  }, []);

  if (error && !snap) return <p className="text-[14px] text-high">{error}</p>;
  if (!snap) return <div className="h-60 animate-pulse rounded-2xl bg-surface-2" />;

  const openRequest = open?.kind === "request" ? snap.requests.find((r) => r.id === open.id) : undefined;
  return (
    <div>
      <HeaderCounts snap={snap} now={now} filter={filter} setFilter={showUpdates} onlyActive={onlyActive} setOnlyActive={(v) => { setOnlyActive(v); setView("updates"); }}
        switcher={
          <div className="inline-flex rounded-full bg-surface-2 p-0.5" role="tablist" aria-label="View">
            {([["todo", "Everyone's to-do"], ["done", "Work done"], ["updates", "Requests"]] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition ${view === k ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink"}`}>{label}</button>
            ))}
          </div>
        } />
      {view !== "updates" ? (
        <div ref={fit.ref} className="mt-3" style={fit.h ? { height: fit.h, marginBottom: -fit.pull } : undefined}>
          <TodoBoard snap={snap} now={now} mode={view} onOpenRequest={(id) => setOpen({ kind: "request", id })} />
        </div>
      ) : (
      <div ref={fit.ref} className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,390px)]" style={fit.h ? { height: fit.h, marginBottom: -fit.pull } : undefined}>
        <div className="flex min-h-0 flex-col gap-3">
          <DependencyBoard snap={snap} now={now} filter={filter} setFilter={setFilter} onOpen={(id) => setOpen({ kind: "request", id })} />
          <ActivityFeed snap={snap} now={now} onOpenRequest={(id) => setOpen({ kind: "request", id })} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <QuickActions onAsk={() => setOpen({ kind: "new" })} />
          <StatusCards snap={snap} now={now} onlyActive={onlyActive} setFilter={setFilter} />
        </div>
      </div>
      )}

      {open?.kind === "new" && <RequestForm me={snap.me} team={snap.team} draft={open.draft} onClose={() => setOpen(null)} />}
      {openRequest && <RequestDetail r={openRequest} me={snap.me} now={now} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------------- Header counts [S4] ---------------- */

function HeaderCounts({ snap, now, filter, setFilter, onlyActive, setOnlyActive, switcher }: { snap: Snapshot; now: Date; filter: Filter; setFilter: (f: Filter) => void; onlyActive: boolean; setOnlyActive: (v: boolean) => void; switcher: React.ReactNode }) {
  const c = counts(snap.team, snap.presence, snap.requests, now);
  // Phones: three narrow tiles — number over the label, no second line.
  const tile = (on: boolean, tone: string) => `press flex min-w-0 flex-1 basis-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition max-sm:flex-col max-sm:items-start max-sm:gap-1 max-sm:px-3 sm:flex-none sm:basis-auto sm:min-w-[210px] [&_.sub]:max-sm:hidden ${on ? "bg-ink text-surface" : `bg-surface shadow-card hover:brightness-[0.98] ${tone}`}`;
  return (
    <div className="flex flex-wrap items-center gap-2.5 max-sm:items-stretch">
      <button type="button" className={tile(onlyActive, "")} aria-pressed={onlyActive} onClick={() => setOnlyActive(!onlyActive)} title="Show only the people active now">
        <span className="size-2.5 shrink-0 rounded-full bg-low" aria-hidden />
        <span className="text-[26px] font-semibold tabular-nums leading-none">{c.active}</span>
        <span className="text-[13.5px] font-medium leading-tight">active {c.active === 1 ? "member" : "members"}<span className={`sub block text-[12px] font-normal${onlyActive ? "text-surface/70" : "text-muted"}`}>of {snap.team.filter((m) => !isAdminId(m.id)).length} · seen in the last 10 min</span></span>
      </button>
      <button type="button" className={tile(filter?.kind === "blockers", c.blockers ? "text-high" : "")} aria-pressed={filter?.kind === "blockers"} onClick={() => setFilter(filter?.kind === "blockers" ? null : { kind: "blockers" })} title="Critical Blockers and anything open for over a day">
        <span className={`size-2.5 shrink-0 rounded-full ${c.blockers ? "bg-high" : "bg-line-strong"}`} aria-hidden />
        <span className="text-[26px] font-semibold tabular-nums leading-none">{c.blockers}</span>
        <span className="text-[13.5px] font-medium leading-tight">open {c.blockers === 1 ? "blocker" : "blockers"}<span className={`sub block text-[12px] font-normal${filter?.kind === "blockers" ? "text-surface/70" : "text-muted"}`}>critical, or open over 24 h</span></span>
      </button>
      <button type="button" className={tile(filter?.kind === "handoffs", "")} aria-pressed={filter?.kind === "handoffs"} onClick={() => setFilter(filter?.kind === "handoffs" ? null : { kind: "handoffs" })} title="Work handed on, not picked up yet">
        <span className="size-2.5 shrink-0 rounded-full bg-completed" aria-hidden />
        <span className="text-[26px] font-semibold tabular-nums leading-none">{c.handoffs}</span>
        <span className="text-[13.5px] font-medium leading-tight">pending {c.handoffs === 1 ? "hand-off" : "hand-offs"}<span className={`sub block text-[12px] font-normal${filter?.kind === "handoffs" ? "text-surface/70" : "text-muted"}`}>not picked up yet</span></span>
      </button>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-3 max-sm:w-full">
        {switcher}
        <span className="text-[12.5px] text-muted" title="Updates every 15 seconds">As of {teamTime(snap.now)}</span>
      </span>
    </div>
  );
}

/* ---------------- Dependency & Hand-off Board [S3, S5, S6] ---------------- */

function filterLabel(f: NonNullable<Filter>, snap: Snapshot): string {
  const name = (id: string) => { const m = snap.team.find((x) => x.id === id); return m ? firstName(m.name) : "?"; };
  switch (f.kind) {
    case "blockers": return "Open blockers";
    case "handoffs": return "Pending hand-offs";
    case "pair": return `${name(f.from)} waiting on ${name(f.to)}`;
    case "to": return `Waiting on ${name(f.id)}`;
    case "from": return `${name(f.id)} is waiting on`;
  }
}
function matches(f: NonNullable<Filter>, r: PtRequest, now: Date): boolean {
  if (r.status !== "open") return false;
  switch (f.kind) {
    case "blockers": return isBlocker(r, now);
    case "handoffs": return r.category === "handoff";
    case "pair": return r.requesterId === f.from && r.waitingOnId === f.to;
    case "to": return r.waitingOnId === f.id;
    case "from": return r.requesterId === f.id;
  }
}

function DependencyBoard({ snap, now, filter, setFilter, onOpen }: { snap: Snapshot; now: Date; filter: Filter; setFilter: (f: Filter) => void; onOpen: (id: string) => void }) {
  const open = snap.requests.filter((r) => r.status === "open").sort(bySeverity(now));
  const incoming = open.filter((r) => r.waitingOnId === snap.me.id);
  const outgoing = open.filter((r) => r.requesterId === snap.me.id);
  const filtered = filter ? open.filter((r) => matches(filter, r, now)) : [];
  return (
    <section className="card flex min-h-0 shrink-0 flex-col p-0 lg:max-h-[58%]" aria-label="Dependency and hand-off board">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">Dependency &amp; hand-off board</h2>
        <span className="text-[13px] text-muted">{open.length ? `${open.length} open` : "nothing open"}</span>
        {filter && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-ink py-0.5 pl-3 pr-1 text-[12.5px] font-medium text-surface">
            {filterLabel(filter, snap)}
            <button type="button" aria-label="Clear the filter" className="grid size-5 place-items-center rounded-full hover:bg-surface/20" onClick={() => setFilter(null)}>
              <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          </span>
        )}
      </div>
      <div className="no-scrollbar grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:overflow-hidden">
        <div className="no-scrollbar min-h-0 min-w-0 space-y-3 px-4 py-3 xl:overflow-y-auto">
          {filter ? (
            <RequestList title={`${filterLabel(filter, snap)} (${filtered.length})`} list={filtered} snap={snap} now={now} onOpen={onOpen} empty="Nothing open here." />
          ) : (
            <>
              <RequestList title={`Waiting on you (${incoming.length})`} list={incoming} snap={snap} now={now} onOpen={onOpen} empty="Nobody is waiting on you right now." strong />
              <RequestList title={`You're waiting on (${outgoing.length})`} list={outgoing} snap={snap} now={now} onOpen={onOpen} empty="You're not waiting on anyone." />
            </>
          )}
        </div>
        <div className="no-scrollbar min-h-0 min-w-0 border-t border-line px-4 py-3 xl:overflow-y-auto xl:border-l xl:border-t-0">
          <BlockedMatrix snap={snap} now={now} filter={filter} setFilter={setFilter} />
        </div>
      </div>
    </section>
  );
}

function RequestList({ title, list, snap, now, onOpen, empty, strong }: { title: string; list: PtRequest[]; snap: Snapshot; now: Date; onOpen: (id: string) => void; empty: string; strong?: boolean }) {
  return (
    <div>
      <h3 className={`mb-1.5 text-[13px] font-semibold uppercase tracking-wide ${strong && list.length ? "text-ink" : "text-muted"}`}>{title}</h3>
      {!list.length ? <p className="text-[13.5px] text-muted">{empty}</p> : (
        <ul className="space-y-1.5">{list.map((r) => <RequestRow key={r.id} r={r} me={snap.me} now={now} onOpen={() => onOpen(r.id)} />)}</ul>
      )}
    </div>
  );
}

/** One request [S12]: category, ref, task, who waits on whom, waiting time (escalated past 24 h [S18]), Ping / Resolve [S16, S17]. */
function RequestRow({ r, me, now, onOpen }: { r: PtRequest; me: Who; now: Date; onOpen: () => void }) {
  const [pinging, setPinging] = useState(false);
  const incoming = r.waitingOnId === me.id;
  const mine = r.requesterId === me.id;
  const esc = isEscalated(r, now);
  const canPing = canDo(me, r, "ping", now);
  const ping = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setPinging(true);
    await call("/api/progress/requests", "PATCH", { id: r.id, action: "ping" });
    setPinging(false);
  };
  const who = incoming ? `from ${firstName(r.requesterName)}` : mine ? `to ${firstName(r.waitingOnName)}` : `${firstName(r.requesterName)} → ${firstName(r.waitingOnName)}`;
  return (
    <li>
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
        className={`press flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 hover:brightness-[0.98] ${edgeOf(r, now)}`}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <CategoryChip c={r.category} short />
            {r.priority === "urgent" && <UrgentPill />}
            <span className="min-w-0 truncate text-[14.5px] font-semibold text-ink" title={r.task.title}>{r.task.title}</span>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            {r.ref} · {who} · {r.seenAt ? `seen ${teamStamp(r.seenAt, now)}` : "not seen yet"}{r.pings.length ? ` · pinged ${r.pings.length}×` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-[13px] font-semibold tabular-nums ${esc ? "text-high" : "text-ink-2"}`} title={esc ? "Open for over 24 hours" : "Waiting time"}>{fmtSpan(waitingMs(r, now))}{esc ? " ▲" : ""}</span>
          {incoming && <span className="text-[12.5px] font-semibold text-brand" title={CATEGORIES[r.category].resolve}>Resolve →</span>}
          {mine && (canPing
            ? <button type="button" className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] font-semibold text-ink hover:bg-line disabled:opacity-50" disabled={pinging} onClick={ping}>{pinging ? "Pinging…" : "Ping"}</button>
            : <span className="text-[12px] text-faint" title="A polite ping becomes possible 4 hours after the request or the last ping">ping at {teamTime(new Date(nextPingAt(r)))}</span>)}
        </div>
      </div>
    </li>
  );
}

/** Who waits (rows) on whom (columns) [S6, A28]; a cell = open requests, coloured by the most pressing one; click = filter. */
function BlockedMatrix({ snap, now, filter, setFilter }: { snap: Snapshot; now: Date; filter: Filter; setFilter: (f: Filter) => void }) {
  const m = useMemo(() => matrix(snap.team, snap.requests, now), [snap, now]);
  const short = (w: Who) => (w.id === "admin" ? "Admin" : firstName(w.name));
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">Blocked work · who waits on whom</h3>
      {!m.rows.length ? <p className="text-[13.5px] text-muted">No one is waiting on anyone right now.</p> : (
        <div className="no-scrollbar overflow-x-auto">
          <table className="border-separate border-spacing-1 text-[13px]">
            <thead>
              <tr>
                <th className="pr-2 text-left text-[11.5px] font-medium text-faint">waits on →</th>
                {m.cols.map((c) => (
                  <th key={c.id} className="px-1 text-center font-semibold text-ink-2">
                    <button type="button" className="hover:underline" title={`Everyone waiting on ${c.name}`} onClick={() => setFilter({ kind: "to", id: c.id })}>{short(c)}</button>
                  </th>
                ))}
                <th className="pl-1 text-[11.5px] font-medium text-faint">total</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.id}>
                  <th className="pr-2 text-left font-semibold text-ink-2">
                    <button type="button" className="hover:underline" title={`Everything ${r.name} is waiting on`} onClick={() => setFilter({ kind: "from", id: r.id })}>{short(r)}</button>
                  </th>
                  {m.cols.map((c) => {
                    const cell = m.cells.get(cellKey(r.id, c.id));
                    if (!cell) return <td key={c.id} className="h-9 min-w-11 rounded-lg bg-surface-2/50 text-center text-faint">·</td>;
                    const w = cell.worst;
                    const hot = w.category === "critical" || isEscalated(w, now);
                    const on = filter?.kind === "pair" && filter.from === r.id && filter.to === c.id;
                    return (
                      <td key={c.id} className="p-0">
                        <button type="button" onClick={() => setFilter(on ? null : { kind: "pair", from: r.id, to: c.id })}
                          title={`${r.name} is waiting on ${c.name}: ${cell.count} open — most pressing: ${CATEGORIES[w.category].label}${w.priority === "urgent" ? ", Urgent" : ""}, ${fmtSpan(waitingMs(w, now))}`}
                          className={`press grid h-9 w-full min-w-11 place-items-center rounded-lg text-[14px] font-bold tabular-nums ${on ? "ring-2 ring-ink" : ""} ${hot ? "bg-high text-white" : w.priority === "urgent" ? "bg-medium text-white" : CATEGORIES[w.category].tone}`}>
                          {cell.count}{hot ? " ▲" : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pl-1 text-center font-semibold tabular-nums text-ink-2">{m.rowTotal.get(r.id)}</td>
                </tr>
              ))}
              <tr>
                <th className="pr-2 text-left text-[11.5px] font-medium text-faint">people waiting</th>
                {m.cols.map((c) => <td key={c.id} className="text-center font-semibold tabular-nums text-ink-2">{m.colTotal.get(c.id)}</td>)}
                <td />
              </tr>
            </tbody>
          </table>
          <p className="mt-1.5 text-[12px] text-muted">Red ▲ = Critical Blocker or open over a day · solid amber = Urgent. The busiest column is the bottleneck.</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Async progress & activity [S2, S7, S24] ---------------- */

// Check-ins are gone (owner, 26 Oct: "I don't need post today's check-ins") — what got done is the requests resolved.
function ActivityFeed({ snap, now, onOpenRequest }: { snap: Snapshot; now: Date; onOpenRequest: (id: string) => void }) {
  const done = snap.requests.filter((r) => r.status === "resolved").sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
  return (
    <section className="card flex min-h-[260px] flex-1 flex-col p-0 lg:min-h-[200px]" aria-label="Resolved this week">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">Resolved this week</h2>
        <span className="text-[13px] text-muted">{done.length ? `${done.length} unblocked` : "who unblocked whom"}</span>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!done.length ? <p className="text-[13.5px] text-muted">Nothing resolved in the last 7 days yet.</p> : (
            <ul className="space-y-1.5">
              {done.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpenRequest(r.id)} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-low-bg text-[12px] font-bold text-low" aria-hidden>✓</span>
                    <span className="min-w-0 flex-1 text-[14px] text-ink-2">
                      <span className="font-semibold text-ink">{firstName(r.resolvedBy ?? "")}</span>{" "}
                      {r.resolvedBy === r.waitingOnName ? `${CATEGORIES[r.category].resumeText.replace(/you/g, firstName(r.requesterName))}` : "closed it"} — {r.task.title}
                      <span className="block text-[12.5px] text-muted">{r.ref} · {CATEGORIES[r.category].label} · waited {fmtSpan(waitingMs(r, now))} · {teamStamp(r.resolvedAt!, now)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}

/* ---------------- Sidebar: quick actions + team status [S9, S10, S20–S23] ---------------- */

function QuickActions({ onAsk }: { onAsk: () => void }) {
  return (
    <section className="card p-3" aria-label="Quick actions">
      <button className={`${btn.primary} h-10 w-full`} onClick={onAsk}>+ Request input or hand-off</button>
    </section>
  );
}

/** The newest thing a member did here, as one short line [S23] (tool activity joins it with the webhooks, plan §5). */
function microLog(m: Who, snap: Snapshot, now: Date): string | undefined {
  type Item = { at: string; text: string };
  const items: Item[] = [];
  for (const r of snap.requests) {
    for (const l of r.log) {
      if (l.by !== m.name || l.action === "seen") continue;
      const text = l.action === "created" ? `Asked ${firstName(r.waitingOnName)} · ${CATEGORIES[r.category].short} (${r.ref})`
        : l.action === "resolved" ? `Resolved ${r.ref} for ${firstName(r.requesterId === m.id ? r.waitingOnName : r.requesterName)}`
        : l.action === "pinged" ? `Pinged ${firstName(r.waitingOnName)} (${r.ref})`
        : l.action === "reopened" ? `Reopened ${r.ref}` : l.action === "withdrawn" ? `Withdrew ${r.ref}` : `Changed ${r.ref}`;
      items.push({ at: l.at, text });
    }
  }
  const last = items.sort((a, b) => b.at.localeCompare(a.at))[0];
  return last ? `${last.text} · ${ago(last.at, now)}` : undefined;
}

function StatusCards({ snap, now, onlyActive, setFilter }: { snap: Snapshot; now: Date; onlyActive: boolean; setFilter: (f: Filter) => void }) {
  const pres = new Map(snap.presence.map((p) => [p.id, p]));
  const open = snap.requests.filter((r) => r.status === "open");
  const people = snap.team
    .map((m) => ({ m, a: availability(pres.get(m.id), now) }))
    .filter((x) => !onlyActive || (x.a.state === "active" && !isAdminId(x.m.id)))
    // You first, then whoever is active, then by last seen.
    .sort((x, y) => Number(y.m.id === snap.me.id) - Number(x.m.id === snap.me.id) || Number(y.a.state === "active") - Number(x.a.state === "active") || (y.a.lastSeenAt ?? "").localeCompare(x.a.lastSeenAt ?? ""));
  return (
    <section className="card flex min-h-0 flex-1 flex-col p-0" aria-label="Team status">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">Team status</h2>
        <span className="text-[12.5px] text-muted">from what they do here and say themselves</span>
      </div>
      <ul className="no-scrollbar min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {people.map(({ m, a }) => {
          const inc = open.filter((r) => r.waitingOnId === m.id);
          const out = open.filter((r) => r.requesterId === m.id);
          const focus = focusOf(pres.get(m.id), snap.today);
          const log = microLog(m, snap, now);
          const me = m.id === snap.me.id;
          return (
            <li key={m.id} className="flex gap-3 px-4 py-3">
              <PersonAvatar name={m.name} size={38} badge={inc.length} severe={inc.some((r) => isSevere(r, now))} dim={a.state !== "active"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{m.name}{me ? " (you)" : ""}</span>
                  <span className={`ml-auto shrink-0 text-[12.5px] font-medium ${a.state === "active" ? "text-low" : "text-muted"}`}>
                    {a.state === "active" ? "● Active" : a.manual ? `○ Away${a.until ? ` until ${teamTime(a.until)}` : ""}` : `○ Away · ${a.lastSeenAt ? `seen ${ago(a.lastSeenAt, now)}` : "not seen yet"}`}
                  </span>
                </div>
                <p className={`truncate text-[13px] ${focus ? "text-ink-2" : "text-faint"}`} title={focus?.text}>{focus ? <>Focus: {focus.text}</> : "No focus shared today"}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px]">
                  <button type="button" disabled={!inc.length} onClick={() => setFilter({ kind: "to", id: m.id })} className={inc.length ? "font-semibold text-ink-2 hover:underline" : "text-faint"}>⇣ {inc.length} waiting on {me ? "you" : firstName(m.name)}</button>
                  <button type="button" disabled={!out.length} onClick={() => setFilter({ kind: "from", id: m.id })} className={out.length ? "font-semibold text-ink-2 hover:underline" : "text-faint"}>⇡ {out.length} {me ? "you're" : "they're"} waiting on</button>
                </div>
                {log && <p className="mt-0.5 truncate text-[12.5px] text-muted" title={log}>{log}</p>}
                {me && <MyStatus away={a.manual} focus={pres.get(m.id)?.focus && teamDay(pres.get(m.id)!.focus!.at) === snap.today ? pres.get(m.id)!.focus!.text : ""} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Your own card: Away / Back and Set focus — self-reported, never guessed [S19, S21]. */
function MyStatus({ away, focus }: { away: boolean; focus: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(focus);
  const [menu, setMenu] = useState(false);
  const setAway = (until?: Date | null) => { setMenu(false); call("/api/progress/presence", "POST", { away: until === null ? null : { until: until?.toISOString() } }); };
  const endOfDay = () => { const d = new Date(); d.setHours(23, 59, 0, 0); return d; };
  const saveFocus = () => { setEditing(false); call("/api/progress/presence", "POST", { focus: text.trim() || null }); };
  return (
    <div className="mt-1.5">
      {editing ? (
        <div className="flex gap-1.5">
          <input autoFocus className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-[13px] focus:border-brand focus:outline-none" maxLength={140} value={text} placeholder="What you're working on now"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveFocus(); if (e.key === "Escape") setEditing(false); }} />
          <button className="rounded-lg bg-brand px-2.5 text-[12.5px] font-semibold text-brand-ink" onClick={saveFocus}>Save</button>
        </div>
      ) : (
        <div className="relative flex flex-wrap gap-1.5">
          <button className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-2 hover:bg-line" onClick={() => { setText(focus); setEditing(true); }}>{focus ? "Change focus" : "Set focus"}</button>
          {away
            ? <button className="rounded-full bg-low-bg px-2.5 py-0.5 text-[12.5px] font-semibold text-low hover:brightness-95" onClick={() => setAway(null)}>I'm back</button>
            : <button className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-2 hover:bg-line" aria-expanded={menu} onClick={() => setMenu(!menu)}>I'm away…</button>}
          {menu && (
            <div className="absolute left-0 top-7 z-10 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 text-[13px] shadow-pop">
              <button className="block w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => setAway(new Date(Date.now() + 3_600_000))}>For an hour</button>
              <button className="block w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => setAway(endOfDay())}>For the rest of today</button>
              <button className="block w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => setAway()}>Until I say I'm back</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
