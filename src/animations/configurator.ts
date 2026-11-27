/* ==========================================================================
   Window-in-a-wall configurator, seen straight on
   – the view outside is photography (rendered by Configurator.astro)
   – the wall, reveal, sill and aluminium profiles are layered DOM, drawn to
     real proportions in millimetres; styling lives in window-scene.css
   – opening: sliding leaves move as they are; leaves that swing or fold are
     drawn as solid bodies while open (open-leaves.ts)
   ========================================================================== */

import type { OpenLeaves, SolidSpec, FinishLook } from "./open-leaves";

export interface CfgFinish {
  slug: string;
  name: string;
  tier: "natural" | "solid" | "premium";
  swatch: string;
}
type ModelKey = "sliding" | "casement" | "fold" | "bay" | "fixed" | "geo";

/** Wall panel size and the centre of the window on it (mm). */
const WALL_W = 3150;
const CX = WALL_W / 2;
const CY = 1100;
/** Visible depth of the plastered recess around the frame. */
const REVEAL = 70;
/** Viewer distance used for the perspective of opening leaves. */
const PERSP = 3600;

type Side = "t" | "r" | "b" | "l";
type Widths = Record<Side, number>;

const rad = (deg: number) => (deg * Math.PI) / 180;
const mm = (n: number) => `calc(var(--mm) * ${+n.toFixed(2)})`;
const even = (n: number): Widths => ({ t: n, r: n, b: n, l: n });

function el(parent: Element, cls: string) {
  const d = document.createElement("div");
  d.className = cls;
  parent.appendChild(d);
  return d;
}

function box(parent: Element, cls: string, x: number, y: number, w: number, h: number) {
  const d = el(parent, cls);
  d.style.left = mm(x);
  d.style.top = mm(y);
  d.style.width = mm(w);
  d.style.height = mm(h);
  return d;
}

const poly = (pts: [number, number][]) => `polygon(${pts.map(([x, y]) => `${mm(x)} ${mm(y)}`).join(",")})`;

/** A mitred rectangular ring as four separate bars, each shaded from its outer to its inner edge. */
function ring(parent: Element, kind: string, x: number, y: number, w: number, h: number, s: Widths) {
  const g = box(parent, "wn-ring", x, y, w, h);
  const bar = (side: Side, bx: number, by: number, bw: number, bh: number, pts: [number, number][]) => {
    box(g, `wn-bar wn-${kind} wn-bar--${side}`, bx, by, bw, bh).style.clipPath = poly(pts);
  };
  bar("t", 0, 0, w, s.t, [[0, 0], [w, 0], [w - s.r, s.t], [s.l, s.t]]);
  bar("b", 0, h - s.b, w, s.b, [[s.l, 0], [w - s.r, 0], [w, s.b], [0, s.b]]);
  bar("l", 0, 0, s.l, h, [[0, 0], [s.l, s.t], [s.l, h - s.b], [0, h]]);
  bar("r", w - s.r, 0, s.r, h, [[s.r, 0], [s.r, h], [0, h - s.b], [0, s.t]]);
  return g;
}

/** Corners of a pointy-topped hexagon of circumradius r around (cx, cy). */
const hexPts = (cx: number, cy: number, r: number): [number, number][] =>
  [0, 1, 2, 3, 4, 5].map((i) => [cx + r * Math.sin((i * Math.PI) / 3), cy - r * Math.cos((i * Math.PI) / 3)]);

/** A hexagonal ring: six top bars, each rotated into place, mitred at 60 degrees. */
function hexRing(parent: Element, kind: string, cx: number, cy: number, r: number, t: number) {
  const apothem = r * Math.cos(Math.PI / 6);
  const cut = t * Math.tan(Math.PI / 6);
  for (let i = 0; i < 6; i++) {
    const b = box(parent, `wn-bar wn-${kind} wn-bar--t wn-bar--hex${i}`, cx - r / 2, cy - apothem, r, t);
    b.style.clipPath = poly([[0, 0], [r, 0], [r - cut, t], [cut, t]]);
    b.style.transformOrigin = `50% ${mm(apothem)}`;
    b.style.transform = `rotate(${30 + 60 * i}deg)`;
  }
}

