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

export type SprintCard = {
  id: string; no: string; name: string; statusId: string; owners: string[]; due: string | null; overdue: boolean; sequence: number;
  /** For editing (owner, 18 Nov: "whatever we change here changes in Zoho Sprints"): the sprint holding it, its type,
   *  priority, owners' ids and start date. */
  sprintId: string; typeId: string; priorityId: string; ownerIds: string[]; start: string | null;
};
/** What a task can be set to: item types, priorities, project users, tags, and the custom fields (label → UDF column). */
export type SprintsMeta = {
  types: { id: string; name: string }[]; priorities: { id: string; name: string; color: string }[];
  users: { id: string; name: string; email: string }[]; tags: { id: string; name: string; color: string }[];
  fields: { label: string; udf: string }[];
};
export type SprintColumn = { id: string; name: string; color: string; cards: SprintCard[] };
export type SprintView = { id: string; name: string; no: string; start: string | null; end: string | null; backlog?: boolean; upcoming?: boolean; kanban?: boolean; columns: SprintColumn[] };
export type SprintsBoard = { project: { id: string; name: string; prefix: string; no: string }; sprints: SprintView[]; fetchedAt: string; boardUrl: string; /** What Zoho returned, in a line (shown when the board is empty). */ diag?: string; meta?: SprintsMeta };

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
      const ownerIds = (Array.isArray(it.ownerId) ? it.ownerId : [it.ownerId]).map(str).filter((u) => u && names[u] !== undefined && !/^unassigned$/i.test(names[u]));
      const owners = ownerIds.map((u) => names[u]);
      const due = dateOf(it.endDate);
      const statusId = str(it.statusId);
      const card: SprintCard = {
        id: it.id, no: `${prefix ? `${prefix}-` : ""}I${str(it.itemNo)}`, name: str(it.itemName), statusId, owners, due,
        // Past its end date and not completed (Zoho's own isOverDue counts too).
        overdue: it.isOverDue === true || (due !== null && new Date(due) < now && dateOf(it.completedDate) === null), sequence: Number(it.sequence) || 0,
        sprintId: str(it.sprintId), typeId: str(it.projItemTypeId), priorityId: str(it.projPriorityId), ownerIds, start: dateOf(it.startDate),
      };
      let col = byId.get(statusId);
      if (!col) { col = { id: statusId || "other", name: "Other", color: "#8a8a8e", cards: [] }; byId.set(col.id, col); cols.push(col); }
      col.cards.push(card);
    }
  }
  for (const c of cols) c.cards.sort((a, b) => a.sequence - b.sequence);
  return cols;
}

/* ---------------- What a task can be set to (owner, 18 Nov) ---------------- */

export const typesOf = (r: Record<string, unknown>) => decode(r.projItemTypeIds, r.projItemTypeJObj, r.projItemType_prop).map((t) => ({ id: t.id, name: str(t.itemTypeName) }));
export const prioritiesOf = (r: Record<string, unknown>) => decode(r.projPriorityIds, r.projPriorityJObj, r.projPriority_prop).map((t) => ({ id: t.id, name: str(t.priorityName), color: str(t.colorCode) || "#878f97" }));
export const usersOf = (r: Record<string, unknown>) => decode(r.userIds, r.userJObj, r.user_prop).map((u) => ({ id: u.id, name: str(u.displayName), email: str(u.emailId) }));
export const tagsOf = (r: Record<string, unknown>) => decode(r.zsTagIds, r.zsTagJObj, r.zsTag_prop).map((t) => ({ id: t.id, name: str(t.tagName), color: str(t.colorCode) || "#878f97" }));
/** The item module's id, from the modules list ("item"). */
export const itemModuleOf = (r: Record<string, unknown>) => decode(r.custommoduleIds, r.custommoduleJObj, r.custommodule_prop).find((m) => str(m.moduleName) === "item")?.id ?? null;
/** The item's custom fields that are ours to fill (their UDF column, e.g. "Invoice Number" → UDF_CHAR1); Zoho's own fields left out. */
export function customFieldsOf(r: Record<string, unknown>): { label: string; udf: string }[] {
  const all = decode(r.associatedCFields ?? Object.keys((r.customfieldJObj ?? {}) as object), r.customfieldJObj, r.customfield_prop);
  return all.map((f) => ({ label: str(f.fieldName), udf: str(f.udfName) })).filter((f) => /^UDF_(CHAR|TEXT|LONG|DOUBLE|URI|EMAIL)\d+$/.test(f.udf));
}

/** A task's details: its description and custom-field values (by UDF column). */
export function itemDetailOf(r: Record<string, unknown>): { description: string; udf: Record<string, string> } {
  const it = decode(r.itemIds, r.itemJObj, r.item_prop)[0];
  if (!it) return { description: "", udf: {} };
  const udf: Record<string, string> = {};
  for (const [k, v] of Object.entries(it)) if (/^UDF_/.test(k) && v !== null && v !== undefined && str(v) !== "-1") udf[k] = str(v);
  return { description: str(it.description), udf };
}

/** A datetime-local value ("2026-11-20T09:30") as Zoho Sprints wants it (India time: "2026-11-20T09:30:00+05:30"). */
export const zohoDate = (local: string) => (local ? `${local.length === 10 ? `${local}T09:00` : local.slice(0, 16)}:00+05:30` : "");
/** Zoho Sprints' date ("2026-11-20T04:00:00.000Z") for a datetime-local box, in India time. */
export function localDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}
