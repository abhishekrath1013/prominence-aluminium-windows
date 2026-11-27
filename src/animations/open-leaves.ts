import * as THREE from "three";

/* ==========================================================================
   The opening leaves of the window-in-a-wall, drawn as solid bodies.

   Closed, the window is flat DOM (configurator.ts), which looks right head on.
   A leaf that swings or folds is not head on: it needs depth, side faces,
   glass that shows as glass and correct hiding of one leaf behind another. So
   while a window is open its leaves are drawn here instead, with
     • the same camera as the page's CSS perspective, so nothing jumps, and
     • the same profile cross-section and finish as the flat drawing.
   Units are millimetres: x to the right, y up, z towards the room.
   ========================================================================== */

export interface Widths {
  t: number;
  r: number;
  b: number;
  l: number;
}

export interface LeafSpec {
  w: number;
  h: number;
  /** top edge, in the host's millimetres (measured downwards) */
  y: number;
  /** profile widths */
  s: Widths;
  /** profile depth, if slimmer or heavier than usual */
  depth?: number;
  /** which side the leaf turns about */
  hinge: "left" | "right";
  /** a frame member only: no glass */
  frameOnly?: boolean;
  /** centre of the handle, in the leaf's own millimetres */
  handle?: { x: number; y: number };
  /** tops of the hinge barrels along the hinged edge */
  barrels?: number[];
}

export interface LeafPose {
  /** where the hinged edge is */
  x: number;
  z: number;
  /** radians, same sign as CSS rotateY */
  turn: number;
}

export interface SolidSpec {
  /** the element the drawing fills; its size in millimetres */
  host: HTMLElement;
  w: number;
  h: number;
  leaves: LeafSpec[];
  pose: (open: number) => LeafPose[];
  /** the opening in the fixed frame, whose depth shows once a leaf moves out of it */
  jamb?: { x: number; y: number; w: number; h: number };
  /** the flat drawing that this replaces while open */
  flat: HTMLElement[];
}

export interface FinishLook {
  colour: string;
  tier: "natural" | "solid" | "premium";
  /** wood-grain board running along x */
  grain?: HTMLCanvasElement;
}

/** viewer distance, equal to the CSS perspective */
const PERSP = 3600;
/** depth of a sash profile */
const DEPTH = 68;
/** how far behind the sash face the glass sits */
const GLASS = 26;
const JAMB = 95;

/* ------------------------------ textures ------------------------------ */
type Stop = [number, string];

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  return cv;
}

function linear(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: Stop[]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  c.fillStyle = g;
}

const white = (a: number) => `rgba(255,255,255,${a})`;
const black = (a: number) => `rgba(0,0,0,${a})`;

/** the front of a profile, outer edge (top row) to glass edge: the same cross-section as .wn-alu */
const FACE: Stop[] = [
  [0, white(0.42)], [0.05, white(0.12)], [0.36, white(0.03)], [0.42, black(0.55)], [0.46, black(0.3)], [0.49, white(0.24)],
  [0.56, white(0.04)], [0.8, black(0.1)], [0.88, white(0.22)], [0.93, black(0.28)], [1, black(0.55)],
];
/** a side of the profile, room edge (top row) to outside edge */
const SIDE: Stop[] = [
  [0, white(0.4)], [0.06, white(0.1)], [0.4, black(0.04)], [0.47, black(0.5)], [0.53, white(0.16)], [0.6, white(0.02)],
  [0.92, black(0.18)], [1, black(0.4)],
];

