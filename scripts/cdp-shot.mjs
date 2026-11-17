// Dev only: screenshot a page in headless Chrome over CDP (next dev's websocket makes chrome --screenshot hang).
// usage: node scripts/cdp-shot.mjs <url> <out.png> <width> <height> [waitMs] [js-to-run] [afterMs]
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, out, w, h, wait = "6000", js = "", after = "800"] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), "cdp-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--force-prefers-reduced-motion", `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(+wait);
if (js) await send("Runtime.evaluate", { expression: js, awaitPromise: true }); await sleep(+after);
const result = { value: +h };
const full = Math.min(result.value, 6000);
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: full, deviceScaleFactor: 1, mobile: +w < 600 });
await sleep(400);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
ws.close(); chrome.kill();
process.exit(0);
