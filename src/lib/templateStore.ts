import "server-only";
import { db } from "./db";
import { DEFAULTS as MAIL_DEFAULTS, type MailTemplate } from "./mailTemplates";
import { SIGNATURE_DETAILS, SIGNATURE_VARS, SIGNERS, TEMPLATES, TEMPLATE_VARS, TOPICS, TOPIC_EXTRAS, TOPIC_VARS, type TemplateOverrides, builtinSignature, signerKey } from "./quoteEmails";
import { TS_TEMPLATES } from "./totalSupply";
import { PORTAL_TEMPLATES, PORTAL_VARS } from "./portalEmail";
import { templateProblems } from "./templateText";
import { canQuote, isAdmin } from "./roles";

/*
 * Editable email templates (owner, 10 Nov, "yeah" to the defaults): every template the Templates page can change, where
 * its saved wording lives, and who may change it.
 *  - "quote:<id>", "ts:<id>" (subject + body) and "topic:<id>" (body): a document in `mailTemplates` with that _id, only
 *    once someone changes it — otherwise the built-in text in quoteEmails.ts / totalSupply.ts is used. Those who quote.
 *  - "aed_onboarding:<step>", "fulfil_gratitude:<step>": the flows' own documents (mailTemplates.ts), subject on step 0
 *    (one subject for the thread). Admin only.
 *  - "sign:<first name>": that person's signature on quotation emails (owner, 10 Nov), saved like "quote:" — the person
 *    themself or Admin; "sign:details", the company block every signature shows as {details} — Admin only.
 *  - "portal:box", "portal:login": the Training Manager login (step 8 of docs/TRAINING_MANAGER_PLAN.md), saved like "quote:".
 * Every save and reset is logged in `mailTemplateEdits` (key, by, at, before, after; after = null for a reset).
 */

export type TemplateGroup = "quote" | "topic" | "ts" | "sign" | "portal" | "aed" | "fulfil";
export type TemplateEntry = {
  key: string; group: TemplateGroup; label: string;
  subject: string | null; body: string; // null subject = this one has none
  builtin: { subject: string | null; body: string };
  vars: readonly string[]; choices: boolean; adminOnly: boolean; note?: string;
  owner?: string; // a signature: the first name of the person it belongs to (they and Admin may change it)
};

const FLOW_VARS: Record<string, readonly string[]> = {
  aed_onboarding: ["invoice"],
  fulfil_gratitude: ["person", "location", "customer", "ref", "course", "dates", "people"],
};
const FLOW_GROUP: Record<string, TemplateGroup> = { aed_onboarding: "aed", fulfil_gratitude: "fulfil" };
// Shikha's Zoho Mail filter forwards replies to digital@ by these words in the subject (mailTemplates.ts).
const MUST_KEEP: Record<string, string> = { fulfil_gratitude: "Thank you for hosting" };

/** The built-in catalogue, in page order. */
function catalogue(): TemplateEntry[] {
  const quote = (group: "quote" | "ts", list: typeof TEMPLATES): TemplateEntry[] => list.map((t) => ({
    key: `${group}:${t.id}`, group, label: t.label, subject: t.subject, body: t.body, builtin: { subject: t.subject, body: t.body },
    vars: TEMPLATE_VARS, choices: false, adminOnly: false,
  }));
  const topics: TemplateEntry[] = [...TOPICS, ...TOPIC_EXTRAS].map((t) => ({
    key: `topic:${t.id}`, group: "topic", label: t.label, subject: null, body: t.text, builtin: { subject: null, body: t.text },
    vars: TOPIC_VARS, choices: true, adminOnly: false, note: "Used on both companies' quotation emails.",
  }));
  const flows: TemplateEntry[] = Object.values(MAIL_DEFAULTS).flatMap((m) => m.steps.map((s, i) => ({
    key: `${m._id}:${i}`, group: FLOW_GROUP[m._id], label: s.label, subject: i === 0 ? m.subject : null, body: s.body,
    builtin: { subject: i === 0 ? m.subject : null, body: s.body }, vars: FLOW_VARS[m._id] ?? [], choices: false, adminOnly: true,
    note: [`Sent from ${m.from}.`, i === 0 && m.steps.length > 1 ? "The subject is shared by every step (the later ones are replies)." : "",
      MUST_KEEP[m._id] && i === 0 ? `Keep "${MUST_KEEP[m._id]}" in the subject: replies are sorted by it.` : ""].filter(Boolean).join(" "),
  })));
  const signs: TemplateEntry[] = [
    ...SIGNERS.map((p) => ({
      key: `sign:${p.key}`, group: "sign" as const, label: p.label, subject: null, body: builtinSignature(p.key), builtin: { subject: null, body: builtinSignature(p.key) },
      vars: SIGNATURE_VARS, choices: false, adminOnly: false, owner: p.key,
      note: `Under "Warm regards," on ${p.label}'s quotation emails (and on Admin's when ${p.label} is the quote's Sales person). {name} is the name as the quote has it; {details} is the company details below. ${p.label} and Admin can change it.`,
    })),
    { key: "sign:details", group: "sign", label: "Company details (in every signature)", subject: null, body: SIGNATURE_DETAILS, builtin: { subject: null, body: SIGNATURE_DETAILS },
      vars: [], choices: false, adminOnly: true, note: "Shown as {details} in each person's signature. Admin only." },
  ];
  const portal: TemplateEntry[] = PORTAL_TEMPLATES.map((t) => ({
    key: `portal:${t.id}`, group: "portal", label: t.label, subject: t.subject, body: t.body, builtin: { subject: t.subject, body: t.body },
    vars: PORTAL_VARS, choices: false, adminOnly: false, note: t.note,
  }));
  return [...quote("quote", TEMPLATES), ...topics, ...quote("ts", TS_TEMPLATES), ...signs, ...portal, ...flows];
}

