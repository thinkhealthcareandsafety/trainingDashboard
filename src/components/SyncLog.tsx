"use client";

import { useCallback, useEffect, useState } from "react";
import { ZOHO_SYNCED } from "@/lib/store";
import { Modal } from "./ui";

/*
 * "Sync log" window (sidebar): one row per scheduled hour (9 am–7 pm IST, Mon–Sat) for a chosen day — did a sync
 * run for that hour, how late, who or what started it, and what it brought in from Zoho. Scheduler calls that found
 * nothing due are listed under their hour, so it's visible whether GitHub / Vercel are actually calling.
 */

type DocChange = { kind: "estimates" | "salesorders" | "invoices"; number: string; customer: string; action: "new" | "updated" | "removed" };
type Entry = {
  at: string;
  ms?: number;
  trigger: "heartbeat" | "scheduler" | "page" | "manual" | "first";
  source?: string;
  by?: string;
  result: "ok" | "failed" | "paused" | "not due" | "busy";
  mode?: "full" | "quick";
  error?: string;
  calls?: number;
  docs?: DocChange[];
  payments?: string[];
  customers?: string[];
  customersRemoved?: number;
};
type Log = { enabled?: boolean; day: string; entries: Entry[]; calls: number; logSince?: string; hours: number[]; fullHours: number[] };

const IST_MS = 330 * 60_000;
const ON_TIME_MS = 10 * 60_000; // a sync within 10 minutes of the hour counts as on time
const todayIst = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** UTC ms of an IST wall-clock hour on `day`. */
const istHour = (day: string, h: number) => Date.parse(`${day}T00:00:00Z`) - IST_MS + h * 3_600_000;
const time = (t: number | string) => new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const timeSec = (t: number | string) => new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", second: "2-digit" });
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
const dayLabel = (day: string) =>
  new Date(Date.parse(`${day}T12:00:00Z`)).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const mins = (ms: number) => (ms < 90 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const KIND: Record<DocChange["kind"], string> = { estimates: "Quotation", salesorders: "PI", invoices: "Invoice" };

function whoLabel(e: Entry): string {
  switch (e.trigger) {
    case "heartbeat": return e.by ? `Open page · ${e.by}` : "Open page";
    case "scheduler": return e.source ?? "Scheduler";
    case "manual": return e.by ? `Sync now · ${e.by}` : "Sync now";
    case "first": return "First sync";
    default: return "Page load";
  }
}
const isSync = (e: Entry) => e.result === "ok" || e.result === "failed" || e.result === "paused";
const changeCount = (e: Entry) => (e.docs?.length ?? 0) + (e.payments?.length ?? 0) + (e.customers?.length ?? 0) + (e.customersRemoved ?? 0);
function changeSummary(e: Entry): string {
  const parts = [
    e.docs?.length ? plural(e.docs.length, "document") : "",
    e.payments?.length ? plural(e.payments.length, "payment update") : "",
    e.customers?.length ? plural(e.customers.length, "customer") : "",
    e.customersRemoved ? `${e.customersRemoved} customer${e.customersRemoved === 1 ? "" : "s"} removed` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No changes";
}

type Tone = "ok" | "late" | "bad" | "wait" | "none";
const TONE: Record<Tone, string> = {
  ok: "bg-low-bg text-low",
  late: "bg-medium-bg text-medium",
  bad: "bg-high-bg text-high",
  wait: "bg-surface-2 text-muted",
  none: "bg-surface-2 text-faint",
};
const Pill = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <span className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-semibold ${TONE[tone]}`}>{children}</span>
);

/** One sync run: time, what started it, result, and (click) what it pulled. */
function RunLine({ e, main }: { e: Entry; main?: boolean }) {
  const [open, setOpen] = useState(false);
  const n = changeCount(e);
  const failed = e.result !== "ok";
  return (
    <div className={main ? "" : "mt-0.5"}>
      <button
        type="button"
        disabled={!n && !failed}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full min-w-0 items-baseline gap-1.5 text-left ${main ? "text-[12.5px] text-ink-2" : "text-[12px] text-muted"} ${n || failed ? "hover:text-ink" : ""}`}
        title={`Started ${timeSec(e.at)}${e.ms ? ` · took ${Math.max(1, Math.round(e.ms / 1000))} s` : ""}`}
      >
        <span className="num shrink-0 font-medium">{time(e.at)}</span>
        <span className="min-w-0 truncate">
          {whoLabel(e)}
          {e.mode && <> · {e.mode === "full" ? "Full check" : "Quick check"}</>}
          {e.calls !== undefined && <> · {plural(e.calls, "call")}</>}
          {" · "}
          {e.result === "failed" ? <span className="text-high">Failed</span> : e.result === "paused" ? <span className="text-high">Paused (daily Zoho limit)</span> : <span className={n ? "font-medium text-ink" : ""}>{changeSummary(e)}</span>}
        </span>
        {(n > 0 || failed) && <span aria-hidden className={`shrink-0 text-faint transition ${open ? "rotate-90" : ""}`}>›</span>}
      </button>
      {open && (
        <div className="mb-1 mt-1 space-y-1 rounded-lg bg-surface-2 px-2.5 py-2 text-[12px] leading-snug text-ink-2">
          {e.error && <div className="text-high">{e.error}</div>}
          {e.docs?.map((d, i) => (
            <div key={i} className="break-words">
              <span className="text-faint">{KIND[d.kind]}</span> <span className="font-medium">{d.number}</span> · {d.customer}{" "}
              <span className={d.action === "removed" ? "text-high" : d.action === "new" ? "text-low" : "text-faint"}>{d.action}</span>
            </div>
          ))}
          {e.payments?.length ? <div><span className="text-faint">Payments re-read for</span> {e.payments.join(", ")}</div> : null}
          {e.customers?.length ? <div><span className="text-faint">Customers new/changed:</span> {e.customers.join(", ")}</div> : null}
          {e.customersRemoved ? <div><span className="text-faint">Customers no longer active:</span> {e.customersRemoved}</div> : null}
        </div>
      )}
    </div>
  );
}

