import { canConvertInvoices, canSee, hasFollowUps } from "./roles";

/*
 * The apps home page (owner, 23 Nov). Where it ended up after a few rounds the same day:
 *  - the main page (/) is a page of applications, big icons. "Training Dashboard is one application; I click on it and
 *    inside are our dashboard's pages, bigger icons. This is our end only; others will add their application on the
 *    main page."
 *  - "I add them: a link that opens their website on this same page instead of a new tab; going back comes back to this
 *    page." So Admin adds an application as a name and a link (`launcherApps`, /api/apps); it opens in the same tab.
 *  - Inside Training Dashboard (/dashboard): every page of the dashboard, in the sidebar's order, each for those who
 *    may open it (the same rules as the sidebar).
 * Pure: the pages, the links' rules.
 */

type Who = { id: string; name: string };
/** The sidebar's own icons (AppShell NAV), plus the two Reports tools. */
export type AppIcon = "overview" | "quotations" | "trainings" | "items" | "templates" | "followups" | "calendar" | "sprints" | "reports" | "converter" | "sheet";
export type DashboardPage = { id: AppIcon; name: string; href: string; icon: AppIcon; color: string };

const PAGES: (DashboardPage & { show: (m: Who) => boolean })[] = [
  { id: "overview", name: "Overview", href: "/overview", icon: "overview", color: "#034f72", show: (m) => canSee(m, "overview") },
  { id: "quotations", name: "Quotations", href: "/quotations", icon: "quotations", color: "#0077b6", show: (m) => canSee(m, "quotations") },
  { id: "trainings", name: "Trainings", href: "/training-management", icon: "trainings", color: "#00843d", show: (m) => canSee(m, "trainings") },
  { id: "items", name: "Items", href: "/items", icon: "items", color: "#5a6b2f", show: (m) => canSee(m, "items") },
  { id: "templates", name: "Templates", href: "/templates", icon: "templates", color: "#7a4fc0", show: (m) => canSee(m, "templates") },
  { id: "followups", name: "Follow-ups", href: "/follow-up", icon: "followups", color: "#b8641a", show: (m) => hasFollowUps(m) },
  { id: "calendar", name: "Calendar", href: "/calendar", icon: "calendar", color: "#b42318", show: (m) => canSee(m, "calendar") },
  { id: "sprints", name: "Sprints", href: "/sprints", icon: "sprints", color: "#1f6f8b", show: (m) => canSee(m, "sprints") },
  { id: "reports", name: "Reports", href: "/reports", icon: "reports", color: "#023a55", show: (m) => canSee(m, "reports") },
  { id: "converter", name: "Invoice Converter", href: "/reports/invoice-converter", icon: "converter", color: "#005387", show: (m) => canConvertInvoices(m) },
  { id: "sheet", name: "Sheet → Quotation", href: "/reports/sheet-to-quotation", icon: "sheet", color: "#9a5b00", show: (m) => canConvertInvoices(m) },
];

/** Inside Training Dashboard: the pages this person may open, in the sidebar's order. */
export function dashboardPages(m: Who): DashboardPage[] {
  return PAGES.filter((p) => p.show(m)).map(({ show: _s, ...p }) => { void _s; return p; });
}

/* ---------------- Applications on the main page (Admin adds them as links) ---------------- */

export type LinkApp = { id: string; name: string; url: string; by: string; at: string };
export const MAX_APPS = 48;

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
/** The name under an application: what was typed, else the site's name ("mail.zoho.in" → "Zoho"). */
export function appName(raw: unknown, url: string): string {
  const typed = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (typed) return typed;
  const host = new URL(url).hostname.replace(/^www\./, "").split(".");
  const core = host.length > 2 && host.at(-2)!.length <= 3 ? host.at(-3)! : host.at(-2) ?? host[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}
