import { canConvertInvoices, canSee, hasFollowUps } from "./roles";

/*
 * The apps home page (owner, 23 Nov: "like Chrome's main page — they log in, they see the applications"; then "make it
 * minimalist"; then "there's this many, how come I only see 3"): every page of the dashboard is an app, in the
 * sidebar's order, each for those who may open it (the same rules as the sidebar). Pure: who sees which app, the
 * search, and the personal shortcuts' rules (the API keeps them).
 *
 * A colleague's new application: build it in this project under its own route, then add it to APPS below with who
 * may see it (and its icon in Launcher.tsx). It shows as a tile for those people at once.
 */

type Who = { id: string; name: string };
/** One per app: the sidebar's own icons (AppShell NAV), plus the two Reports tools. */
export type AppIcon = "overview" | "quotations" | "trainings" | "items" | "templates" | "followups" | "calendar" | "sprints" | "reports" | "converter" | "sheet";
export type AppTile = { id: AppIcon; name: string; about: string; href: string; icon: AppIcon; color: string };

const APPS: (AppTile & { show: (m: Who) => boolean })[] = [
  { id: "overview", name: "Overview", about: "Sales, targets and the month at a glance", href: "/overview", icon: "overview", color: "#034f72", show: (m) => canSee(m, "overview") },
  { id: "quotations", name: "Quotations", about: "Quote any customer in Zoho Books", href: "/quotations", icon: "quotations", color: "#0077b6", show: (m) => canSee(m, "quotations") },
  { id: "trainings", name: "Trainings", about: "Training quotations and the clients' portal", href: "/training-management", icon: "trainings", color: "#00843d", show: (m) => canSee(m, "trainings") },
  { id: "items", name: "Items", about: "Products, prices, stock and brochures", href: "/items", icon: "items", color: "#5a6b2f", show: (m) => canSee(m, "items") },
  { id: "templates", name: "Templates", about: "The wording of our emails", href: "/templates", icon: "templates", color: "#7a4fc0", show: (m) => canSee(m, "templates") },
  { id: "followups", name: "Follow-ups", about: "The boards: leads, AED, fulfilment", href: "/follow-up", icon: "followups", color: "#b8641a", show: (m) => hasFollowUps(m) },
  { id: "calendar", name: "Calendar", about: "Everyone's schedule", href: "/calendar", icon: "calendar", color: "#b42318", show: (m) => canSee(m, "calendar") },
  { id: "sprints", name: "Sprints", about: "Team tasks from Zoho Sprints", href: "/sprints", icon: "sprints", color: "#1f6f8b", show: (m) => canSee(m, "sprints") },
  { id: "reports", name: "Reports", about: "Sales and analytics dashboards", href: "/reports", icon: "reports", color: "#023a55", show: (m) => canSee(m, "reports") },
  { id: "converter", name: "Invoice Converter", about: "Purchase orders and e-way bills on invoices", href: "/reports/invoice-converter", icon: "converter", color: "#005387", show: (m) => canConvertInvoices(m) },
  { id: "sheet", name: "Sheet → Quotation", about: "Customer item sheets into Zoho draft quotations", href: "/reports/sheet-to-quotation", icon: "sheet", color: "#9a5b00", show: (m) => canConvertInvoices(m) },
];

/** The apps this person may open, in the sidebar's order. */
export function appsFor(m: Who): AppTile[] {
  return APPS.filter((a) => a.show(m)).map(({ show: _s, ...a }) => { void _s; return a; });
}

export type Found = { name: string; href: string; kind: "app" | "shortcut"; external?: boolean };
/** Apps and their own shortcuts by name (kept for a search box; the minimalist page has none yet). */
export function search(q: string, m: Who, shortcuts: Shortcut[]): Found[] {
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const hit = (text: string) => ws.every((w) => text.toLowerCase().includes(w));
  const apps = appsFor(m).filter((a) => hit(`${a.name} ${a.about}`)).map((a): Found => ({ name: a.name, href: a.href, kind: "app" }));
  const mine = shortcuts.filter((s) => hit(`${s.name} ${s.url}`)).map((s): Found => ({ name: s.name, href: s.url, kind: "shortcut", external: true }));
  return [...apps, ...mine].slice(0, 8);
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
