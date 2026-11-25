import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { gsap } from "gsap";
import { studioEnv } from "./studio-env";
import type { RobusComponent } from "../data/robus-components";

/* ==========================================================================
   "Inside the frame" — Robus 40 component showcase.

   One WebGL canvas, two scenes, drawn back to back:
     • window scene  – the whole Robus 40. Idle: centred. Open: it slides to the
       left and the camera dollies into the part being shown. The profile around
       that part turns to glass (shader, see injectShell) so the hardware inside
       reads through it; the hardware in question is shown in Prominance green.
     • part scene    – the same part, full detail, turning slowly. It flies out
       of the window's focus point to the right-hand stage.
   Where each scene is drawn is dictated by placeholder elements in the page
   (their rects are read every frame), so layout stays in CSS.
   ========================================================================== */

type Role = "profile" | "glass" | "rubber" | "steel" | "black" | "plastic" | "powder" | "alu";

interface ManifestComp {
  id: string;
  focusA: number[];
  focusB: number[];
  inWindow: { center: number[]; extent: number[] };
  display: { extent: number[] };
}
interface Manifest {
  window: { min: number[]; max: number[]; center: number[] };
  components: ManifestComp[];
}

/* ------------------------------ shared uniforms ------------------------------ */
const G = {
  uGhost: { value: 0 },
  uFA: { value: new THREE.Vector3() },
  uFB: { value: new THREE.Vector3() },
  uR0: { value: 0.1 },
  uR1: { value: 0.25 },
  uMute: { value: 0 },
  uTint: { value: new THREE.Color("#d6e8ee") },
};

/** Prominance green — sampled from the logo (#429B46). */
const BRAND_GREEN = "#429B46";
/** The highlighted part: flat Prominance green, matte, no emissive glow or sparkle. Only the shade varies by role so screws and bodies stay legible. */
const FOCUS_COLOR: Record<Role, string> = {
  profile: BRAND_GREEN,
  glass: BRAND_GREEN,
  rubber: "#256b2a",
  steel: "#5db561",
  black: "#2f7a34",
  plastic: "#2f7a34",
  powder: "#388a3d",
  alu: BRAND_GREEN,
};

/** How much wider than the part itself the window camera shows while a part is presented. */
const WINDOW_ZOOM_OUT = 3;

const ROLE: Record<Role, THREE.MeshPhysicalMaterialParameters> = {
  // powder-coat matte: almost no metal sheen, fully rough, so the frame diffuses light instead of mirroring it
  profile: { color: "#1d2540", metalness: 0.05, roughness: 0.92 },
  glass: { color: "#e4f1f5", metalness: 0, roughness: 0.05, transparent: true, opacity: 0.07, depthWrite: false },
  rubber: { color: "#17171a", metalness: 0, roughness: 0.62 },
  // satin finishes, no clearcoat — metal reads as metal without the chrome glare
  steel: { color: "#aeb3bb", metalness: 0.8, roughness: 0.5 },
  black: { color: "#3b3f47", metalness: 0.6, roughness: 0.55 },
  plastic: { color: "#26272c", metalness: 0, roughness: 0.6 },
  powder: { color: "#555a63", metalness: 0.45, roughness: 0.58 },
  alu: { color: "#c4c8cf", metalness: 0.75, roughness: 0.5 },
};

/** Turns the profile near the focus into glass: alpha, fresnel rim and tint. */
function injectShell(shader: any) {
  Object.assign(shader.uniforms, { uGhost: G.uGhost, uFA: G.uFA, uFB: G.uFB, uR0: G.uR0, uR1: G.uR1, uTint: G.uTint });
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vRxPos;")
    .replace("#include <project_vertex>", "#include <project_vertex>\nvRxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
      uniform float uGhost; uniform vec3 uFA; uniform vec3 uFB; uniform float uR0; uniform float uR1; uniform vec3 uTint;
      varying vec3 vRxPos;
      float rxSeg(vec3 p, vec3 a, vec3 b){ vec3 ab = b - a; float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return distance(p, a + ab * t); }`
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      float rxD = rxSeg(vRxPos, uFA, uFB);
      float rxG = (1.0 - smoothstep(uR0, uR1, rxD)) * uGhost;
      float rxF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
      diffuseColor.a *= mix(1.0, clamp(0.06 + rxF * 0.42, 0.0, 1.0), rxG);
      diffuseColor.rgb = mix(diffuseColor.rgb, uTint * 0.85, rxG * 0.55);
      metalnessFactor = mix(metalnessFactor, 0.0, rxG);
      roughnessFactor = mix(roughnessFactor, 0.05, rxG);`
    );
}