function HourRow({ log, h, next }: { log: Log; h: number; next?: number }) {
  const start = istHour(log.day, h);
  const end = next !== undefined ? istHour(log.day, next) : istHour(log.day, 24);
  const inHour = log.entries.filter((e) => { const t = Date.parse(e.at); return t >= start && t < end; });
  const runs = inHour.filter(isSync);
  const checks = inHour.filter((e) => !isSync(e));
  const covered = runs.find((e) => e.result === "ok");
  const now = Date.now();
  const logStart = log.logSince ? Date.parse(log.logSince) : Infinity;
  let pill: React.ReactNode;
  if (covered) {
    const late = Date.parse(covered.at) - start;
    pill = late <= ON_TIME_MS ? <Pill tone="ok">On time</Pill> : <Pill tone="late">Late · {mins(late)}</Pill>;
  } else if (now < start) pill = <Pill tone="none">Upcoming</Pill>;
  else if (end <= logStart) pill = <Pill tone="none">Not logged</Pill>;
  else if (now < end) pill = runs.length ? <Pill tone="bad">Failed · retrying</Pill> : <Pill tone="wait">Waiting</Pill>;
  else pill = <Pill tone="bad">{runs.length ? "Failed" : "Missed"}</Pill>;
  return (
    <li className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-x-2 border-t border-line py-[7px] first:border-t-0 sm:grid-cols-[54px_118px_minmax(0,1fr)]">
      <span className="num pt-[3px] text-[12.5px] font-semibold text-ink">
        {hourLabel(h)}
        {log.fullHours.includes(h) && <span className="block text-[10.5px] font-medium text-faint">full check</span>}
      </span>
      <span className="pt-px">{pill}</span>
      <div className={`col-start-2 min-w-0 pt-[3px] sm:col-start-3 sm:row-start-1 ${inHour.length ? "" : "hidden sm:block"}`}>
        {runs.length === 0 && <span className="text-[12px] text-faint">{now < start ? "—" : "No sync ran in this hour"}</span>}
        {runs.map((e, i) => <RunLine key={e.at + i} e={e} main={e === covered || (!covered && i === 0)} />)}
        {checks.length > 0 && (
          <div className="mt-0.5 truncate text-[11.5px] text-faint" title={checks.map((c) => `${timeSec(c.at)} ${whoLabel(c)} — ${c.result}`).join("\n")}>
            {checks.map((c) => `${whoLabel(c)} ${time(c.at)} (${c.result})`).join(" · ")}
          </div>
        )}
      </div>
    </li>
  );
}

