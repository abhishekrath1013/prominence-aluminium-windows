// Turns the renders from render_robus40.py into the web images.
//   node tools/compose_robus40.mjs <render-dir>
// window.webp gets glossy glass: a dark pane with studio reflections, placed behind the see-through glass of the
// render so the rendered reflections and the sash stay on top of it.
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

// the pane, in its own coordinates; it runs a little under the sash so no gap can show
const M = 12;
const poly = (...p) => p.map(([x, y]) => `${(x * gw).toFixed(1)},${(y * gh).toFixed(1)}`).join(" ");
const grad = (id, dir, stops) =>
  `<linearGradient id="${id}" ${dir}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const pane = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${gw + 2 * M}" height="${gh + 2 * M}" viewBox="${-M} ${-M} ${gw + 2 * M} ${gh + 2 * M}">
<defs>
${grad("tint", 'x1="0" y1="0" x2="0.65" y2="1"', [[0, "#4d6670", 1], [0.34, "#233640", 1], [0.7, "#101b22", 1], [1, "#1b2b32", 1]])}
${grad("sky", 'x1="0" y1="0" x2="0" y2="1"', [[0, "#cfe6f5", 0.3], [0.32, "#cfe6f5", 0.04], [1, "#cfe6f5", 0]])}
${grad("wide", 'x1="0" y1="0" x2="1" y2="0.45"', [[0, "#e9f6ff", 0.34], [0.55, "#dcefff", 0.13], [1, "#dcefff", 0.03]])}
${grad("thin", 'x1="0" y1="1" x2="1" y2="0"', [[0, "#f4fbff", 0.04], [0.5, "#f4fbff", 0.3], [1, "#f4fbff", 0.08]])}
${grad("floor", 'x1="1" y1="1" x2="0.3" y2="0.45"', [[0, "#9fc4cf", 0.22], [1, "#9fc4cf", 0]])}
<radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>
</defs>
<rect x="${-M}" y="${-M}" width="${gw + 2 * M}" height="${gh + 2 * M}" fill="url(#tint)"/>
<rect x="${-M}" y="${-M}" width="${gw + 2 * M}" height="${gh + 2 * M}" fill="url(#sky)"/>
<rect x="0" y="0" width="${gw}" height="${gh}" fill="url(#floor)"/>
<g filter="url(#soft)">
<polygon points="${poly([0, 0.08], [0.66, 0], [0.9, 0], [0, 0.62])}" fill="url(#wide)"/>
<polygon points="${poly([0, 0.69], [0.97, 0], [1.02, 0], [0, 0.74])}" fill="url(#thin)"/>
<polygon points="${poly([0.28, 1], [1, 0.46], [1, 0.62], [0.52, 1])}" fill="url(#wide)" opacity="0.55"/>
<polygon points="${poly([0.6, 1], [1, 0.69], [1, 0.705], [0.625, 1])}" fill="url(#thin)"/>
</g>
<ellipse cx="${gw * 0.2}" cy="${gh * 0.13}" rx="${gw * 0.34}" ry="${gh * 0.1}" fill="url(#lamp)"/>
<!-- the edge of the second pane of the sealed unit, and light caught along the glass edge -->
<rect x="22" y="22" width="${gw - 44}" height="${gh - 44}" fill="none" stroke="#bfe3d8" stroke-opacity="0.16" stroke-width="3"/>
<rect x="3" y="3" width="${gw - 6}" height="${gh - 6}" fill="none" stroke="#000000" stroke-opacity="0.55" stroke-width="10"/>
<rect x="9" y="9" width="${gw - 18}" height="${gh - 18}" fill="none" stroke="#d9f1ff" stroke-opacity="0.3" stroke-width="2"/>
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

layout.glass = [left, top, gw, gh]; // the visible glass, for the page's moving glint
await writeFile(path.join(root, "src/data/robus40-layout.json"), JSON.stringify(layout) + "\n");
console.log("wrote", out);
