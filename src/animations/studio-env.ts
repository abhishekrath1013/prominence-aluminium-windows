import * as THREE from "three";

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

