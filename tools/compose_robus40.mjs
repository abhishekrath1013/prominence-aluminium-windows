// Turns the renders from render_robus40.py into the web images.
//   node tools/compose_robus40.mjs <render-dir>
// window.webp gets the real view (a CC0 photo, see src/assets/media/window-view/CREDITS.md) placed behind the
// see-through glass; the reflections in the rendered glass stay on top of it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? ".");
const out = path.join(root, "public/media/robus40");
const VIEW = path.join(root, "src/assets/media/window-view/day.webp");
const VIEW_X = 0.17; // which slice of the wide photo shows through: 0 = left edge, 1 = right edge
const WEBP = { quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true };

await mkdir(out, { recursive: true });
const layout = JSON.parse(await readFile(path.join(src, "layout.json"), "utf8"));
const { width, height } = layout;

// the view fills the glass (the sash is rendered on top and hides the surplus)
const [x0, y0, x1, y1] = layout.glass;
const gx = Math.floor(x0), gy = Math.floor(y0);
const gw = Math.ceil(x1) - gx, gh = Math.ceil(y1) - gy;
const meta = await sharp(VIEW).metadata();
const scale = Math.max(gw / meta.width, gh / meta.height);
const vw = Math.ceil(meta.width * scale), vh = Math.ceil(meta.height * scale);
const view = await sharp(VIEW)
  .resize(vw, vh)
  .extract({ left: Math.round((vw - gw) * VIEW_X), top: Math.round((vh - gh) / 2), width: gw, height: gh })
  .png()
  .toBuffer();

const behind = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: view, left: gx, top: gy }])
  .png()
  .toBuffer();
await sharp(behind).composite([{ input: path.join(src, "window.png") }]).webp(WEBP).toFile(path.join(out, "window.webp"));

for (const [id, part] of Object.entries(layout.parts)) {
  await sharp(path.join(src, `where-${id}.png`)).webp(WEBP).toFile(path.join(out, `where-${id}.webp`));
  const shot = await sharp(path.join(src, `part-${id}.png`)).webp(WEBP).toFile(path.join(out, `part-${id}.webp`));
  part.shot = [shot.width, shot.height];
}

delete layout.glass;
await writeFile(path.join(root, "src/data/robus40-layout.json"), JSON.stringify(layout) + "\n");
console.log("wrote", out);
