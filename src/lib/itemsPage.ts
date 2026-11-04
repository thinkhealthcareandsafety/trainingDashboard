/*
 * What the Items page leaves out (owner, 4 Nov: "the items must not show services, office supplies and elan vital"). Only that page:
 * a quotation can still pick them from the item search and Browse items.
 */
const HIDDEN = new Set(["services", "training services", "office supplies", "elan vital"]);

export const onItemsPage = (i: { service?: boolean; group?: string | null; category?: string | null }) =>
  !i.service && !HIDDEN.has((i.group ?? i.category ?? "").trim().toLowerCase());