/** Hardware seen in the window dims when something else is in focus. */
function injectMute(shader: any) {
  shader.uniforms.uMute = G.uMute;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uMute;")
    .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= (1.0 - 0.6 * uMute);");
}

/** The source profiles overlap and share coplanar faces (invisible in Blender's path tracer, but they
 *  z-fight in a rasteriser). Each profile mesh gets its own small depth bias so one always wins. */
function makeShell(p: THREE.MeshPhysicalMaterialParameters, bias: number) {
  const mm = new THREE.MeshPhysicalMaterial({
    ...p,
    transparent: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.45,
    polygonOffset: bias !== 0,
    polygonOffsetFactor: bias,
    polygonOffsetUnits: bias,
  });
  mm.onBeforeCompile = injectShell;
  mm.customProgramCacheKey = () => "rx-shell";
  return mm;
}

const cache = new Map<string, THREE.Material>();
function material(kind: "shell" | "hw" | "focus" | "plain", role: Role): THREE.Material {
  const key = `${kind}:${role}`;
  let m = cache.get(key);
  if (m) return m;
  const p = { ...ROLE[role] };
  if (role === "glass") {
    m = new THREE.MeshPhysicalMaterial({ ...p, side: THREE.DoubleSide, envMapIntensity: 0.7 });
  } else if (kind === "shell") {
    m = makeShell(p, 0);
  } else if (kind === "hw") {
    const mm = new THREE.MeshPhysicalMaterial({ ...p, envMapIntensity: 0.8 });
    mm.onBeforeCompile = injectMute;
    mm.customProgramCacheKey = () => "rx-hw";
    m = mm;
  } else if (kind === "focus") {
    m = new THREE.MeshPhysicalMaterial({ color: FOCUS_COLOR[role], metalness: 0.05, roughness: 0.62, envMapIntensity: 0.45 });
  } else {
    m = new THREE.MeshPhysicalMaterial({ ...p, envMapIntensity: 0.8 });
  }
  cache.set(key, m);
  return m;
}

/* ------------------------------ helpers ------------------------------ */
const roleOf = (m: THREE.Material | THREE.Material[]): Role => {
  const mat = Array.isArray(m) ? m[0] : m;
  const r = /^rx_([a-z]+)/.exec(mat?.name ?? "")?.[1] as Role | undefined;
  return r && r in ROLE ? r : "alu";
};
const famOf = (o: THREE.Object3D): string => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    const m = /^([a-z]+)__/.exec(p.name);
    if (m) return m[1];
  }
  return "misc";
};
const ease = (x: number) => 1 - Math.pow(1 - x, 3);
const FOV = 28;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);

interface Rect { x: number; y: number; w: number; h: number; cx: number; cy: number }
function rectRel(el: HTMLElement, base: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  const x = r.left - base.left;
  const y = r.top - base.top;
  return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2 };
}

