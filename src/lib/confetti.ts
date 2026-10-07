/**
 * "Training completed": Magic UI's Custom Shapes confetti — triangles, squares, coins and trees bursting all round
 * the button and floating out (no gravity), three quick bursts. Above everything, including modals. The library loads
 * only when it's needed. It shows even when Windows has animation effects turned off (the owner asked for that —
 * many office PCs have them off).
 */
export function celebrate(from?: Element | null) {
  if (typeof window === "undefined") return;
  // Read the button's position now: by the time the library has loaded, the card has moved on and the button is gone.
  const r = from?.getBoundingClientRect();
  const origin = r && r.width ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.5 };
  import("canvas-confetti")
    .then(({ default: confetti }) => {
      const scalar = 2;
      const triangle = confetti.shapeFromPath({ path: "M0 10 L5 0 L10 10z" });
      const square = confetti.shapeFromPath({ path: "M0 0 L10 0 L10 10 L0 10 Z" });
      const coin = confetti.shapeFromPath({ path: "M5 0 A5 5 0 1 0 5 10 A5 5 0 1 0 5 0 Z" });
      const tree = confetti.shapeFromPath({ path: "M5 0 L10 10 L0 10 Z" });
      const defaults = { spread: 360, ticks: 60, gravity: 0, decay: 0.96, startVelocity: 20, shapes: [triangle, square, coin, tree], scalar, origin, zIndex: 9999 };
      const shoot = () => {
        void confetti({ ...defaults, particleCount: 30 });
        void confetti({ ...defaults, particleCount: 5 });
        void confetti({ ...defaults, particleCount: 15, scalar: scalar / 2, shapes: ["circle"] });
      };
      [0, 100, 200].forEach((ms) => window.setTimeout(shoot, ms));
    })
    .catch(() => {}); // Confetti is a nicety — never let it get in the way of saving.
}

/** Plain confetti burst from a button (canvas-confetti's basic example) — "Reached the client" on the Logistics board. */
export function confettiPop(from?: Element | null) {
  if (typeof window === "undefined") return;
  const r = from?.getBoundingClientRect();
  const origin = r && r.width ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.6 };
  import("canvas-confetti")
    .then(({ default: confetti }) => void confetti({ particleCount: 100, spread: 70, origin, zIndex: 9999 }))
    .catch(() => {});
}

/** Fireworks (Magic UI's "Fireworks" example): bursts from both sides for a few seconds — "Certificates Generated". */
export function fireworks(seconds = 4) {
  if (typeof window === "undefined") return;
  import("canvas-confetti")
    .then(({ default: confetti }) => {
      const end = Date.now() + seconds * 1000;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
      const between = (min: number, max: number) => Math.random() * (max - min) + min;
      const timer = window.setInterval(() => {
        const left = end - Date.now();
        if (left <= 0) return window.clearInterval(timer);
        const particleCount = 50 * (left / (seconds * 1000));
        void confetti({ ...defaults, particleCount, origin: { x: between(0.1, 0.3), y: Math.random() - 0.2 } });
        void confetti({ ...defaults, particleCount, origin: { x: between(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    })
    .catch(() => {});
}