export function SyncLogWindow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [day, setDay] = useState(todayIst);
  const [log, setLog] = useState<Log | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/zoho/sync-log?day=${d}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLog(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    load(day);
    const again = () => load(day);
    window.addEventListener(ZOHO_SYNCED, again);
    const t = setInterval(again, 60_000);
    return () => {
      window.removeEventListener(ZOHO_SYNCED, again);
      clearInterval(t);
    };
  }, [open, day, load]);

  const today = todayIst();
  const shown = log?.day === day ? log : null;
  const sunday = new Date(Date.parse(`${day}T12:00:00Z`)).getUTCDay() === 0;
  const firstDay = shown?.logSince ? new Date(Date.parse(shown.logSince) + IST_MS).toISOString().slice(0, 10) : today;
  const hours = shown?.hours ?? [];
  const before = shown ? shown.entries.filter((e) => Date.parse(e.at) < istHour(day, hours[0] ?? 9)) : [];
  const passed = hours.filter((h) => istHour(day, h) <= Date.now());
  const synced = shown ? passed.filter((h) => {
    const s = istHour(day, h), e = istHour(day, hours[hours.indexOf(h) + 1] ?? 24);
    return shown.entries.some((x) => x.result === "ok" && Date.parse(x.at) >= s && Date.parse(x.at) < e);
  }).length : 0;
  const navBtn = "press grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <Modal open={open} onClose={onClose} title="Sync log" wide>
      <div className="-mt-1 mb-2 flex items-center gap-1">
        <button className={navBtn} aria-label="Previous day" disabled={day <= firstDay} onClick={() => setDay(shiftDay(day, -1))}>◀</button>
        <span className="min-w-[150px] text-center text-[13.5px] font-semibold text-ink">{day === today ? "Today" : dayLabel(day)}</span>
        <button className={navBtn} aria-label="Next day" disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))}>▶</button>
        <span className="ml-auto text-right text-[12px] leading-snug text-muted">
          {shown && !sunday && <>{synced} of {plural(passed.length, "hour")} synced<br /></>}
          {shown && <>{plural(shown.calls, "Zoho call")} this day</>}
        </span>
      </div>
      {error && <p className="text-[13px] text-high">Couldn&apos;t load the sync log: {error}</p>}
      {!shown && !error && <p className="py-6 text-center text-[13px] text-muted">Loading…</p>}
      {shown && (
        <>
          {day < firstDay && <p className="py-2 text-[13px] text-muted">The sync log starts on {dayLabel(firstDay)}.</p>}
          {before.length > 0 && (
            <div className="mb-1 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <div className="text-[11.5px] font-semibold text-faint">Before {hourLabel(hours[0] ?? 9)}</div>
              {before.filter(isSync).map((e, i) => <RunLine key={e.at + i} e={e} />)}
              {before.filter((e) => !isSync(e)).length > 0 && (
                <div className="truncate text-[11.5px] text-faint">{before.filter((e) => !isSync(e)).map((c) => `${whoLabel(c)} ${time(c.at)} (${c.result})`).join(" · ")}</div>
              )}
            </div>
          )}
          {sunday ? (
            <>
              <p className="py-2 text-[13px] text-muted">No automatic syncs on Sunday.</p>
              {shown.entries.filter((e) => !before.includes(e)).map((e, i) => <RunLine key={e.at + i} e={e} />)}
            </>
          ) : (
            <ul>{hours.map((h, i) => <HourRow key={h} log={shown} h={h} next={hours[i + 1]} />)}</ul>
          )}
          <p className="mt-2 border-t border-line pt-2 text-[11.5px] leading-snug text-faint">
            On time = synced within 10 minutes of the hour. Open page = someone had the dashboard open; GitHub Actions / Vercel cron
            run it when nobody does. Click a sync to see what it pulled from Zoho. Kept for 90 days.
          </p>
        </>
      )}
    </Modal>
  );
}
