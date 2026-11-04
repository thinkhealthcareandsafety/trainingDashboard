/*
 * What the Items page leaves out at first (owner, 4 Nov: "the items must not show services, office supplies and elan vital"; Training Services stay,
 * and "i should still be able to utilize them if i want one day": its Everything choice shows these and inactive items). Only that page: a quotation can
 * still pick them from the item search and Browse items.
 */
const HIDDEN = new Set(["services", "office supplies", "elan vital"]);

const isTrainingService = (i: { group?: string | null }) => (i.group ?? "").trim().toLowerCase() === "training services";

export const onItemsPage = (i: { service?: boolean; group?: string | null; category?: string | null }) =>
  (!i.service || isTrainingService(i)) && !HIDDEN.has((i.group ?? i.category ?? "").trim().toLowerCase());
