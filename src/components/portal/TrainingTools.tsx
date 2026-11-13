"use client";

import { useEffect, useMemo, useState } from "react";
import { type Person, type Proposal, type Skipped, duplicatePhones, fmtProposalDate, indiaToday, parseCsv, peopleFromRows } from "@/lib/portalRules";
import type { DayWindow } from "@/lib/attendanceRules";
import { portalPrefix } from "@/lib/portalHost";
import { Qr, qrPng } from "./Qr";

/*
 * What a coordinator does on a training (docs/TRAINING_MANAGER_PLAN.md steps 5–7): propose the date(s), location and
 * headcount ("Send to Think Health"), and build the attendee list — typed in, from an Excel / CSV file, or by the QR link
 * that people scan to join themselves. Every change shows straight away on our Trainings page.
 */

export type ToolTraining = { id: string; number: string; title: string; expected: number; proposal: Proposal | null; history: Proposal[]; joinKey: string; registered: number };
type Row = { th: string; name: string; phone: string; email: string; source: "typed" | "excel" | "qr" | "walkin"; addedAt: string; duplicate: boolean; present: string[] };
/** The list as the server sends it: with attendance once the training is confirmed (owner, 13 Nov). */
type People = { list?: Row[]; days?: string[]; window?: DayWindow; attendance?: boolean };
export type Live = { present: number; total: number };

const field = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-action focus:outline-none focus:ring-4 focus:ring-action/15";
export const primaryBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-action px-5 text-[15px] font-bold text-white shadow-[0_2px_8px_rgb(0_80_130/0.22)] transition hover:bg-action-hover active:scale-[0.99] disabled:opacity-50";
export const secondaryBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold text-action ring-1 ring-inset ring-action/35 transition hover:bg-action/[0.06] disabled:opacity-50";
const linkBtn = "text-[14px] font-semibold text-action hover:underline disabled:opacity-50";
const label = "mb-1.5 block text-[13.5px] font-semibold text-ink-2";
const sectionTitle = "text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted";

