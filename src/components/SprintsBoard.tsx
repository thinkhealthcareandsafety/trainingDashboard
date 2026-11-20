"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SprintCard, SprintColumn, SprintComment, SprintsBoard as Board, SprintsMeta } from "@/lib/sprintsRules";
import { localDate } from "@/lib/sprintsRules";
import { Avatar, Skeleton, btn } from "./ui";

/*
 * Sprints (owner, 18 Nov: "a working Zoho Sprints connected to our Sprints, whatever we change here changes in Zoho
 * Sprints"). Project P5's Kanban board, drawn from Zoho Sprints and written back to it: drag a card to another column,
 * Create Task (Zoho's "+ Item"), open a card to edit every field, assign people, tag, or delete. No Backlog. Refreshes
 * every 30 s, so changes made in Zoho show here too.
 */

/** `me`: the viewer on the board (a people key); `seesAll`: Sumit, Admin, Shikha, Nikita (others see only their tasks). */
type Data = { connected: boolean; canConnect: boolean; needsReconnect: boolean; scopes: string; board?: Board & { me?: string; seesAll?: boolean }; error?: string };
type Task = { name: string; description: string; statusId: string; typeId: string; priorityId: string; start: string; end: string; users: string[]; tags: string[]; udf: Record<string, string> };

const day = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
/** A finished column: its cards are never overdue. */
const doneCol = (name: string) => /done|complete|closed|resolved/i.test(name);
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const post = (body: object) => fetch("/api/sprints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Couldn't reach the server" }));

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="shrink-0 animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Zoho's item-type marks: Story (green page), Task (blue tick), Bug (red bug). */
function TypeIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes("bug")) return <svg viewBox="0 0 16 16" width="15" height="15" aria-label="Bug" className="shrink-0 text-[#e5484d]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><ellipse cx="8" cy="9.5" rx="3.5" ry="4.5" /><path d="M8 5V14M4.5 8H2M14 8h-2.5M4.6 11.8 2.8 13M11.4 11.8l1.8 1.2M6 3.5 5 2M10 3.5 11 2" /></svg>;
  if (n.includes("task")) return <svg viewBox="0 0 16 16" width="15" height="15" aria-label="Task" className="shrink-0 text-[#3b82f6]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="m5.5 8.2 1.8 1.8 3.4-3.6" /></svg>;
  return <svg viewBox="0 0 16 16" width="15" height="15" aria-label="Story" className="shrink-0 text-[#16a34a]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><rect x="3" y="2.5" width="8.5" height="11" rx="1" /><path d="M5.5 5.5h4M5.5 8h4M5.5 10.5h2.5M13 5v8.5H6" /></svg>;
}

/**
 * The columns' height that makes the board end at the bottom of the window (owner, 18 Nov: "fit it to screen"; the same
 * way as the Follow-ups board): no page scroll, each column scrolls on its own.
 */
