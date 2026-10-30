// Lets `node --test` run the TypeScript in src/lib directly (Node strips the types): "@/x" → src/x.ts, and imports
// written without an extension ("./model") → that file's .ts. No packages needed (owner, 29 Oct: tests, phase 2).
// The database and sign-in are ALWAYS the in-memory fakes in tests/fakes — a test can never reach the live data.
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`
  import { existsSync } from "node:fs";
  import { fileURLToPath, pathToFileURL } from "node:url";
  const FAKES = { "@/lib/db": ${JSON.stringify(new URL("./fakes/db.ts", import.meta.url).href)}, "@/lib/auth": ${JSON.stringify(new URL("./fakes/auth.ts", import.meta.url).href)} };
  const SRC = ${JSON.stringify(new URL("../src/", import.meta.url).href)};
  const REAL = { [new URL("lib/db.ts", SRC).href]: FAKES["@/lib/db"], [new URL("lib/auth.ts", SRC).href]: FAKES["@/lib/auth"] };
  export async function resolve(spec, ctx, next) {
    if (FAKES[spec]) return next(FAKES[spec], ctx);
    // Next's CommonJS entry points need their file name under plain Node ESM (quotations → zohoSync → next/server).
    if (spec === "next/server") return next("next/server.js", ctx);
    // "server-only" throws outside Next's server build; in a test it's just a marker.
    if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    let url = null;
    if (spec.startsWith("@/")) url = new URL(spec.slice(2), SRC);
    else if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) url = new URL(spec, ctx.parentURL);
    // "\\." — inside this template string a single backslash would vanish, and "tileEdits" would pass for a ".ts" file.
    if (url && !/\\.[cm]?[jt]sx?$/.test(url.pathname)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(fileURLToPath(url.href + ext))) { url = new URL(url.href + ext); break; }
    }
    // Also when imported relatively ("./db" from cachedRead.ts) — before 30 Oct only "@/lib/db" was swapped.
    if (url && REAL[url.href]) return next(REAL[url.href], ctx);
    return next(url ? url.href : spec, ctx);
  }
`));