export async function act<T>(body: object): Promise<T & { error?: string }> {
  const r = await fetch("/api/portal/training", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { error: "Couldn't reach Think Health. Check your connection and try again." } as T & { error?: string };
  if (r.status === 401) { location.reload(); return { error: "Please sign in again" } as T & { error?: string }; }
  return r.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

/* ---------------- Step 5: the proposal ---------------- */

export function ProposalView({ p, history, expected }: { p: Proposal; history: Proposal[]; expected: number }) {
  const prev = history.at(-1);
  const changed = (k: "dates" | "location" | "headcount") => prev && JSON.stringify(prev[k]) !== JSON.stringify(p[k]);
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <div>
        <p className={sectionTitle}>On{p.tentative && <span className="ml-2 rounded-md bg-ground px-1.5 py-0.5 text-[11px] tracking-[0.08em] text-ink-2 ring-1 ring-line">Tentative</span>}</p>
        <ul className="mt-1.5 space-y-0.5 text-[15px] font-semibold text-ink">{p.dates.map((d) => <li key={d.date}>{fmtProposalDate(d)}</li>)}</ul>
        {changed("dates") && <ul className="mt-1 space-y-0.5 text-[13.5px] text-muted line-through">{prev!.dates.map((d) => <li key={d.date}>{fmtProposalDate(d)}</li>)}</ul>}
      </div>
      <div>
        <p className={sectionTitle}>Course conducted at</p>
        <p className="mt-1.5 text-[15px] font-semibold text-ink">{p.location}</p>
        {changed("location") && <p className="mt-1 text-[13.5px] text-muted line-through">{prev!.location}</p>}
      </div>
      <div>
        <p className={sectionTitle}>Attending</p>
        <p className="num mt-1.5 text-[15px] font-semibold text-ink">{p.headcount} people</p>
        {changed("headcount") && <p className="num mt-1 text-[13.5px] text-muted line-through">{prev!.headcount} people</p>}
        {expected > 0 && p.headcount !== expected && <p className="mt-1 text-[13px] font-semibold text-warn">The quotation is for {expected}. We&apos;ll be in touch about the difference.</p>}
      </div>
    </div>
  );
}

export function ProposeForm({ t, onSaved, onCancel }: { t: ToolTraining; onSaved: (p: Proposal, history: Proposal[]) => void; onCancel: () => void }) {
  const p = t.proposal;
  const [dates, setDates] = useState(p?.dates.length ? p.dates : [{ date: "", time: "10:00" }]);
  const [tentative, setTentative] = useState(p?.tentative ?? false);
  const [location, setLocation] = useState(p?.location ?? "");
  const [headcount, setHeadcount] = useState(String(p?.headcount ?? (t.expected || "")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = indiaToday();
  const n = Number(headcount);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await act<{ ok?: boolean; proposal?: Proposal }>({ action: "propose", id: t.id, dates, tentative, location, headcount: n });
    setBusy(false);
    if (!r.proposal) return setError(r.error ?? "Couldn't send it");
    const changed = p && JSON.stringify(p) !== JSON.stringify(r.proposal);
    onSaved(r.proposal, changed ? [...t.history, p] : t.history);
  };

  return (
    <form onSubmit={send} className="space-y-5" noValidate>
      <div>
        <span className={label}>Training date{dates.length > 1 ? "s" : ""}</span>
        <div className="space-y-2">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" className={`${field} min-w-0 flex-[1.4]`} min={today} value={d.date} aria-label={`Day ${i + 1} date`}
                onChange={(e) => setDates(dates.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} required />
              <input type="time" className={`${field} min-w-0 flex-1`} value={d.time} step={900} aria-label={`Day ${i + 1} start time`}
                onChange={(e) => setDates(dates.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
              {dates.length > 1 && <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-ground" aria-label={`Remove day ${i + 1}`} onClick={() => setDates(dates.filter((_, j) => j !== i))}><svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg></button>}
            </div>
          ))}
        </div>
        {dates.length < 10 && <button type="button" className={`${linkBtn} mt-2`} onClick={() => setDates([...dates, { date: "", time: dates.at(-1)?.time ?? "10:00" }])}>+ Add another day</button>}
      </div>
      <label className="flex cursor-pointer items-center gap-3">
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input type="checkbox" className="peer sr-only" checked={tentative} onChange={(e) => setTentative(e.target.checked)} />
          <span className="absolute inset-0 rounded-full bg-line-strong transition peer-checked:bg-action peer-focus-visible:ring-4 peer-focus-visible:ring-action/25" />
          <span className="absolute left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </span>
        <span className="text-[15px] text-ink">Tentative <span className="text-muted">— the date may still change</span></span>
      </label>
      <label className="block">
        <span className={label}>Course conducted at</span>
        <input className={field} placeholder="e.g. The Grand Hotel, Pune" value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} required />
        <span className="mt-1.5 block text-[13px] text-muted">As it should be printed on the certificates.</span>
      </label>
      <label className="block max-w-[220px]">
        <span className={label}>People attending</span>
        <input className={`${field} num`} inputMode="numeric" value={headcount} onChange={(e) => setHeadcount(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
      </label>
      {t.expected > 0 && n > 0 && n !== t.expected && <p className="-mt-3 text-[13.5px] font-semibold text-warn">The quotation is for {t.expected} people. You can still send {n}; we&apos;ll be in touch about the difference.</p>}
      {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-[14px] text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2.5">
        <button className={primaryBtn} disabled={busy}>{busy ? "Sending…" : p ? "Send the change to Think Health" : "Accept and send to Think Health"}</button>
        <button type="button" className={secondaryBtn} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

/* ---------------- Steps 6 and 7: the attendee list and the QR link ---------------- */

const SOURCE: Record<Row["source"], string> = { typed: "Typed", excel: "Excel", qr: "QR", walkin: "Walk-in" };
const dayShort = (d: string) => fmtProposalDate({ date: d, time: "" }).replace(/ \d{4}$/, "");

/** The list always shows (owner, 12 Nov: "let me see the user without opening it"); the ways to add, when `adding`. */
export function Participants({ t, adding, onCount, onLive }: { t: ToolTraining; adding: boolean; onCount: (n: number) => void; onLive?: (l: Live) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"type" | "excel" | "qr">("type");
  const [joinKey, setJoinKey] = useState(t.joinKey);
  const [att, setAtt] = useState<{ days: string[]; window: DayWindow; on: boolean }>({ days: [], window: { state: "none", of: 0 }, on: false });
  const [busyTick, setBusyTick] = useState("");
  const today = indiaToday();

  const update = (r: People) => {
    if (!r.list) return;
    setRows(r.list); onCount(r.list.length);
    const w: DayWindow = r.window ?? { state: "none", of: 0 };
    setAtt({ days: r.days ?? [], window: w, on: Boolean(r.attendance) });
    if (r.attendance && onLive) onLive({ present: w.state === "open" ? r.list.filter((p) => p.present.includes(w.day)).length : 0, total: r.list.length });
  };
  const load = () => act<People>({ action: "people", id: t.id }).then((r) => { if (r.list) { update(r); setError(""); } else setError(r.error ?? "Couldn't load the list"); });
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live ticks (owner, 13 Nov): every 5 s on a training day, every minute otherwise once confirmed; paused while the tab is hidden.
  useEffect(() => {
    if (!att.on) return;
    const id = setInterval(() => { if (!document.hidden) load(); }, att.window.state === "open" ? 5000 : 60000);
    return () => clearInterval(id);
  }, [att.on, att.window.state, t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (th: string, name: string) => {
    if (!window.confirm(`Take ${name} (${th}) off the list?`)) return;
    const r = await act<People>({ action: "remove", id: t.id, th });
    if (r.list) update(r); else setError(r.error ?? "Couldn't remove them");
  };
  const tick = async (r: Row, day: string) => {
    const on = !r.present.includes(day);
    if (!on && !window.confirm(`Untick ${r.name} for ${dayShort(day)}? They'll show as not present.`)) return;
    setBusyTick(`${r.th}:${day}`);
    const res = await act<People>({ action: "tick", id: t.id, th: r.th, day, on });
    setBusyTick("");
    if (res.list) update(res); else setError(res.error ?? "Couldn't change it");
  };
  const download = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = "﻿" + [["TH ID", "Name", "Phone", "Email", "Added by", ...att.days.map((d) => `Present ${d}`)], ...(rows ?? []).map((r) => [r.th, r.name, r.phone, r.email, SOURCE[r.source], ...att.days.map((d) => (r.present.includes(d) ? "Yes" : ""))])].map((r) => r.map(esc).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `Participants ${t.number}.csv`;
    a.click();
  };

  const tabs: { id: typeof tab; label: string }[] = [{ id: "type", label: "Type names" }, { id: "excel", label: "Excel / CSV" }, { id: "qr", label: "QR code" }];
  return (
    <div className="space-y-6">
      {adding && <div>
        <div className="flex gap-1 rounded-xl bg-ground p-1" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className={`h-10 flex-1 rounded-lg text-[14px] font-bold transition ${tab === x.id ? "bg-surface text-ink shadow-[0_1px_3px_rgb(2_40_60/0.12)]" : "text-muted hover:text-ink"}`}>{x.label}</button>
          ))}
        </div>
        <div className="pt-5">
          {tab === "type" && <TypeIn id={t.id} onAdded={update} />}
          {tab === "excel" && <ImportFile id={t.id} onAdded={update} />}
          {tab === "qr" && <JoinLink t={t} joinKey={joinKey} onNew={setJoinKey} />}
        </div>
      </div>}

      <div>
        {error && <p className="mt-2 rounded-xl bg-danger-bg px-4 py-3 text-[14px] text-danger" role="alert">{error}</p>}
        {!rows && !error && <p className="text-[14px] text-muted">Loading the list…</p>}
        {rows && rows.length === 0 && <p className="text-[14.5px] text-muted">{adding ? "No one yet. Type names above, import a file, or share the QR code." : "No one yet. Add participants: type names, import a file, or share the QR code."}</p>}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
            <li className="flex items-center justify-between gap-3 bg-ground px-3.5 py-2">
              <span className="text-[13.5px] font-semibold text-ink-2">
                {att.on && att.days.length ? <>Attendance{att.days.length > 1 ? <span className="num font-normal text-muted"> · {att.days.map(dayShort).join(" · ")}</span> : ""}</> : "The list, in the order people were added"}
              </span>
              <button type="button" className={linkBtn} onClick={download}>Download</button>
            </li>
            {rows.map((r) => (
              <li key={r.th} className={`flex items-center gap-3 px-3.5 py-2.5 ${r.duplicate ? "bg-warn-bg" : "bg-surface"}`}>
                <span className="num w-14 shrink-0 text-[13px] font-semibold text-muted">{r.th}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{r.name}</span>
                  <span className="num block text-[13px] text-muted">{r.phone}{r.email ? ` · ${r.email}` : ""} · {SOURCE[r.source]}{r.duplicate && <b className="ml-1.5 font-bold text-warn">Same phone twice</b>}</span>
                </span>
                {/* A tick per training day (owner, 13 Nov): navy ink, live; the coordinator can tick a day that has come. */}
                {att.on && att.days.length > 0 && (
                  <span className="flex shrink-0 gap-1.5">
                    {att.days.map((d) => {
                      const here = r.present.includes(d);
                      const can = d <= today;
                      const name = `${r.name}, ${dayShort(d)}`;
                      return (
                        <button key={d} type="button" disabled={!can || busyTick === `${r.th}:${d}`} onClick={() => tick(r, d)} aria-pressed={here}
                          aria-label={here ? `${name}: present. Untick` : can ? `${name}: mark present` : `${name}: opens on the day`} title={att.days.length > 1 ? dayShort(d) : undefined}
                          className={`grid size-9 place-items-center rounded-full transition-none ${here ? "bg-navy text-white" : "text-transparent ring-2 ring-inset ring-line-strong hover:ring-navy/50"} disabled:cursor-default ${!can && !here ? "opacity-40" : ""}`}>
                          <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 10.5l3.2 3.2L15 6.8" /></svg>
                        </button>
                      );
                    })}
                  </span>
                )}
                {!r.present.length && <button type="button" className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold text-danger hover:bg-danger-bg" onClick={() => remove(r.th, r.name)}>Remove</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TypeIn({ id, onAdded }: { id: string; onAdded: (r: People) => void }) {
  const blank = { name: "", phone: "" };
  const [people, setPeople] = useState([blank, blank, blank]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const filled = people.filter((p) => p.name.trim() || p.phone.trim());
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await act<{ added?: number; already?: number } & People>({ action: "add", id, people: filled, source: "typed" });
    setBusy(false);
    if (!r.list) return setMsg(r.error ?? "Couldn't add them");
    onAdded(r);
    setPeople([blank, blank, blank]);
    setMsg(`${r.added} added${r.already ? `; ${r.already} already on the list (same mobile number)` : ""}.`);
  };
  return (
    <form onSubmit={save} className="space-y-2" noValidate>
      {people.map((p, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
          <input className={field} placeholder="Name" value={p.name} aria-label={`Person ${i + 1} name`} autoComplete="off" onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className={`${field} num`} placeholder="Mobile number" inputMode="tel" value={p.phone} aria-label={`Person ${i + 1} mobile`} autoComplete="off" onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button className={primaryBtn} disabled={busy || !filled.length}>{busy ? "Adding…" : filled.length > 1 ? `Add ${filled.length} people` : "Add to the list"}</button>
        <button type="button" className={linkBtn} onClick={() => setPeople([...people, blank, blank])}>+ More rows</button>
        {msg && <span className={`text-[14px] ${/added/.test(msg) ? "font-semibold text-ink-2" : "text-danger"}`} role="status">{msg}</span>}
      </div>
    </form>
  );
}

function ImportFile({ id, onAdded }: { id: string; onAdded: (r: People) => void }) {
  const [found, setFound] = useState<{ people: Person[]; skipped: Skipped[]; file: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dups = useMemo(() => (found ? duplicatePhones(found.people) : new Set<string>()), [found]);

  const read = async (f: File | undefined) => {
    if (!f) return;
    setMsg(""); setFound(null);
    try {
      let rows: string[][];
      if (/\.xlsx$/i.test(f.name)) rows = await (await import("@/lib/xlsxRead")).readXlsx(await f.arrayBuffer());
      else if (/\.(csv|txt)$/i.test(f.name)) rows = parseCsv(await f.text());
      else return setMsg("Use an Excel file (.xlsx) or a CSV. For an older .xls, save it as .xlsx first.");
      const r = peopleFromRows(rows);
      setFound({ ...r, file: f.name });
      if (!r.people.length) setMsg("We didn't find any names with a 10-digit mobile number in that file.");
    } catch { setMsg("We couldn't read that file. Save it as .xlsx or CSV and try again."); }
  };
  const save = async () => {
    if (!found) return;
    setBusy(true); setMsg("");
    const r = await act<{ added?: number; already?: number } & People>({ action: "add", id, people: found.people, source: "excel" });
    setBusy(false);
    if (!r.list) return setMsg(r.error ?? "Couldn't add them");
    onAdded(r);
    setFound(null);
    setMsg(`${r.added} added from the file${r.already ? `; ${r.already} already on the list (same mobile number)` : ""}.`);
  };
  return (
    <div className="space-y-3">
      <p className="text-[14.5px] leading-relaxed text-ink-2">Two columns are enough: name and mobile number. Header rows are skipped by themselves.</p>
      <label className={`${secondaryBtn} cursor-pointer`}>
        Choose a file
        <input type="file" accept=".xlsx,.csv,.txt" className="sr-only" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {found && found.people.length > 0 && (
        <div className="rounded-xl bg-ground p-4">
          <p className="text-[15px] font-bold text-ink">{found.people.length} to add{found.skipped.length ? `, ${found.skipped.length} skipped` : ""} <span className="font-medium text-muted">· {found.file}</span></p>
          {dups.size > 0 && <p className="mt-1 text-[13.5px] font-semibold text-warn">{dups.size} mobile number{dups.size > 1 ? "s appear" : " appears"} twice in the file; each person is added once.</p>}
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-[13.5px] text-ink-2">
            {found.people.slice(0, 200).map((p, i) => <li key={i} className="num">{p.name} · {p.phone}</li>)}
          </ul>
          {found.skipped.length > 0 && (
            <details className="mt-2 text-[13.5px] text-muted">
              <summary className="cursor-pointer font-semibold">Why {found.skipped.length} were skipped</summary>
              <ul className="mt-1 space-y-0.5">{found.skipped.slice(0, 50).map((s) => <li key={s.row}>Row {s.row}: {s.text || "(empty)"} — {s.why}</li>)}</ul>
            </details>
          )}
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button type="button" className={primaryBtn} disabled={busy} onClick={save}>{busy ? "Adding…" : `Add ${found.people.length} people`}</button>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setFound(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-[14px] ${/added/.test(msg) ? "font-semibold text-ink-2" : "text-danger"}`} role="status">{msg}</p>}
    </div>
  );
}

function JoinLink({ t, joinKey, onNew }: { t: ToolTraining; joinKey: string; onNew: (k: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = typeof window === "undefined" ? "" : `${location.origin}${portalPrefix(location.host)}/${encodeURIComponent(t.number)}/join?k=${joinKey}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("Copy this link:", link); } };
  const png = () => { const a = document.createElement("a"); a.href = qrPng(link, [t.title, `Scan to join · ${t.number}`]); a.download = `QR ${t.number}.png`; a.click(); };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Please register for the ${t.title} training: ${link}`)}`;
  const renew = async () => {
    if (!window.confirm("Make a new link? The old link and QR code will stop working, so share the new one.")) return;
    setBusy(true);
    const r = await act<{ joinKey?: string }>({ action: "newlink", id: t.id });
    setBusy(false);
    if (r.joinKey) onNew(r.joinKey); else window.alert(r.error ?? "Couldn't make a new link");
  };
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="mx-auto shrink-0 rounded-2xl p-2 ring-1 ring-line sm:mx-0"><Qr text={link} size={200} label={`QR code to join ${t.title}`} /></div>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-[14.5px] leading-relaxed text-ink-2">Your team scans this, types their name and mobile number, and they&apos;re on the list with their own TH number. One person per mobile number: joining twice lists them once.</p>
        <p className="break-all rounded-xl bg-ground px-3.5 py-2.5 font-mono text-[12.5px] text-ink-2">{link}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          <button type="button" className={secondaryBtn} onClick={png}>Download QR</button>
          <a className={secondaryBtn} href={whatsapp} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
        </div>
        <button type="button" className={`${linkBtn} !text-muted`} onClick={renew} disabled={busy}>{busy ? "Making a new link…" : "Make a new link (the old one stops working)"}</button>
      </div>
    </div>
  );
}

/**
 * The fixed attendance QR (owner, 13 Nov): printable and shown in advance; it works on the training's days only. A new QR
 * stops the old one (a forwarded copy, a lost printout). `big`: the training-day layout, where it leads the panel.
 */
export function AttendQr({ id, number, title, attendKey, onNew, big = false }: { id: string; number: string; title: string; attendKey: string; onNew: (k: string) => void; big?: boolean }) {
  const [busy, setBusy] = useState(false);
  const link = typeof window === "undefined" ? "" : `${location.origin}${portalPrefix(location.host)}/${encodeURIComponent(number)}/attend?k=${attendKey}`;
  const caption = [title, `Scan to mark your attendance · ${number}`];
  const png = () => { const a = document.createElement("a"); a.href = qrPng(link, caption); a.download = `Attendance QR ${number}.png`; a.click(); };
  const print = () => {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return png(); // pop-ups blocked: the PNG instead
    w.document.write(`<!doctype html><title>Attendance QR ${number}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh}img{width:min(90vw,640px)}</style><img src="${qrPng(link, caption)}" alt="">`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };
  const renew = async () => {
    if (!window.confirm("Make a new attendance QR? The old one, and any printout of it, will stop working.")) return;
    setBusy(true);
    const r = await act<{ attendKey?: string }>({ action: "newattend", id });
    setBusy(false);
    if (r.attendKey) onNew(r.attendKey); else window.alert(r.error ?? "Couldn't make a new QR");
  };
  return (
    <div className={big ? "flex flex-col items-center gap-4" : "flex flex-col items-center gap-3 sm:items-start"}>
      <div className="rounded-2xl p-2 ring-1 ring-line"><Qr text={link} size={big ? 260 : 168} label={`Attendance QR for ${title}`} /></div>
      <div className={`flex flex-wrap gap-x-4 gap-y-1.5 ${big ? "justify-center" : ""}`}>
        <button type="button" className={linkBtn} onClick={print}>Print</button>
        <button type="button" className={linkBtn} onClick={png}>Download</button>
        <button type="button" className={`${linkBtn} !text-muted`} onClick={renew} disabled={busy}>{busy ? "Making a new QR…" : "New QR"}</button>
      </div>
    </div>
  );
}

/** Decline the quotation (owner, 12 Nov): an optional reason; final for the coordinator (we can reopen it). */
export function RejectForm({ id, onDone, onCancel }: { id: string; onDone: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await act<{ ok?: boolean }>({ action: "reject", id, reason });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Couldn't send it");
    onDone(reason.trim());
  };
  return (
    <form onSubmit={send} className="space-y-4" noValidate>
      <label className="block">
        <span className={label}>Tell us why <span className="font-normal text-muted">(optional)</span></span>
        <textarea className={`${field} !h-auto min-h-[96px] py-3 leading-relaxed`} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <p className="text-[14px] text-muted">Once declined, it can&apos;t be accepted here; write to learn@thinkhealth.in if you change your mind.</p>
      {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-[14px] text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2.5">
        <button className="inline-flex h-11 items-center justify-center rounded-xl bg-danger px-5 text-[15px] font-bold text-white transition hover:brightness-110 disabled:opacity-50" disabled={busy}>{busy ? "Sending…" : "Decline the quotation"}</button>
        <button type="button" className={secondaryBtn} onClick={onCancel} disabled={busy}>Keep it open</button>
      </div>
    </form>
  );
}
