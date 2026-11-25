/*
 * Reading a scanned page (owner, 24 Nov: "need to open it and check and find the location of the PO number"): the first
 * page is drawn as a picture and its words are read from it (Tesseract), in the person's own browser — the host's servers
 * couldn't run it (24 Nov). Its files are ours (public/ocr); nothing goes to anyone else. Read twice: as it is, and with
 * the paper's shadows taken out (a photo taken in poor light). A sideways page is turned first. Browser only.
 */
const WIDTH = 2400;
const LARGE = 3400;
const SURE = 55; // below this the page is probably sideways

type Worker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>;
let worker: Promise<Worker> | null = null;
const reader = () => (worker ??= (async () => {
  const { createWorker } = await import("tesseract.js");
  const at = `${window.location.origin}/ocr`;
  return createWorker("eng", 1, { workerPath: `${at}/worker.min.js`, corePath: at, langPath: at, gzip: false, workerBlobURL: false });
})().catch((e) => { worker = null; throw e; }));

/** Done for now: the reader's memory is given back. */
export function stopReading() {
  const w = worker;
  worker = null;
  void w?.then((x) => x.terminate()).catch(() => {});
}

/** The picture turned by `deg`, and (`flat`) each point judged against the paper round it, so shadows go. */
function prepare(img: ImageBitmap, deg: number, flat: boolean): HTMLCanvasElement {
  const side = deg % 180 !== 0, W = side ? img.height : img.width, H = side ? img.width : img.height;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: flat })!;
  x.translate(W / 2, H / 2);
  x.rotate((deg * Math.PI) / 180);
  x.drawImage(img, -img.width / 2, -img.height / 2);
  if (!flat) return c;
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
  return c;
}

/** The words on the PDF's first page, read from its picture. */
export async function readFirstPage(bytes: Uint8Array): Promise<string> {
  const { renderPageAsImage } = await import("unpdf");
  const copy = bytes.slice(); // drawing takes the bytes over
  const png = new Blob([new Uint8Array(await renderPageAsImage(bytes, 1, { width: WIDTH }))], { type: "image/png" });
  const img = await createImageBitmap(png);
  try {
    const w = await reader();
    const read = async (b: Blob | HTMLCanvasElement) => { const { data } = await w.recognize(b, { rotateAuto: true }); return { text: data.text, sure: data.confidence }; };
    let plain = await read(png), deg = 0;
    if (plain.sure < SURE) {
      for (const d of [90, 270]) {
        const turned = await read(prepare(img, d, false));
        if (turned.sure > plain.sure + 10) { plain = turned; deg = d; }
        if (plain.sure >= SURE) break;
      }
    }
    const flat = await read(prepare(img, deg, true));
    if (plain.sure >= 78) return `${plain.text}\n${flat.text}`;
    // A poor picture (a photo of the paper): once more, drawn larger.
    const big = await createImageBitmap(new Blob([new Uint8Array(await renderPageAsImage(copy, 1, { width: LARGE }))], { type: "image/png" }));
    try {
      return `${plain.text}\n${flat.text}\n${(await read(prepare(big, deg, true))).text}`;
    } finally {
      big.close();
    }
  } finally {
    img.close();
  }
}
