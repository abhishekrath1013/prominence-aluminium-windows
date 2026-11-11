import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { studioEnv } from "./configurator";

gsap.registerPlugin(ScrollTrigger);

/* ==========================================================================
   Hardware assembly viewer.
   Loads the parts exported from "Hardware Components_02.blend", re-materials
   them with polished-metal PBR, and drives an exploded → assembled animation
   from scroll (desktop, pinned) or an Assemble button (touch).
   ========================================================================== */

interface Part {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  dir: THREE.Vector3;
  start: number; // assembly progress at which this part starts moving home
}
interface Loaded {
  holder: THREE.Group;
  parts: Part[];
  reach: number;
}

const matCache = new Map<string, THREE.Material>();
function materialFor(name: string): THREE.Material {
  const key = /gloss/i.test(name)
    ? "gloss"
    : /rubber|plastic|wool/i.test(name)
      ? "rubber"
      : /powder/i.test(name)
        ? "powder"
        : /black/i.test(name)
          ? "black"
          : /steel/i.test(name)
            ? "steel"
            : "alu";
  let m = matCache.get(key);
  if (m) return m;
  switch (key) {
    case "gloss":
      m = new THREE.MeshPhysicalMaterial({ color: "#2b2e34", metalness: 0.95, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
      break;
    case "rubber":
      m = new THREE.MeshStandardMaterial({ color: "#1a1a1d", metalness: 0, roughness: 0.7, envMapIntensity: 0.9 });
      break;
    case "powder":
      m = new THREE.MeshPhysicalMaterial({ color: "#4b4d54", metalness: 0.8, roughness: 0.3, clearcoat: 0.6, envMapIntensity: 1.5 });
      break;
    case "black":
      m = new THREE.MeshPhysicalMaterial({ color: "#3d4047", metalness: 0.92, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 1.6 });
      break;
    case "steel":
      m = new THREE.MeshStandardMaterial({ color: "#d4d8df", metalness: 1, roughness: 0.2, envMapIntensity: 1.6 });
      break;
    default:
      m = new THREE.MeshPhysicalMaterial({ color: "#e4e7ec", metalness: 1, roughness: 0.24, clearcoat: 0.3, envMapIntensity: 1.6 });
  }
  matCache.set(key, m);
  return m;
}

function prepare(scene: THREE.Group, row = false): Loaded {
  scene.updateMatrixWorld(true);
  const found = new Set<THREE.Object3D>();
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const par = o.parent;
    // glTF turns a multi-material mesh into a Group of primitives: keep that Group as ONE part
    const group = par && par !== scene && par.type === "Group" && par.children.length > 1 && par.children.every((c) => (c as THREE.Mesh).isMesh);
    found.add(group ? par! : o);
  });
  const objs = Array.from(found);
  const flat = new THREE.Group();
  objs.forEach((m) => {
    m.updateWorldMatrix(true, false);
    const mw = m.matrixWorld.clone();
    m.removeFromParent();
    mw.decompose(m.position, m.quaternion, m.scale);
    m.updateMatrix();
    m.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        mesh.material = materialFor(mat?.name ?? "");
      }
    });
    flat.add(m);
  });
  flat.updateMatrixWorld(true);
  if (row) {
    // Components that do not physically join are laid out as a tidy kit, largest first.
    const items = objs
      .map((o) => {
        const bb = new THREE.Box3().setFromObject(o);
        return { o, bb, size: bb.getSize(new THREE.Vector3()), c: bb.getCenter(new THREE.Vector3()) };
      })
      .sort((a, b) => Math.max(b.size.x, b.size.y, b.size.z) - Math.max(a.size.x, a.size.y, a.size.z));
    const widest = Math.max(...items.map((i) => Math.max(i.size.x, i.size.y, i.size.z)));
    const gap = widest * 0.18;
    const rows: (typeof items)[] = [[], []];
    items.forEach((it, k) => rows[k % 2].push(it));
    rows.forEach((r, ri) => {
      const total = r.reduce((n, i) => n + Math.max(i.size.x, i.size.z) + gap, -gap);
      let x = -total / 2;
      r.forEach((it) => {
        const w = Math.max(it.size.x, it.size.z);
        const target = new THREE.Vector3(x + w / 2, (ri === 0 ? 1 : -1) * widest * 0.2, 0);
        it.o.position.add(target.sub(it.c));
        x += w + gap;
      });
    });
    flat.updateMatrixWorld(true);
  }
  const box = new THREE.Box3().setFromObject(flat);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const axisIdx = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  const axis = new THREE.Vector3();
  axis.setComponent(axisIdx, 1);

  const info = objs.map((mesh, i) => {
    const b2 = new THREE.Box3().setFromObject(mesh);
    const c = b2.getCenter(new THREE.Vector3()).sub(centre);
    return { mesh, c, i };
  });
  const parts: Part[] = info.map(({ mesh, c, i }) => {
    let dir: THREE.Vector3;
    if (c.length() < maxDim * 0.02) {
      const a2 = i * 2.399;
      dir = new THREE.Vector3(Math.cos(a2), 0.35, Math.sin(a2)).normalize();
    } else {
      dir = c.clone().normalize().multiplyScalar(0.7).addScaledVector(axis, Math.sign(c.dot(axis) || 1) * 0.5).normalize();
    }
    return { mesh: mesh as THREE.Mesh, base: mesh.position.clone(), dir, start: 0 };
  });
  // parts nearest the middle of the assembly go home first, outermost last
  [...info]
    .sort((a2, b2) => Math.abs(a2.c.dot(axis)) - Math.abs(b2.c.dot(axis)))
    .forEach((o, rank) => (parts[o.i].start = (rank / Math.max(1, parts.length)) * 0.5));

  const s = 2.7 / maxDim;
  flat.scale.setScalar(s);
  flat.position.copy(centre).multiplyScalar(-s);
  const holder = new THREE.Group();
  holder.add(flat);
  // turn the broadest face to the camera (smallest dimension → depth axis)
  const minIdx = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
  if (minIdx === 0) holder.rotation.y = Math.PI / 2;
  else if (minIdx === 1) holder.rotation.x = Math.PI / 2;
  return { holder, parts, reach: maxDim * 0.7 };
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);

