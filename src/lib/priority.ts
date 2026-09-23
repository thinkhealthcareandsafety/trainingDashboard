import type { Priority } from "./types";

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const PRIORITY_META: Record<Priority, { label: string; short: string; glyph: string }> = {
  high: { label: "High", short: "High", glyph: "▲" },
  medium: { label: "Medium", short: "Med", glyph: "◆" },
  low: { label: "Low", short: "Low", glyph: "●" },
};

export function highestPriority(ps: Priority[]): Priority | null {
  if (ps.length === 0) return null;
  return ps.reduce((a, b) => (PRIORITY_RANK[b] < PRIORITY_RANK[a] ? b : a));
}

// Tailwind class sets per priority (tokens defined in globals.css).
export const PRIORITY_CLASSES: Record<Priority, { text: string; bg: string; dot: string; border: string }> = {
  high: { text: "text-high", bg: "bg-high-bg", dot: "bg-high", border: "border-high" },
  medium: { text: "text-medium", bg: "bg-medium-bg", dot: "bg-medium", border: "border-medium" },
  low: { text: "text-low", bg: "bg-low-bg", dot: "bg-low", border: "border-low" },
};
