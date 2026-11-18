import { brandsOf, topicOf } from "./quoteEmails";

/*
 * AEDs, pads, batteries and cabinets: bought, sold and in stock (owner, 18 Nov: "basically all about purchase sold and in
 * stock for all our aeds, pads, battery and cabinets — just exclude inactive items; a summary as a whole, and brand wise;
 * cabinets don't have brands"). The first section of the daily summary email. Pure: the server passes the active Zoho
 * items (with stock on hand), the bills' lines (bought) and the invoices' lines (sold).
 */

export type AedKind = "aed" | "pads" | "battery" | "cabinet";
export const AED_KINDS: { key: AedKind; label: string }[] = [
  { key: "aed", label: "AEDs" },
  { key: "pads", label: "Pads" },
  { key: "battery", label: "Batteries" },
  { key: "cabinet", label: "Cabinets" },
];

/** Which of the four an item is: by its Item Identifier, else its name (as the quote emails sort them); goods only, no trainers. */
export function aedKindOf(name: string, identifier?: string | null, productType?: string | null): AedKind | null {
  if (productType && productType !== "goods") return null; // AED Rental and other services
  const t = topicOf(name, identifier ?? null);
  if (t === "aed") return "aed";
  if (t === "aedPads") return "pads";
  if (t === "aedBattery") return "battery";
  if (t === "aedCabinet" && /cabinet/i.test(name)) return "cabinet"; // not brackets, signage, other accessories
  return null;
}

/** Zoho's Brand, else the make in the name ("Philips FRx …"), else "Other". */
export const brandOf = (brand: string | null | undefined, name: string) => brand?.trim() || brandsOf([name])[0] || "Other";

export type AedItem = { id: string; name: string; kind: AedKind; brand: string; stock: number | null; cost: number };
/** One line of a bill (bought) or an invoice (sold). */
export type MoveLine = { itemId: string; qty: number; value: number; date: string };

export type Tally = { stock: number; stockValue: number; bought: number; boughtValue: number; sold: number; soldValue: number; boughtToday: number; soldToday: number; boughtTodayValue: number; soldTodayValue: number };
export type AedReport = {
  total: Tally;
  kinds: { kind: AedKind; label: string; tally: Tally; brands: { brand: string; tally: Tally }[] }[];
  /** Items whose stock Zoho didn't give. */
  stockUnknown: number;
};

const zero = (): Tally => ({ stock: 0, stockValue: 0, bought: 0, boughtValue: 0, sold: 0, soldValue: 0, boughtToday: 0, soldToday: 0, boughtTodayValue: 0, soldTodayValue: 0 });
/** Anything to say about it (stock, or bought / sold in the period). */
export const busy = (t: Tally) => t.stock !== 0 || t.bought !== 0 || t.sold !== 0;

/** Adds up stock, bought and sold over the period (all lines given) and on `today`: as a whole, by kind, by brand (cabinets: no brands). */
export function aedReport(items: AedItem[], bought: MoveLine[], sold: MoveLine[], today: string): AedReport {
  const byId = new Map(items.map((i) => [i.id, i]));
  const total = zero();
  const kinds = new Map<AedKind, { tally: Tally; brands: Map<string, { brand: string; tally: Tally }> }>(AED_KINDS.map((k) => [k.key, { tally: zero(), brands: new Map() }]));
  const tallies = (i: AedItem): Tally[] => {
    const k = kinds.get(i.kind)!;
    const key = i.brand.toLowerCase();
    if (!k.brands.has(key)) k.brands.set(key, { brand: i.brand, tally: zero() });
    return i.kind === "cabinet" ? [total, k.tally] : [total, k.tally, k.brands.get(key)!.tally];
  };
  let stockUnknown = 0;
  for (const i of items) {
    if (i.stock === null) { stockUnknown++; continue; }
    for (const t of tallies(i)) { t.stock += i.stock; t.stockValue += i.stock * i.cost; }
  }
  for (const [lines, side] of [[bought, "bought"], [sold, "sold"]] as const) for (const l of lines) {
    const i = byId.get(l.itemId);
    if (!i) continue; // not one of the four, or an inactive item
    for (const t of tallies(i)) {
      t[side] += l.qty; t[`${side}Value`] += l.value;
      if (l.date === today) { t[`${side}Today`] += l.qty; t[`${side}TodayValue`] += l.value; }
    }
  }
  return {
    total,
    stockUnknown,
    kinds: AED_KINDS.map(({ key, label }) => {
      const k = kinds.get(key)!;
      const brands = key === "cabinet" ? [] : [...k.brands.values()].filter((b) => busy(b.tally)).sort((a, b) => b.tally.stock - a.tally.stock || b.tally.sold - a.tally.sold || a.brand.localeCompare(b.brand));
      return { kind: key, label, tally: k.tally, brands };
    }),
  };
}
