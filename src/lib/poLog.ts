/* The live log of Find POs (owner, 25 Nov): one line per PDF in the PO folder. Pure and client-safe. */
export type PoLogEntry = {
  id: string; name: string; at: string;
  /** How it was read: "no" = its text was enough, "done" = from the page's picture, "due" = waiting, "failed". */
  look: "no" | "due" | "done" | "failed";
  /** Nothing like an order could be read on it. */
  empty: boolean;
  po: string;
  invoices: { number: string; has: boolean }[];
};
/** `matched` / `waiting`: invoices whose PO is here / still to attach. */
export type PoLog = { entries: PoLogEntry[]; matched: number; waiting: number };
/** One scan (owner, 25 Nov: "per scan I need new logs"): the PDFs in the order they were checked, newest first; `fresh` = read for the first time in this scan. */
export type PoRun = { startedAt: string; endedAt: string | null; lines: (PoLogEntry & { fresh: boolean; n: number })[]; matched: number; waiting: number };

export const poLogGroup = (e: PoLogEntry): "open" | "has" | "none" | "unread" | "waiting" =>
  e.invoices.some((i) => !i.has) ? "open" : e.invoices.length ? "has" : e.look === "due" ? "waiting" : e.look === "failed" || e.empty ? "unread" : "none";
export const PO_LOG_LABEL = { open: "To attach", has: "Already attached", none: "No invoice", unread: "Couldn't read", waiting: "Waiting" } as const;
