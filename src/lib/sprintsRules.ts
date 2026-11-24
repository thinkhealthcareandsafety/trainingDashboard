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
  /** Everyone on it (owner, 18 Nov): "z:<Zoho user>" from Zoho Sprints and "m:<member>" kept on the dashboard. */
  people?: string[];
  /** Comments on it in Zoho Sprints (owner, 20 Nov: a comment section, "for example their work"). */
  comments?: number;
};
/** What a task can be set to: item types, priorities, project users, tags, and the custom fields (label → UDF column). */
export type SprintsMeta = {
  types: { id: string; name: string }[]; priorities: { id: string; name: string; color: string }[];
  users: { id: string; name: string; email: string }[]; tags: { id: string; name: string; color: string }[];
  fields: { label: string; udf: string }[];
  /** Everyone who can be assigned (clean names; dashboard members too). */
  people?: SprintPerson[];
  /** The Zoho user who stands in for people without one of their own (hello@thinkhealth.in — STAND_IN_EMAIL). */
  standIn?: string;
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
        comments: Number(it.commentCount) || 0,
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

/*
 * Comments (owner, 20 Nov: "add comment section in sprints so people can add everything in there, for example their
 * work"): Zoho Sprints' own item comments (GET/POST …/item/{i}/notes/, text in `name`), read and added here. Zoho writes
 * an API comment as the connected user (Admin), so one added here starts with its writer's name in bold, and that name
 * is shown as the writer.
 */
export type SprintComment = { id: string; by: string; at: string; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Zoho's comment HTML as plain lines. */
export function htmlText(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m))
    .replace(/[ \t\u00a0]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** A comment typed here, as Zoho's comment HTML, with the writer's name first. */
export const commentHtml = (by: string, text: string) => `<b>${esc(by.trim())}:</b> ${esc(text.trim()).replace(/\r?\n/g, "<br/>")}`;
const BY = /^\s*(?:<p>\s*)?<b>([^<:]{1,80}):<\/b>\s*/i;

/** A notes answer → comments, oldest first; the writer from our bold name, else Zoho's user (clean name). */
export function commentsOf(r: Record<string, unknown>, people: SprintPerson[] = []): SprintComment[] {
  const names = (r.userDisplayName ?? {}) as Record<string, string>;
  const known = new Map(people.filter((p) => p.zohoId).map((p) => [p.zohoId!, p.name]));
  return decode(r.notesIds, r.notesJObj, r.notes_prop)
    .filter((n) => str(n.parentCommentId) === "" || str(n.parentCommentId) === "-1" || n.parentCommentId === null)
    .map((n) => {
      const html = str(n.notes);
      const ours = html.match(BY);
      const u = str(n.createdBy);
      return { id: n.id, by: ours ? ours[1].trim() : known.get(u) ?? cleanName(names[u] ?? ""), at: dateOf(n.createdOn) ?? "", text: htmlText(ours ? html.slice(ours[0].length) : html) };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** A datetime-local value ("2026-11-20T09:30") as Zoho Sprints wants it (India time: "2026-11-20T09:30:00+05:30"). */
export const zohoDate = (local: string) => (local ? `${local.length === 10 ? `${local}T09:00` : local.slice(0, 16)}:00+05:30` : "");
/** Zoho Sprints' date ("2026-11-20T04:00:00.000Z") for a datetime-local box, in India time. */
export function localDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

/* ---------------- People (owner, 18 Nov: full, clean names; every dashboard member can be assigned) ---------------- */

const titleWord = (w: string) => (w === w.toUpperCase() || w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);
/**
 * A Zoho Sprints display name made readable: "Sumit Shah Shah" → "Sumit Shah", "PRANJAL DHARMENDRA NIKALJE Nikalje" →
 * "Pranjal Dharmendra Nikalje", "vaibhav.thinkhealth" → "Vaibhav". A last word repeating an earlier one is dropped.
 */
export function cleanName(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  if (!/\s/.test(s) && /[._@]/.test(s)) s = s.split(/[._@]/)[0];
  const words = s.split(/\s+/);
  while (words.length > 1 && words.slice(0, -1).some((w) => w.toLowerCase() === words.at(-1)!.toLowerCase())) words.pop();
  return words.map(titleWord).join(" ");
}
const firstWord = (n: string) => cleanName(n).split(" ")[0]?.toLowerCase() ?? "";

/** Someone a task can be assigned to: `key` is "z:<Zoho user id>" (in Zoho Sprints) or "m:<member id>" (dashboard only). */
export type SprintPerson = { key: string; name: string; zohoId?: string; memberId?: string };
/**
 * Everyone: each Zoho Sprints user under a clean full name, matched to the dashboard member with the same first name;
 * dashboard members not in Zoho Sprints are added too (their assignments are kept on the dashboard).
 */
export function peopleOf(zohoUsers: { id: string; name: string }[], members: { id: string; name: string }[]): SprintPerson[] {
  const used = new Set<string>();
  const people: SprintPerson[] = zohoUsers.filter((u) => !/^unassigned$/i.test(u.name)).map((u) => {
    const m = members.find((x) => !used.has(x.id) && firstWord(x.name) && firstWord(x.name) === firstWord(u.name));
    if (m) used.add(m.id);
    const clean = cleanName(u.name);
    // The fuller of the two names (a member saved as just "Sumit" shows as "Sumit Shah").
    const name = m && cleanName(m.name).split(" ").length > clean.split(" ").length ? cleanName(m.name) : clean;
    return { key: `z:${u.id}`, name, zohoId: u.id, ...(m ? { memberId: m.id } : {}) };
  });
  for (const m of members) if (!used.has(m.id) && m.name.trim()) people.push({ key: `m:${m.id}`, name: cleanName(m.name), memberId: m.id });
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A task's people: Zoho's owners, then those kept on the dashboard. A member given a task before their account was matched
 * to a Zoho user (Jasmeet, 19 Nov) counts as that user — the same person, one key.
 */
export function taskPeople(ownerIds: string[], local: string[], people: SprintPerson[], hide?: string): string[] {
  const zohoOf = new Map(people.filter((p) => p.memberId && p.zohoId).map((p) => [p.memberId!, p.key]));
  return [...new Set([...ownerIds.filter((z) => z !== hide).map((z) => `z:${z}`), ...local.map((m) => zohoOf.get(m) ?? `m:${m}`)])];
}

/* The board's people filter (owner, 24 Nov): several people = tasks any of them is on; NO_ONE = tasks nobody is on. */
export const NO_ONE = "none";
const onCard = (c: SprintCard) => c.people ?? c.ownerIds.map((z) => `z:${z}`);
export function filterByPeople(cols: SprintColumn[], picked: string[]): SprintColumn[] {
  if (!picked.length) return cols;
  const fits = (c: SprintCard) => { const on = onCard(c); return on.length ? on.some((k) => picked.includes(k)) : picked.includes(NO_ONE); };
  return cols.map((c) => ({ ...c, cards: c.cards.filter(fits) }));
}
/** Who can be picked: people with a task on the board (and those already picked), by name, with how many; "No one" last. */
export function peopleOnBoard(cols: SprintColumn[], people: SprintPerson[], picked: string[] = []): { id: string; name: string; count: number }[] {
  const n = new Map<string, number>(picked.map((k) => [k, 0]));
  for (const c of cols) for (const card of c.cards) { const on = onCard(card); for (const k of on.length ? on : [NO_ONE]) n.set(k, (n.get(k) ?? 0) + 1); }
  const name = new Map(people.map((p) => [p.key, p.name]));
  return [...n].map(([id, count]) => ({ id, name: id === NO_ONE ? "No one" : name.get(id) ?? "Someone else", count }))
    .sort((a, b) => Number(a.id === NO_ONE) - Number(b.id === NO_ONE) || a.name.localeCompare(b.name));
}

/**
 * Owner (19 Nov): someone with no Zoho Sprints user of their own (Anuj, Anushka, Prashant, Vaibhavi, Jasmeet) is written to
 * Zoho as hello@thinkhealth.in — the dashboard keeps the real person (sprintAssign). `standIn` = it was added only for them,
 * so the dashboard doesn't show that user (Priyanka's) on the card; picking her yourself keeps her.
 */
export const STAND_IN_EMAIL = "hello@thinkhealth.in";
export function zohoOwners(zoho: string[], members: string[], standIn: string | undefined): { owners: string[]; standIn: boolean } {
  const need = Boolean(standIn && members.length && !zoho.includes(standIn));
  return { owners: need ? [...zoho, standIn!] : zoho, standIn: need };
}

/**
 * Zoho owners to add / remove on an edit. `carried`: Zoho users shown only through a dashboard-side assignment (taskPeople) —
 * not owners in Zoho yet, so kept ones are added there now, and removed ones need nothing sent to Zoho.
 */
export function ownerChanges(now: string[], was: string[], carried: Set<string>): { add: string[]; del: string[] } {
  return { add: now.filter((u) => !was.includes(u) || carried.has(u)), del: was.filter((u) => !now.includes(u) && !carried.has(u)) };
}