function handle(parent: Element, x: number, y: number) {
  const g = box(parent, "wn-handle", x - 15, y - 90, 30, 180);
  el(g, "wn-handle__plate");
  el(g, "wn-handle__lever");
}

/** A glazed leaf: glass, EPDM gasket and the aluminium sash around them. */
function sash(parent: Element, x: number, y: number, w: number, h: number, s: Widths) {
  const g = box(parent, "wn-sash", x, y, w, h);
  const gw = w - s.l - s.r;
  const gh = h - s.t - s.b;
  box(g, "wn-glass", s.l - 2, s.t - 2, gw + 4, gh + 4);
  ring(g, "gasket", s.l - 2, s.t - 2, gw + 4, gh + 4, even(11));
  ring(g, "alu", 0, 0, w, h, s);
  return g;
}

/** A fixed pane held by a slim bead, no opening sash. */
function fixedPane(parent: Element, x: number, y: number, w: number, h: number) {
  box(parent, "wn-glass", x, y, w, h);
  ring(parent, "gasket", x, y, w, h, even(30));
  ring(parent, "bead", x, y, w, h, even(22));
}

interface Opening {
  /** bounds of the hole in the wall (mm, wall coordinates) */
  x: number;
  y: number;
  w: number;
  h: number;
  clip: string;
  /** which part of the view to keep when the opening is narrower than the photo */
  focus?: string;
}
interface Built {
  group: HTMLElement;
  opening: Opening;
  update: (open: number) => void;
  /** leaves that swing or fold, as solid bodies */
  solid?: SolidSpec;
}

/** Plaster recess, stone sill and an origin at the frame's top-left corner. */
function rectOpening(group: HTMLElement, W: number, H: number) {
  const x = CX - W / 2;
  const y = CY - H / 2;
  const ow = W + 2 * REVEAL;
  const oh = H + 2 * REVEAL;
  const opening: Opening = { x: x - REVEAL, y: y - REVEAL, w: ow, h: oh, clip: "none" };
  box(group, "wn-recess", opening.x, opening.y, ow, oh);
  ring(group, "reveal", opening.x, opening.y, ow, oh, even(REVEAL));
  const win = box(group, "wn-window", x, y, W, H);
  // the sill board sits on the bottom reveal and oversails the wall
  box(group, "wn-sill", opening.x - 55, opening.y + oh - 34, ow + 110, 86);
  return { opening, win };
}

/** Container whose children share one vanishing point at the middle of the window. */
function perspective(parent: Element, W: number, H: number) {
  const p = box(parent, "wn-persp", 0, 0, W, H);
  p.style.perspective = mm(PERSP);
  p.style.perspectiveOrigin = "50% 50%";
  return p;
}

