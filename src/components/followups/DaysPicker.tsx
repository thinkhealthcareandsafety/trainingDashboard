"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { daysValue, fmtDays } from "@/lib/pipeline";
import { fmtDate } from "@/lib/dates";
import { btn } from "../ui";

const pad = (n: number) => String(n).padStart(2, "0");
const todayYmd = () => new Date().toLocaleDateString("en-CA");
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const nextDay = (ymd: string) => new Date(Date.parse(ymd) + 86_400_000).toISOString().slice(0, 10);
/** Every day from a to b, either order, inclusive. */
function between(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) out.push(d);
  return out;
}

const POP_W = 296;
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Training days: click days to pick them one by one (any days, not just in a row); drag across days — or click one,
 * then Shift-click another — to pick everything in between. Clicking a picked day takes it off again.
 * The calendar floats over the modal, so the modal never grows a scrollbar.
 */
export function DaysPicker({ value, onChange, min, label, autoOpen }: { value: string[]; onChange: (days: string[]) => void; min?: string; label: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [month, setMonth] = useState(() => (value[0] ?? todayYmd()).slice(0, 7));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ anchor: string; add: boolean; base: Set<string> } | null>(null);
  const last = useRef<string | null>(null);
  const allowed = useCallback((d: string) => !min || d >= min, [min]);

  // Below the button, or above it when there's no room; always inside the window.
  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const h = popRef.current?.offsetHeight ?? 360;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - 6 - h);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8));
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Outside click or Escape closes the calendar only (not the card modal underneath).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!popRef.current?.contains(n) && !triggerRef.current?.contains(n)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onUp = () => { drag.current = null; };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [open]);

  const set = (days: Iterable<string>) => onChange(daysValue([...days]).split(",").filter(Boolean));
  const toggle = (d: string) => {
    const next = new Set(value);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    last.current = d;
    set(next);
  };
  const dragTo = (d: string) => {
    const g = drag.current;
    if (!g) return;
    const next = new Set(g.base);
    for (const x of between(g.anchor, d)) if (allowed(x)) (g.add ? next.add(x) : next.delete(x));
    last.current = d;
    set(next);
  };
  const onDayDown = (d: string, e: React.PointerEvent) => {
    if (!allowed(d) || e.button !== 0) return;
    e.preventDefault();
    if (e.shiftKey && last.current) {
      const next = new Set(value);
      for (const x of between(last.current, d)) if (allowed(x)) next.add(x);
      last.current = d;
      return set(next);
    }
    drag.current = { anchor: d, add: !value.includes(d), base: new Set(value) };
    dragTo(d);
  };
  const onGridMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-day]");
    if (el?.dataset.day) dragTo(el.dataset.day);
  };

  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const count = new Date(y, m, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)];
  const today = todayYmd();
  const picked = new Set(value);
  const summary = value.length ? fmtDays(daysValue(value)) : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        title={summary || undefined}
        className={`inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-[10px] border bg-surface px-3 text-left text-[13px] transition hover:border-line-strong ${open ? "border-brand ring-4 ring-brand/15" : "border-line"}`}
      >
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></svg>
        {summary ? (
          <span className="min-w-0 truncate font-semibold text-ink">
            {summary}
            {value.length > 1 && <span className="ml-1.5 font-medium text-muted">· {value.length} days</span>}
          </span>
        ) : (
          <span className="text-faint">Select dates</span>
        )}
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={label}
          className="fade-in fixed z-[80] rounded-2xl border border-line bg-surface p-3 shadow-pop"
          style={{ width: POP_W, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2" onClick={() => setMonth((v) => shiftMonth(v, -1))} aria-label="Previous month">
              <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor" aria-hidden><path d="M7.5 1 2 5l5.5 4z" /></svg>
            </button>
            <span className="text-[13.5px] font-semibold text-ink">{fmtDate(`${month}-01`, { month: "long", year: "numeric" })}</span>
            <button type="button" className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2" onClick={() => setMonth((v) => shiftMonth(v, 1))} aria-label="Next month">
              <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor" aria-hidden><path d="M2.5 1 8 5 2.5 9z" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-faint">
            {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
          </div>
          <div className="grid touch-none select-none grid-cols-7 gap-0.5" onPointerMove={onGridMove}>
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const on = picked.has(d);
              const ok = allowed(d);
              return (
                <button
                  key={d}
                  type="button"
                  data-day={d}
                  disabled={!ok}
                  aria-pressed={on}
                  aria-label={fmtDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  onPointerDown={(e) => onDayDown(d, e)}
                  onClick={(e) => { if (e.detail === 0) toggle(d); }} // keyboard (Enter / Space)
                  className={`num h-8 rounded-lg text-[13px] transition ${on ? "bg-brand font-semibold text-brand-ink" : ok ? "text-ink hover:bg-surface-2" : "cursor-not-allowed text-faint/60"} ${d === today && !on ? "ring-1 ring-inset ring-brand" : ""}`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-muted">Click days to pick them · drag across days (or Shift-click) for a range · click a picked day to remove it.</p>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-[12.5px] text-ink-2">{value.length ? `${value.length} day${value.length === 1 ? "" : "s"} picked` : "No days picked"}</span>
            <span className="flex items-center gap-1">
              {value.length > 0 && <button type="button" className={`${btn.quiet} !h-7 !px-2.5`} onClick={() => onChange([])}>Clear</button>}
              <button type="button" className={`${btn.primary} !h-7 !px-3`} onClick={() => setOpen(false)}>Done</button>
            </span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