const flowOf = (key: string) => { const m = key.match(/^(\w+):(\d+)$/); return m && MAIL_DEFAULTS[m[1]] ? { id: m[1], step: Number(m[2]) } : null; };
export const canEditTemplate = (me: { id: string; name: string }, e: Pick<TemplateEntry, "adminOnly" | "owner">) =>
  e.adminOnly ? isAdmin(me) : e.owner ? isAdmin(me) || (canQuote(me) && signerKey(me.name) === e.owner) : canQuote(me);

type Saved = { _id: string; subject?: string; body: string };
const col = async () => (await db()).collection<Saved & Partial<MailTemplate>>("mailTemplates");
const editsCol = async () => (await db()).collection<{ key: string; by: string; at: string; before: unknown; after: unknown }>("mailTemplateEdits");

/** Every template with its current wording, and who last changed it. */
export async function listTemplates(): Promise<(TemplateEntry & { editedBy?: string; editedAt?: string; edited: boolean })[]> {
  const docs = new Map((await (await col()).find({}).toArray()).map((d) => [d._id, d]));
  const last = new Map<string, { by: string; at: string }>();
  for (const e of await (await editsCol()).find({}).toArray()) if (!last.has(e.key) || last.get(e.key)!.at < e.at) last.set(e.key, { by: e.by, at: e.at });
  return catalogue().map((e) => {
    const f = flowOf(e.key);
    const d = docs.get(f ? f.id : e.key);
    const subject = e.subject === null ? null : d?.subject ?? e.subject;
    const body = (f ? d?.steps?.[f.step]?.body : d?.body) ?? e.body;
    return { ...e, subject, body, edited: subject !== e.builtin.subject || body !== e.builtin.body, editedBy: last.get(e.key)?.by, editedAt: last.get(e.key)?.at };
  });
}

/** The quotation emails' saved wording ("quote:", "ts:", "topic:", "sign:"), for the email step. */
export async function templateOverrides(): Promise<TemplateOverrides> {
  const out: TemplateOverrides = {};
  for (const d of await (await col()).find({}).toArray()) if (/^(quote|ts|topic|sign):/.test(d._id) && typeof d.body === "string") out[d._id] = { ...(d.subject ? { subject: d.subject } : {}), body: d.body };
  return out;
}

/** The Training Manager login's wording (saved, or built in). */
export async function portalTemplates(): Promise<{ subject: string; body: string; box: string }> {
  const saved = new Map((await (await col()).find({}).toArray()).filter((d) => d._id.startsWith("portal:")).map((d) => [d._id, d]));
  const login = PORTAL_TEMPLATES.find((t) => t.id === "login")!, box = PORTAL_TEMPLATES.find((t) => t.id === "box")!;
  return { subject: saved.get("portal:login")?.subject ?? login.subject!, body: saved.get("portal:login")?.body ?? login.body, box: saved.get("portal:box")?.body ?? box.body };
}

export type SaveResult = { ok: true } | { error: string; status: number };

/** Save new wording (`reset`: back to the built-in text). Saving the built-in text itself is a reset. */
export async function saveTemplate(me: { id: string; name: string }, key: string, input: { subject?: unknown; body?: unknown; reset?: boolean }): Promise<SaveResult> {
  const entry = (await listTemplates()).find((e) => e.key === key);
  if (!entry) return { error: "Unknown template", status: 404 };
  if (!canEditTemplate(me, entry)) return { error: entry.adminOnly ? "Only Admin changes this" : entry.owner ? "Only its owner and Admin change a signature" : "Only those who send quotations change these", status: 403 };
  const subject = entry.subject === null ? null : input.reset ? entry.builtin.subject : String(input.subject ?? "").replace(/\s*\n\s*/g, " ").trim();
  const body = input.reset ? entry.builtin.body : String(input.body ?? "").replace(/\r\n/g, "\n");
  const problems = [
    ...(subject === null ? [] : templateProblems(subject, entry.vars).map((p) => `Subject: ${p}`)),
    ...templateProblems(body, entry.vars, { choices: entry.choices }),
  ];
  const f = flowOf(key);
  const must = f && f.step === 0 ? MUST_KEEP[f.id] : undefined;
  if (must && subject !== null && !subject.toLowerCase().includes(must.toLowerCase())) problems.push(`Subject: keep "${must}" in it, replies are sorted by it.`);
  if (problems.length) return { error: problems.join(" "), status: 400 };
  if (subject === entry.subject && body === entry.body) return { ok: true }; // nothing changed

  const c = await col();
  if (f) {
    // The flow's document holds every step; create it from the defaults first if it isn't there yet.
    if (!(await c.findOne({ _id: f.id }))) await c.replaceOne({ _id: f.id }, structuredClone(MAIL_DEFAULTS[f.id]) as never, { upsert: true });
    await c.updateOne({ _id: f.id }, { $set: { [`steps.${f.step}.body`]: body, ...(subject !== null ? { subject } : {}) } });
  } else if (subject === entry.builtin.subject && body === entry.builtin.body) {
    await c.deleteOne({ _id: key });
  } else {
    await c.replaceOne({ _id: key }, { ...(subject !== null ? { subject } : {}), body, updatedBy: me.name, updatedAt: new Date().toISOString() } as never, { upsert: true });
  }
  const isBuiltin = subject === entry.builtin.subject && body === entry.builtin.body;
  await (await editsCol()).insertOne({ key, by: me.name, at: new Date().toISOString(), before: { subject: entry.subject, body: entry.body }, after: isBuiltin ? null : { subject, body } });
  return { ok: true };
}