/** one metre of profile: the finish's colour or wood, then the section's light and shade */
function profileCanvas(look: FinishLook, section: Stop[]) {
  const W = 512;
  const H = 128;
  return canvas(W, H, (c) => {
    c.fillStyle = look.colour;
    c.fillRect(0, 0, W, H);
    // a 68 mm slice of the 250 mm board
    if (look.tier === "natural" && look.grain) c.drawImage(look.grain, 0, 60, look.grain.width, 70, 0, 0, W, H);
    // powder-coat speckle
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = rnd() > 0.5 ? white(0.05) : black(0.08);
      c.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 1);
    }
    if (look.tier === "premium") {
      linear(c, 0, 0, W, 0, [
        [0, white(0)], [0.08, white(0)], [0.24, white(0.32)], [0.41, black(0.18)], [0.58, white(0.1)], [0.72, white(0.38)],
        [0.9, black(0.16)], [1, white(0)],
      ]);
      c.fillRect(0, 0, W, H);
    }
    linear(c, 0, 0, 0, H, section);
    c.fillRect(0, 0, W, H);
  });
}

/** clear glass: a faint tint, a soft reflection with no hard lines and the edge of the sealed unit */
function glassCanvas() {
  const W = 256;
  const H = 512;
  return canvas(W, H, (c) => {
    c.fillStyle = "rgba(190,224,222,0.10)";
    c.fillRect(0, 0, W, H);
    linear(c, 0, 0, W, H * 0.62, [
      [0, white(0.2)], [0.22, white(0.08)], [0.45, white(0)], [0.6, white(0.07)], [0.74, white(0.015)], [1, white(0.07)],
    ]);
    c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(214,244,236,0.5)";
    c.lineWidth = 1.5;
    c.strokeRect(5, 5, W - 10, H - 10);
  });
}

function texture(image: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(image);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------ geometry ------------------------------ */
type P = [number, number, number];

/** collects flat four-cornered faces; `shade` is a brightness as it would be picked on screen */
class Faces {
  private pos: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];

  /** corners a, b along the first edge of the texture (u = ua, ub; top row), c, d along the other (bottom row) */
  quad(a: P, b: P, c: P, d: P, ua = 0, ub = 1, uc = ub, ud = ua, shade = 1) {
    const k = Math.pow(shade, 2.2);
    const corners: [P, number, number][] = [[a, ua, 1], [b, ub, 1], [c, uc, 0], [d, ud, 0]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [p, u, v] = corners[i];
      this.pos.push(...p);
      this.uv.push(u, v);
      this.col.push(k, k, k);
    }
  }

  mesh(material: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return new THREE.Mesh(g, material);
  }
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/** the four corners of a rectangle, clockwise from top left (y is measured downwards here) */
const corners = (r: Rect): [number, number][] => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
const at = ([x, y]: [number, number], z: number): P => [x, -y, z];
const METRE = 1 / 1000;

/** a flat mitred ring between two rectangles */
function ring(f: Faces, outer: Rect, inner: Rect, z: number, shades = [1, 1, 1, 1]) {
  const o = corners(outer);
  const n = corners(inner);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const along = i % 2 ? 1 : 0; // top and bottom run along x, the sides along y
    const u = (p: [number, number]) => p[along] * METRE;
    f.quad(at(o[i], z), at(o[j], z), at(n[j], z), at(n[i], z), u(o[i]), u(o[j]), u(n[j]), u(n[i]), shades[i]);
  }
}

/** the four faces running from a rectangle at depth z0 back to depth z1 */
function walls(f: Faces, r: Rect, z0: number, z1: number, shades: number[]) {
  const c = corners(r);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const along = i % 2 ? 1 : 0;
    const u0 = c[i][along] * METRE;
    const u1 = c[j][along] * METRE;
    f.quad(at(c[i], z0), at(c[j], z0), at(c[j], z1), at(c[i], z1), u0, u1, u1, u0, shades[i]);
  }
}

