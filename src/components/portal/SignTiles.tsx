/*
 * The programme signs (Safety-sign direction), in the international safety-sign grammar (ISO 7010): safe-condition
 * signs are green squares (First Aid, AED), fire-equipment signs red squares (Fire Safety, an extinguisher), and
 * mandatory actions blue circles (CPR) — in sign blue, never the blue of things you can press. Drawn here as SVG.
 */
type Sign = { key: string; label: string; bg: string; shape: "square" | "circle"; icon: React.ReactNode };

export const SIGNS: Sign[] = [
  { key: "first-aid", label: "First Aid", bg: "var(--sign-green)", shape: "square", icon: <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" /> },
  {
    key: "aed", label: "AED", bg: "var(--sign-green)", shape: "square",
    icon: <><path d="M16 27s-10-6.2-10-13.3C6 10 8.6 7.5 11.7 7.5c1.9 0 3.4 1 4.3 2.4.9-1.4 2.4-2.4 4.3-2.4 3.1 0 5.7 2.5 5.7 6.2C26 20.8 16 27 16 27z" fill="#fff" /><path d="M17.2 10.5 13.6 17h3.2l-1.6 5.8 4.4-7.4h-3.2l1.6-4.9z" fill="var(--sign-green)" /></>,
  },
  {
    key: "cpr", label: "CPR", bg: "var(--sign-blue)", shape: "circle",
    icon: <path d="M5 17h5.5l2.2-5 3.6 10 2.6-6.5 1.4 1.5H27" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    key: "fire", label: "Fire Safety", bg: "var(--sign-red)", shape: "square",
    // A fire extinguisher (the fire-equipment sign), not a flame (which in the sign language means "flammable").
    icon: <><rect x="11" y="11" width="9" height="16" rx="2.6" fill="#fff" /><rect x="13.5" y="7.5" width="4" height="4" rx="0.8" fill="#fff" /><path d="M12 7.2h7.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><path d="M17.5 9.2h3.3c1.6 0 2.7 1.1 2.7 2.7V19l1.5 2.2" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>,
  },
];

/** `rim`: the white border of a printed sign — for signs set on navy, where the dark CPR blue would sink. */
export function SignTile({ sign, size = 52, delay = 0, rim = false }: { sign: Sign; size?: number; delay?: number; rim?: boolean }) {
  return (
    <span className={`sign-tile inline-grid shrink-0 place-items-center shadow-[0_2px_6px_rgb(2_40_60/0.25)] ${sign.shape === "circle" ? "rounded-full" : "rounded-[10px]"} ${rim ? "ring-2 ring-white" : ""}`} style={{ width: size, height: size, background: sign.bg, animationDelay: `${delay}ms` }} aria-hidden>
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66}>{sign.icon}</svg>
    </span>
  );
}
