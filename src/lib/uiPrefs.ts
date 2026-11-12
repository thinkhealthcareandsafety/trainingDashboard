/*
 * Each member's own page settings (owner, 12 Nov: "whatever I did, keep it as default setting for the user"), kept in
 * Mongo `uiPrefs` (one doc per member). Only the keys below (no dots: Mongo reads a dot as a nested field), each checked. Pure.
 */

export const TRAINING_SORT_KEYS = ["customer", "quote", "training", "expected", "total", "status"] as const;
export type TrainingSortKey = (typeof TRAINING_SORT_KEYS)[number];
export type TrainingSort = { key: TrainingSortKey; dir: "asc" | "desc" } | null;

type Check = (v: unknown) => { ok: true; value: unknown } | { ok: false };
export const UI_PREFS: Record<string, Check> = {
  // The Trainings page's column sort; null = the default order (accepted first, then newest).
  trainingsSort: (v) => {
    if (v === null) return { ok: true, value: null };
    const s = v as { key?: unknown; dir?: unknown };
    return TRAINING_SORT_KEYS.includes(s?.key as TrainingSortKey) && (s.dir === "asc" || s.dir === "desc") ? { ok: true, value: { key: s.key, dir: s.dir } } : { ok: false };
  },
};