/** shades a rounded metal fitting from its surface direction, like the flat handle's gradient */
function metal(geometry: THREE.BufferGeometry) {
  const n = geometry.getAttribute("normal");
  const ramp = ["#6f737a", "#b9bdc3", "#fbfcfd", "#cdd0d5", "#767a81"].map((c) => new THREE.Color(c));
  const colours: number[] = [];
  const mixed = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const t = THREE.MathUtils.clamp((n.getX(i) + 1) / 2 + n.getY(i) * 0.12, 0, 0.999) * (ramp.length - 1);
    const k = Math.floor(t);
    mixed.copy(ramp[k]).lerp(ramp[k + 1], t - k);
    colours.push(mixed.r, mixed.g, mixed.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/* ------------------------------ the drawing ------------------------------ */
interface Body {
  group: THREE.Group;
  /** darkened as the leaf turns away from the room's light */
  skins: THREE.MeshBasicMaterial[];
  glass?: THREE.MeshBasicMaterial;
}
interface Model {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bodies: Body[];
}

export interface OpenLeaves {
  setFinish(look: FinishLook): void;
  /** draw the window this far open (0 – 1) into its host, taking over from the flat drawing */
  draw(spec: SolidSpec, open: number): void;
  /** put the flat drawing back */
  release(spec: SolidSpec): void;
}

export function createOpenLeaves(): OpenLeaves {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const surface = renderer.domElement;
  surface.className = "wn-solid";

  let look: FinishLook = { colour: "#2b2d31", tier: "solid" };
  let faceMap = texture(profileCanvas(look, FACE));
  let sideMap = texture(profileCanvas(look, SIDE));
  const glassMap = texture(glassCanvas());
  const faceMats: THREE.MeshBasicMaterial[] = [];
  const sideMats: THREE.MeshBasicMaterial[] = [];

  const basic = (opts: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, ...opts });
  const faceMaterial = () => {
    const m = basic({ map: faceMap, vertexColors: true });
    faceMats.push(m);
    return m;
  };
  const sideMaterial = () => {
    const m = basic({ map: sideMap, vertexColors: true });
    sideMats.push(m);
    return m;
  };
  const gasketMaterial = basic({ color: "#0a0b0c", vertexColors: true });
  const fittingMaterial = basic({ vertexColors: true });

  function leaf(spec: LeafSpec): Body {
    const group = new THREE.Group();
    const x0 = spec.hinge === "left" ? 0 : -spec.w;
    const outer: Rect = { x0, x1: x0 + spec.w, y0: 0, y1: spec.h };
    const { s } = spec;
    const inner: Rect = { x0: outer.x0 + s.l, x1: outer.x1 - s.r, y0: s.t, y1: spec.h - s.b };
    const depth = spec.depth ?? DEPTH;
    const glazing = Math.min(GLASS, depth * 0.4);
    const face = faceMaterial();
    const side = sideMaterial();

    const front = new Faces();
    ring(front, outer, inner, 0, [1, 0.92, 1, 1]);
    // the outside face, seen on the leaves of a folded stack that turn their backs
    ring(front, outer, inner, -depth, [0.8, 0.74, 0.8, 0.8]);
    group.add(front.mesh(face));

    // edges: top, right, bottom, left
    const edges = new Faces();
    walls(edges, outer, 0, -depth, [1.15, 0.82, 0.72, 1.12]);
    walls(edges, inner, 0, spec.frameOnly ? -depth : -glazing, [0.6, 0.78, 1.05, 0.78]);
    group.add(edges.mesh(side));

    let glass: THREE.MeshBasicMaterial | undefined;
    if (!spec.frameOnly) {
      const gasket = new Faces();
      const lip: Rect = { x0: inner.x0 + 9, x1: inner.x1 - 9, y0: inner.y0 + 9, y1: inner.y1 - 9 };
      ring(gasket, inner, lip, -glazing + 3);
      ring(gasket, inner, lip, -depth + 6);
      group.add(gasket.mesh(gasketMaterial));

      const pane = new Faces();
      const c = corners(inner);
      pane.quad(at(c[0], -glazing), at(c[1], -glazing), at(c[2], -glazing), at(c[3], -glazing));
      glass = basic({ map: glassMap, transparent: true, depthWrite: false });
      const mesh = pane.mesh(glass);
      mesh.renderOrder = 1;
      group.add(mesh);
    }

    const fitting = (g: THREE.BufferGeometry, x: number, y: number, z: number, flatten = 1) => {
      const mesh = new THREE.Mesh(metal(g), fittingMaterial);
      mesh.position.set(x0 + x, -y, z);
      mesh.scale.z = flatten;
      group.add(mesh);
    };
    if (spec.handle) {
      const { x, y } = spec.handle;
      fitting(new THREE.CapsuleGeometry(13, 80, 6, 24), x, y - 38, 5, 0.45); // back plate
      const neck = new THREE.CylinderGeometry(9, 9, 26, 24);
      neck.rotateX(Math.PI / 2);
      fitting(neck, x, y - 36, 22);
      fitting(new THREE.CapsuleGeometry(8.5, 120, 6, 24), x, y + 22, 36); // lever
    }
    for (const y of spec.barrels ?? []) {
      fitting(new THREE.CylinderGeometry(10, 10, 90, 24), spec.hinge === "left" ? 3 : spec.w - 5, y + 45, 5);
    }

    return { group, skins: [face, side], glass };
  }

  const models = new Map<SolidSpec, Model>();
  function build(spec: SolidSpec) {
    let model = models.get(spec);
    if (model) return model;
    const scene = new THREE.Scene();
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(spec.h / 2 / PERSP));
    const camera = new THREE.PerspectiveCamera(fov, spec.w / spec.h, 200, 12000);
    camera.position.set(spec.w / 2, -spec.h / 2, PERSP);

    if (spec.jamb) {
      const { x, y, w, h } = spec.jamb;
      const depth = new Faces();
      // top faces down and is in shade; the bottom one catches the sky
      walls(depth, { x0: x - 1, x1: x + w + 1, y0: y - 1, y1: y + h + 1 }, 0, -JAMB, [0.55, 0.72, 1.05, 0.72]);
      scene.add(depth.mesh(sideMaterial()));
    }
    const bodies = spec.leaves.map((l) => {
      const body = leaf(l);
      scene.add(body.group);
      return body;
    });
    model = { scene, camera, bodies };
    models.set(spec, model);
    return model;
  }

  return {
    setFinish(next) {
      look = next;
      faceMap.dispose();
      sideMap.dispose();
      faceMap = texture(profileCanvas(look, FACE));
      sideMap = texture(profileCanvas(look, SIDE));
      for (const m of faceMats) m.map = faceMap;
      for (const m of sideMats) m.map = sideMap;
    },
    draw(spec, open) {
      const model = build(spec);
      const w = Math.max(1, spec.host.offsetWidth);
      const h = Math.max(1, spec.host.offsetHeight);
      if (surface.parentElement !== spec.host) spec.host.appendChild(surface);
      // drawn a little finer than the screen, so thin slanted edges stay clean
      const ratio = Math.min(Math.max(devicePixelRatio * 1.25, 1.5), 2.5);
      if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
      const size = renderer.getSize(new THREE.Vector2());
      if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);

      const poses = spec.pose(open);
      model.bodies.forEach((body, i) => {
        const l = spec.leaves[i];
        const p = poses[i];
        body.group.position.set(p.x, -l.y, p.z);
        body.group.rotation.y = p.turn;
        const away = Math.abs(Math.sin(p.turn));
        const light = Math.pow(1 - 0.16 * away, 2.2);
        for (const m of body.skins) m.color.setScalar(light);
        // glass seen at an angle reflects more
        if (body.glass) body.glass.opacity = 0.4 + 0.6 * away;
      });
      renderer.render(model.scene, model.camera);
      for (const el of spec.flat) el.style.visibility = "hidden";
      surface.hidden = false;
    },
    release(spec) {
      for (const el of spec.flat) el.style.visibility = "";
      if (surface.parentElement === spec.host) surface.remove();
    },
  };
}
