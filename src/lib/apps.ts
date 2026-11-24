import { canConvertInvoices, canSee, hasFollowUps } from "./roles";

/*
 * The apps home page (owner, 23 Nov). Where it ended up after a few rounds the same day:
 *  - the main page (/) is a page of applications, big icons. "Training Dashboard is one application; I click on it and
 *    inside are our dashboard's pages, bigger icons. This is our end only; others will add their application on the
 *    main page."
 *  - "I add them: a link that opens their website on this same page instead of a new tab; going back comes back to this
 *    page." So Admin adds an application as a name and a link (`launcherApps`, /api/apps); it opens in the same tab.
 *  - The pages of Training Dashboard (the sidebar): every page, section by section, each for those who
 *    may open it (the same rules as the sidebar).
 * Pure: the pages, the links' rules.
 */

type Who = { id: string; name: string };
/** One icon per page (appIcons.tsx draws them, for the sidebar and the apps page alike). */
export type AppIcon = "overview" | "quotations" | "trainings" | "items" | "templates" | "followups" | "calendar" | "sprints" | "reports" | "converter" | "sheet";
/** The sidebar's sections (owner, 23 Nov), in order; Trainings went to Sales and Reports to Overview (owner's picks). */
export const SECTIONS = ["Overview", "Sales", "Inventory", "Utilities"] as const;
export type Section = (typeof SECTIONS)[number];
export type DashboardPage = { id: AppIcon; name: string; href: string; icon: AppIcon; color: string; section: Section };

// The one list of the dashboard's pages: the sidebar (AppShell) and the inside of Training Dashboard both read it.
const PAGES: (DashboardPage & { show: (m: Who) => boolean })[] = [
  { id: "overview", name: "Overview", href: "/overview", icon: "overview", color: "#034f72", section: "Overview", show: (m) => canSee(m, "overview") },
  { id: "followups", name: "Follow-ups", href: "/follow-up", icon: "followups", color: "#b8641a", section: "Overview", show: (m) => hasFollowUps(m) },
  { id: "calendar", name: "Calendar", href: "/calendar", icon: "calendar", color: "#b42318", section: "Overview", show: (m) => canSee(m, "calendar") },
  { id: "reports", name: "Reports", href: "/reports", icon: "reports", color: "#023a55", section: "Overview", show: (m) => canSee(m, "reports") },
  { id: "quotations", name: "Quotations", href: "/quotations", icon: "quotations", color: "#0077b6", section: "Sales", show: (m) => canSee(m, "quotations") },
  { id: "sheet", name: "Sheet → Quotation", href: "/reports/sheet-to-quotation", icon: "sheet", color: "#9a5b00", section: "Sales", show: (m) => canConvertInvoices(m) },
  { id: "trainings", name: "Trainings", href: "/training-management", icon: "trainings", color: "#00843d", section: "Sales", show: (m) => canSee(m, "trainings") },
  { id: "items", name: "Items", href: "/items", icon: "items", color: "#5a6b2f", section: "Inventory", show: (m) => canSee(m, "items") },
  { id: "converter", name: "Invoice Converter", href: "/reports/invoice-converter", icon: "converter", color: "#005387", section: "Inventory", show: (m) => canConvertInvoices(m) },
  { id: "sprints", name: "Sprints", href: "/sprints", icon: "sprints", color: "#1f6f8b", section: "Utilities", show: (m) => canSee(m, "sprints") },
  { id: "templates", name: "Templates", href: "/templates", icon: "templates", color: "#7a4fc0", section: "Utilities", show: (m) => canSee(m, "templates") },
];

/** The pages this person may open, section by section. */
export function dashboardPages(m: Who): DashboardPage[] {
  return PAGES.filter((p) => p.show(m)).map(({ show: _s, ...p }) => { void _s; return p; });
}
/** The same, grouped under their sections (sections with nothing for this person left out). */
export function pageSections(m: Who): { section: Section; pages: DashboardPage[] }[] {
  const mine = dashboardPages(m);
  return SECTIONS.map((section) => ({ section, pages: mine.filter((p) => p.section === section) })).filter((s) => s.pages.length);
}
/** The page a path belongs to: the longest matching address (so /reports/invoice-converter is the converter, not Reports). */
export function pageAt(path: string, pages: Pick<DashboardPage, "href">[]): string | undefined {
  return pages.filter((p) => path === p.href || path.startsWith(`${p.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
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
