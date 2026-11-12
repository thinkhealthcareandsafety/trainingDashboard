"use client";

import qrcode from "qrcode-generator";

/*
 * A QR code as crisp SVG (docs/TRAINING_MANAGER_PLAN.md step 7: the coordinator's join link, shown big). `qrPng` makes
 * the PNG for "Download QR", with the training under it so a printed copy says what it's for.
 */

function matrix(text: string): boolean[][] {
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

export function Qr({ text, size = 220, label }: { text: string; size?: number; label: string }) {
  const m = matrix(text);
  const n = m.length, quiet = 4;
  let d = "";
  m.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  return (
    <svg viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" className="block rounded-xl bg-white">
      <path d={d} fill="#0f2a3a" />
    </svg>
  );
}

/** The QR as a PNG data URL, 4 px per module scaled up, with a caption under it. */
export function qrPng(text: string, caption: string[]): string {
  const m = matrix(text);
  const n = m.length, quiet = 4, px = Math.max(8, Math.floor(800 / (n + quiet * 2)));
  const side = (n + quiet * 2) * px;
  const lineH = Math.round(px * 3.2);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side + caption.length * lineH + px * 3;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#0f2a3a";
  m.forEach((row, r) => row.forEach((dark, c) => { if (dark) g.fillRect((c + quiet) * px, (r + quiet) * px, px, px); }));
  g.textAlign = "center";
  caption.forEach((line, i) => {
    g.font = `${i === 0 ? 700 : 500} ${Math.round(lineH * 0.62)}px Manrope, system-ui, sans-serif`;
    g.fillText(line, side / 2, side + lineH * (i + 0.6), side - px * 4);
  });
  return canvas.toDataURL("image/png");
}
