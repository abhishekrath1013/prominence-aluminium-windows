import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

/* ==========================================================================
   The one live 3D object in "Inside the frame": the component being shown,
   swaying slowly. Drag to turn it.

   Realism comes from three things: it is lit by a photographed studio (HDRI)
   with extra soft boxes for crisp highlights; each material uses the same
   colour / metalness / roughness as the window stills (tools/render_robus40.py);
   and the surfaces get a fine real-world grain (orange-peel powder coat,
   brushed metal) so no face is perfectly flat.
   ========================================================================== */

type Role = "profile" | "powder" | "rubber" | "plastic" | "black" | "steel" | "alu" | "glass";

interface Finish {
  color: string;
  metalness: number;
  roughness: number;
  /** surface grain: size and depth in metres */
  grain?: [number, number];
  /** how much the roughness wanders, and whether it does so in brush lines */
  vary?: number;
  brushed?: boolean;
  clearcoat?: number;
}

const FINISH: Record<Role, Finish> = {
  profile: { color: "#26292e", metalness: 0.25, roughness: 0.42, grain: [0.0007, 0.000018], clearcoat: 0.25 },
  powder: { color: "#34373d", metalness: 0.3, roughness: 0.4, grain: [0.0005, 0.000012], clearcoat: 0.25 },
  rubber: { color: "#1a1a1c", metalness: 0, roughness: 0.7, grain: [0.0005, 0.000018] },
  plastic: { color: "#242427", metalness: 0, roughness: 0.36, grain: [0.0004, 0.000007] },
  black: { color: "#55585e", metalness: 0.9, roughness: 0.34, vary: 0.07 },
  steel: { color: "#c9cbce", metalness: 1, roughness: 0.24, vary: 0.09, brushed: true },
  alu: { color: "#d3d5d7", metalness: 1, roughness: 0.33, vary: 0.07, brushed: true },
  glass: { color: "#dfeee9", metalness: 0, roughness: 0.05 },
};

/** the starting pose of each part in degrees, the same as its still: yaw, pitch (looking down), roll */
const POSE: Record<string, [number, number, number]> = {
  stay: [-22, 52, -24],
  valve: [34, 30, 0],
  handle: [-38, 12, 0],
  receiver: [62, 14, 0],
  alignment: [24, 20, 8],
  raiser: [-30, 34, 0],
  cleats: [28, 24, 0],
  safety: [-52, 14, 32],
  gasket: [-58, 30, 38],
};

/** the slow movement: this far to each side, once every this many seconds */
const SWAY = THREE.MathUtils.degToRad(34);
const PERIOD = 15;
const FOV = 24;

const NOISE = /* glsl */ `
  float rxHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float rxNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(rxHash(i), rxHash(i + vec3(1,0,0)), f.x), mix(rxHash(i + vec3(0,1,0)), rxHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(rxHash(i + vec3(0,0,1)), rxHash(i + vec3(1,0,1)), f.x), mix(rxHash(i + vec3(0,1,1)), rxHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  /* grain finer than a pixel would only sparkle, so it fades out */
  float rxSharp(vec3 q) { vec3 w = fwidth(q); return 1.0 - smoothstep(0.35, 0.9, max(w.x, max(w.y, w.z))); }
`;