export function mountHardware(root: HTMLElement, tabs: { key: string; count: number }[]) {
  const stage = root.querySelector<HTMLElement>("[data-hw-canvas]")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;";

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnv(), 0.03).texture;
  scene.environmentIntensity = 1.0;
  scene.environmentIntensity = 1.5;
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
  key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.6);
  rim.position.set(-4, 2, -3);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(1.2, 0.8, 5.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = Math.PI - 0.7;
  controls.rotateSpeed = 0.7;

  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  const loader = new GLTFLoader();
  const cache = new Map<string, Promise<Loaded>>();
  const load = (k: string) => {
    if (!cache.has(k)) cache.set(k, loader.loadAsync(`/models/hw-${k}.glb`).then((g) => prepare(g.scene, k === "motion" || k === "seal")));
    return cache.get(k)!;
  };

  /* ---- state ---- */
  let current: Loaded | null = null;
  let currentKey = tabs[0].key;
  let tTarget = 0; // assembly progress 0 (exploded) → 1 (assembled)
  let tCur = 0;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let dragging = false;
  const countEl = root.querySelector<HTMLElement>("[data-hw-count]");
  const totalEl = root.querySelector<HTMLElement>("[data-hw-total]");
  const pad = (n: number) => String(n).padStart(2, "0");

  async function show(k: string) {
    currentKey = k;
    const l = await load(k);
    if (currentKey !== k) return;
    if (current) stageGroup.remove(current.holder);
    current = l;
    stageGroup.add(l.holder);
    const total = l.parts.length;
    if (totalEl) totalEl.textContent = pad(total);
    apply(tCur);
    root.dataset.hwReady = "1";
  }

  function apply(t: number) {
    if (!current) return;
    let done = 0;
    for (const p of current.parts) {
      const a = Math.min(1, Math.max(0, (t - p.start) / 0.5));
      const e = 1 - ease(a);
      p.mesh.position.copy(p.base).addScaledVector(p.dir, e * current.reach);
      if (a >= 0.999) done++;
    }
    if (countEl) countEl.textContent = pad(done);
  }

  /* ---- sizing + loop ---- */
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.position.setLength(camera.aspect < 1 ? 8.4 : 6.0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  function frame() {
    raf = 0;
    if (!visible) return;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const prev = tCur;
    tCur += (tTarget - tCur) * (1 - Math.exp(-dt * 6));
    if (Math.abs(tCur - prev) > 1e-5) apply(tCur);
    if (!dragging) stageGroup.rotation.y += (Math.sin(now / 2400) * 0.5 - stageGroup.rotation.y) * Math.min(1, dt * 1.5);
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const start = () => {
    if (!raf && visible) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    },
    { threshold: 0.02 }
  ).observe(root);
  controls.addEventListener("start", () => (dragging = true));
  controls.addEventListener("end", () => (dragging = false));

  /* ---- tabs ---- */
  const tabBtns = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-hw-tab]"));
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-hw-panel]"));
  tabBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.hwTab!;
      tabBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      panels.forEach((p) => (p.hidden = p.dataset.hwPanel !== k));
      show(k);
    })
  );

  /* ---- scroll drive (desktop, pinned) / button (touch) ---- */
  const mm = gsap.matchMedia();
  mm.add("(min-width: 1024px) and (min-height: 640px)", () => {
    const st = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: "+=210%",
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => (tTarget = Math.min(1, self.progress / 0.72)),
    });
    return () => st.kill();
  });
  const toggle = root.querySelector<HTMLButtonElement>("[data-hw-toggle]");
  const toggleLabel = root.querySelector<HTMLElement>("[data-hw-toggle-label]");
  toggle?.addEventListener("click", () => {
    tTarget = tTarget > 0.5 ? 0 : 1;
    if (toggleLabel) toggleLabel.textContent = tTarget > 0.5 ? "Explode" : "Assemble";
  });

  show(currentKey);
  void tabs;
}
