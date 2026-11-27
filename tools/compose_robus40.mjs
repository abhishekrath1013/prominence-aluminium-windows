// Turns the renders from render_robus40.py into the web images.
//   node tools/compose_robus40.mjs <render-dir>
// window.webp keeps the glass see-through, so the page behind it shows. The render supplies the glass itself; on a
// dark page that alone reads as an empty panel, so a faint tint, a soft reflection with no hard lines and the fine
// edges of a sealed double-glazed unit are laid in behind it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? ".");
const out = path.join(root, "public/media/robus40");
const WEBP = { quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true };

await mkdir(out, { recursive: true });
const layout = JSON.parse(await readFile(path.join(src, "layout.json"), "utf8"));
const { width, height } = layout;

// find the part of the glass you can actually see: walk out from its middle until the sash starts
const raw = await sharp(path.join(src, "window.png")).ensureAlpha().raw().toBuffer();
const alpha = (x, y) => raw[(y * width + x) * 4 + 3];
const [bx0, by0, bx1, by1] = layout.glass;
const midX = Math.round((bx0 + bx1) / 2), midY = Math.round((by0 + by1) / 2);
const reach = (x, y, dx, dy) => {
  while (alpha(x + dx, y + dy) < 235) (x += dx), (y += dy);
  return dx ? x : y;
};
const left = reach(midX, midY, -1, 0), right = reach(midX, midY, 1, 0) + 1;
const top = reach(midX, midY, 0, -1), bottom = reach(midX, midY, 0, 1) + 1;
const gw = right - left, gh = bottom - top;

// the glass, in its own coordinates; it runs a little under the sash so no gap can show
const M = 12;
const grad = (id, dir, colour, stops) =>
  `<linearGradient id="${id}" ${dir}>${stops.map(([o, a]) => `<stop offset="${o}" stop-color="${colour}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const full = `x="${-M}" y="${-M}" width="${gw + 2 * M}" height="${gh + 2 * M}"`;
const pane = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${full} viewBox="${-M} ${-M} ${gw + 2 * M} ${gh + 2 * M}">
<defs>
${grad("sheen", 'x1="0" y1="0" x2="1" y2="0.75"', "#e2f1f4", [[0, 0.17], [0.2, 0.085], [0.42, 0.012], [0.56, 0.062], [0.66, 0.05], [0.82, 0.008], [1, 0.055]])}
${grad("sky", 'x1="0" y1="0" x2="0" y2="1"', "#d6eaf2", [[0, 0.09], [0.4, 0.015], [1, 0]])}
<filter id="shade" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect ${full} fill="#8fc2b6" fill-opacity="0.06"/>
<rect ${full} fill="url(#sheen)"/>
<rect ${full} fill="url(#sky)"/>
<!-- the shade the sash casts just inside the glass -->
<rect x="0" y="0" width="${gw}" height="${gh}" fill="none" stroke="#000000" stroke-opacity="0.4" stroke-width="30" filter="url(#shade)"/>
<!-- light caught on the edge of the front pane, and the faint green edge of the pane behind it -->
<rect x="5" y="5" width="${gw - 10}" height="${gh - 10}" fill="none" stroke="#e4f6f4" stroke-opacity="0.38" stroke-width="2.5"/>
<rect x="24" y="24" width="${gw - 48}" height="${gh - 48}" fill="none" stroke="#9fd8c6" stroke-opacity="0.24" stroke-width="3"/>
</svg>`);

const behind = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: pane, left: left - M, top: top - M }])
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