const builders: Record<ModelKey, (group: HTMLElement) => Omit<Built, "group">> = {
  sliding(group) {
    const W = 2400;
    const H = 1500;
    const f = 62;
    const fb = 82;
    const { opening, win } = rectOpening(group, W, H);
    const iw = W - 2 * f;
    const ih = H - f - fb;
    const sw = iw / 2 + 36;
    // two sliding tracks along the bottom of the frame
    box(win, "wn-track", f, H - fb - 22, iw, 22);
    sash(win, f, f, sw, ih - 8, { t: 66, b: 76, l: 78, r: 58 }).classList.add("wn-sash--rear");
    const front = sash(win, f + iw - sw, f, sw, ih - 8, { t: 66, b: 76, l: 58, r: 78 });
    front.classList.add("wn-sash--front");
    handle(front, 29, (ih - 8) / 2);
    ring(win, "alu", 0, 0, W, H, { t: f, r: f, b: fb, l: f });
    for (const k of [0.27, 0.5, 0.73]) box(win, "wn-slot", W * k - 45, H - 34, 90, 9);
    return {
      opening,
      update: (open) => (front.style.transform = `translateX(${mm(-open * (iw - sw - 70))})`),
    };
  },

  casement(group) {
    const W = 1900;
    const H = 1560;
    const f = 68;
    const { opening, win } = rectOpening(group, W, H);
    opening.focus = "42%";
    ring(win, "alu", 0, 0, W, H, even(f));
    const p = perspective(win, W, H);
    const lw = (W - 2 * f) / 2;
    const lh = H - 2 * f;
    const L = sash(p, f, f, lw - 2, lh, even(68));
    const R = sash(p, f + lw + 2, f, lw - 2, lh, even(68));
    L.style.transformOrigin = "0 50%";
    R.style.transformOrigin = "100% 50%";
    handle(R, 34, lh / 2 + 40);
    const barrels = [200, lh - 260];
    for (const y of barrels) {
      box(L, "wn-hinge", -7, y, 20, 90);
      box(R, "wn-hinge", lw - 15, y, 20, 90);
    }
    const SWING = 64;
    return {
      opening,
      /* flat while closed; this stand-in transform is only seen if the solid drawing can't start */
      update: (open) => {
        L.style.transform = open ? `rotateY(${open * SWING}deg)` : "";
        R.style.transform = open ? `rotateY(${-open * SWING}deg)` : "";
      },
      solid: {
        host: p,
        w: W,
        h: H,
        jamb: { x: f, y: f, w: W - 2 * f, h: lh },
        flat: [L, R],
        leaves: [
          { w: lw - 2, h: lh, y: f, s: even(68), hinge: "left", barrels },
          { w: lw - 2, h: lh, y: f, s: even(68), hinge: "right", barrels, handle: { x: 34, y: lh / 2 + 40 } },
        ],
        pose: (open) => [
          { x: f, z: 0, turn: rad(open * SWING) },
          { x: f + lw + 2 + (lw - 2), z: 0, turn: rad(-open * SWING) },
        ],
      },
    };
  },

  /* four leaves that concertina to the left (Robus 40) */
  fold(group) {
    const FOLD_DEPTH = 40; // the Robus 40 is a slim system
    const W = 2400;
    const H = 1580;
    const f = 64;
    const { opening, win } = rectOpening(group, W, H);
    ring(win, "alu", 0, 0, W, H, { t: f, r: f, b: 78, l: f });
    const iw = W - 2 * f;
    const ih = H - f - 78;
    const n = 4;
    const pw = iw / n;
    const p = perspective(box(win, "wn-clear", f, f, iw, ih), iw, ih);
    const leaves = Array.from({ length: n }, (_, i) => {
      const leaf = sash(p, 0, 0, pw - 3, ih, even(56));
      leaf.style.transformOrigin = "0 50%";
      if (i === n - 1) handle(leaf, pw - 31, ih / 2 + 30);
      return leaf;
    });
    return {
      opening,
      update: (open) => {
        const a = rad(open * 76);
        leaves.forEach((leaf, i) => {
          // hinge points zig-zag between the frame line and outside it
          const z = i % 2 ? -pw * Math.sin(a) : 0;
          leaf.style.transform = `translate3d(${mm(i * pw * Math.cos(a))}, 0, ${mm(z)}) rotateY(${(i % 2 ? -1 : 1) * open * 76}deg)`;
        });
      },
      solid: {
        host: p,
        w: iw,
        h: ih,
        jamb: { x: 0, y: 0, w: iw, h: ih },
        flat: leaves,
        leaves: leaves.map((_, i) => ({
          w: pw - 3,
          h: ih,
          y: 0,
          s: even(56),
          depth: FOLD_DEPTH,
          hinge: "left" as const,
          handle: i === n - 1 ? { x: pw - 31, y: ih / 2 + 30 } : undefined,
        })),
        pose: (open) => {
          const a = rad(open * 81);
          // the leaves have thickness: leave room for it, so the folded stack sits side by side instead of cutting through itself
          let x = FOLD_DEPTH * Math.sin(a);
          return leaves.map((_, i) => {
            // leaves hinged at the back meet edge to edge; those hinged at the front need both their depths between them
            if (i) x += pw * Math.cos(a) + (i % 2 ? 8 : 2 * FOLD_DEPTH + 6) * Math.sin(a);
            return { x, z: i % 2 ? -pw * Math.sin(a) : 0, turn: i % 2 ? -a : a };
          });
        },
      },
    };
  },

  /* a fixed centre pane with two casement leaves at 40 degrees, projecting outwards */
  bay(group) {
    const W = 2400;
    const H = 1560;
    const cw = 1250;
    const ang = 40;
    const side = (W - cw) / 2;
    const uw = side / Math.cos((ang * Math.PI) / 180);
    const depth = uw * Math.sin((ang * Math.PI) / 180);
    const { opening, win } = rectOpening(group, W, H);
    // where the far (centre) corners land on screen: they close the head and sill of the bay
    const s = PERSP / (PERSP + depth);
    const far = (x: number, y: number): [number, number] => [W / 2 + (x - W / 2) * s, H / 2 + (y - H / 2) * s];
    box(win, "wn-soffit", 0, 0, W, H).style.clipPath = poly([[0, 0], [W, 0], far(W - side, 0), far(side, 0)]);
    box(win, "wn-board", 0, 0, W, H).style.clipPath = poly([[0, H], far(side, H), far(W - side, H), [W, H]]);
    const p = perspective(win, W, H);
    const centre = box(p, "wn-pane", side, 0, cw, H);
    fixedPane(centre, 58, 58, cw - 116, H - 116);
    ring(centre, "alu", 0, 0, cw, H, even(60));
    centre.style.transform = `translateZ(${mm(-depth)})`;
    const L = sash(p, 0, 0, uw, H, even(68));
    const R = sash(p, W - uw, 0, uw, H, even(68));
    L.style.transformOrigin = "0 50%";
    R.style.transformOrigin = "100% 50%";
    el(L, "wn-leafshade").style.opacity = "0.08";
    el(R, "wn-leafshade").style.opacity = "0.08";
    handle(R, 34, H / 2 + 40);
    L.style.transform = `rotateY(${ang}deg)`;
    R.style.transform = `rotateY(${-ang}deg)`;
    /* open: the two angled side frames stay put, as the bay's structure, and a sash swings out of each */
    const jw = 36;
    const sw = uw - 2 * jw;
    const sh = H - 2 * jw;
    const SWING = 38;
    const hx = jw * Math.cos(rad(ang));
    const hz = -jw * Math.sin(rad(ang));
    return {
      opening,
      update: () => void 0,
      solid: {
        host: p,
        w: W,
        h: H,
        flat: [L, R],
        leaves: [
          { w: uw, h: H, y: 0, s: even(jw), hinge: "left", frameOnly: true },
          { w: uw, h: H, y: 0, s: even(jw), hinge: "right", frameOnly: true },
          { w: sw, h: sh, y: jw, s: even(54), hinge: "left" },
          { w: sw, h: sh, y: jw, s: even(54), hinge: "right", handle: { x: 28, y: sh / 2 + 40 } },
        ],
        pose: (open) => [
          { x: 0, z: 0, turn: rad(ang) },
          { x: W, z: 0, turn: rad(-ang) },
          { x: hx, z: hz, turn: rad(ang + open * SWING) },
          { x: W - hx, z: hz, turn: rad(-(ang + open * SWING)) },
        ],
      },
    };
  },

  fixed(group) {
    const W = 2400;
    const H = 1560;
    const f = 60;
    const { opening, win } = rectOpening(group, W, H);
    fixedPane(win, f - 2, f - 2, W - 2 * f + 4, H - 2 * f + 4);
    ring(win, "alu", 0, 0, W, H, even(f));
    return { opening, update: () => void 0 };
  },

  /* a fixed hexagonal window */
  geo(group) {
    const R = 850;
    const Ro = R + 82;
    const halfW = Ro * Math.cos(Math.PI / 6);
    const opening: Opening = { x: CX - halfW, y: CY - Ro, w: 2 * halfW, h: 2 * Ro, clip: poly(hexPts(halfW, Ro, Ro - 2)), focus: "15%" };
    box(group, "wn-recess wn-recess--hex", opening.x, opening.y, opening.w, opening.h).style.clipPath = opening.clip;
    const gr = R - 70;
    box(group, "wn-glass", CX - R, CY - R, 2 * R, 2 * R).style.clipPath = poly(hexPts(R, R, gr));
    hexRing(group, "reveal", CX, CY, Ro, 82);
    hexRing(group, "gasket", CX, CY, gr + 6, 30);
    hexRing(group, "alu", CX, CY, R, 70);
    return { opening, update: () => void 0 };
  },
};

