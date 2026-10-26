"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIES, type Comment, LIMITS, type PtRequest, type Who, canDo, fmtSpan, isAdminId, isEscalated, nextPingAt, teamStamp, teamTime, waitingMs } from "@/lib/progress/model";
import { btn, inputCls } from "../ui";
import { Dialog } from "./Dialog";
import { CategoryChip, PersonAvatar, UrgentPill, firstName, taskHref } from "./bits";
import { PROGRESS_CHANGED, call } from "./useProgress";

const LOG_WORD: Record<PtRequest["log"][number]["action"], string> = {
  created: "asked", seen: "saw it", pinged: "pinged", resolved: "resolved it", withdrawn: "withdrew it", reopened: "reopened it", priority: "set the priority to",
};

/** One request: who waits on whom and for how long, the actions this member may take (§3.5), its history and thread. */
export function RequestDetail({ r, me, now, onClose }: { r: PtRequest; me: Who; now: Date; onClose: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const k = CATEGORIES[r.category];
  const open = r.status === "open";
  const escalated = isEscalated(r, now);

  // The person waited on opening it = "Seen" for the requester (once).
  const seenSent = useRef(false);
  useEffect(() => {
    if (seenSent.current || !canDo(me, r, "seen", now)) return;
    seenSent.current = true;
    call("/api/progress/requests", "PATCH", { id: r.id, action: "seen" });
  }, [me, r, now]);

  const act = async (action: "ping" | "resolve" | "withdraw" | "reopen" | "priority", extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    const j = await call("/api/progress/requests", "PATCH", { id: r.id, action, ...extra });
    setBusy(false);
    if (j.error) return setError(j.error);
    if (action === "resolve" || action === "withdraw") onClose();
    setResolving(false);
    setNote("");
  };

  const pingAt = nextPingAt(r);
  const mine = r.requesterId === me.id;
  const href = taskHref(r);
  const status = r.status === "resolved" ? <span className="rounded-full bg-low-bg px-2 py-0.5 text-[12px] font-semibold text-low">Resolved</span>
    : r.status === "withdrawn" ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-muted">Withdrawn</span>
    : escalated ? <span className="rounded-full bg-high-bg px-2 py-0.5 text-[12px] font-semibold text-high">Open over a day ▲</span>
    : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">Open</span>;

  return (
    <Dialog width={680} onClose={onClose}
      title={<span className="flex flex-wrap items-center gap-2"><CategoryChip c={r.category} /> <span className="text-muted">{r.ref}</span> {r.priority === "urgent" && <UrgentPill />} {status}</span>}
      sub={<span>{r.requesterName} is waiting on {r.waitingOnName} · asked {teamStamp(r.createdAt, now)}{r.reopenedAt ? ` · reopened ${teamStamp(r.reopenedAt, now)}` : ""}</span>}
      footer={<>
        {error && <span className="mr-auto text-[13.5px] font-medium text-high">{error}</span>}
        {open && canDo(me, r, "priority", now) && <button className={`${btn.quiet} mr-auto`} disabled={busy} onClick={() => act("priority", { priority: r.priority === "urgent" ? "normal" : "urgent" })}>{r.priority === "urgent" ? "Make it Normal" : "Make it Urgent"}</button>}
        {canDo(me, r, "withdraw", now) && <button className={btn.danger} disabled={busy} onClick={() => { if (confirm(`Withdraw ${r.ref}? ${firstName(r.waitingOnName)} won't be waited on any more.`)) act("withdraw"); }}>Withdraw</button>}
        {open && mine && (
          <button className={btn.ghost} disabled={busy || !canDo(me, r, "ping", now)} onClick={() => act("ping")}
            title={canDo(me, r, "ping", now) ? `Send ${firstName(r.waitingOnName)} a gentle reminder` : `A ping is possible from ${teamTime(new Date(pingAt))} (4 h after the request or the last ping)`}>
            {canDo(me, r, "ping", now) ? "Ping" : `Ping at ${teamTime(new Date(pingAt))}`}
          </button>
        )}
        {canDo(me, r, "reopen", now) && <button className={btn.ghost} disabled={busy} onClick={() => act("reopen")}>Reopen — still waiting</button>}
        {canDo(me, r, "resolve", now) && !resolving && <button className={btn.primary} disabled={busy} onClick={() => setResolving(true)}>{mine && r.waitingOnId !== me.id ? "Resolve — not waiting any more" : k.resolve}</button>}
      </>}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <PersonAvatar name={r.requesterName} size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{r.task.title}</p>
            {href && <Link href={href} className="text-[13px] font-semibold text-brand hover:underline">Open the card on its board →</Link>}
            {r.note && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2 text-[14px] text-ink-2">{r.note}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-line px-3 py-2.5 text-[13.5px] sm:grid-cols-4">
          <div><dt className="text-[12px] text-muted">{open ? "Waiting" : "Waited"}</dt><dd className={`font-semibold ${escalated ? "text-high" : "text-ink"}`}>{fmtSpan(waitingMs(r, now))}</dd></div>
          <div><dt className="text-[12px] text-muted">Seen by {firstName(r.waitingOnName)}</dt><dd className="font-semibold text-ink">{r.seenAt ? teamStamp(r.seenAt, now) : "Not yet"}</dd></div>
          <div><dt className="text-[12px] text-muted">Pings</dt><dd className="font-semibold text-ink">{r.pings.length || "None"}{r.pings.length ? ` · last ${teamStamp(r.pings.at(-1)!.at, now)}` : ""}</dd></div>
          <div><dt className="text-[12px] text-muted">{r.status === "resolved" ? "Resolved" : r.status === "withdrawn" ? "Withdrawn" : "Next ping"}</dt>
            <dd className="font-semibold text-ink">{r.status === "resolved" ? `${teamStamp(r.resolvedAt!, now)} · ${firstName(r.resolvedBy ?? "")}` : r.status === "withdrawn" ? teamStamp(r.withdrawnAt!, now) : now.getTime() >= pingAt ? "Possible now" : teamTime(new Date(pingAt))}</dd></div>
        </dl>

        {r.resolution && <p className="rounded-xl bg-low-bg px-3 py-2 text-[14px] text-ink-2"><span className="font-semibold text-low">{firstName(r.resolvedBy ?? "")}:</span> {r.resolution}</p>}

        {resolving && (
          <div className="rounded-xl border border-brand/40 bg-brand-soft/50 p-3">
            <label className="mb-1.5 block text-[13px] font-semibold text-ink-2" htmlFor="pt-resolve">A short note for {r.requesterId === me.id ? firstName(r.waitingOnName) : firstName(r.requesterName)} <span className="font-normal text-muted">(optional — what changed)</span></label>
            <textarea id="pt-resolve" autoFocus className={`${inputCls} h-auto py-2`} rows={2} maxLength={LIMITS.note} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex justify-end gap-2">
              <button className={btn.quiet} onClick={() => setResolving(false)}>Cancel</button>
              <button className={btn.primary} disabled={busy} onClick={() => act("resolve", { note })}>{busy ? "Saving…" : `${k.resolve} · tell ${r.requesterId === me.id ? firstName(r.waitingOnName) : firstName(r.requesterName)}`}</button>
            </div>
          </div>
        )}

        <Thread parent={`request:${r.id}`} me={me} now={now} />

        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer select-none font-medium hover:text-ink">History ({r.log.length})</summary>
          <ul className="mt-1.5 space-y-0.5">
            {r.log.map((l, i) => <li key={i}>{teamStamp(l.at, now)} · <span className="text-ink-2">{l.by}</span> {LOG_WORD[l.action]}{l.detail ? ` — ${l.detail}` : ""}</li>)}
          </ul>
        </details>
      </div>
    </Dialog>
  );
}

/** Replies under a request or a check-in [S25] — plain text, newest last; your own (or Admin) can be removed. */
export function Thread({ parent, me, now }: { parent: string; me: Who; now: Date }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    fetch(`/api/progress/comments?parent=${encodeURIComponent(parent)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setList(j.comments ?? [])).catch(() => setList((l) => l ?? []));
  }, [parent]);
  useEffect(() => {
    load();
    window.addEventListener(PROGRESS_CHANGED, load);
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15_000);
    return () => { window.removeEventListener(PROGRESS_CHANGED, load); clearInterval(t); };
  }, [load]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    const j = await call("/api/progress/comments", "POST", { parent, text });
    setBusy(false);
    if (j.error) return setError(j.error);
    setText("");
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this reply?")) return;
    await call(`/api/progress/comments?id=${encodeURIComponent(id)}`, "DELETE");
  };
  return (
    <section>
      <h3 className="mb-1.5 text-[13px] font-semibold text-ink-2">Thread{list?.length ? ` (${list.filter((c) => !c.deletedAt).length})` : ""}</h3>
      {list === null ? <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
        : !list.length ? <p className="text-[13px] text-muted">No replies yet — keep the conversation here so it stays with the work.</p>
        : (
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <PersonAvatar name={c.by} size={26} dim={Boolean(c.deletedAt)} />
                <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-1.5">
                  <div className="flex items-baseline gap-2 text-[12px] text-muted">
                    <span className="font-semibold text-ink-2">{c.by}</span> {teamStamp(c.at, now)}
                    {!c.deletedAt && (c.byId === me.id || isAdminId(me.id)) && <button type="button" className="ml-auto hover:text-high hover:underline" onClick={() => remove(c.id)}>Remove</button>}
                  </div>
                  {c.deletedAt ? <p className="text-[13.5px] italic text-faint">Removed</p> : <p className="whitespace-pre-wrap text-[14px] text-ink [overflow-wrap:anywhere]">{c.text}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      <div className="mt-2 flex items-end gap-2">
        <textarea className={`${inputCls} h-auto min-h-10 py-2`} rows={1} maxLength={LIMITS.comment} placeholder="Write a reply…" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} />
        <button className={btn.primary} disabled={!text.trim() || busy} onClick={send}>{busy ? "…" : "Reply"}</button>
      </div>
      {error && <p className="mt-1 text-[13px] text-high">{error}</p>}
    </section>
  );
}
