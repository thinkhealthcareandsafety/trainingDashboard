/**
 * A basic confetti burst from an element (the "Training completed" button), above everything including modals.
 * The library loads only when it's needed, and it skips the animation for people who've asked for reduced motion.
 */
export function celebrate(from?: Element | null) {
  if (typeof window === "undefined") return;
  // Read the button's position now: by the time the library has loaded, the card has moved on and the button is gone.
  const r = from?.getBoundingClientRect();
  const origin = r && r.width ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { y: 0.6 };
  import("canvas-confetti")
    .then(({ default: confetti }) => confetti({ particleCount: 100, spread: 70, origin, zIndex: 9999, disableForReducedMotion: true }))
    .catch(() => {}); // Confetti is a nicety — never let it get in the way of saving.
}
