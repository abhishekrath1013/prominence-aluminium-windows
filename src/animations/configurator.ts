import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* ==========================================================================
   Procedural 3D window configurator
   – mitred aluminium profiles (separate bars per side, correct UV direction)
   – double glazing (pane / spacer / pane) with transmission, EPDM gaskets
   – sliding, casement and fixed "full view" systems built to real proportions
   – installed in a plaster wall with a recessed reveal and stone sill
   – a lit interior behind the glass so day / night actually reads
   ========================================================================== */

export interface CfgFinish {
  slug: string;
  name: string;
  tier: "natural" | "solid" | "premium";
  swatch: string;
}
type ModelKey = "sliding" | "casement" | "fold" | "bay" | "fixed" | "geo";

interface Side {
  t: number;
  b: number;
  l: number;
  r: number;
}

/* ---------------- procedural textures ---------------- */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

function noiseTex(size: number, lo: number, hi: number, repeat: number) {
  const t = canvasTex(
    size,
    size,
    (c) => {
      const img = c.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const v = (lo + Math.random() * (hi - lo)) * 255;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    },
    false
  );
  t.repeat.set(repeat, repeat);
  return t;
}

function woodTex(base: string) {
  const t = canvasTex(1024, 256, (c) => {
    c.fillStyle = base;
    c.fillRect(0, 0, 1024, 256);
    // broad tonal drift
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,255,0.05)");
    g.addColorStop(0.5, "rgba(0,0,0,0.08)");
    g.addColorStop(1, "rgba(255,255,255,0.04)");
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 256);
    // fine grain
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * 256;
      const amp = 0.6 + Math.random() * 2.4;
      const ph = Math.random() * 6.28;
      const fr = 0.004 + Math.random() * 0.012;
      c.beginPath();
      for (let x = 0; x <= 1024; x += 16) c.lineTo(x, y + Math.sin(x * fr + ph) * amp);
      c.strokeStyle = Math.random() > 0.5 ? `rgba(0,0,0,${0.04 + Math.random() * 0.16})` : `rgba(255,235,210,${0.03 + Math.random() * 0.09})`;
      c.lineWidth = 0.5 + Math.random() * 1.6;
      c.stroke();
    }
  });
  t.repeat.set(1.4, 13);
  return t;
}