function useFitHeight(deps: unknown[]) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [colH, setColH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const fit = () => {
      const body = page.querySelector<HTMLElement>("[data-col-body]");
      const main = page.parentElement;
      if (!body || !main) return;
      // Space the layout keeps below the page (the bottom tab bar on small screens).
      const reserve = parseFloat(getComputedStyle(main).paddingBottom);
      const bottom = page.getBoundingClientRect().bottom + window.scrollY;
      const next = Math.max(220, Math.floor(body.clientHeight + window.innerHeight - reserve - bottom));
      setColH((h) => (h === next ? h : next));
    };
    fit();
    const late = setTimeout(fit, 600); // after the page's entry animation
    const ro = new ResizeObserver(fit);
    ro.observe(page);
    window.addEventListener("resize", fit);
    return () => { clearTimeout(late); ro.disconnect(); window.removeEventListener("resize", fit); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { pageRef, colH };
}

export function SprintsBoard() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState("");
  const [tab, setTab] = useState(0);
  const [cols, setCols] = useState<SprintColumn[] | null>(null);
  const [open, setOpen] = useState<{ card?: SprintCard; statusId?: string } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const busyMoves = useRef(0);
  const { pageRef, colH } = useFitHeight([Boolean(data?.board)]);

  const load = () => fetch("/api/sprints", { cache: "no-store" }).then(async (r) => {
    const j = (await r.json().catch(() => null)) as Data | null;
    if (!j) return setFailed("Couldn't reach the server");
    setFailed("");
    setData(j);
  }).catch(() => setFailed("Couldn't reach the server"));
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible" && !busyMoves.current) load(); }, 30_000);
    return () => clearInterval(t);
  }, []);

  const b = data?.board;
  const sprint = b?.sprints[Math.min(tab, Math.max(0, (b?.sprints.length ?? 1) - 1))];
  // The columns shown, kept locally so a dragged card moves at once (Zoho is told right after).
  useEffect(() => { setCols(sprint?.columns ?? null); }, [sprint]);
  const meta: SprintsMeta = b?.meta ?? { types: [], priorities: [], users: [], tags: [], fields: [] };
  const typeName = (id: string) => meta.types.find((t) => t.id === id)?.name ?? "";
  const priority = (id: string) => meta.priorities.find((p) => p.id === id);

  if (!data) return failed ? <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{failed}</p> : <Skeleton className="h-[520px]" />;
  if (!data.connected) return <Connect canConnect={data.canConnect} scopes={data.scopes} onDone={load} />;

  const move = async (card: SprintCard, to: string) => {
    if (!cols || card.statusId === to) return;
    const before = cols;
    setCols(cols.map((c) => ({ ...c, cards: c.id === to ? [{ ...card, statusId: to }, ...c.cards] : c.cards.filter((x) => x.id !== card.id) })));
    busyMoves.current++;
    const r = await post({ action: "move", sprint: card.sprintId || sprint?.id, item: card.id, status: to });
    busyMoves.current--;
    if (r.error) { setCols(before); setNote(`Couldn't move ${card.no}: ${r.error}`); }
  };
  const total = (cols ?? []).reduce((n, c) => n + c.cards.length, 0);

  return (
    <div ref={pageRef} className="space-y-4">
      {data.needsReconnect && data.canConnect && <Connect canConnect scopes={data.scopes} onDone={load} again />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-2">
          {b && b.sprints.length > 1 ? (
            <select value={tab} onChange={(e) => setTab(Number(e.target.value))} className="select-chevron bg-transparent pr-6 text-[15px] font-semibold text-ink" aria-label="Board">
              {b.sprints.map((s, k) => <option key={s.id} value={k}>{s.name}</option>)}
            </select>
          ) : <span className="text-[15px] font-semibold text-ink">{b?.project.name ?? sprint?.name ?? "Board"}</span>}
          <span className="num text-[13px] text-muted">{total} tasks</span>
        </div>
        {b && b.seesAll === false && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-brand">Only your tasks</span>}
        <span className="flex-1" />
        {b && <span className="num hidden text-[12.5px] text-faint sm:inline">Updated {new Date(b.fetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
        <a href={b?.boardUrl ?? "https://sprints.zoho.in/workspace/thinkhealth#P5/board"} target="_blank" rel="noreferrer" className={btn.ghost}>
          Open in Zoho Sprints
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h7v7M13 3 4 12" /></svg>
        </a>
        {sprint && <button type="button" onClick={() => setOpen({})} className={btn.primary}>+ New task</button>}
      </div>
      {data.error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{data.error}</p>}
      {note && <p className="flex items-center gap-3 rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{note}<button type="button" className="ml-auto font-semibold" onClick={() => setNote("")}>Dismiss</button></p>}
      {sprint && cols ? (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1">
          {cols.map((c) => (
            <section key={c.id}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(c.id); } }}
              onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const card = cols.flatMap((x) => x.cards).find((x) => x.id === drag); setDrag(null); if (card) move(card, c.id); }}
              className={`flex w-[290px] shrink-0 flex-col rounded-2xl border border-line/70 bg-surface-2/50 transition lg:w-auto lg:min-w-[250px] lg:flex-1 ${over === c.id ? "border-brand bg-brand-soft/40" : ""}`}>
              <header className="flex items-center gap-2 px-3.5 pb-2.5 pt-3">
                <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                <h2 className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{c.name}</h2>
                <span className="num rounded-full bg-surface px-2 py-px text-[11.5px] font-semibold text-muted ring-1 ring-line">{c.cards.length}</span>
                <span className="flex-1" />
                <button type="button" onClick={() => setOpen({ statusId: c.id })} className="press grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label={`New task in ${c.name}`} title={`New task in ${c.name}`}>
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9" /></svg>
                </button>
              </header>
              <ul data-col-body style={colH ? { height: colH } : undefined} className={`no-scrollbar flex flex-col gap-2 overflow-y-auto px-2.5 pb-3 ${colH ? "" : "max-h-[calc(100vh-250px)]"}`}>
                {c.cards.length === 0 && <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-faint">Drop a task here</li>}
                {c.cards.map((card) => {
                  const pr = priority(card.priorityId);
                  const hasPr = Boolean(pr && !/^none$/i.test(pr.name));
                  const done = doneCol(c.name);
                  return (
                    <li key={card.id} draggable onDragStart={(e) => { setDrag(card.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => setOpen({ card })}
                      className={`group cursor-grab rounded-xl border border-line bg-surface p-3 transition hover:border-line-strong hover:shadow-[0_2px_8px_rgb(0_0_0/0.08)] active:cursor-grabbing ${drag === card.id ? "opacity-40" : ""}`}>
                      <div className="flex items-center gap-1.5">
                        <TypeIcon name={typeName(card.typeId)} />
                        <span className="num text-[12px] font-medium text-muted">{card.no}</span>
                        <span className="flex-1" />
                        {hasPr && <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-2"><span className="size-1.5 rounded-full" style={{ background: pr!.color }} />{pr!.name}</span>}
                      </div>
                      <p className={`mt-1.5 line-clamp-3 text-[13.5px] font-medium leading-snug ${done ? "text-ink-2" : "text-ink"}`}>{card.name}</p>
                      {(card.owners.length > 0 || card.due || Boolean(card.comments)) && (
                        <div className="mt-2.5 flex items-center gap-2">
                          {card.owners.length > 0 && (
                            <span className="flex min-w-0 items-center gap-1.5" title={card.owners.join(", ")}>
                              <span className="flex shrink-0 -space-x-1.5">{card.owners.slice(0, 3).map((o) => <Avatar key={o} name={o} />)}</span>
                              <span className="truncate text-[12px] text-ink-2">{card.owners.length === 1 ? firstName(card.owners[0]) : card.owners.length <= 3 ? card.owners.map(firstName).join(", ") : `${firstName(card.owners[0])} +${card.owners.length - 1}`}</span>
                            </span>
                          )}
                          <span className="flex-1" />
                          {Boolean(card.comments) && (
                            <span className="num inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-muted" title={`${card.comments} comment${card.comments === 1 ? "" : "s"}`}>
                              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" /></svg>{card.comments}
                            </span>
                          )}
                          {card.due && <span className={`num shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${card.overdue && !done ? "bg-high-bg text-high" : "bg-surface-2 text-muted"}`}>{day(card.due)}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : !data.error && (
        <div className="card p-6">
          <p className="text-[14px] text-muted">The board has no tasks yet.</p>
          {b?.diag && <p className="num mt-2 text-[12.5px] text-faint">Zoho Sprints said: {b.diag}</p>}
        </div>
      )}
      {open && sprint && cols && (
        <TaskPanel key={open.card?.id ?? `new-${open.statusId ?? ""}`} card={open.card} statusId={open.statusId} sprintId={open.card?.sprintId || sprint.id} cols={cols} meta={meta} me={b?.me}
          onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />
      )}
    </div>
  );
}

/** Pick several (people, tags) from a list, with search. */
function MultiPick({ label, options, value, onChange }: { label: string; options: { id: string; name: string; color?: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const picked = options.filter((o) => value.includes(o.id));
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-left text-[13.5px]" aria-expanded={open}>
        {picked.length ? picked.map((o) => <span key={o.id} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[12.5px] text-ink">{o.color && <span className="size-1.5 rounded-full" style={{ background: o.color }} />}{o.name}</span>) : <span className="text-faint">Select {label.toLowerCase()}</span>}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-surface p-2 shadow-pop">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} className="mb-1 h-9 w-full rounded-lg bg-surface-2 px-3 text-[13px] text-ink" />
          <ul className="max-h-56 overflow-y-auto">
            {shown.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] text-ink hover:bg-surface-2">
                  <input type="checkbox" checked={value.includes(o.id)} onChange={() => onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id])} />
                  {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} />}{o.name}
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-2 text-[12.5px] text-faint">Nothing matches</li>}
          </ul>
          <button type="button" onClick={() => setOpen(false)} className="mt-1 w-full rounded-lg py-1.5 text-[12.5px] font-semibold text-brand hover:bg-brand-soft">Done</button>
        </div>
      )}
    </div>
  );
}

/** Create Task / a task opened: every field Zoho's item has here, saved straight to Zoho Sprints. */
function TaskPanel({ card, statusId, sprintId, cols, meta, me, onClose, onSaved }: { card?: SprintCard; statusId?: string; sprintId: string; cols: SprintColumn[]; meta: SprintsMeta; me?: string; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(card);
  const defType = meta.types.find((t) => /story/i.test(t.name))?.id ?? meta.types[0]?.id ?? "";
  const defPriority = meta.priorities.find((p) => /^none$/i.test(p.name))?.id ?? meta.priorities[0]?.id ?? "";
  const first: Task = useMemo(() => ({
    name: card?.name ?? "", description: "", statusId: card?.statusId ?? statusId ?? cols[0]?.id ?? "", typeId: card?.typeId || defType, priorityId: card?.priorityId || defPriority,
    start: localDate(card?.start ?? null), end: localDate(card?.due ?? null), users: card ? card.people ?? card.ownerIds.map((z) => `z:${z}`) : me ? [me] : [], tags: [], udf: {},
  }), [card, statusId, cols, defType, defPriority, me]);
  const [t, setT] = useState<Task>(first);
  const [loaded, setLoaded] = useState<Task | null>(editing ? null : first);
  const [busy, setBusy] = useState<"" | "save" | "delete">("");
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!card) return;
    fetch(`/api/sprints?item=${card.id}&sprint=${sprintId}`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.error) { setError(d.error); setLoaded(first); return; }
      const full = { ...first, description: d.description ?? "", tags: d.tags ?? [], udf: d.udf ?? {} };
      setT(full); setLoaded(full);
    }).catch(() => { setError("Couldn't read the task"); setLoaded(first); });
  }, [card, sprintId, first]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!t.name.trim()) return setError("Give the task a name.");
    setBusy("save"); setError("");
    let r;
    if (!editing) r = await post({ action: "create", sprint: sprintId, task: t });
    else {
      // Only what changed goes to Zoho.
      const base = loaded ?? first;
      const ch: Record<string, unknown> = {};
      for (const k of ["name", "description", "statusId", "typeId", "priorityId", "start", "end"] as const) if (t[k] !== base[k]) ch[k] = t[k];
      if (JSON.stringify([...t.users].sort()) !== JSON.stringify([...base.users].sort())) { ch.users = t.users; ch.was = base.users; }
      if (JSON.stringify([...t.tags].sort()) !== JSON.stringify([...base.tags].sort())) ch.tags = t.tags;
      const udf = Object.fromEntries(Object.entries(t.udf).filter(([k, v]) => v !== (base.udf[k] ?? "")));
      if (Object.keys(udf).length) ch.udf = udf;
      if (!Object.keys(ch).length) { setBusy(""); return onClose(); }
      r = await post({ action: "update", sprint: sprintId, item: card!.id, task: ch });
    }
    setBusy("");
    if (r.error) return setError(r.error);
    onSaved();
  };
  const remove = async () => {
    setBusy("delete"); setError("");
    const r = await post({ action: "delete", sprint: sprintId, item: card!.id });
    setBusy("");
    if (r.error) return setError(r.error);
    onSaved();
  };

  const row = "grid grid-cols-1 gap-1.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center sm:gap-4";
  const lab = "text-[13px] font-medium text-ink-2";
  const field = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="modal-in flex h-full w-full max-w-[640px] flex-col bg-surface shadow-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editing ? card!.name : "New task"}>
        <header className="flex items-center gap-3 border-b border-line px-6 py-4">
          {editing && <span className="num rounded-md border border-line px-2 py-0.5 text-[12.5px] font-semibold text-ink-2">{card!.no}</span>}
          <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold text-ink">{editing ? "Task" : "New task"}</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">✕</button>
        </header>
        {!loaded ? <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted"><Spinner />Reading the task from Zoho Sprints…</div> : (
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className={row}><label className={lab} htmlFor="t-name">Task Name</label><input id="t-name" autoFocus={!editing} className={field} value={t.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className={row}><label className={lab} htmlFor="t-desc">Description</label><textarea id="t-desc" rows={4} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink" value={t.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div className={row}><span className={lab}>Tags</span><MultiPick label="Tags" options={meta.tags} value={t.tags} onChange={(v) => set("tags", v)} /></div>
            {meta.fields.length > 0 && <p className="border-b border-line pb-1 pt-2 text-[13px] font-semibold text-brand">Default Section</p>}
            {meta.fields.map((f) => (
              <div key={f.udf} className={row}><label className={lab} htmlFor={`t-${f.udf}`}>{f.label}</label><input id={`t-${f.udf}`} className={field} value={t.udf[f.udf] ?? ""} onChange={(e) => set("udf", { ...t.udf, [f.udf]: e.target.value })} /></div>
            ))}
            <div className={row}><span className={lab}>Assign Users</span><MultiPick label="Users" options={(meta.people ?? []).map((x) => ({ id: x.key, name: x.name }))} value={t.users} onChange={(v) => set("users", v)} /></div>
            <div className={row}><label className={lab} htmlFor="t-status">Status</label><select id="t-status" className={field} value={t.statusId} onChange={(e) => set("statusId", e.target.value)}>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className={row}><label className={lab} htmlFor="t-type">Item Type</label><select id="t-type" className={field} value={t.typeId} onChange={(e) => set("typeId", e.target.value)}>{meta.types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className={row}><label className={lab} htmlFor="t-pri">Priority</label><select id="t-pri" className={field} value={t.priorityId} onChange={(e) => set("priorityId", e.target.value)}>{meta.priorities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className={row}><label className={lab} htmlFor="t-start">Start Date</label><input id="t-start" type="datetime-local" className={field} value={t.start} onChange={(e) => set("start", e.target.value)} /></div>
            <div className={row}><label className={lab} htmlFor="t-end">End Date</label><input id="t-end" type="datetime-local" className={field} value={t.end} onChange={(e) => set("end", e.target.value)} /></div>
            {editing && <Comments sprintId={sprintId} itemId={card!.id} />}
          </div>
        )}
        {error && <p className="mx-6 mb-2 rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
          {editing && (sure ? (
            <span className="flex items-center gap-2 text-[13px] text-high">Delete {card!.no} in Zoho Sprints?
              <button type="button" disabled={busy !== ""} onClick={remove} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-high px-3 font-semibold text-white disabled:opacity-60">{busy === "delete" ? <><Spinner />Deleting…</> : "Delete"}</button>
              <button type="button" onClick={() => setSure(false)} className="h-9 rounded-lg px-2 text-muted hover:text-ink">Keep</button>
            </span>
          ) : <button type="button" onClick={() => setSure(true)} className={btn.danger}>Delete</button>)}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btn.ghost}>Cancel</button>
          <button type="button" disabled={busy !== "" || !loaded} onClick={save} className={btn.primary}>
            {busy === "save" ? <><Spinner />Saving to Zoho Sprints…</> : editing ? "Save" : "Create"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

/** Zoho Sprints' one-time connection (again when new permissions were added): Admin pastes a code from the Zoho API console. */
/**
 * Comments (owner, 20 Nov: "so people can add everything in there, for example their work"): the task's comments in Zoho
 * Sprints, and a box to add one. A comment saves on its own (no need for Save) and goes to Zoho under the writer's name.
 */
function Comments({ sprintId, itemId }: { sprintId: string; itemId: string }) {
  const [list, setList] = useState<SprintComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch(`/api/sprints?item=${itemId}&sprint=${sprintId}&comments=1`, { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.error) { setError(d.error); setList([]); } else setList(d.comments ?? []); })
      .catch(() => { setError("Couldn't read the comments"); setList([]); });
  }, [itemId, sprintId]);
  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    const r = await post({ action: "comment", sprint: sprintId, item: itemId, text });
    setBusy(false);
    if (r.error) return setError(r.error);
    setText(""); setList(r.comments ?? []);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <section className="border-t border-line pt-4" aria-label="Comments">
      <h3 className="mb-3 flex items-baseline gap-2 text-[14px] font-semibold text-ink">Comments{list && list.length > 0 && <span className="num text-[12.5px] font-medium text-muted">{list.length}</span>}</h3>
      {!list ? <p className="flex items-center gap-2 text-[13px] text-muted"><Spinner />Reading comments…</p> : (
        <ul className="space-y-3">
          {list.length === 0 && <li className="text-[13px] text-faint">No comments yet. Add what you did, a note or an update.</li>}
          {list.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.by || "?"} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]"><span className="font-semibold text-ink">{c.by || "Someone"}</span>{c.at && <span className="num text-faint">{when(c.at)}</span>}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-2">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} className="mt-3">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment: your work today, an update, a question…" aria-label="New comment"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } }}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink" />
        {error && <p className="mt-1.5 rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="hidden text-[12px] text-faint sm:inline">Ctrl + Enter to add</span>
          <span className="flex-1" />
          <button type="button" disabled={busy || !text.trim()} onClick={add} className={btn.primary}>{busy ? <><Spinner />Adding…</> : "Add comment"}</button>
        </div>
      </div>
    </section>
  );
}

function Connect({ canConnect, scopes, onDone, again = false }: { canConnect: boolean; scopes: string; onDone: () => void; again?: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connect = async () => {
    setBusy(true); setError("");
    const r = await post({ action: "connect", code });
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone();
  };
  if (!canConnect) return <p className="card p-6 text-[14px] text-muted">Zoho Sprints isn&apos;t connected yet. Admin or Shikha connects it once here.</p>;
  return (
    <section className="card max-w-3xl px-5 py-5">
      <h2 className="text-[16px] font-semibold text-ink">{again ? "Connect Zoho Sprints again (once) to create, edit and delete tasks" : "Connect Zoho Sprints (once)"}</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-ink-2">
        <li>Open the Zoho API console (api-console.zoho.in) as a Zoho user who is in the thinkhealth Sprints workspace.</li>
        <li>Open the same Self Client as Zoho Books → Generate Code, with this scope:<br /><span className="num select-all break-all font-semibold text-ink">{scopes}</span></li>
        <li>Pick 10 minutes, create it, and paste the code here.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input className="h-10 w-80 max-w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink" placeholder="1000.xxxx…" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) connect(); }} aria-label="Zoho code" />
        <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-brand-ink disabled:opacity-50" disabled={busy || !code.trim()} onClick={connect}>
          {busy && <Spinner />}{busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
    </section>
  );
}
