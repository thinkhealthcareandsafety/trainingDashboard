import "server-only";
import path from "node:path";

/*
 * Reading a scanned page (owner, 24 Nov: "need to open it and check and find the location of the PO number"): the first
 * page is drawn as a picture and its words are read from it (Tesseract, on our server; nothing is sent anywhere). Twice:
 * as it is, and with the paper's shadows taken out (a photo taken in poor light). A sideways page is turned first.
 * Only for /api/invoice-converter: next.config.ts ships the reader's files (node_modules, assets/ocr) with that route.
 */
const WIDTH = 2400;
const SURE = 55; // below this the page is probably sideways

type Canvas = typeof import("@napi-rs/canvas");
type Worker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>;
let worker: Promise<Worker> | null = null;
const reader = () => (worker ??= (async () => {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, { langPath: path.join(process.cwd(), "assets", "ocr"), gzip: false, cacheMethod: "none" });
})().catch((e) => { worker = null; throw e; }));

/** The picture turned by `deg`, and (`flat`) each point judged against the paper round it, so shadows go. */
async function prepare(cv: Canvas, png: Buffer, deg: number, flat: boolean): Promise<Buffer> {
  const img = await cv.loadImage(png), side = deg % 180 !== 0;
  const W = side ? img.height : img.width, H = side ? img.width : img.height;
  const c = cv.createCanvas(W, H), x = c.getContext("2d");
  x.translate(W / 2, H / 2);
  x.rotate((deg * Math.PI) / 180);
  x.drawImage(img, -img.width / 2, -img.height / 2);
  if (flat) {
    const d = x.getImageData(0, 0, W, H), p = d.data, light = new Float32Array(W * H), sum = new Float64Array((W + 1) * (H + 1)), R = 24;
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let k = 0; k < W; k++) {
        const o = (y * W + k) * 4, l = 0.3 * p[o] + 0.59 * p[o + 1] + 0.11 * p[o + 2];
        light[y * W + k] = l;
        row += l;
        sum[(y + 1) * (W + 1) + k + 1] = sum[y * (W + 1) + k + 1] + row;
      }
    }
    for (let y = 0; y < H; y++) for (let k = 0; k < W; k++) {
      const a = Math.max(0, k - R), b = Math.min(W, k + R), u = Math.max(0, y - R), v = Math.min(H, y + R);
      const mean = (sum[v * (W + 1) + b] - sum[u * (W + 1) + b] - sum[v * (W + 1) + a] + sum[u * (W + 1) + a]) / ((b - a) * (v - u));
      const l = light[y * W + k], o = (y * W + k) * 4;
      p[o] = p[o + 1] = p[o + 2] = l < mean * 0.86 ? Math.max(0, 255 * (l / mean - 0.45)) : 255;
      p[o + 3] = 255;
    }
    x.putImageData(d, 0, 0);
  }
  return c.toBuffer("image/png");
}

/** The words on the PDF's first page, read from its picture. */
export async function readFirstPage(bytes: Uint8Array): Promise<string> {
  const cv = await import("@napi-rs/canvas");
  const { renderPageAsImage } = await import("unpdf");
  const png = Buffer.from(await renderPageAsImage(new Uint8Array(bytes), 1, { canvasImport: () => import("@napi-rs/canvas"), width: WIDTH }));
  const w = await reader();
  const read = async (b: Buffer) => { const { data } = await w.recognize(b, { rotateAuto: true }); return { text: data.text, sure: data.confidence }; };
  let plain = await read(png), deg = 0;
  if (plain.sure < SURE) {
    for (const d of [90, 270]) {
      const turned = await read(await prepare(cv, png, d, false));
      if (turned.sure > plain.sure + 10) { plain = turned; deg = d; }
      if (plain.sure >= SURE) break;
    }
  }
  const flat = await read(await prepare(cv, png, deg, true));
  return `${plain.text}\n${flat.text}`;
}
