"use client";

import { CATEGORIES, type Category, type PtRequest, isEscalated } from "@/lib/progress/model";
import { personColour } from "../Calendar";

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** A member's initials in their calendar colour [S9]; `badge` = requests waiting on them (red when any is pressing) [S15]. */
export function PersonAvatar({ name, size = 36, badge, severe, dim }: { name: string; size?: number; badge?: number; severe?: boolean; dim?: boolean }) {
  const c = personColour(name);
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white" aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: c, opacity: dim ? 0.55 : 1 }}>
      {initials(name)}
      {badge ? (
        <span className={`absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold leading-none ring-2 ring-surface ${severe ? "bg-high text-white" : "bg-ink text-surface"}`}>{badge}</span>
      ) : null}
    </span>
  );
}

const ICON: Record<Category, React.ReactNode> = {
  input: <path d="M10 13.5v.01M10 6.5a2 2 0 0 1 1.2 3.6c-.7.5-1.2 1-1.2 1.9" />,
  review: <><path d="M3.5 10s2.4-4.5 6.5-4.5 6.5 4.5 6.5 4.5-2.4 4.5-6.5 4.5S3.5 10 3.5 10Z" /><circle cx="10" cy="10" r="1.8" /></>,
  handoff: <path d="M4 7.5h10.5M12 5l2.5 2.5L12 10M16 12.5H5.5M8 10l-2.5 2.5L8 15" />,
  critical: <><path d="M10 3.5 17 16H3l7-12.5Z" /><path d="M10 8.5v3.2M10 13.8v.01" /></>,
};
export function CategoryIcon({ c, className = "size-4" }: { c: Category; className?: string }) {
  return <svg viewBox="0 0 20 20" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICON[c]}</svg>;
}

/** "⚠ Critical Blocker" chip in the category's colour (always with its words — colour never says it alone). */
export function CategoryChip({ c, short }: { c: Category; short?: boolean }) {
  const k = CATEGORIES[c];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${k.tone}`}>
      <CategoryIcon c={c} className="size-3.5" />
      {short ? k.short : k.label}
    </span>
  );
}

export const UrgentPill = () => <span className="shrink-0 rounded-full bg-high px-2 py-px text-[11px] font-bold uppercase tracking-wide text-white">Urgent</span>;

/** A request row's border, like the boards' cards: red + tint when escalated (open > 24 h) or critical [S18], amber when urgent. */
export const edgeOf = (r: PtRequest, now: Date) => (r.status !== "open" ? "border-line bg-surface" : r.category === "critical" || isEscalated(r, now) ? "border-high/50 bg-high-bg" : r.priority === "urgent" ? "border-medium/50 bg-surface" : "border-line bg-surface");

/** Where a request's task opens: the card on its own board (the board switches to it). */
export function taskHref(r: PtRequest): string | undefined {
  return r.task.cardId ? `/follow-up?open=${encodeURIComponent(r.task.cardId)}` : undefined;
}