/* ======================================================================= */
export async function mountRobusComponents(root: HTMLElement, comps: RobusComponent[]) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = (s: number) => (reduce ? 0.01 : s);

  const host = $("[data-rx-canvas]");
  const vpFrame = $("[data-rx-vp-frame]");
  const vpComp = $("[data-rx-vp-comp]");
  const svg = $<HTMLElement>("[data-rx-svg]") as unknown as SVGSVGElement;
  const lineEl = svg.querySelector<SVGLineElement>("[data-rx-line]")!;
  const pinEl = svg.querySelector<SVGGElement>("[data-rx-pin]")!;
  const loadingEl = root.querySelector<HTMLElement>("[data-rx-loading]");
  const openBtn = $<HTMLButtonElement>("[data-rx-open]");

  /* ---- renderer ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(studioEnv(), 0.03).texture;

  /* ---- window scene ---- */
  const sceneF = new THREE.Scene();
  sceneF.environment = env;
  sceneF.environmentIntensity = 1.25;
  const camF = new THREE.PerspectiveCamera(FOV, 1, 0.02, 30);
  sceneF.add(camF);
  const keyF = new THREE.DirectionalLight(0xfff1dc, 2.4);
  keyF.position.set(1.8, 2.4, 1.2);
  keyF.target.position.set(0, 0, -6);
  const rimF = new THREE.DirectionalLight(0xbcd2ff, 1.4);
  rimF.position.set(-2.2, 0.6, -0.6);
  rimF.target.position.set(0, 0, -6);
  camF.add(keyF, keyF.target, rimF, rimF.target);

  /* ---- part scene ---- */
  const sceneC = new THREE.Scene();
  sceneC.environment = env;
  sceneC.environmentIntensity = 1.35;
  const camC = new THREE.PerspectiveCamera(FOV, 1, 0.05, 40);
  sceneC.add(camC);
  const keyC = new THREE.DirectionalLight(0xfff1dc, 2.6);
  keyC.position.set(2, 3, 1.5);
  keyC.target.position.set(0, 0, -6);
  const rimC = new THREE.DirectionalLight(0xbcd2ff, 1.8);
  rimC.position.set(-3, 1, -1);
  rimC.target.position.set(0, 0, -6);
  camC.add(keyC, keyC.target, rimC, rimC.target);
  const roll = new THREE.Group();
  const pitch = new THREE.Group();
  const spinG = new THREE.Group();
  roll.add(pitch);
  pitch.add(spinG);
  sceneC.add(roll);

  /* ---- loaders ---- */
  const draco = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);

  const manifest: Manifest = await (await fetch("/models/robus40/manifest.json")).json();
  const mById = new Map(manifest.components.map((c) => [c.id, c]));
  const winCenter = new THREE.Vector3(...manifest.window.center);
  const winSize = new THREE.Vector3(...manifest.window.max).sub(new THREE.Vector3(...manifest.window.min));
  winSize.set(Math.abs(winSize.x), Math.abs(winSize.y), Math.abs(winSize.z));
  const winMinY = Math.min(manifest.window.min[1], manifest.window.max[1]);

  /* ---- load the window ---- */
  interface Part { mesh: THREE.Mesh; fam: string; normal: THREE.Material; focus: THREE.Material }
  const parts: Part[] = [];
  let shellIdx = 1;
  const frameGltf = await loader.loadAsync("/models/robus40/frame.glb");
  frameGltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const fam = famOf(mesh);
    const role = roleOf(mesh.material);
    const shell = role === "profile" || fam === "seal";
    let normal: THREE.Material;
    if (role === "glass") normal = material("plain", "glass");
    else if (shell) normal = makeShell(ROLE[role], (shellIdx++ % 14) * 1.5); // distinct bias per shell mesh
    else normal = material("hw", role);
    const focus = role === "glass" || shell ? normal : material("focus", role);
    mesh.material = normal;
    mesh.frustumCulled = true;
    parts.push({ mesh, fam, normal, focus });
  });
  sceneF.add(frameGltf.scene);

  function setFocusFamily(fam: string | null) {
    for (const p of parts) p.mesh.material = fam && p.fam === fam ? p.focus : p.normal;
  }

  /* ---- state ---- */
  const overview = { tx: winCenter.x, ty: winCenter.y, tz: winCenter.z, rw: winSize.x * 1.12, rh: winSize.y * 1.12, yaw: 0, pitch: 0.05 };
  const cam = { ...overview };
  const S = {
    open: false,
    index: 0,
    token: 0,
    compIdx: -1,
    enter: 0,
    spin: 0,
    spinVel: 0,
    drag: 0, // user yaw on the window
    pointerX: 0,
    visible: false,
  };
  let compModel: { group: THREE.Group; ext: THREE.Vector3; compId: string } | null = null;
  let scanTimer: gsap.core.Tween | null = null;
  let scanIdx = -1;

  function focusTo(i: number, d: number) {
    const c = comps[i];
    const m = mById.get(c.id)!;
    const a = new THREE.Vector3(...m.focusA);
    const b = new THREE.Vector3(...m.focusB);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const base = Math.min(c.view[0], c.view[1]);
    const r0 = Math.max(0.045, base * 0.27);
    const r1 = r0 + Math.max(0.07, base * 0.3);
    gsap.to(G.uFA.value, { x: a.x, y: a.y, z: a.z, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(G.uFB.value, { x: b.x, y: b.y, z: b.z, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(G.uR0, { value: r0, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(G.uR1, { value: r1, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(cam, {
      tx: mid.x, ty: mid.y, tz: mid.z, rw: c.view[0] * WINDOW_ZOOM_OUT, rh: c.view[1] * WINDOW_ZOOM_OUT, yaw: c.yaw, pitch: c.pitch,
      duration: d, ease: "power3.inOut", overwrite: true,
    });
    setFocusFamily(c.id);
  }

  /* ---- idle: a small glass "scanner" drifts across the window, hinting at what is inside ---- */
  function scanStep() {
    if (S.open || reduce) return;
    scanIdx = (scanIdx + 1) % comps.length;
    const c = comps[scanIdx];
    const m = mById.get(c.id)!;
    const a = new THREE.Vector3(...m.focusA);
    const b = new THREE.Vector3(...m.focusB);
    // long parts: scan a short stretch of them
    if (a.distanceTo(b) > 0.3) {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a).normalize().multiplyScalar(0.12);
      a.copy(mid).sub(dir);
      b.copy(mid).add(dir);
    }
    const d = 1.4;
    gsap.to(G.uFA.value, { x: a.x, y: a.y, z: a.z, duration: d, ease: "power2.inOut", overwrite: true });
    gsap.to(G.uFB.value, { x: b.x, y: b.y, z: b.z, duration: d, ease: "power2.inOut", overwrite: true });
    gsap.to(G.uR0, { value: 0.04, duration: d, overwrite: true });
    gsap.to(G.uR1, { value: 0.13, duration: d, overwrite: true });
    gsap.to(G.uGhost, { value: 1, duration: 0.9, overwrite: true });
    gsap.to(G.uMute, { value: 0.45, duration: 0.9, overwrite: true });
    setFocusFamily(c.id);
    scanTimer = gsap.delayedCall(3.4, scanStep);
  }
  function startScan() {
    scanTimer?.kill();
    if (reduce) return;
    scanTimer = gsap.delayedCall(1.2, scanStep);
  }
  function stopScan() {
    scanTimer?.kill();
    scanTimer = null;
  }

  /* ---- showcase part loading ---- */
  const compCache = new Map<string, Promise<THREE.Group>>();
  function loadComp(c: RobusComponent) {
    let p = compCache.get(c.id);
    if (!p) {
      p = loader.loadAsync(`/models/robus40/${c.file}`).then((g) => {
        g.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.material = material("plain", roleOf(mesh.material));
        });
        return g.scene;
      });
      compCache.set(c.id, p);
    }
    return p;
  }
  function attach(c: RobusComponent, g: THREE.Group) {
    spinG.clear();
    g.scale.setScalar(1);
    g.position.set(0, 0, 0);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const s = 1 / Math.max(size.x, size.y, size.z);
    g.scale.setScalar(s);
    g.position.copy(centre).multiplyScalar(-s);
    spinG.add(g);
    roll.rotation.z = c.tilt;
    pitch.rotation.x = 0.3;
    compModel = { group: g, ext: size.multiplyScalar(s), compId: c.id };
  }

  /* ---- DOM: panel ---- */
  const items = $$("[data-rx-item]");
  const chips = $$<HTMLButtonElement>("[data-rx-chip]");
  const countEl = root.querySelector<HTMLElement>("[data-rx-count]");
  function showItem(i: number, animate: boolean) {
    items.forEach((el) => {
      // title row and body are separate elements that share an index
      const on = Number(el.dataset.rxItem) === i;
      if (on && animate && !reduce) {
        el.hidden = false;
        gsap.fromTo(el.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: "power3.out", overwrite: true });
      } else {
        el.hidden = !on;
      }
    });
    chips.forEach((b, k) => b.setAttribute("aria-current", k === i ? "true" : "false"));
    if (countEl) countEl.textContent = String(i + 1).padStart(2, "0");
  }

  /* ---- navigation ---- */
  async function go(i: number, first = false) {
    i = (i + comps.length) % comps.length;
    const my = ++S.token;
    const c = comps[i];
    S.index = i;
    showItem(i, !first);

    // the previous part flies back into the window …
    if (S.compIdx >= 0 && S.enter > 0.01) {
      await new Promise<void>((res) => gsap.to(S, { enter: 0, duration: dur(0.4), ease: "power2.in", overwrite: true, onComplete: () => res() }));
      if (S.token !== my) return;
    }
    // … while the window glides to the new one
    gsap.to(G.uGhost, { value: 1, duration: dur(1), overwrite: true });
    gsap.to(G.uMute, { value: 1, duration: dur(1), overwrite: true });
    focusTo(i, dur(first ? 1.5 : 1.25));

    const g = await loadComp(c);
    if (S.token !== my) return;
    attach(c, g);
    S.compIdx = i;
    S.spin = 0;
    S.spinVel = 0;
    gsap.fromTo(S, { enter: 0 }, { enter: 1, duration: dur(1.1), delay: dur(first ? 0.75 : 0.55), ease: "power3.out", overwrite: true });
  }

  function open(i = 0) {
    if (S.open) return;
    S.open = true;
    stopScan();
    root.dataset.state = "open";
    go(i, true);
    root.dispatchEvent(new CustomEvent("rx:open"));
  }
  function close() {
    if (!S.open) return;
    S.open = false;
    S.token++;
    root.dataset.state = "idle";
    gsap.to(S, { enter: 0, duration: dur(0.45), ease: "power2.in", overwrite: true });
    gsap.to(cam, { ...overview, duration: dur(1.3), ease: "power3.inOut", overwrite: true });
    gsap.to(G.uGhost, { value: 0, duration: dur(0.9), overwrite: true });
    gsap.to(G.uMute, { value: 0, duration: dur(0.9), overwrite: true });
    setFocusFamily(null);
    if (!reduce) gsap.delayedCall(1.6, () => !S.open && startScan());
  }

  openBtn.addEventListener("click", () => open(0));
  // the numbered list beside the window
  $$<HTMLButtonElement>("[data-rx-pick]").forEach((b) => {
    b.disabled = false;
    b.addEventListener("click", () => {
      const k = Number(b.dataset.rxPick);
      if (S.open) go(k);
      else open(k);
    });
  });
  $("[data-rx-close]").addEventListener("click", close);
  $("[data-rx-prev]").addEventListener("click", () => go(S.index - 1));
  $("[data-rx-next]").addEventListener("click", () => go(S.index + 1));
  chips.forEach((b, k) => b.addEventListener("click", () => k !== S.index && go(k)));
  addEventListener("keydown", (e) => {
    if (!S.open || !S.visible) return;
    if (e.key === "ArrowRight") go(S.index + 1);
    else if (e.key === "ArrowLeft") go(S.index - 1);
    else if (e.key === "Escape") close();
  });

  /* ---- pointer: drag the window (idle) / spin the part (open) ---- */
  function drag(el: HTMLElement, onMove: (dx: number) => void, onEnd?: () => void) {
    let id = -1;
    let lastX = 0;
    el.addEventListener("pointerdown", (e) => {
      id = e.pointerId;
      lastX = e.clientX;
      el.setPointerCapture(id);
      el.classList.add("is-drag");
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      onMove(e.clientX - lastX);
      lastX = e.clientX;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      el.classList.remove("is-drag");
      onEnd?.();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  let draggingFrame = false;
  drag(
    vpFrame,
    (dx) => {
      draggingFrame = true;
      S.drag = THREE.MathUtils.clamp(S.drag + dx * 0.006, -1.1, 1.1);
    },
    () => (draggingFrame = false)
  );
  let draggingComp = false;
  drag(
    vpComp,
    (dx) => {
      draggingComp = true;
      S.spin += dx * 0.012;
      S.spinVel = dx * 0.012 * 60;
    },
    () => (draggingComp = false)
  );
  vpFrame.addEventListener("pointermove", (e) => {
    const r = vpFrame.getBoundingClientRect();
    S.pointerX = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
  });

  /* ---- picking: press a component in the window to open / jump to it ---- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const glassMat = material("plain", "glass");
  const partOf = new Map<THREE.Object3D, Part>(parts.map((p) => [p.mesh, p]));
  const pickable = parts.filter((p) => p.normal !== glassMat).map((p) => p.mesh);
  const tmpAB = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  let focusPx = { x: -1e4, y: -1e4 }; // where the highlighted part sits on screen (set every frame)

  /** is this point inside the glass region around the current focus? */
  function inGlass(pt: THREE.Vector3) {
    if (G.uGhost.value < 0.4) return false;
    const a = G.uFA.value;
    tmpAB.copy(G.uFB.value).sub(a);
    const t = THREE.MathUtils.clamp(tmpP.copy(pt).sub(a).dot(tmpAB) / Math.max(tmpAB.lengthSq(), 1e-6), 0, 1);
    tmpP.copy(a).addScaledVector(tmpAB, t);
    return pt.distanceTo(tmpP) < G.uR0.value + (G.uR1.value - G.uR0.value) * 0.6;
  }

  /** component index under the pointer, or -1. Profile in front of a part blocks it unless it has turned to glass. */
  function pickAt(clientX: number, clientY: number): number {
    const cr = canvas.getBoundingClientRect();
    ndc.set(((clientX - cr.left) / cr.width) * 2 - 1, -(((clientY - cr.top) / cr.height) * 2 - 1));
    ray.setFromCamera(ndc, camF);
    for (const h of ray.intersectObjects(pickable, false)) {
      const p = partOf.get(h.object)!;
      if (p.focus === p.normal) {
        // profile / seal: solid unless it has turned to glass here
        if (inGlass(h.point)) continue;
        break;
      }
      const k = comps.findIndex((c) => c.id === p.fam);
      if (k >= 0) return k;
    }
    // the little glass scanner that drifts across the window: pressing it opens what it is showing
    if (!S.open && scanIdx >= 0 && Math.hypot(clientX - cr.left - focusPx.x, clientY - cr.top - focusPx.y) < 64) return scanIdx;
    return -1;
  }

  let downAt: { x: number; y: number } | null = null;
  vpFrame.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
  vpFrame.addEventListener("pointerup", (e) => {
    const d = downAt;
    downAt = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // that was a drag, not a press
    const k = pickAt(e.clientX, e.clientY);
    if (k < 0) return;
    if (!S.open) open(k);
    else if (k !== S.index) go(k);
  });
  // pointer cursor over anything pressable (throttled — it ray-casts)
  let hoverAt = 0;
  vpFrame.addEventListener("pointermove", (e) => {
    if (draggingFrame || downAt) return;
    const now = performance.now();
    if (now - hoverAt < 90) return;
    hoverAt = now;
    const k = pickAt(e.clientX, e.clientY);
    vpFrame.style.cursor = k >= 0 && (!S.open || k !== S.index) ? "pointer" : "";
  });

  /* ---- sizing + loop ---- */
  let W = 0;
  let H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === W && h === H) return;
    W = w;
    H = h;
    renderer.setSize(w, h, false);
  }

  function place(c: THREE.PerspectiveCamera, cx: number, cy: number) {
    c.aspect = W / H;
    c.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    c.updateMatrixWorld(true);
  }
  const v3 = new THREE.Vector3();

  const dbg = { frame: true, comp: true };
  let last = performance.now();
  let t = 0;
  let raf = 0;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    resize();
    const cr = canvas.getBoundingClientRect();
    const rf = rectRel(vpFrame, cr);
    const rc = rectRel(vpComp, cr);

    /* window camera */
    if (!draggingFrame) S.drag *= Math.exp(-dt * (S.open ? 0.9 : 0.5));
    const sway = reduce ? 0 : S.open ? Math.sin(t * 0.45) * 0.035 : Math.sin(t * 0.38) * 0.2 + S.pointerX * 0.16;
    const yaw = cam.yaw + sway + S.drag;
    // never pull back further than the whole window
    const ppu = Math.max(Math.min(rf.w / cam.rw, rf.h / cam.rh), Math.min(rf.w / overview.rw, rf.h / overview.rh));
    const dist = H / (2 * TAN * Math.max(ppu, 1));
    const cp = Math.cos(cam.pitch);
    camF.position.set(cam.tx + dist * Math.sin(yaw) * cp, cam.ty + dist * Math.sin(cam.pitch), cam.tz - dist * Math.cos(yaw) * cp);
    camF.lookAt(cam.tx, cam.ty, cam.tz);
    camF.near = Math.max(0.01, dist * 0.04);
    camF.far = dist + 12;
    const zoomK = THREE.MathUtils.clamp(1 - cam.rh / overview.rh, 0, 1);
    const relY = THREE.MathUtils.clamp((cam.ty - winMinY) / winSize.y, 0, 1);
    place(camF, rf.cx, rf.cy + (0.5 - relY) * rf.h * 0.3 * zoomK);
    camF.updateProjectionMatrix();

    /* focus point on screen (for the part's flight and the leader line) */
    v3.copy(G.uFA.value).add(G.uFB.value).multiplyScalar(0.5).project(camF);
    const fx = (v3.x * 0.5 + 0.5) * W;
    const fy = (1 - (v3.y * 0.5 + 0.5)) * H;
    focusPx = { x: fx, y: fy };

    renderer.setScissorTest(false);
    renderer.clear();
    // the window is clipped to its own half so it never runs under the text
    renderer.setScissorTest(true);
    renderer.setScissor(rf.x, H - (rf.y + rf.h), rf.w, rf.h);
    if (dbg.frame) renderer.render(sceneF, camF);
    renderer.setScissorTest(false);

    /* showcase part */
    const e = ease(THREE.MathUtils.clamp(S.enter, 0, 1));
    if (compModel && S.enter > 0.002) {
      const c = comps[S.compIdx];
      if (!draggingComp) {
        S.spinVel *= Math.exp(-dt * 2.4);
        S.spin += dt * (reduce ? 0 : 0.34) + S.spinVel * dt;
      }
      spinG.rotation.y = S.spin;
      // fit the part to the stage: worst-case reach while it turns, with the pitch and roll applied
      const ext = compModel.ext;
      const rh = 0.5 * Math.hypot(ext.x, ext.z);
      const rv = 0.5 * ext.y * Math.cos(0.3) + rh * Math.sin(0.3);
      const ct = Math.abs(Math.cos(c.tilt));
      const st = Math.abs(Math.sin(c.tilt));
      const hw = rh * ct + rv * st;
      const hh = rh * st + rv * ct;
      const ppuC = Math.min((rc.w * 0.86) / (2 * Math.max(hw, 0.05)), (rc.h * 0.86) / (2 * Math.max(hh, 0.05)));
      const D = H / (2 * TAN * ppuC);
      const px = THREE.MathUtils.lerp(fx, rc.cx, e);
      const py = THREE.MathUtils.lerp(fy, rc.cy, e);
      roll.scale.setScalar(THREE.MathUtils.lerp(0.08, 1, e));
      camC.position.set(0, 0, -D);
      camC.lookAt(0, 0, 0);
      camC.near = D * 0.1;
      camC.far = D * 6;
      place(camC, px, py);
      camC.updateProjectionMatrix();
      renderer.clearDepth();
      if (dbg.comp) renderer.render(sceneC, camC);

      /* leader line: window focus point → part */
      const o = S.open ? THREE.MathUtils.clamp((S.enter - 0.55) / 0.45, 0, 1) : 0;
      lineEl.setAttribute("x1", fx.toFixed(1));
      lineEl.setAttribute("y1", fy.toFixed(1));
      lineEl.setAttribute("x2", rc.cx.toFixed(1));
      lineEl.setAttribute("y2", rc.cy.toFixed(1));
      svg.style.setProperty("--rx-line", String(o * 0.9));
      pinEl.setAttribute("transform", `translate(${fx.toFixed(1)} ${fy.toFixed(1)})`);
    } else {
      svg.style.setProperty("--rx-line", "0");
    }
  }

  /* run only while on screen */
  const io = new IntersectionObserver(
    ([en]) => {
      S.visible = en.isIntersecting;
      if (S.visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!S.visible && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    { threshold: 0.01 }
  );
  io.observe(root);

  /* ---- ready ---- */
  root.dataset.rxReady = "1";
  loadingEl?.setAttribute("hidden", "");
  openBtn.disabled = false;
  gsap.to(G.uGhost, { value: 0, duration: 0.01 });
  startScan();
  // warm the part files while the visitor reads
  const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 800));
  idle(() => comps.forEach((c) => loadComp(c)));

  (window as any).__rx = { open, close, go, S, cam, G, camF, camC, dbg }; // handy for debugging in the console
}