/** the grain is measured on the real part: mesh points are in metres (see load) */
function makeMaterial(role: Role, brushAxis: { value: THREE.Vector3 }) {
  const f = FINISH[role];
  const m = new THREE.MeshPhysicalMaterial({
    color: f.color,
    metalness: f.metalness,
    roughness: f.roughness,
    clearcoat: f.clearcoat ?? 0,
    clearcoatRoughness: 0.35,
    side: THREE.DoubleSide,
  });
  if (role === "glass") Object.assign(m, { transparent: true, opacity: 0.18, depthWrite: false });
  if (!f.grain && !f.vary) return m;

  const uniforms = {
    uBrush: brushAxis,
    uGrain: { value: new THREE.Vector2(...(f.grain ?? [0.001, 0])) },
    uVary: { value: f.vary ?? 0 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRxPos; varying mat3 vRxToView;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRxPos = position; vRxToView = normalMatrix;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vRxPos; varying mat3 vRxToView;\nuniform vec3 uBrush; uniform vec2 uGrain; uniform float uVary;\n${NOISE}`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        {
          vec3 q = vRxPos * ${f.brushed ? "mix(vec3(1700.0), vec3(35.0), uBrush)" : "vec3(70.0)"};
          roughnessFactor = clamp(roughnessFactor + (rxNoise(q) - 0.5) * 2.0 * uVary * rxSharp(q), 0.04, 1.0);
        }`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          /* the slope of the grain, measured on the surface itself so it stays smooth at any angle */
          vec3 q = vRxPos / uGrain.x;
          float h = rxNoise(q);
          vec3 slope = vec3(rxNoise(q + vec3(0.1, 0.0, 0.0)), rxNoise(q + vec3(0.0, 0.1, 0.0)), rxNoise(q + vec3(0.0, 0.0, 0.1))) - h;
          vec3 g = vRxToView * slope;
          g = length(g) > 0.0 ? normalize(g) * length(slope) : vec3(0.0);
          g *= 10.0 * uGrain.y / uGrain.x * rxSharp(q);
          normal = normalize(normal - (g - dot(g, normal) * normal));
        }`
      );
  };
  m.customProgramCacheKey = () => (f.brushed ? "rx-brushed" : "rx-grain");
  return m;
}

/** the photographed studio plus a few soft boxes, which give metal its long clean highlights */
function studio(hdr: THREE.Texture) {
  const sc = new THREE.Scene();
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  sc.background = hdr;
  sc.backgroundIntensity = 0.85;
  const box = (w: number, h: number, pos: [number, number, number], strength: number, colour: string) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(strength), side: THREE.DoubleSide })
    );
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    sc.add(mesh);
  };
  box(5, 3.5, [-4.5, 4.5, 4], 4.5, "#fff3e4"); // key, high left
  box(0.8, 7, [6.5, 0.8, -1.5], 7, "#e3ecff"); // cool strip, right
  box(0.8, 7, [-6.5, 0.2, -2.5], 5, "#ffe9cf"); // warm strip, behind left
  box(7, 1.2, [0, 6, -2], 4, "#ffffff"); // top edge light
  return sc;
}

export interface PartViewer {
  /** show a part; resolves once it is on screen */
  show(index: number): Promise<void>;
  /** the animation only runs while it can be seen */
  run(on: boolean): void;
}

interface Model {
  root: THREE.Group;
  /** sampled surface points, centred, in scene units (longest side = 1) */
  points: THREE.Vector3[];
  brush: THREE.Vector3;
}

export async function createPartViewer(host: HTMLElement, ids: string[]): Promise<PartViewer> {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const hdr = await new EXRLoader().loadAsync("/media/robus40/studio.exr");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(hdr), 0.02).texture;
  pmrem.dispose();
  hdr.dispose();

  const key = new THREE.DirectionalLight(0xfff1de, 1.6);
  key.position.set(-2, 3, 2.5);
  const rim = new THREE.DirectionalLight(0xcddcff, 1.8);
  rim.position.set(3, 1, -2.5);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  /* from the outside in: roll, then look-down pitch, then the turn about the part's own upright */
  const rollG = new THREE.Group();
  const pitchG = new THREE.Group();
  const turnG = new THREE.Group();
  rollG.add(pitchG);
  pitchG.add(turnG);
  scene.add(rollG);

  const uBrush = { value: new THREE.Vector3(0, 1, 0) };
  const materials = new Map<Role, THREE.Material>();
  const material = (role: Role) => {
    let m = materials.get(role);
    if (!m) materials.set(role, (m = makeMaterial(role, uBrush)));
    return m;
  };

  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
  const cache = new Map<number, Promise<Model>>();

  function load(i: number) {
    let model = cache.get(i);
    if (!model) {
      model = loader.loadAsync(`/models/robus40/c${i + 1}-${ids[i]}.glb`).then(({ scene: gltf }) => {
        gltf.updateMatrixWorld(true);
        /* move every mesh's own placement into its points, so they are all in the same metres */
        const solid = new THREE.Group();
        const meshes: THREE.Mesh[] = [];
        gltf.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name;
          const role = /^rx_([a-z]+)/.exec(name)?.[1] as Role | undefined;
          meshes.push(new THREE.Mesh(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material(role && role in FINISH ? role : "alu")));
        });
        for (const mesh of meshes) solid.add(mesh);
        const bounds = new THREE.Box3().setFromObject(solid);
        const size = bounds.getSize(new THREE.Vector3());
        const centre = bounds.getCenter(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z);
        const scale = 1 / longest;
        const points: THREE.Vector3[] = [];
        for (const mesh of meshes) {
          const pos = mesh.geometry.getAttribute("position");
          const step = Math.max(1, Math.floor(pos.count / 400));
          for (let k = 0; k < pos.count; k += step)
            points.push(new THREE.Vector3().fromBufferAttribute(pos, k).sub(centre).multiplyScalar(scale));
        }
        const root = new THREE.Group();
        root.add(solid);
        root.scale.setScalar(scale);
        root.position.copy(centre).multiplyScalar(-scale);
        const brush = new THREE.Vector3(Number(size.x === longest), Number(size.y === longest), Number(size.z === longest));
        return { root, points, brush };
      });
      cache.set(i, model);
      model.catch(() => cache.delete(i));
    }
    return model;
  }

  let current: Model | null = null;
  let pose: [number, number, number] = [0, 0, 0];
  let wanted = -1;
  /* what the visitor has added by dragging */
  let userTurn = 0;
  let userTilt = 0;
  let clock = 0;

  function orient(turn: number, tilt: number) {
    const [yaw, pitch, roll] = pose.map(THREE.MathUtils.degToRad);
    rollG.rotation.z = -roll;
    pitchG.rotation.x = THREE.MathUtils.clamp(pitch + tilt, -1.3, 1.4);
    turnG.rotation.y = Math.PI + yaw + turn; // the models face away from a default camera
  }

  /** move the camera so the part fills the space at every point of its sway (so it never pumps in and out) */
  function fit() {
    if (!current) return;
    const tanY = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const tanX = tanY * camera.aspect;
    const v = new THREE.Vector3();
    let dist = 0;
    for (const turn of [-SWAY, -SWAY / 2, 0, SWAY / 2, SWAY]) {
      orient(turn, 0);
      rollG.updateMatrixWorld(true);
      for (const p of current.points) {
        v.copy(p).applyMatrix4(turnG.matrixWorld);
        dist = Math.max(dist, v.z + Math.abs(v.x) / (tanX * 0.9), v.z + Math.abs(v.y) / (tanY * 0.9));
      }
    }
    camera.position.set(0, 0, dist);
    camera.near = dist * 0.05;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
  }

  function draw() {
    if (!current) return;
    orient(userTurn + (reduce ? 0 : Math.sin((clock / PERIOD) * Math.PI * 2) * SWAY), userTilt);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
    draw();
  }

  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  new ResizeObserver(resize).observe(host);

  let pointer = -1;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    pointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(pointer);
    canvas.classList.add("is-drag");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointer) return;
    userTurn += (e.clientX - lastX) * 0.01;
    userTilt = THREE.MathUtils.clamp(userTilt + (e.clientY - lastY) * 0.006, -0.9, 0.9);
    lastX = e.clientX;
    lastY = e.clientY;
    draw();
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    canvas.classList.remove("is-drag");
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  let raf = 0;
  let last = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (pointer < 0) clock += Math.min(0.05, (now - last) / 1000); // holds still while being dragged
    last = now;
    draw();
  }

  return {
    async show(i) {
      wanted = i;
      const model = await load(i);
      if (wanted !== i) return; // the visitor has already moved on
      turnG.clear();
      turnG.add(model.root);
      current = model;
      pose = POSE[ids[i]] ?? [0, 20, 0];
      uBrush.value.copy(model.brush);
      userTurn = userTilt = clock = 0;
      resize();
      // fetch the neighbour ahead of time
      load((i + 1) % ids.length).catch(() => {});
    },
    run(on) {
      if (on && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}
