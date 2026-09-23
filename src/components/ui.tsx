"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Priority } from "@/lib/types";
import { PRIORITY_CLASSES, PRIORITY_META } from "@/lib/priority";

/** Priority = coloured glyph (the mark) + label in text ink. Never colour-only. */
export function PriorityBadge({ p, compact = false }: { p: Priority; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-2">
      <span aria-hidden className={`text-[10px] leading-none ${PRIORITY_CLASSES[p].text}`}>{PRIORITY_META[p].glyph}</span>
      {compact ? PRIORITY_META[p].short : PRIORITY_META[p].label}
      <span className="sr-only"> priority</span>
    </span>
  );
}

export function PriorityDot({ p, pulse = false, className = "" }: { p: Priority; pulse?: boolean; className?: string }) {
  return <span aria-hidden className={`inline-block size-1.5 shrink-0 rounded-full ${PRIORITY_CLASSES[p].dot} ${pulse ? "pulse-dot" : ""} ${className}`} />;
}

/** Required priority picker: no default, so the user must choose. */
export function PriorityPicker({ value, onChange }: { value: Priority | null; onChange: (p: Priority) => void }) {
  return (
    <div role="radiogroup" aria-label="Priority" className="grid grid-cols-3 gap-2">
      {(["high", "medium", "low"] as Priority[]).map((p) => {
        const c = PRIORITY_CLASSES[p];
        const on = value === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p)}
            className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-[13px] font-medium transition ${
              on ? `${c.border} ${c.bg} text-ink` : "border-line text-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            <span aria-hidden className={`size-2 rounded-full ${c.dot}`} />
            {p === "low" ? "Low" : PRIORITY_META[p].label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-0 backdrop-blur-md sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={`modal-in max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] bg-surface shadow-pop sm:rounded-[22px] ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pb-1 pt-5">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <path d="M5 5l10 10M15 5L5 15" />
          </IconButton>
        </div>
        <div className="px-6 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-faint transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

export const selectCls =
  "h-9 rounded-full border border-line bg-surface pl-3.5 pr-8 text-[13px] text-ink-2 transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

export const btn = {
  primary: "press inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-brand px-4 text-[13px] font-semibold text-brand-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-110 disabled:opacity-40 disabled:active:scale-100",
  ghost: "press inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13px] font-medium text-ink hover:bg-line",
  quiet: "press inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-ink",
  danger: "press inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-high hover:bg-high-bg",
};

export function IconButton({ label, onClick, children, className = "" }: { label: string; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`press grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink ${className}`}>
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "sm" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full font-medium transition-all duration-200 ${size === "sm" ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-[13px]"} ${
            value === o.value ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2 ring-1 ring-line" aria-hidden>
      {initials}
    </span>
  );
}

export function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Animates a number from its previous value (count-up). */
export function useCountUp(target: number, ms = 800) {
  const [v, setV] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const f0 = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(f0 + (target - f0) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

/**
 * Searchable dropdown. Shows every option when opened (the browser's <datalist> only shows
 * options matching the current value, which made prefilled fields look broken).
 * Rendered in a portal so modals with overflow never clip it.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = true,
  customLabel = "Use",
  noun = "options",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  allowCustom?: boolean;
  customLabel?: string;
  noun?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null = not typing: show everything
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const MAX = 60;

  const matches = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    const all = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    // Prefix matches first.
    return q ? [...all.filter((o) => o.toLowerCase().startsWith(q)), ...all.filter((o) => !o.toLowerCase().startsWith(q))] : all;
  }, [options, query]);

  const typed = (query ?? "").trim();
  const showCustom = allowCustom && typed.length > 0 && !options.some((o) => o.toLowerCase() === typed.toLowerCase());
  // Real matches first; "Add …" goes last so Enter picks an existing record.
  const items = [...matches.slice(0, MAX).map((label) => ({ custom: false, label })), ...(showCustom ? [{ custom: true, label: typed }] : [])];

  const place = useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    setRect({ left: r.left, top: below < 260 && r.top > below ? r.top : r.bottom, width: r.width, up: below < 260 && r.top > below });
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

  const openList = () => {
    setQuery(null);
    const i = options.indexOf(value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  };

  const close = (commit: boolean) => {
    if (commit && allowCustom && query !== null && typed) onChange(options.find((o) => o.toLowerCase() === typed.toLowerCase()) ?? typed);
    setOpen(false);
    setQuery(null);
  };

  const pick = (label: string) => {
    onChange(label);
    setOpen(false);
    setQuery(null);
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!inputRef.current?.parentElement?.contains(t) && !listRef.current?.contains(t)) close(true);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  // Keep the active option in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      setActive((a) => Math.max(0, Math.min(items.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      const it = items[active];
      if (it) pick(it.label);
      else close(true);
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation(); // don't close the surrounding modal
        e.nativeEvent.stopImmediatePropagation();
        setOpen(false);
        setQuery(null);
      }
    } else if (e.key === "Tab") {
      if (open) close(true);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        className={`${inputCls} pr-9`}
        value={query ?? value}
        placeholder={placeholder}
        onFocus={() => !open && openList()}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close list" : "Open list"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close(true) : (inputRef.current?.focus(), openList()))}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className={`size-4 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8l4 4 4-4" /></svg>
      </button>
      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="fixed z-[80] max-h-64 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
            style={{ left: rect.left, width: rect.width, ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }) }}
          >
            {items.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No {noun} found</li>}
            {items.map((it, i) => (
              <li
                key={`${it.custom ? "c:" : ""}${it.label}`}
                data-idx={i}
                role="option"
                aria-selected={!it.custom && it.label === value}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(it.label)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13.5px] ${i === active ? "bg-surface-2 text-ink" : "text-ink-2"}`}
              >
                <span className="truncate">{it.custom ? <>{customLabel} “<b className="font-medium text-ink">{it.label}</b>”</> : it.label}</span>
                {!it.custom && it.label === value && (
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
                )}
              </li>
            ))}
            {matches.length > MAX && (
              <li className="px-2.5 py-1.5 text-xs text-faint">Showing {MAX} of {matches.length} — type to narrow down</li>
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
