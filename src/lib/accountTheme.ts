/*
 * The chosen theme, saved to the person's account (owner, 24 Nov) as well as this browser: /api/ui-prefs key `theme`.
 * The browser's copy (th.theme / th.bg) stays, so the theme shows before the first paint; th.themeBy says whose it is, so
 * on a shared computer nobody is given the last person's theme.
 */
export type ThemeMode = "light" | "dark";
export type ThemePick = { mode: ThemeMode; id: string };

/** A theme: light or dark, and an id ("" = plain; the dark ones start with "dark-"). */
export function goodTheme(v: unknown): v is ThemePick {
  const t = v as Partial<ThemePick> | null;
  if (!t || (t.mode !== "light" && t.mode !== "dark") || typeof t.id !== "string") return false;
  return t.id === "" || (/^(dark-)?[a-z]{2,30}$/.test(t.id) && t.id.startsWith("dark-") === (t.mode === "dark"));
}

/** Signing in: what to do with the account's theme and this browser's. */
export function themeOnSignIn(account: unknown, browser: ThemePick | null, browserOwner: string | null, me: string): { do: "apply" | "save"; theme: ThemePick } | { do: "clear" | "nothing" } {
  if (goodTheme(account)) return { do: "apply", theme: account };
  if (!browser) return { do: "nothing" };
  // Nothing on the account yet: this browser's theme becomes theirs (picked before 24 Nov, or by them), unless it's someone else's.
  return !browserOwner || browserOwner === me ? { do: "save", theme: browser } : { do: "clear" };
}

/* ---------------- Browser side ---------------- */

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
let picks = 0; // a pick made while the account's theme is still loading wins

function browserTheme(): ThemePick | null {
  const t = { mode: read("th.theme"), id: read("th.bg") ?? "" };
  return goodTheme(t) ? t : null;
}

/** Show it and remember it in this browser. Null = back to the default. */
function show(t: ThemePick | null, owner: string | null) {
  const root = document.documentElement;
  if (t) root.dataset.theme = t.mode; else delete root.dataset.theme;
  if (t?.id) root.dataset.bg = t.id; else delete root.dataset.bg;
  try {
    if (t) localStorage.setItem("th.theme", t.mode); else localStorage.removeItem("th.theme");
    if (t?.id) localStorage.setItem("th.bg", t.id); else localStorage.removeItem("th.bg");
    if (owner) localStorage.setItem("th.themeBy", owner); else localStorage.removeItem("th.themeBy");
  } catch {}
}

const save = (t: ThemePick) =>
  fetch("/api/ui-prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "theme", value: t }) })
    .then((r) => r.ok)
    .catch(() => false);

/** Change theme. True once it's on the account (false: this browser only). */
export function pickTheme(t: ThemePick, me: string): Promise<boolean> {
  picks++;
  show(t, me);
  return save(t);
}

/** After signing in (or opening the site signed in). */
export async function loadAccountTheme(me: string): Promise<void> {
  const before = picks;
  const j = (await fetch("/api/ui-prefs").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { prefs?: { theme?: unknown } } | null;
  if (!j?.prefs || picks !== before) return; // couldn't ask, or picked meanwhile: what's showing stands
  const r = themeOnSignIn(j.prefs.theme, browserTheme(), read("th.themeBy"), me);
  if (r.do === "apply") show(r.theme, me);
  else if (r.do === "clear") show(null, null);
  else if (r.do === "save") {
    show(r.theme, me);
    void save(r.theme);
  }
}
