import type { CertRow } from "./types";

/*
 * Participation certificates (Fulfillment board). Numbering and the two designs follow the certificate generator
 * (D:\Projects\certificate-generator — github.com/Jasmeet1025/certificate-generator): FAT-OD/<training date>/<n>,
 * where n continues the certificate numbers in the master sheet (not its serial column — see `certRows`). The designs themselves (they carry the trainer's signature
 * and the company seal) are uploaded once by Admin into MongoDB `certDesigns` — never committed: this repo is public.
 */

export type DesignId = "bls" | "fa";
export const DESIGNS: { id: DesignId; label: string; course: string; file: string }[] = [
  { id: "bls", label: "Basic Life Support (CPR & AED)", course: "Basic Life Support (CPR & AED Training)", file: "cpr-aed.pdf" },
  { id: "fa", label: "CPR, AED & First Aid", course: "CPR, AED and First aid Training", file: "cpr-aed-first-aid.pdf" },
];
export const isDesignId = (x: unknown): x is DesignId => x === "bls" || x === "fa";

/** The design that fits the training (owner, 14 Oct 2026): a BLS training gets Basic Life Support, every other the CPR, AED & First Aid one. */
export const designFor = (trainingNames: string[]): DesignId => (trainingNames.some((n) => /\bBLS\b|basic\s*life\s*support/i.test(n)) ? "bls" : "fa");

/** "2026-10-06" → "06-10-2026" / "06/10/2026". */
const dmy = (ymd: string, sep: string) => ymd.slice(0, 10).split("-").reverse().join(sep);
/** The date as printed after "Training Date:" — 06/10/2026. */
export const printedDate = (ymd: string) => dmy(ymd, "/");
/** FAT-OD/<training date>/<certificate count> — e.g. FAT-OD/06-10-2026/2077. */
export const certificateNumber = (ymd: string, serial: number) => `FAT-OD/${dmy(ymd, "-")}/${serial}`;

/**
 * Names as pasted: one per line — from an email, a list, or rows copied from Excel / the register. Numbering
 * ("1.", "2)") and empty lines go; from a copied row, the cell that holds a name is kept.
 */
export function parseNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const cells = line.split("\t").map((c) => c.trim()).filter(Boolean);
      const cell = cells.find((c) => /[A-Za-z\u00C0-\u024F]{2,}/.test(c) && !/^FAT-OD\//i.test(c)) ?? "";
      return cell.replace(/^\s*(\d+\s*[.)\-:]\s*|[•*\-–]\s+)/, "").replace(/\s+/g, " ").trim();
    })
    .filter((n) => /[A-Za-z\u00C0-\u024F]/.test(n));
}

/** The participants of one training day (a multi-day training trains different people each day). */
export type DayNames = { date: string; names: string[] };

/**
 * The batch's rows, day by day in date order — each row carries its own training day (sheet date, certificate no.,
 * printed date). The sheet's serial and the number at the end of the certificate no. are two separate counts (rows
 * left blank between locations took a serial but no certificate), so each continues from its own last value.
 */
export function certRows(days: DayNames[], first: { serial: number; cert: number }, t: { location: string; course: string }): CertRow[] {
  const people = [...days].sort((a, b) => a.date.localeCompare(b.date)).flatMap((d) => d.names.map((name) => ({ name, date: d.date })));
  return people.map(({ name, date }, i) => ({
    serial: first.serial + i, certNo: certificateNumber(date, first.cert + i), name, location: t.location, course: t.course, date,
  }));
}

/** Names given on more than one day (one person is trained on one day only) — "Asha Rao (13/10/2026, 14/10/2026)". */
export function namesOnSeveralDays(days: DayNames[]): string[] {
  const seen = new Map<string, { name: string; dates: string[] }>();
  for (const d of days) {
    for (const name of new Set(d.names.map((n) => n.toLowerCase().replace(/\s+/g, " ").trim()))) {
      const s = seen.get(name) ?? { name: d.names.find((n) => n.toLowerCase().replace(/\s+/g, " ").trim() === name)!, dates: [] };
      s.dates.push(d.date);
      seen.set(name, s);
    }
  }
  return [...seen.values()].filter((s) => s.dates.length > 1).map((s) => `${s.name} (${s.dates.map(printedDate).join(", ")})`);
}

/** "<Alias> certificates.pdf", safe as a file name. */
export const pdfName = (location: string) => `${location.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Training"} certificates.pdf`;