/** Wood-grain laminate as a tileable image, in the finish's own colour. */
function woodGrain(base: string, vertical: boolean) {
  const w = 1024;
  const h = 256;
  const cv = document.createElement("canvas");
  cv.width = vertical ? h : w;
  cv.height = vertical ? w : h;
  const c = cv.getContext("2d")!;
  if (vertical) c.transform(0, 1, 1, 0, 0, 0);
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);
  // seeded, so both directions show the same board
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 320; i++) {
    const y = rnd() * h;
    const amp = 0.6 + rnd() * 3;
    const phase = rnd() * 6.28;
    // whole number of waves across the tile, so it repeats without a seam
    const freq = (1 + Math.floor(rnd() * 3)) * ((2 * Math.PI) / w);
    c.beginPath();
    for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    c.strokeStyle = rnd() > 0.45 ? `rgba(0,0,0,${0.08 + rnd() * 0.24})` : `rgba(255,226,190,${0.04 + rnd() * 0.13})`;
    c.lineWidth = 0.6 + rnd() * 2.2;
    c.stroke();
  }
  return { canvas: cv, url: `url(${cv.toDataURL("image/jpeg", 0.85)})` };
}

export function mountConfigurator(root: HTMLElement, finishes: CfgFinish[]) {
  const wall = root.querySelector<HTMLElement>("[data-wn]")!;
  const view = wall.querySelector<HTMLElement>("[data-wn-view]")!;
  const layer = wall.querySelector<HTMLElement>("[data-wn-windows]")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- leaves drawn as solid bodies while open ---- */
  let leaves: OpenLeaves | null = null;
  let loading: Promise<void> | null = null;
  let look: FinishLook | null = null;
  /** fetched when the visitor first shows interest in opening, so the 3D library doesn't slow the page down */
  const loadLeaves = () =>
    (loading ??= import("./open-leaves")
      .then((m) => {
        leaves = m.createOpenLeaves();
        if (look) leaves.setFinish(look);
      })
      .catch((e) => console.warn("Solid window drawing unavailable, using the flat one:", e)));

  /** show the current window this far open */
  function paint() {
    const b = built.get(current);
    if (!b) return;
    b.update(openCur);
    if (!b.solid || !leaves) return;
    if (openCur > 0) leaves.draw(b.solid, openCur);
    else leaves.release(b.solid);
  }

  /* ---- opening tween ---- */
  let current: ModelKey = "sliding";
  let openTarget = 0;
  let openCur = 0;
  let raf = 0;
  let last = 0;

  const built = new Map<ModelKey, Built>();
  function show(key: ModelKey) {
    let b = built.get(key);
    if (!b) {
      const group = el(layer, "wn-model");
      b = { group, ...builders[key](group) };
      built.set(key, b);
    }
    built.forEach((x) => {
      x.group.hidden = x !== b;
      if (x !== b && x.solid) leaves?.release(x.solid);
    });
    const o = b.opening;
    Object.assign(view.style, { left: mm(o.x), top: mm(o.y), width: mm(o.w), height: mm(o.h), clipPath: o.clip });
    view.style.setProperty("--focus", o.focus ?? "50%");
    current = key;
    paint();
  }

  function step(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    openCur += (openTarget - openCur) * (1 - Math.exp(-dt * 4.5));
    if (reduced || Math.abs(openTarget - openCur) < 0.001) openCur = openTarget;
    paint();
    raf = openCur === openTarget ? 0 : requestAnimationFrame(step);
  }
  function animate() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }

  /* ---- finishes ---- */
  const grains = new Map<string, ReturnType<typeof woodGrain>[]>();
  function applyFinish(f: CfgFinish) {
    wall.dataset.tier = f.tier;
    let board: HTMLCanvasElement | undefined;
    wall.style.setProperty("--frame", f.swatch);
    if (f.tier === "natural") {
      if (!grains.has(f.slug)) grains.set(f.slug, [woodGrain(f.swatch, false), woodGrain(f.swatch, true)]);
      const [h, v] = grains.get(f.slug)!.map((g) => g.url);
      board = grains.get(f.slug)![0].canvas;
      wall.style.setProperty("--grain-h", h);
      wall.style.setProperty("--grain-v", v);
    }
    look = { colour: f.swatch, tier: f.tier, grain: board };
    leaves?.setFinish(look);
    if (openCur > 0) paint();
  }

  /* ---- UI wiring ---- */
  const qa = <T extends HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const press = (all: HTMLElement[], on: HTMLElement) => all.forEach((x) => x.setAttribute("aria-pressed", String(x === on)));
  const finishName = root.querySelector<HTMLElement>("[data-cfg-finish-name]");
  const modelName = root.querySelector<HTMLElement>("[data-cfg-model-name]");
  const timeName = root.querySelector<HTMLElement>("[data-cfg-time-name]");
  const tierName = { natural: "Wood-grain", premium: "Metallic", solid: "Matte solid" } as const;
  const names: Record<ModelKey, string> = { sliding: "Graf · Sliding", casement: "Livio · Casement", fold: "Robus 40 · Fold & Slide", bay: "Livio · Bay", fixed: "Full View · Fixed", geo: "Geometrical · Hexagon" };
  const openBtn = root.querySelector<HTMLButtonElement>("[data-cfg-open]");
  const openLabel = openBtn?.querySelector<HTMLElement>("[data-cfg-open-label]");
  const setOpen = (v: number) => {
    openTarget = v;
    if (openLabel) openLabel.textContent = v ? "Close window" : "Open window";
    openBtn?.setAttribute("aria-pressed", String(!!v));
  };

  const modelBtns = qa<HTMLButtonElement>("[data-cfg-model]");
  modelBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.cfgModel as ModelKey;
      press(modelBtns, b);
      if (modelName) modelName.textContent = names[key];
      const canOpen = key !== "fixed" && key !== "geo";
      if (openBtn) openBtn.disabled = !canOpen;
      if (!canOpen) {
        setOpen(0);
        openCur = 0;
      }
      show(key);
    })
  );

  const finishBtns = qa<HTMLButtonElement>("[data-cfg-finish]");
  const pickFinish = (i: number) => {
    const f = finishes[i];
    press(finishBtns, finishBtns[i]);
    if (finishName) finishName.textContent = `${f.name} · ${tierName[f.tier]}`;
    applyFinish(f);
  };
  finishBtns.forEach((b) => b.addEventListener("click", () => pickFinish(Number(b.dataset.cfgFinish))));

  /* ---- time of day ---- */
  /** Fetches a view the first time it is wanted; resolves once it can be painted. */
  function loadView(key: string) {
    const img = view.querySelector<HTMLImageElement>(`[data-wn-img="${key}"]`)!;
    if (!img.getAttribute("src")) {
      img.loading = "eager";
      img.src = img.dataset.src!;
    }
    return img.decode().catch(() => void 0);
  }
  const timeBtns = qa<HTMLButtonElement>("[data-cfg-time]");
  let wanted = "day";
  timeBtns.forEach((b) => {
    const key = b.dataset.cfgTime!;
    for (const type of ["pointerenter", "focus"]) b.addEventListener(type, () => void loadView(key), { once: true });
    b.addEventListener("click", async () => {
      wanted = key;
      press(timeBtns, b);
      if (timeName) timeName.textContent = b.textContent?.trim() ?? "";
      // hold the current scene until the new photo is ready, so the pane never goes blank
      await loadView(key);
      if (wanted === key) wall.dataset.time = key;
    });
  });

  const lightSwitch = wall.querySelector<HTMLButtonElement>("[data-wn-switch]")!;
  lightSwitch.addEventListener("click", () => {
    const on = wall.dataset.light !== "on";
    wall.dataset.light = on ? "on" : "off";
    lightSwitch.setAttribute("aria-checked", String(on));
  });

  for (const type of ["pointerenter", "focus", "touchstart"]) openBtn?.addEventListener(type, () => void loadLeaves(), { once: true, passive: true });
  openBtn?.addEventListener("click", async () => {
    setOpen(openTarget ? 0 : 1);
    await loadLeaves(); // start moving only once the leaves can be drawn properly
    animate();
  });
  // an open window is redrawn when the wall changes size
  new ResizeObserver(() => openCur > 0 && paint()).observe(wall);

  // initial state
  pickFinish(Math.max(0, finishes.findIndex((f) => f.name === "Noir")));
  show("sliding");
  root.dataset.cfgReady = "1";
}
