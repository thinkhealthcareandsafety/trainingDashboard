/*
 * Zoho Sprints on the dashboard (owner, 18 Nov: "hide the progress tracker entirely, instead push Zoho Sprints into its
 * place"). Zoho Sprints refuses to be framed (X-Frame-Options: DENY), so the board is drawn here from its REST API.
 * Pure and client-safe: reading Zoho Sprints' answers into columns and cards.
 *
 * Zoho Sprints answers with records as arrays keyed by id, plus a "*_prop" map naming each array position, e.g.
 * { itemIds: ["1"], itemJObj: { "1": ["Fix login", "37", …] }, item_prop: { itemName: 0, itemNo: 1, … } }.
 */

export type Rec = Record<string, unknown> & { id: string };

/** Records from Zoho Sprints' id-keyed arrays: each field by its name from the prop map, in the order of `ids`. */
export function decode(ids: unknown, jobj: unknown, prop: unknown): Rec[] {
  const map = (jobj ?? {}) as Record<string, unknown[]>;
  const names = Object.entries((prop ?? {}) as Record<string, number>);
  const order = Array.isArray(ids) ? ids.map(String) : Object.keys(map);
  return order.filter((id) => Array.isArray(map[id])).map((id) => {
    const row = map[id];
    const r: Rec = { id };
    for (const [name, at] of names) r[name] = row[at];
    return r;
  });
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
/** Zoho Sprints writes "-1" or "" for "no date". */
const dateOf = (v: unknown): string | null => { const s = str(v); return !s || s === "-1" ? null : s; };

export type SprintCard = { id: string; no: string; name: string; statusId: string; owners: string[]; due: string | null; overdue: boolean; sequence: number };
export type SprintColumn = { id: string; name: string; color: string; cards: SprintCard[] };
export type SprintView = { id: string; name: string; no: string; start: string | null; end: string | null; backlog?: boolean; upcoming?: boolean; kanban?: boolean; columns: SprintColumn[] };
export type SprintsBoard = { project: { id: string; name: string; prefix: string; no: string }; sprints: SprintView[]; fetchedAt: string; boardUrl: string; /** What Zoho returned, in a line (shown when the board is empty). */ diag?: string };

/** The project whose number is `no` (the "P5" in the board's web address is project number 5). */
export function findProject(resp: Record<string, unknown>, no: string): { id: string; name: string; prefix: string; no: string; backlogId: string } | null {
  const p = decode(resp.projectIds, resp.projectJObj, resp.project_prop).find((x) => str(x.projNo) === no);
  if (!p) return null;
  const prefix = str(((resp.prefixObj ?? {}) as Record<string, unknown>)[p.id]);
  return { id: p.id, name: str(p.projName), prefix, no, backlogId: str(p.backlogId) };
}

/** The workspace to read: the one named like ours, else the user's own, else the first. */
export function pickTeam(resp: Record<string, unknown>, like = /think\s*health/i): string | null {
  const portals = ((resp.portals ?? []) as { zsoid?: unknown; teamName?: unknown; orgName?: unknown }[]);
  const named = portals.find((p) => like.test(str(p.teamName)) || like.test(str(p.orgName)));
  return str(named?.zsoid) || str(resp.myTeamId) || str(portals[0]?.zsoid) || null;
}

/** Sprints from a "sprints" answer (type [2] = the active ones). */
export function sprintsOf(resp: Record<string, unknown>): { id: string; name: string; no: string; start: string | null; end: string | null }[] {
  return decode(resp.sprintIds, resp.sprintJObj, resp.sprint_prop).map((s) => ({ id: s.id, name: str(s.sprintName), no: str(s.sprintNo), start: dateOf(s.startDate), end: dateOf(s.endDate) }));
}

/**
 * The board: one column per item status in Zoho's order, each with its items (in Zoho's sequence). Owner names come
 * from the items answer's userDisplayName; an item in a status we don't know goes to an "Other" column at the end.
 */
export function boardColumns(statusResp: Record<string, unknown>, items: Record<string, unknown>[], prefix: string, now = new Date()): SprintColumn[] {
  const statuses = decode(statusResp.statusIds, statusResp.statusJObj, statusResp.status_prop);
  const cols: SprintColumn[] = statuses.map((s) => ({ id: s.id, name: str(s.statusName), color: str(s.colorCode) || "#8a8a8e", cards: [] }));
  const byId = new Map(cols.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const page of items) {
    const names = (page.userDisplayName ?? {}) as Record<string, string>;
    for (const it of decode(page.itemIds, page.itemJObj, page.item_prop)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const owners = (Array.isArray(it.ownerId) ? it.ownerId : [it.ownerId]).map(str).filter(Boolean).map((u) => names[u] ?? "").filter((n) => n && !/^unassigned$/i.test(n));
      const due = dateOf(it.endDate);
      const statusId = str(it.statusId);
      const card: SprintCard = {
        id: it.id, no: `${prefix ? `${prefix}-` : ""}I${str(it.itemNo)}`, name: str(it.itemName), statusId, owners, due,
        // Past its end date and not completed (Zoho's own isOverDue counts too).
        overdue: it.isOverDue === true || (due !== null && new Date(due) < now && dateOf(it.completedDate) === null), sequence: Number(it.sequence) || 0,
      };
      let col = byId.get(statusId);
      if (!col) { col = { id: statusId || "other", name: "Other", color: "#8a8a8e", cards: [] }; byId.set(col.id, col); cols.push(col); }
      col.cards.push(card);
    }
  }
  for (const c of cols) c.cards.sort((a, b) => a.sequence - b.sequence);
  return cols;
}
