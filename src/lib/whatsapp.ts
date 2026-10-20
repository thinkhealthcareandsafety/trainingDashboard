import "server-only";
import { db } from "./db";

/*
 * WhatsApp through Anantya AI (owner, 20 Oct): the training reminders also go as WhatsApp template messages. Anantya's
 * API (Swagger: https://apiv1.anantya.ai/swagger/index.html; in their dashboard: Integrations → API Key / API Docs):
 *   POST /api/Campaign/SendSingleTemplateMessage?templateId=<id>  form: ContactNo (country code + number, no "+"),
 *        ContactName, Attribute1…Attribute13 → the template's {{1}}…{{13}}
 *   GET  /api/Campaign/GetTemplates → [{ id, templateName, msgText, templateStatus, isActive }]
 * Header X-Api-Key. Answers { isSuccess, responseCode, message, dataObj }.
 * Admin keeps the key, the team's numbers and which template is which in Mongo kv `whatsapp:anantya` (WhatsApp popup on
 * the Calendar) — the key never goes back to a browser, the numbers stay out of the (public) code.
 */

const KV = "whatsapp:anantya";
const API = process.env.ANANTYA_API ?? "https://apiv1.anantya.ai";

export type WaKind = "reminder" | "postponed";
/** How many {{n}} each message fills (trainingReminders.ts whatsappValues has the order). */
export const WA_VARS: Record<WaKind, number> = { reminder: 11, postponed: 11 };
/** Who can get one: the trainers with a reminder email (reminderPlan.ts TRAINER_EMAILS), by the same key. */
export const WA_PEOPLE = [
  { key: "sumit", name: "Sumit A Shah" },
  { key: "shikha", name: "Shikha Dixit" },
  { key: "ashish", name: "Ashish Dalal" },
  { key: "priyanka", name: "Priyanka" },
];

type Stored = {
  _id: string;
  apiKey?: string;
  numbers?: Record<string, string>;
  templates?: Partial<Record<WaKind, WaPicked>>;
  updatedAt?: string;
  updatedBy?: string;
};
/** A picked template; `vars` = how many {{n}} it had when picked (one that doesn't take ours never sends). */
export type WaPicked = { id: number; name: string; vars?: number };
export type WaTemplate = { id: number; name: string; status: string; active: boolean; text: string; vars: number };
/** What the Admin popup sees: everything but the key (its last 4 characters only). */
export type WaPublic = {
  hasKey: boolean;
  keyEnd?: string;
  numbers: Record<string, string>;
  templates: Partial<Record<WaKind, WaPicked>>;
  updatedAt?: string;
  updatedBy?: string;
  /** Sends happen only when all of this is set (and both templates take the values we send). */
  ready: boolean;
};

export const fits = (t: Partial<Record<WaKind, WaPicked>>, k: WaKind) => t[k]?.vars === WA_VARS[k];

const kv = async () => (await db()).collection<Stored>("kv");
export async function waStored(): Promise<Stored | null> {
  return (await kv()).findOne({ _id: KV });
}
export function waPublic(s: Stored | null): WaPublic {
  const numbers = s?.numbers ?? {};
  const templates = s?.templates ?? {};
  return {
    hasKey: Boolean(s?.apiKey),
    keyEnd: s?.apiKey ? s.apiKey.slice(-4) : undefined,
    numbers,
    templates,
    updatedAt: s?.updatedAt,
    updatedBy: s?.updatedBy,
    ready: Boolean(s?.apiKey && fits(templates, "reminder") && fits(templates, "postponed") && Object.values(numbers).some(Boolean)),
  };
}

/** "98200 12345" / "+91 98200-12345" → "919820012345" (10 digits = an Indian mobile); "" stays "" (no WhatsApp). */
export function waNumber(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (!d) return "";
  const n = d.length === 10 ? `91${d}` : d.replace(/^0+/, "");
  return n.length >= 11 && n.length <= 15 ? n : null;
}

export async function saveWa(patch: Partial<Pick<Stored, "apiKey" | "numbers" | "templates">>, by: string): Promise<WaPublic> {
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await (await kv()).updateOne({ _id: KV }, { $set: { ...set, updatedAt: new Date().toISOString(), updatedBy: by } }, { upsert: true });
  return waPublic(await waStored());
}

/** One Anantya call; their "isSuccess: false" and HTTP errors become an Error with their message (never the key). */
async function call<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { accept: "*/*", "X-Api-Key": apiKey, ...init.headers }, cache: "no-store" });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch {}
  const b = (body && typeof body === "object" ? body : {}) as { isSuccess?: boolean; IsSuccess?: boolean; message?: string; Message?: string; dataObj?: unknown; DataObj?: unknown };
  if (!res.ok || b.isSuccess === false || b.IsSuccess === false) {
    const msg = b.message ?? b.Message ?? (typeof body === "string" ? body.slice(0, 200) : "");
    console.error(`[whatsapp] ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status} ${msg}`);
    throw new Error(`Anantya: ${msg || `HTTP ${res.status}`}${res.status === 401 ? " — check the API key" : ""}`);
  }
  return (b.dataObj ?? b.DataObj ?? body) as T;
}

const keyOf = async (apiKey?: string) => {
  const k = apiKey ?? (await waStored())?.apiKey;
  if (!k) throw new Error("WhatsApp isn't set up — Admin adds the Anantya API key (Calendar → WhatsApp)");
  return k;
};

/** The account's templates with how many {{n}} each takes (the popup lists them to pick from). */
export async function waTemplates(apiKey?: string): Promise<WaTemplate[]> {
  const data = await call<unknown>(await keyOf(apiKey), "/api/Campaign/GetTemplates");
  const list = (Array.isArray(data) ? data : Object.values((data ?? {}) as object).find(Array.isArray) ?? []) as Record<string, unknown>[];
  return list.map((t) => {
    const text = String(t.msgText ?? t.MsgText ?? "");
    return {
      id: Number(t.id ?? t.Id),
      name: String(t.templateName ?? t.TemplateName ?? ""),
      status: String(t.templateStatus ?? t.TemplateStatus ?? ""),
      active: t.isActive !== false && t.IsActive !== false,
      text,
      vars: Math.max(0, ...[...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))),
    };
  })
    // Anantya lists every template twice (same id); the switched-off ones go last.
    .filter((t, i, all) => Number.isFinite(t.id) && all.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/** WhatsApp values can't hold line breaks, tabs or long runs of spaces; an empty value isn't accepted either. */
const clean = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, 900) || "—";

/** Sends one template message; returns Anantya's message id when it gives one. */
export async function sendWaTemplate(templateId: number, to: { number: string; name: string }, values: string[], apiKey?: string): Promise<string | undefined> {
  const form = new FormData();
  form.append("ContactNo", to.number);
  form.append("ContactName", to.name.split(" ")[0].slice(0, 15)); // their contact names stop at 15 characters
  values.forEach((v, i) => form.append(`Attribute${i + 1}`, clean(v)));
  const data = await call<unknown>(await keyOf(apiKey), `/api/Campaign/SendSingleTemplateMessage?templateId=${templateId}`, { method: "POST", body: form });
  const d = (data && typeof data === "object" ? data : { id: data }) as Record<string, unknown>;
  const id = d.msgId ?? d.MsgId ?? d.messageId ?? d.MessageId ?? d.id ?? d.Id;
  return id === undefined || id === null || id === "" || typeof id === "object" || typeof id === "boolean" ? undefined : String(id);
}
