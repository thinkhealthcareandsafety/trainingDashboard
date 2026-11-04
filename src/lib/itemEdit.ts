/*
 * Editing an item from the Items page (owner, 4 Nov: "if i update the item's details here it gets updated in zoho books ...
 * we are trying not to open zoho"). Pure: what a form may hold, what changed, and what Zoho is sent. Only changed fields go;
 * Zoho keeps the rest (tested 4 Nov on Hot Water Bag Standard), but always wants the name and rate. GST isn't editable here.
 */
export type ItemFields = { name: string; rate: number; description: string; hsn: string; identifier: string; stock: string; offerPrice: string };
export type ItemChanges = Partial<Record<keyof ItemFields, { from: string | number; to: string | number }>>;

const CUSTOM: Partial<Record<keyof ItemFields, { id: string; api: string }>> = {
  identifier: { id: "982417000016998331", api: "cf_item_identifier" },
  stock: { id: "982417000020182044", api: "cf_stock_status" },
  offerPrice: { id: "982417000021532093", api: "cf_offer_price" },
};
const TOP: Partial<Record<keyof ItemFields, string>> = { name: "name", rate: "rate", description: "description", hsn: "hsn_or_sac" };
export const STOCK_OPTIONS = ["In Stock", "Back order", "No Stock"];
export const PICTURE_MAX_BYTES = 4 * 1024 * 1024; // Vercel refuses request bodies over 4.5 MB

type ItemDoc = { document_id?: unknown; file_type?: unknown; attachment_order?: unknown; is_back_image?: unknown };
/** An item's pictures among its documents (PDFs live there too): the main image first, back images last, else Zoho's order. */
export function itemPictures(i: Record<string, unknown>): string[] {
  const docs = ((i.documents ?? []) as ItemDoc[]).filter((d) => d.document_id && /^(jpe?g|png|gif|webp)$/i.test(String(d.file_type ?? "")));
  const main = String(i.image_document_id ?? "");
  const rank = (d: ItemDoc) => (String(d.document_id) === main ? 0 : d.is_back_image ? 2 : 1);
  return [...docs].sort((a, b) => rank(a) - rank(b) || Number(a.attachment_order ?? 0) - Number(b.attachment_order ?? 0)).map((d) => String(d.document_id));
}

/** The picture formats by their first bytes: a name or a browser's word isn't proof. */
export function isPicture(b: Uint8Array): boolean {
  const start = (...x: number[]) => x.every((v, n) => b[n] === v);
  return start(0xff, 0xd8, 0xff) || start(0x89, 0x50, 0x4e, 0x47) || start(0x47, 0x49, 0x46, 0x38) || (start(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...b.slice(8, 12)) === "WEBP");
}

export const BROCHURE_MAX_BYTES = 1024 * 1024; // Books' note on the field: "Upload PDF less than 1 MB"

/** The editable fields of a Zoho item, as Zoho answers it. */
export function itemFieldsOf(i: Record<string, unknown>): ItemFields {
  const hash = (i.custom_field_hash ?? {}) as Record<string, unknown>;
  const cf = (k: keyof ItemFields) => String(hash[CUSTOM[k]!.api] ?? i[CUSTOM[k]!.api] ?? "");
  return { name: String(i.name ?? ""), rate: Number(i.rate) || 0, description: String(i.description ?? ""), hsn: String(i.hsn_or_sac ?? ""), identifier: cf("identifier"), stock: cf("stock"), offerPrice: cf("offerPrice") };
}

/** What a person sent, trimmed; a wrong type can't get through. */
export function cleanItemFields(f: Partial<Record<keyof ItemFields, unknown>>): ItemFields {
  const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  return { name: s(f.name, 100), rate: Number(f.rate), description: String(f.description ?? "").trim().slice(0, 2000), hsn: s(f.hsn, 20), identifier: s(f.identifier, 100), stock: s(f.stock, 50), offerPrice: s(f.offerPrice, 20) };
}

/** What's wrong in plain words, or null. */
export function itemProblem(f: ItemFields): string | null {
  if (!f.name) return "Type the item's name";
  if (!Number.isFinite(f.rate) || f.rate < 0) return "The price must be a number, 0 or more";
  if (!f.identifier) return "Pick the Item Identifier: Zoho needs it";
  if (f.stock && !STOCK_OPTIONS.includes(f.stock)) return "Pick a Stock Status from the list";
  if (f.offerPrice && !(Number(f.offerPrice) >= 0)) return "The offer price must be a number, 0 or more";
  if (f.hsn && !/^[0-9A-Za-z]+$/.test(f.hsn)) return "The HSN code can only have letters and numbers";
  return null;
}

export function itemChanges(before: ItemFields, after: ItemFields): ItemChanges {
  const out: ItemChanges = {};
  for (const k of Object.keys(before) as (keyof ItemFields)[]) {
    const same = k === "offerPrice" ? (before[k] === "" ? after[k] === "" : Number(before[k]) === Number(after[k]) && after[k] !== "") : before[k] === after[k];
    if (!same) out[k] = { from: before[k], to: after[k] };
  }
  return out;
}

/** The PUT body: name and rate always (Zoho wants them), the changed fields, and only the changed custom fields. */
export function itemBody(after: ItemFields, changes: ItemChanges): Record<string, unknown> {
  const body: Record<string, unknown> = { name: after.name, rate: after.rate };
  for (const k of Object.keys(TOP) as (keyof ItemFields)[]) if (changes[k]) body[TOP[k]!] = after[k];
  const custom = (Object.keys(CUSTOM) as (keyof ItemFields)[]).filter((k) => changes[k]).map((k) => ({ customfield_id: CUSTOM[k]!.id, value: after[k] }));
  if (custom.length) body.custom_fields = custom;
  return body;
}
