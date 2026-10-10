import type { CertRow } from "./types";

/*
 * Participation certificates (Fulfillment board). Numbering and the two designs follow the certificate generator
 * (D:\Projects\certificate-generator — github.com/Jasmeet1025/certificate-generator): FAT-OD/<training date>/<serial>,
 * where the serial is the row's serial in the master sheet. The designs themselves (they carry the trainer's signature
 * and the company seal) are uploaded once by Admin into MongoDB `certDesigns` — never committed: this repo is public.
 */

export type DesignId = "bls" | "fa";
export const DESIGNS: { id: DesignId; label: string; course: string; file: string }[] = [
  { id: "bls", label: "Basic Life Support (CPR & AED)", course: "Basic Life Support (CPR & AED Training)", file: "cpr-aed.pdf" },
  { id: "fa", label: "CPR, AED & First Aid", course: "CPR, AED and First aid Training", file: "cpr-aed-first-aid.pdf" },
];
export const isDesignId = (x: unknown): x is DesignId => x === "bls" || x === "fa";

/** The design that fits the training: First Aid trainings get the First Aid certificate. */
export const designFor = (trainingNames: string[]): DesignId => (trainingNames.some((n) => /first\s*aid/i.test(n)) ? "fa" : "bls");

/** "2026-10-06" → "06-10-2026" / "06/10/2026". */
const dmy = (ymd: string, sep: string) => ymd.slice(0, 10).split("-").reverse().join(sep);
/** The date as printed after "Training Date:" — 06/10/2026. */
export const printedDate = (ymd: string) => dmy(ymd, "/");
/** FAT-OD/<training date>/<serial in the master sheet> — e.g. FAT-OD/06-10-2026/2077. */
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

/** The batch's rows, numbered from `firstSerial`. */
export function certRows(names: string[], firstSerial: number, t: { location: string; course: string; date: string }): CertRow[] {
  return names.map((name, i) => ({
    serial: firstSerial + i, certNo: certificateNumber(t.date, firstSerial + i), name, location: t.location, course: t.course, date: t.date,
  }));
}

/** "<Alias> certificates.pdf", safe as a file name. */
export const pdfName = (location: string) => `${location.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Training"} certificates.pdf`;
