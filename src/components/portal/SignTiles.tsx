/*
 * The programme signs (Safety-sign direction): each programme in the international safety-sign language — First Aid and
 * AED in safe-condition green, Fire in fire red, CPR as a mandatory-action blue. Drawn here as SVG, one stroke weight.
 */
type Sign = { key: string; label: string; bg: string; icon: React.ReactNode };

export const SIGNS: Sign[] = [
  { key: "first-aid", label: "First Aid", bg: "var(--sign-green)", icon: <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" /> },
  {
    key: "aed", label: "AED", bg: "var(--sign-green)",
    icon: <><path d="M16 27s-10-6.2-10-13.3C6 10 8.6 7.5 11.7 7.5c1.9 0 3.4 1 4.3 2.4.9-1.4 2.4-2.4 4.3-2.4 3.1 0 5.7 2.5 5.7 6.2C26 20.8 16 27 16 27z" fill="#fff" /><path d="M17.2 10.5 13.6 17h3.2l-1.6 5.8 4.4-7.4h-3.2l1.6-4.9z" fill="var(--sign-green)" /></>,
  },
  {
    key: "cpr", label: "CPR", bg: "var(--action)",
    icon: <><path d="M5 17h5.5l2.2-5 3.6 10 2.6-6.5 1.4 1.5H27" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></>,
  },
  {
    key: "fire", label: "Fire Safety", bg: "var(--sign-red)",
    icon: <path d="M16.4 4.5c.6 3.6-1.3 5.6-3 7.6-1.8 2-3.6 4-3.6 7.3A6.3 6.3 0 0 0 16 25.8a6.3 6.3 0 0 0 6.3-6.4c0-2.3-1-4.1-2.1-5.4-.2 1.5-1 2.6-2.2 3.1.5-3.8-.5-8.6-1.6-12.6z" fill="#fff" />,
  },
];

export function SignTile({ sign, size = 52, delay = 0 }: { sign: Sign; size?: number; delay?: number }) {
  return (
    <span className="sign-tile inline-grid shrink-0 place-items-center rounded-[10px] shadow-[0_2px_6px_rgb(2_40_60/0.25)]" style={{ width: size, height: size, background: sign.bg, animationDelay: `${delay}ms` }} aria-hidden>
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66}>{sign.icon}</svg>
    </span>
  );
}
