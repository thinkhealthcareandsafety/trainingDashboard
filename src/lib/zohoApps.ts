/*
 * The Zoho apps on the apps home page (owner, 24 Nov: "bring all Zoho apps directly here", without adding each). Built in,
 * for everyone; pictures in public/zoho (Zoho's own symbols). India addresses: [id, name, address if not <id>.zoho.in].
 */
const LIST: [string, string, string?][] = [
  ["analytics", "Analytics"],
  ["apptics", "Apptics"],
  ["assist", "Assist"],
  ["backstage", "Backstage"],
  ["bigin", "Bigin"],
  ["billing", "Billing"],
  ["bookings", "Bookings"],
  ["books", "Books", "books.zoho.in/app"],
  ["bugtracker", "BugTracker", "bugtracker.zoho.in/portal"],
  ["calendar", "Calendar"],
  ["campaigns", "Campaigns"],
  ["catalyst", "Catalyst", "console.catalyst.zoho.in"],
  ["checkout", "Checkout"],
  ["cliq", "Cliq"],
  ["commerce", "Commerce"],
  ["connect", "Connect"],
  ["contacts", "Contacts"],
  ["contracts", "Contracts"],
  ["creator", "Creator"],
  ["crm", "CRM", "crm.zoho.in/crm/"],
  ["dataprep", "DataPrep"],
  ["desk", "Desk", "desk.zoho.in/agent"],
  ["directory", "Directory"],
  ["domains", "Domains"],
  ["erp", "ERP"],
  ["expense", "Expense"],
  ["flow", "Flow"],
  ["forms", "Forms"],
  ["fsm", "FSM"],
  ["inventory", "Inventory"],
  ["invoice", "Invoice", "invoice.zoho.in/app"],
  ["iot", "IoT"],
  ["landingpage", "LandingPage"],
  ["learn", "Learn"],
  ["lens", "Lens"],
  ["mail", "Mail"],
  ["marketingautomation", "Marketing Automation"],
  ["meeting", "Meeting", "meeting.zoho.in/meeting"],
  ["notebook", "Notebook"],
  ["one", "One"],
  ["pagesense", "PageSense"],
  ["payments", "Payments"],
  ["payroll", "Payroll"],
  ["people", "People"],
  ["practice", "Practice"],
  ["procurement", "Procurement"],
  ["projects", "Projects", "projects.zoho.in/portal"],
  ["publish", "Publish"],
  ["qengine", "QEngine"],
  ["recruit", "Recruit"],
  ["salesiq", "SalesIQ", "salesiq.zoho.in/home"],
  ["sheet", "Sheet"],
  ["shifts", "Shifts"],
  ["show", "Show", "show.zoho.in/show/"],
  ["showtime", "ShowTime"],
  ["sign", "Sign"],
  ["sites", "Sites", "sites.zoho.in/home"],
  ["social", "Social"],
  ["sprints", "Sprints", "sprints.zoho.in/workspace/thinkhealth"],
  ["survey", "Survey"],
  ["tables", "Tables"],
  ["teaminbox", "TeamInbox"],
  ["thrive", "Thrive"],
  ["todo", "ToDo"],
  ["vault", "Vault"],
  ["voice", "Voice"],
  ["webinar", "Webinar"],
  ["workdrive", "WorkDrive"],
  ["workerly", "Workerly", "workerly.zoho.in/workerly/"],
  ["writer", "Writer", "writer.zoho.in/writer"],
  ["zeptomail", "ZeptoMail"],
];
export type ZohoApp = { id: string; name: string; url: string; icon: string };
export const ZOHO_APPS: ZohoApp[] = LIST.map(([id, name, at]) => ({ id: `z:${id}`, name, url: `https://${at ?? `${id}.zoho.in/`}`, icon: `/zoho/${id}.png` }));

/* ---------------- Pins (right-click → Pin): each person's own, first in their list, in the order pinned ---------------- */

export const PIN = /^[\w:.-]{1,80}$/;
export const goodPins = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 200 && new Set(v).size === v.length && v.every((x) => typeof x === "string" && PIN.test(x));
export function pinnedFirst<T extends { id: string }>(list: T[], pins: string[]): T[] {
  const at = new Map(pins.map((p, i) => [p, i]));
  return [...list.filter((x) => at.has(x.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!), ...list.filter((x) => !at.has(x.id))];
}
/** Our applications (owner, 25 Nov): the dashboard first always, then the pinned ones, then A to Z. */
export function arranged<T extends { id: string; name: string }>(apps: T[], pins: string[]): { id: string; app?: T }[] {
  const az = [...apps].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }));
  return [{ id: "dashboard" }, ...pinnedFirst(az, pins).map((app) => ({ id: app.id, app }))];
}
