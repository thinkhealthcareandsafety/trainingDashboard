import { type Page, canConvertInvoices, canSee, hasFollowUps, homeOf } from "./roles";

/*
 * The apps home page (owner, 23 Nov: "like Chrome's main page — they log in, they see the applications; first our
 * ThinkHealth dashboard, other colleagues will add their own applications there, one click and it opens"). Look C,
 * "Signboard". Pure: who sees which app, the search, and the personal shortcuts' rules (the API keeps them).
 *
 * A colleague's new application: build it in this project under its own route, then add it to APPS below with who
 * may see it. It shows as a tile for those people at once.
 */

type Who = { id: string; name: string };
export type AppIcon = "dashboard" | "trainings" | "converter" | "sheet";
export type AppTile = {
  id: string; name: string; about: string; href: string; icon: AppIcon;
  /** The sign's colour (DESIGN.md sign grammar, white pictogram). */
  color: string;
  /** The main app: drawn wide, with an Open button. */
  main?: boolean;
};

const APPS: (Omit<AppTile, "href"> & { href: string | ((m: Who) => string); show: (m: Who) => boolean })[] = [
  { id: "dashboard", name: "ThinkHealth Dashboard", about: "Sales, quotations, trainings, follow-ups, calendar, sprints and reports.", href: (m) => homeOf(m), icon: "dashboard", color: "#034f72", main: true, show: () => true },
  { id: "trainings", name: "Training Manager", about: "Training quotations and the clients' training portal.", href: "/training-management", icon: "trainings", color: "#00843d", show: (m) => canSee(m, "trainings") },
  { id: "converter", name: "Invoice Converter", about: "Purchase orders and e-way bills on invoices.", href: "/reports/invoice-converter", icon: "converter", color: "#005387", show: (m) => canConvertInvoices(m) },
  { id: "sheet", name: "Sheet → Quotation", about: "Customer item sheets into Zoho draft quotations.", href: "/reports/sheet-to-quotation", icon: "sheet", color: "#9a5b00", show: (m) => canConvertInvoices(m) },
];

/** The apps this person may open, the main one first. */
export function appsFor(m: Who): AppTile[] {
  return APPS.filter((a) => a.show(m)).map(({ show: _s, href, ...a }) => { void _s; return { ...a, href: typeof href === "function" ? href(m) : href }; });
}

/** The dashboard's own pages, for the search ("find an app or a page"). */
const PAGES: { page: Page | "followups"; name: string; href: string; words: string }[] = [
  { page: "overview", name: "Overview", href: "/overview", words: "kpi sales numbers targets" },
  { page: "quotations", name: "Quotations", href: "/quotations", words: "quote customer estimate" },
  { page: "trainings", name: "Trainings", href: "/training-management", words: "training portal coordinator" },
  { page: "items", name: "Items", href: "/items", words: "products stock brochure price" },
  { page: "templates", name: "Templates", href: "/templates", words: "email wording" },
  { page: "followups", name: "Follow-ups", href: "/follow-up", words: "board leads aed fulfillment" },
  { page: "calendar", name: "Calendar", href: "/calendar", words: "schedule entries" },
  { page: "sprints", name: "Sprints", href: "/sprints", words: "tasks zoho sprints" },
  { page: "reports", name: "Reports", href: "/reports", words: "analytics dashboards" },
];
export type Found = { name: string; href: string; kind: "app" | "page" | "shortcut"; external?: boolean };
export function search(q: string, m: Who, shortcuts: Shortcut[]): Found[] {
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const hit = (text: string) => ws.every((w) => text.toLowerCase().includes(w));
  const apps = appsFor(m).filter((a) => hit(`${a.name} ${a.about}`)).map((a): Found => ({ name: a.name, href: a.href, kind: "app" }));
  const pages = PAGES.filter((p) => (p.page === "followups" ? hasFollowUps(m) : canSee(m, p.page)) && hit(`${p.name} ${p.words}`)).map((p): Found => ({ name: p.name, href: p.href, kind: "page" }));
  const mine = shortcuts.filter((s) => hit(`${s.name} ${s.url}`)).map((s): Found => ({ name: s.name, href: s.url, kind: "shortcut", external: true }));
  return [...apps, ...pages, ...mine].filter((f, i, all) => all.findIndex((x) => x.href === f.href) === i).slice(0, 8);
}

/* ---------------- Personal shortcuts (owner: each person adds their own websites) ---------------- */

export type Shortcut = { id: string; name: string; url: string };
export const MAX_SHORTCUTS = 24;

/** A link someone typed, made whole ("zoho.in/books" → "https://zoho.in/books"); null when it isn't a web address. */
export function cleanUrl(raw: unknown): string | null {
  let s = String(raw ?? "").trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.href;
  } catch { return null; }
}
/** The name shown under a shortcut: what they typed, else the site's name ("mail.zoho.in" → "Zoho"). */
export function shortcutName(raw: unknown, url: string): string {
  const typed = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (typed) return typed;
  const host = new URL(url).hostname.replace(/^www\./, "").split(".");
  const core = host.length > 2 && host.at(-2)!.length <= 3 ? host.at(-3)! : host.at(-2) ?? host[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}