function plasterTex() {
  const t = canvasTex(
    512,
    512,
    (c) => {
      const img = c.createImageData(512, 512);
      for (let i = 0; i < 512 * 512; i++) {
        const v = 200 + Math.random() * 55;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      // soft trowel marks
      for (let i = 0; i < 70; i++) {
        c.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.035)`;
        c.beginPath();
        c.ellipse(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 90, 10 + Math.random() * 30, Math.random() * 3, 0, 6.28);
        c.fill();
      }
    },
    false
  );
  t.repeat.set(3, 2);
  return t;
}

function streakTex() {
  return canvasTex(512, 512, (c) => {
    c.clearRect(0, 0, 512, 512);
    c.translate(256, 256);
    c.rotate(-0.55);
    const band = (x: number, w: number, a: number) => {
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(x - w, -600, w * 2, 1200);
    };
    band(-120, 90, 0.75);
    band(60, 34, 0.55);
    band(150, 14, 0.4);
  });
}

/** Cool sky reflected in the upper part of the glass. */
function skyTex() {
  return canvasTex(64, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(176,206,240,0.95)");
    g.addColorStop(0.45, "rgba(214,228,245,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 256);
  });
}

function shadowTex() {
  return canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

function artTex() {
  return canvasTex(256, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, "#c98a4b");
    g.addColorStop(0.55, "#7d4a2c");
    g.addColorStop(1, "#2f2a2a");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = "rgba(241,230,205,.85)";
    c.beginPath();
    c.arc(150, 100, 46, 0, 6.28);
    c.fill();
  });
}

/* ---------------- geometry helpers ---------------- */
const BEVEL = 0.0017;

/** A mitred rectangular frame as four separate extruded bars (so wood grain
 *  and normals follow each bar, and the 45° joints read as real mitres). */
function frameBars(w: number, h: number, s: Side, depth: number, z0: number, mat: THREE.Material, shadow = true) {
  const g = new THREE.Group();
  const hw = w / 2;
  const hh = h / 2;
  const shapes: { pts: [number, number][]; vertical: boolean }[] = [
    { pts: [[-hw, hh], [hw, hh], [hw - s.r, hh - s.t], [-hw + s.l, hh - s.t]], vertical: false },
    { pts: [[-hw + s.l, -hh + s.b], [hw - s.r, -hh + s.b], [hw, -hh], [-hw, -hh]], vertical: false },
    { pts: [[-hw, hh], [-hw + s.l, hh - s.t], [-hw + s.l, -hh + s.b], [-hw, -hh]], vertical: true },
    { pts: [[hw - s.r, hh - s.t], [hw, hh], [hw, -hh], [hw - s.r, -hh + s.b]], vertical: true },
  ];
  for (const sh of shapes) {
    const shape = new THREE.Shape();
    sh.pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth - BEVEL * 2,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelOffset: -BEVEL,
      bevelSegments: 2,
      curveSegments: 1,
    });
    if (sh.vertical) {
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        uv.setX(i, uv.getY(i));
        uv.setY(i, u);
      }
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.z = z0 + BEVEL;
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** Double-glazed unit: pane / aluminium spacer / pane, plus a faint streak. */
function glazing(gw: number, gh: number, glass: THREE.Material, spacer: THREE.Material, streak: THREE.Material, sky: THREE.Material, thick = 0.024) {
  const g = new THREE.Group();
  const pane = 0.0055;
  const front = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, pane), glass);
  front.position.z = thick / 2 - pane / 2;
  const back = front.clone();
  back.position.z = -thick / 2 + pane / 2;
  g.add(front, back);
  const sp = frameBars(gw, gh, { t: 0.014, b: 0.014, l: 0.014, r: 0.014 }, thick - pane * 2, -(thick - pane * 2) / 2, spacer, false);
  g.add(sp);
  const st = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), streak);
  st.position.z = thick / 2 + 0.0004;
  const sk = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), sky);
  sk.position.z = thick / 2 + 0.0006;
  g.add(sk, st);
  return g;
}

function handle(mat: THREE.Material, rubber: THREE.Material, vertical = true) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.15, 0.006), mat);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 24), mat);
  rose.rotation.x = Math.PI / 2;
  rose.position.z = 0.007;
  const lever = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.1, 4, 12), mat);
  lever.position.set(0, -0.05, 0.022);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 12), mat);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = 0.014;
  void rubber;
  g.add(plate, rose, lever, stem);
  if (!vertical) g.rotation.z = Math.PI / 2;
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}


/** Thermal-break line down the middle of the frame face + drainage slots. */
function detailing(W: number, H: number, f: number, fb: number, zFront: number): THREE.Object3D[] {
  const dark = new THREE.MeshStandardMaterial({ color: "#0b0b0c", roughness: 0.9 });
  const line = frameBars(W - f, H - (f + fb) / 2 * 1, { t: 0.0028, b: 0.0028, l: 0.0028, r: 0.0028 }, 0.0014, zFront - 0.0006, dark, false);
  const out: THREE.Object3D[] = [line];
  for (const x of [-0.45, 0, 0.45]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.009, 0.002), dark);
    slot.position.set(x * W * 0.5, -H / 2 + fb * 0.5, zFront);
    out.push(slot);
  }
  return out;
}

/** A photographic light studio used only for reflections: soft boxes and
 *  strip lights on a dark cyc, so polished aluminium gets crisp highlights. */
export function studioEnv(): THREE.Scene {
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.BoxGeometry(14, 9, 14), new THREE.MeshBasicMaterial({ color: 0x0b0b0d, side: THREE.BackSide })));
  const box = (w: number, h: number, pos: [number, number, number], k: number, col: string, map?: THREE.Texture) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide, map: map ?? null });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    sc.add(mesh);
  };
  const grad = canvasTex(8, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.16, "#ffffff");
    g.addColorStop(0.28, "#6a6a6a");
    g.addColorStop(0.5, "#1c1c1c");
    g.addColorStop(0.66, "#f4f4f4");
    g.addColorStop(0.76, "#f4f4f4");
    g.addColorStop(0.86, "#202020");
    g.addColorStop(1, "#0e0e0e");
    c.fillStyle = g;
    c.fillRect(0, 0, 8, 128);
  });
  box(11, 6.5, [0, 0.4, 6.6], 4.2, "#fff6e8", grad); // big front soft box (graded)
  box(8, 4.5, [0, 4.2, 1.5], 8, "#ffffff"); // overhead
  box(1.6, 7, [-6.3, 0.2, 2.2], 7, "#ffe9c8"); // warm strip, left
  box(1.6, 7, [6.3, 0.2, 1.4], 6, "#d6e6ff"); // cool strip, right
  box(9, 3, [0, -3.9, 2.5], 0.7, "#c9b79b"); // warm floor bounce
  return sc;
}

/* ---------------- main ---------------- */
export function mountConfigurator(root: HTMLElement, finishes: CfgFinish[]) {
  const stage = root.querySelector<HTMLElement>("[data-cfg-canvas]")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;";

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnv(), 0.03).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0.8, 0.22, 5.3);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minAzimuthAngle = -0.85;
  controls.maxAzimuthAngle = 0.85;
  controls.minPolarAngle = Math.PI / 2 - 0.32;
  controls.maxPolarAngle = Math.PI / 2 + 0.28;
  controls.rotateSpeed = 0.6;

  /* ---- lights ---- */
  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x7a6a58, 0.5);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3);
  sun.position.set(4.4, 3.0, 3.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.004;
  sun.shadow.radius = 4;
  const moon = new THREE.DirectionalLight(0x9db8ff, 0);
  moon.position.set(-3, 2.5, 4);
  const room = new THREE.PointLight(0xffc98a, 1, 2.3, 2);
  room.position.set(0, 0.35, -1.7);
  scene.add(hemi, sun, moon, room);

  /* ---- materials ---- */
  const frameMat = new THREE.MeshPhysicalMaterial({ color: "#25272c", metalness: 0.92, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.16 });
  const roughNoise = noiseTex(256, 0.78, 1, 60);
  const bumpNoise = noiseTex(256, 0.4, 0.6, 60);
  const gasketMat = new THREE.MeshStandardMaterial({ color: "#0c0c0d", roughness: 0.88, metalness: 0 });
  const spacerMat = new THREE.MeshStandardMaterial({ color: "#16171a", roughness: 0.4, metalness: 0.9 });
  const steelMat = new THREE.MeshStandardMaterial({ color: "#d9dbdf", roughness: 0.22, metalness: 1 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 0.02,
    ior: 1.5,
    specularIntensity: 1,
    attenuationColor: new THREE.Color("#cfe6e0"),
    attenuationDistance: 0.9,
    envMapIntensity: 1.1,
  });
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTex(), transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false });
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex(), transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
  const wallMat = new THREE.MeshStandardMaterial({ color: "#e9e2d5", roughness: 0.97, metalness: 0, bumpMap: plasterTex(), bumpScale: 1.4, envMapIntensity: 0.7 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#c9c1b3", roughness: 0.8, bumpMap: noiseTex(256, 0.3, 0.7, 20), bumpScale: 1 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: "#161618", roughness: 0.6, metalness: 0.2 });

  const wood = new Map<string, THREE.Texture>();
  const wallTarget = new THREE.Color("#8d8f94");
  function applyFinish(f: CfgFinish) {
    frameMat.color.set(f.swatch);
    frameMat.map = null;
    frameMat.bumpMap = bumpNoise;
    frameMat.bumpScale = 0.25;
    frameMat.roughnessMap = roughNoise;
    frameMat.envMapIntensity = 1.5;
    if (f.tier === "natural") {
      // lacquered wood-grain laminate
      if (!wood.has(f.slug)) wood.set(f.slug, woodTex(f.swatch));
      const t = wood.get(f.slug)!;
      frameMat.color.set("#ffffff");
      frameMat.map = t;
      frameMat.bumpMap = t;
      frameMat.bumpScale = 1.1;
      frameMat.metalness = 0.0;
      frameMat.roughness = 0.5;
      frameMat.roughnessMap = null;
      frameMat.clearcoat = 0.7;
      frameMat.clearcoatRoughness = 0.12;
    } else if (f.tier === "premium") {
      // polished anodised metallic
      frameMat.metalness = 1;
      frameMat.roughness = 0.16;
      frameMat.clearcoat = 1;
      frameMat.clearcoatRoughness = 0.04;
    } else {
      // satin anodised
      frameMat.metalness = 0.9;
      frameMat.roughness = 0.28;
      frameMat.clearcoat = 1;
      frameMat.clearcoatRoughness = 0.08;
    }
    frameMat.needsUpdate = true;
    // The wall takes a tone-on-tone of the chosen frame colour.
    const c = new THREE.Color(f.swatch);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    wallTarget.setHSL(hsl.h, Math.min(hsl.s * (f.tier === "natural" ? 0.42 : 0.85), 0.45), hsl.l < 0.5 ? Math.min(hsl.l + 0.17, 0.62) : Math.max(hsl.l - 0.2, 0.55));
  }

  /* ---- shared room + wall ---- */
  interface Built {
    group: THREE.Group;
    update: (open: number) => void;
  }
  const lamps: THREE.Mesh[] = [];
  const lampMats: THREE.MeshStandardMaterial[] = [];

  function buildRoom(w: number, h: number) {
    const g = new THREE.Group();
    const rw = w - 0.2;
    const rh = h - 0.2;
    const rd = 2.6;
    const rm = new THREE.MeshStandardMaterial({ color: "#9e8a72", roughness: 0.92, side: THREE.BackSide });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), rm);
    shell.position.set(0, 0, -0.2 - rd / 2);
    g.add(shell);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), new THREE.MeshStandardMaterial({ map: woodTex("#6a4a30"), roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -rh / 2 + 0.002, -0.2 - rd / 2);
    g.add(floor);
    // cove light on the ceiling edge
    const coveMat = new THREE.MeshStandardMaterial({ color: "#fff3df", emissive: new THREE.Color("#ffc98a"), emissiveIntensity: 0.2, toneMapped: false });
    const cove = new THREE.Mesh(new THREE.BoxGeometry(rw - 0.1, 0.025, 0.025), coveMat);
    cove.position.set(0, rh / 2 - 0.06, -0.2 - rd + 0.08);
    g.add(cove);
    // pendant
    const penMat = new THREE.MeshStandardMaterial({ color: "#fff3df", emissive: new THREE.Color("#ffbf78"), emissiveIntensity: 0.1, toneMapped: false });
    const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 24), penMat);
    pendant.position.set(0.25, rh / 2 - 0.5, -1.0);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 6), new THREE.MeshStandardMaterial({ color: "#111" }));
    cord.position.set(0.25, rh / 2 - 0.25, -1.0);
    g.add(pendant, cord);
    // sofa + art
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.38, 0.72), new THREE.MeshStandardMaterial({ color: "#3b3a3c", roughness: 0.9 }));
    sofa.position.set(-0.15, -rh / 2 + 0.2, -1.95);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.16), sofa.material);
    back.position.set(-0.15, -rh / 2 + 0.52, -2.25);
    g.add(sofa, back);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: artTex(), emissive: new THREE.Color("#ffb070"), emissiveMap: artTex(), emissiveIntensity: 0.05, roughness: 0.8 }));
    art.position.set(-0.3, 0.12, -2.78);
    g.add(art);
    lampMats.push(coveMat, penMat, art.material as THREE.MeshStandardMaterial);
    return g;
  }

  function buildWall(w: number, h: number, ow: number, oh: number, pts?: [number, number][]) {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.closePath();
    const hole = new THREE.Path();
    const hp: [number, number][] = pts ?? [[-ow / 2, -oh / 2], [-ow / 2, oh / 2], [ow / 2, oh / 2], [ow / 2, -oh / 2]];
    hp.forEach(([x, y], i) => (i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)));
    hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 1 });
    const wall = new THREE.Mesh(geo, wallMat);
    wall.position.z = -0.2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
    // stone sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(ow + 0.16, 0.035, 0.2), stoneMat);
    sill.position.set(0, -oh / 2 - 0.0175, 0.02);
    sill.castShadow = true;
    sill.receiveShadow = true;
    if (!pts) g.add(sill);
    // plinth + soft ground shadow
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.06, 0.8), plinthMat);
    plinth.position.set(0, -h / 2 - 0.03, 0.05);
    plinth.receiveShadow = true;
    g.add(plinth);
    return g;
  }

  /* ---- three window systems ---- */
  function newSash(w: number, h: number, s: Side, depth: number, z0: number) {
    const g = new THREE.Group();
    g.add(frameBars(w, h, s, depth, z0, frameMat));
    // gasket (EPDM) hugging the sash perimeter
    g.add(frameBars(w + 0.003, h + 0.003, { t: 0.0035, b: 0.0035, l: 0.0035, r: 0.0035 }, depth * 0.8, z0 + depth * 0.1, gasketMat, false));
    // glazing bead (proud clip) on the front
    const gw = w - s.l - s.r;
    const gh = h - s.t - s.b;
    g.add(frameBars(gw + 0.022, gh + 0.022, { t: 0.014, b: 0.014, l: 0.014, r: 0.014 }, 0.008, z0 + depth - 0.002, frameMat));
    const ig = glazing(gw + 0.01, gh + 0.01, glassMat, spacerMat, streakMat, skyMat);
    ig.position.z = z0 + depth / 2 - 0.002;
    g.add(ig);
    return { group: g, gw, gh };
  }

  function buildSliding(): Built {
    const W = 2.3;
    const H = 1.42;
    const f = 0.054;
    const group = new THREE.Group();
    group.add(buildRoom(W + 0.8, H + 0.7), buildWall(W + 0.8, H + 0.7, W + 0.006, H + 0.006));
    group.add(frameBars(W, H, { t: f, b: f + 0.012, l: f, r: f }, 0.09, -0.045, frameMat));
    group.add(...detailing(W, H, f, f + 0.012, 0.045));
    // guide rails
    for (const z of [0.016, -0.016]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * f, 0.008, 0.012), steelMat);
      rail.position.set(0, -H / 2 + f + 0.016, z);
      group.add(rail);
    }
    const ow = W - 2 * f;
    const oh = H - 2 * f - 0.012;
    const sw = ow / 2 + 0.034;
    const sh = oh - 0.01;
    const A = newSash(sw, sh, { t: 0.05, b: 0.058, l: 0.066, r: 0.05 }, 0.034, 0.002);
    const B = newSash(sw, sh, { t: 0.05, b: 0.058, l: 0.05, r: 0.066 }, 0.034, -0.036);
    const aG = new THREE.Group();
    aG.add(A.group);
    const hnd = handle(steelMat, gasketMat);
    hnd.position.set(-sw / 2 + 0.033, 0, 0.036);
    aG.add(hnd);
    const bG = new THREE.Group();
    bG.add(B.group);
    const y0 = -H / 2 + f + 0.012 + 0.005 + sh / 2 + 0.014;
    aG.position.set(ow / 2 - sw / 2, y0, 0);
    bG.position.set(-ow / 2 + sw / 2, y0, 0);
    group.add(aG, bG);
    return {
      group,
      update: (open) => {
        aG.position.x = ow / 2 - sw / 2 - open * (ow - sw - 0.01);
      },
    };
  }

  function buildCasement(): Built {
    const W = 1.7;
    const H = 1.5;
    const f = 0.058;
    const group = new THREE.Group();
    group.add(buildRoom(W + 0.8, H + 0.7), buildWall(W + 0.8, H + 0.7, W + 0.006, H + 0.006));
    // outer frame with rebate step
    group.add(frameBars(W, H, { t: f, b: f, l: f, r: f }, 0.044, -0.045, frameMat));
    group.add(frameBars(W, H, { t: f - 0.02, b: f - 0.02, l: f - 0.02, r: f - 0.02 }, 0.046, -0.001, frameMat));
    const ow = W - 2 * (f - 0.02);
    const oh = H - 2 * (f - 0.02);
    const lw = ow / 2 - 0.004;
    const lh = oh - 0.008;
    const L = newSash(lw, lh, { t: 0.056, b: 0.056, l: 0.056, r: 0.056 }, 0.036, -0.006);
    const R = newSash(lw, lh, { t: 0.056, b: 0.056, l: 0.056, r: 0.056 }, 0.036, -0.006);
    const lPivot = new THREE.Group();
    const rPivot = new THREE.Group();
    lPivot.position.set(-ow / 2 + 0.002, 0, 0);
    rPivot.position.set(ow / 2 - 0.002, 0, 0);
    L.group.position.x = lw / 2;
    R.group.position.x = -lw / 2;
    lPivot.add(L.group);
    rPivot.add(R.group);
    const hnd = handle(steelMat, gasketMat);
    hnd.position.set(-lw / 2 + 0.028, -0.02, 0.03);
    R.group.add(hnd);
    // concealed-hinge cylinders on the visible face of the hinge stile
    for (const [pv, sgn] of [[lPivot, 1], [rPivot, -1]] as const) {
      for (const yy of [lh / 2 - 0.18, -lh / 2 + 0.18]) {
        const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 16), steelMat);
        hg.position.set(sgn * 0.003, yy, 0.032);
        pv.add(hg);
      }
    }
    group.add(lPivot, rPivot);
    return {
      group,
      update: (open) => {
        lPivot.rotation.y = -open * 1.1;
        rPivot.rotation.y = open * 1.1;
      },
    };
  }

  function buildFixed(): Built {
    const W = 2.5;
    const H = 1.5;
    const f = 0.05;
    const group = new THREE.Group();
    group.add(buildRoom(W + 0.8, H + 0.7), buildWall(W + 0.8, H + 0.7, W + 0.006, H + 0.006));
    group.add(frameBars(W, H, { t: f, b: f + 0.012, l: f, r: f }, 0.074, -0.045, frameMat));
    group.add(...detailing(W, H, f, f + 0.012, 0.029));
    const gw = W - 2 * f + 0.02;
    const gh = H - 2 * f - 0.012 + 0.02;
    // pressure plate / bead around the glass
    group.add(frameBars(W - 2 * f + 0.024, H - 2 * f - 0.012 + 0.024, { t: 0.016, b: 0.016, l: 0.016, r: 0.016 }, 0.01, 0.02, frameMat));
    group.add(frameBars(W - 2 * f + 0.006, H - 2 * f - 0.012 + 0.006, { t: 0.004, b: 0.004, l: 0.004, r: 0.004 }, 0.03, -0.01, gasketMat, false));
    const ig = glazing(gw, gh, glassMat, spacerMat, streakMat, skyMat, 0.028);
    ig.position.set(0, 0.006, 0.0);
    group.add(ig);
    return { group, update: () => void 0 };
  }

  /* Fold & slide — four leaves that concertina to one side (Robus 40). */
  function buildFold(): Built {
    const W = 2.6;
    const H = 1.5;
    const f = 0.056;
    const group = new THREE.Group();
    group.add(buildRoom(W + 0.8, H + 0.7), buildWall(W + 0.8, H + 0.7, W + 0.006, H + 0.006));
    group.add(frameBars(W, H, { t: f, b: f + 0.014, l: f, r: f }, 0.08, -0.04, frameMat));
    group.add(...detailing(W, H, f, f + 0.014, 0.04));
    const ow = W - 2 * f;
    const oh = H - 2 * f - 0.014;
    const n = 4;
    const pw = ow / n;
    const ph = oh - 0.008;
    const pivots: THREE.Group[] = [];
    let parent: THREE.Object3D = group;
    for (let i = 0; i < n; i++) {
      const pv = new THREE.Group();
      pv.position.set(i === 0 ? -ow / 2 : pw, i === 0 ? 0.007 : 0, 0);
      const sash = newSash(pw - 0.004, ph, { t: 0.05, b: 0.05, l: 0.05, r: 0.05 }, 0.034, -0.017);
      sash.group.position.x = pw / 2;
      pv.add(sash.group);
      if (i === 1) {
        const hnd = handle(steelMat, gasketMat);
        hnd.position.set(pw - 0.03, -0.02, 0.019);
        pv.add(hnd);
      }
      parent.add(pv);
      parent = pv;
      pivots.push(pv);
    }
    return {
      group,
      update: (open) => {
        const a = open * 1.24;
        pivots.forEach((pv, i) => (pv.rotation.y = i === 0 ? -a : i % 2 === 1 ? 2 * a : -2 * a));
      },
    };
  }

  /* Bay — a fixed centre pane with two casement leaves at 40 degrees (Livio bay). */
  function buildBay(): Built {
    const H = 1.5;
    const f = 0.05;
    const uw = 0.78;
    const ang = (40 * Math.PI) / 180;
    const cw = 1.4;
    const jamb = cw / 2 + uw * Math.cos(ang);
    const W = jamb * 2;
    const proj = uw * Math.sin(ang);
    const group = new THREE.Group();
    group.add(buildRoom(W + 0.8, H + 0.7), buildWall(W + 0.8, H + 0.7, W + 0.006, H + 0.006));
    const centre = new THREE.Group();
    centre.add(frameBars(cw, H, { t: f, b: f + 0.012, l: f, r: f }, 0.074, -0.037, frameMat));
    centre.add(frameBars(cw - 2 * f + 0.024, H - 2 * f - 0.012 + 0.024, { t: 0.016, b: 0.016, l: 0.016, r: 0.016 }, 0.01, 0.02, frameMat));
    const ig = glazing(cw - 2 * f + 0.02, H - 2 * f - 0.012 + 0.02, glassMat, spacerMat, streakMat, skyMat, 0.028);
    ig.position.y = 0.006;
    centre.add(ig);
    centre.position.z = proj;
    group.add(centre);
    const leafH = H - 0.01;
    const mk = (side: 1 | -1) => {
      const pv = new THREE.Group();
      pv.position.set(side * jamb, 0, 0);
      const sash = newSash(uw, leafH, { t: 0.056, b: 0.056, l: 0.056, r: 0.056 }, 0.036, -0.018);
      sash.group.position.x = -side * (uw / 2);
      pv.add(sash.group);
      const hnd = handle(steelMat, gasketMat);
      hnd.position.set(-side * (uw - 0.032), -0.02, 0.03);
      pv.add(hnd);
      group.add(pv);
      return pv;
    };
    const L = mk(-1);
    const R = mk(1);
    const slab = (mat: THREE.Material, y: number, d: number) => {
      const sh = new THREE.Shape();
      const pts: [number, number][] = [[-jamb - 0.04, -0.02], [jamb + 0.04, -0.02], [cw / 2 + 0.07, -(proj + 0.1)], [-cw / 2 - 0.07, -(proj + 0.1)]];
      pts.forEach(([x, yy], i) => (i === 0 ? sh.moveTo(x, yy) : sh.lineTo(x, yy)));
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    };
    slab(stoneMat, -H / 2 - 0.045, 0.045);
    slab(wallMat, H / 2 + 0.002, 0.06);
    return {
      group,
      update: (open) => {
        L.rotation.y = -(ang + open * 0.55);
        R.rotation.y = ang + open * 0.55;
      },
    };
  }

  /* Geometrical — a fixed hexagonal window, every bar mitred at 60 degrees. */
  function buildGeo(): Built {
    const R = 0.84;
    const f = 0.052;
    const depth = 0.074;
    const apo = R * Math.cos(Math.PI / 6);
    const Ri = (apo - f) / Math.cos(Math.PI / 6);
    const vert = (r: number, i: number): [number, number] => [r * Math.sin((i * Math.PI) / 3), r * Math.cos((i * Math.PI) / 3)];
    const group = new THREE.Group();
    const hole: [number, number][] = [0, 1, 2, 3, 4, 5].map((i) => vert(R + 0.003, i));
    group.add(buildRoom(2.5, 2.4), buildWall(2.7, 2.5, 0, 0, hole));
    const bars = (ro: number, ri: number, d: number, z0: number, mat: THREE.Material, cast = true) => {
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const sh = new THREE.Shape();
        const pts = [vert(ro, i), vert(ro, (i + 1) % 6), vert(ri, (i + 1) % 6), vert(ri, i)];
        pts.forEach(([x, y], k) => (k === 0 ? sh.moveTo(x, y) : sh.lineTo(x, y)));
        sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: d - BEVEL * 2, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelOffset: -BEVEL, bevelSegments: 2, curveSegments: 1 });
        const uv = geo.attributes.uv as THREE.BufferAttribute;
        const ang = -((i * Math.PI) / 3 + Math.PI / 6);
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        for (let k = 0; k < uv.count; k++) {
          const u = uv.getX(k);
          const v = uv.getY(k);
          uv.setXY(k, u * ca - v * sa, u * sa + v * ca);
        }
        const m = new THREE.Mesh(geo, mat);
        m.position.z = z0 + BEVEL;
        m.castShadow = cast;
        m.receiveShadow = true;
        g.add(m);
      }
      return g;
    };
    group.add(bars(R, Ri, depth, -0.045, frameMat));
    group.add(bars(Ri + 0.02, Ri - 0.014, 0.01, 0.02, frameMat));
    group.add(bars(Ri + 0.004, Ri - 0.001, 0.03, -0.01, gasketMat, false));
    const hexShape = (r: number) => {
      const sh = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const [x, y] = vert(r, i);
        if (i === 0) sh.moveTo(x, y);
        else sh.lineTo(x, y);
      }
      sh.closePath();
      return sh;
    };
    const gR = Ri + 0.01;
    const pane = new THREE.ExtrudeGeometry(hexShape(gR), { depth: 0.0055, bevelEnabled: false });
    const ig = new THREE.Group();
    const p1 = new THREE.Mesh(pane, glassMat);
    p1.position.z = 0.006;
    const p2 = new THREE.Mesh(pane, glassMat);
    p2.position.z = -0.0115;
    ig.add(p1, p2, bars(gR, gR - 0.016, 0.012, -0.006, spacerMat, false));
    for (const [mat, z] of [[streakMat, 0.0128], [skyMat, 0.0133]] as const) {
      const g2 = new THREE.ShapeGeometry(hexShape(gR));
      const uv = g2.attributes.uv as THREE.BufferAttribute;
      const pos = g2.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k) / (2 * gR) + 0.5, pos.getY(k) / (2 * gR) + 0.5);
      const m = new THREE.Mesh(g2, mat);
      m.position.z = z;
      ig.add(m);
    }
    group.add(ig);
    return { group, update: () => void 0 };
  }

  const builders: Record<ModelKey, () => Built> = { sliding: buildSliding, casement: buildCasement, fold: buildFold, bay: buildBay, fixed: buildFixed, geo: buildGeo };
  const built = new Map<ModelKey, Built>();
  const stageGroup = new THREE.Group();
  scene.add(stageGroup);
  let current: ModelKey = "sliding";
  function show(key: ModelKey) {
    if (!built.has(key)) built.set(key, builders[key]());
    built.forEach((b) => (b.group.visible = false));
    const b = built.get(key)!;
    if (!b.group.parent) stageGroup.add(b.group);
    b.group.visible = true;
    current = key;
    b.update(openCur);
  }

  /* ---- state + tween ---- */
  let openTarget = 0;
  let openCur = 0;
  let night = 0; // target 0..1
  let nightCur = 0;
  let idle = 1;
  let lastTouch = 0;
  let visible = false;
  let raf = 0;
  const dayCol = new THREE.Color(0xfff0d8);
  void dayCol;

  function applyTime(t: number) {
    sun.intensity = THREE.MathUtils.lerp(4.4, 0, t);
    moon.intensity = THREE.MathUtils.lerp(0, 0.06, t);
    hemi.intensity = THREE.MathUtils.lerp(0.26, 0.04, t);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.75, 0.16, t);
    room.intensity = THREE.MathUtils.lerp(0.4, 7, t);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1, 1.18, t);
    streakMat.opacity = THREE.MathUtils.lerp(0.42, 0.06, t);
    skyMat.opacity = THREE.MathUtils.lerp(0.34, 0.0, t);
    const e = THREE.MathUtils.lerp(0.06, 2.4, t);
    lampMats.forEach((m) => (m.emissiveIntensity = m === lampMats[2] ? THREE.MathUtils.lerp(0.03, 0.5, t) : e));
  }

  /* ---- sizing ---- */
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    // keep the whole slab in frame on narrow canvases
    camera.position.z = camera.aspect < 1 ? 7.6 : 5.5;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  /* ---- loop ---- */
  let lastT = performance.now();
  function frame() {
    raf = 0;
    if (!visible) return;
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const k = 1 - Math.exp(-dt * 4.5);
    const prevOpen = openCur;
    openCur += (openTarget - openCur) * k;
    if (Math.abs(openCur - prevOpen) > 1e-5) built.get(current)?.update(openCur);
    const prevNight = nightCur;
    nightCur += (night - nightCur) * (1 - Math.exp(-dt * 3));
    if (Math.abs(nightCur - prevNight) > 1e-5) applyTime(nightCur);
    wallMat.color.lerp(wallTarget, 1 - Math.exp(-dt * 5));
    const since = performance.now() - lastTouch;
    idle += ((since > 2500 ? 1 : 0) - idle) * (1 - Math.exp(-dt * 2));
    stageGroup.rotation.y = Math.sin(performance.now() / 2600) * 0.1 * idle;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const start = () => {
    if (!raf && visible) {
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    },
    { threshold: 0.05 }
  ).observe(root);
  controls.addEventListener("start", () => (lastTouch = performance.now() + 1e9));
  controls.addEventListener("end", () => (lastTouch = performance.now()));

  /* ---- UI wiring ---- */
  const qa = <T extends HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const finishName = root.querySelector<HTMLElement>("[data-cfg-finish-name]");
  const modelName = root.querySelector<HTMLElement>("[data-cfg-model-name]");
  const names: Record<ModelKey, string> = { sliding: "Graf · Sliding", casement: "Livio · Casement", fold: "Robus 40 · Fold & Slide", bay: "Livio · Bay", fixed: "Full View · Fixed", geo: "Geometrical · Hexagon" };
  const openBtn = root.querySelector<HTMLButtonElement>("[data-cfg-open]");
  const openLabel = openBtn?.querySelector<HTMLElement>("[data-cfg-open-label]");

  qa<HTMLButtonElement>("[data-cfg-model]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.cfgModel as ModelKey;
      qa("[data-cfg-model]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (modelName) modelName.textContent = names[key];
      const canOpen = key !== "fixed" && key !== "geo";
      if (openBtn) (openBtn.disabled = !canOpen), (openBtn.style.opacity = canOpen ? "1" : "0.35");
      if (!canOpen) {
        openTarget = 0;
        openCur = 0;
        if (openLabel) openLabel.textContent = "Open";
      }
      show(key);
      lastTouch = performance.now();
    })
  );
  qa<HTMLButtonElement>("[data-cfg-finish]").forEach((b) =>
    b.addEventListener("click", () => {
      const f = finishes[Number(b.dataset.cfgFinish)];
      qa("[data-cfg-finish]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (finishName) finishName.textContent = `${f.name} · ${f.tier === "natural" ? "Wood-grain" : f.tier === "premium" ? "Metallic" : "Matte solid"}`;
      applyFinish(f);
      lastTouch = performance.now();
    })
  );
  qa<HTMLButtonElement>("[data-cfg-time]").forEach((b) =>
    b.addEventListener("click", () => {
      night = b.dataset.cfgTime === "night" ? 1 : 0;
      qa("[data-cfg-time]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      lastTouch = performance.now();
    })
  );
  openBtn?.addEventListener("click", () => {
    openTarget = openTarget > 0.5 ? 0 : 1;
    if (openLabel) openLabel.textContent = openTarget > 0.5 ? "Close" : "Open";
    lastTouch = performance.now();
  });

  // initial state
  const firstFinish = Math.max(0, finishes.findIndex((f) => f.name === "Noir"));
  applyFinish(finishes[firstFinish]);
  wallMat.color.copy(wallTarget);
  qa("[data-cfg-finish]")[firstFinish]?.setAttribute("aria-pressed", "true");
  if (finishName) finishName.textContent = `${finishes[firstFinish].name} · Matte solid`;
  show("sliding");
  applyTime(0);
  root.dataset.cfgReady = "1";
  (window as unknown as { __cfg?: unknown }).__cfg = { camera, controls, stageGroup, renderer };
  return {
    // exposed for tests / debugging
    setModel: (k: ModelKey) => qa<HTMLButtonElement>("[data-cfg-model]").find((b) => b.dataset.cfgModel === k)?.click(),
  };
}
