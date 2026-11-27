import { gsap } from "gsap";
import layout from "../data/robus40-layout.json";
import { robusComponents as comps } from "../data/robus-components";

/* ==========================================================================
   "Inside the frame" — Robus 40 component showcase.

   Everything on screen is a photo-real still, seen straight on:
     • the window  – idle: centred. Open: it moves to the left half and the view
       moves in on the part being shown, which appears through a frosted patch
       of the frame (a second picture of the part alone, from the same camera).
     • the part    – its close-up photo flies from that spot to the right.
   Where the window goes is dictated by a placeholder element in the page, so
   the layout stays in CSS.
   ========================================================================== */

/** where the window picture is: image point (cx, cy) sits at screen point (sx, sy), at s screen px per image px */
interface View {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  s: number;
}

const W = layout.width;
const H = layout.height;
/** a close-up never shows less than this much of the window (image px, about 40 cm), so you can tell where you are */
const MIN_REGION = 950;
/** and is never drawn larger than this many screen px per image px, which would turn soft */
const MAX_SCALE = 0.85;

export function mountRobusComponents(root: HTMLElement) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = (s: number) => (reduce ? 0.01 : s);

  const win = $("[data-rx-win]");
  const vpFrame = $("[data-rx-vp-frame]");
  const stage = $("[data-rx-stage]");
  const spots = $$("[data-rx-spot]");
  const shots = $$<HTMLImageElement>("[data-rx-shot]");
  const items = $$("[data-rx-item]");
  const chips = $$<HTMLButtonElement>("[data-rx-chip]");
  const countEl = root.querySelector<HTMLElement>("[data-rx-count]");

  const S = { open: false, index: 0 };

  /* ---------------- the window ---------------- */
  const view: View = { cx: W / 2, cy: H / 2, sx: 0, sy: 0, s: 0.1 };

  function relRect(el: HTMLElement) {
    const base = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, cx: r.left - base.left + r.width / 2, cy: r.top - base.top + r.height / 2 };
  }

  function target(): View {
    const vp = relRect(vpFrame);
    const fit = Math.min(vp.w / W, vp.h / H);
    const whole: View = { cx: W / 2, cy: H / 2, sx: vp.cx, sy: vp.cy, s: fit };
    if (!S.open) return whole;

    const [x, y, w, h] = layout.parts[comps[S.index].id as keyof typeof layout.parts].where;
    const s = gsap.utils.clamp(fit, Math.max(fit, MAX_SCALE), Math.min(vp.w / Math.max(w * 1.45, MIN_REGION), vp.h / Math.max(h * 1.3, MIN_REGION)));
    /* centre on the part, without drifting far past the window's edge; an axis that fits entirely stays centred */
    const along = (centre: number, size: number, room: number) => {
      if (size * s <= room) return size / 2;
      const edge = (room / s) * 0.22;
      return gsap.utils.clamp(edge, size - edge, centre);
    };
    return { cx: along(x + w / 2, W, vp.w), cy: along(y + h / 2, H, vp.h), sx: vp.cx, sy: vp.cy, s };
  }

  function apply() {
    win.style.width = `${W * view.s}px`;
    win.style.height = `${H * view.s}px`;
    win.style.transform = `translate3d(${view.sx - view.cx * view.s}px, ${view.sy - view.cy * view.s}px, 0)`;
    win.style.setProperty("--s", view.s.toFixed(4));
    win.dataset.placed = "";
  }

  let move: gsap.core.Tween | null = null;
  function moveTo(to: View, seconds: number) {
    move?.kill();
    const from = { ...view };
    const k = { t: 0 };
    move = gsap.to(k, {
      t: 1,
      duration: dur(seconds),
      ease: "power3.inOut",
      onUpdate: () => {
        const mix = (a: number, b: number) => a + (b - a) * k.t;
        view.cx = mix(from.cx, to.cx);
        view.cy = mix(from.cy, to.cy);
        view.sx = mix(from.sx, to.sx);
        view.sy = mix(from.sy, to.sy);
        view.s = from.s * Math.pow(to.s / from.s, k.t); // zooming feels even when the scale grows geometrically
        apply();
      },
    });
  }

  function settle() {
    move?.kill();
    Object.assign(view, target());
    apply();
  }

  /** light up one part inside the frame, or none */
  function light(i: number | null) {
    const id = i === null ? "" : comps[i].id;
    spots.forEach((el) => el.classList.toggle("is-on", el.dataset.rxSpot === id));
  }

  /* ---------------- the panel ---------------- */
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

  /** the close-up leaves the part's place on the window and settles on the stage */
  function flyShot(i: number, to: View, delay: number) {
    shots.forEach((img, k) => {
      gsap.killTweensOf(img);
      img.hidden = k !== i;
    });
    const [x, y, w, h] = layout.parts[comps[i].id as keyof typeof layout.parts].where;
    const st = relRect(stage);
    const dx = to.sx + (x + w / 2 - to.cx) * to.s - st.cx;
    const dy = to.sy + (y + h / 2 - to.cy) * to.s - st.cy;
    gsap.fromTo(
      shots[i],
      { x: dx, y: dy, scale: 0.12, opacity: 0 },
      { x: 0, y: 0, scale: 1, opacity: 1, duration: dur(1.1), delay: dur(delay), ease: "power3.out" }
    );
  }

  /* ---------------- navigation ---------------- */
  function go(i: number, first = false) {
    S.index = (i + comps.length) % comps.length;
    showItem(S.index, !first);
    const to = target();
    moveTo(to, first ? 1.4 : 1.15);
    light(S.index);
    flyShot(S.index, to, first ? 0.75 : 0.45);
  }

  function open(i = 0) {
    if (S.open) return go(i);
    S.open = true;
    root.dataset.state = "open";
    go(i, true);
    root.dispatchEvent(new CustomEvent("rx:open"));
  }

  function close() {
    if (!S.open) return;
    S.open = false;
    root.dataset.state = "idle";
    light(null);
    moveTo(target(), 1.2);
  }

  $("[data-rx-open]").addEventListener("click", () => open(0));
  $("[data-rx-close]").addEventListener("click", close);
  $("[data-rx-prev]").addEventListener("click", () => go(S.index - 1));
  $("[data-rx-next]").addEventListener("click", () => go(S.index + 1));
  chips.forEach((b, k) => b.addEventListener("click", () => k !== S.index && go(k)));

  /* the numbered list and the dots on the window: pointing at one previews the part inside the frame, pressing opens it */
  const preview = (el: HTMLElement, i: number) => {
    const on = () => !S.open && light(i);
    const off = () => !S.open && light(null);
    el.addEventListener("pointerenter", on);
    el.addEventListener("focus", on);
    el.addEventListener("pointerleave", off);
    el.addEventListener("blur", off);
    el.addEventListener("click", () => open(i));
  };
  $$("[data-rx-pick]").forEach((b) => preview(b, Number(b.dataset.rxPick)));
  $$("[data-rx-dot]").forEach((b) => preview(b, Number(b.dataset.rxDot)));

  let visible = false;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting), { threshold: 0.01 }).observe(root);
  addEventListener("keydown", (e) => {
    if (!S.open || !visible) return;
    if (e.key === "ArrowRight") go(S.index + 1);
    else if (e.key === "ArrowLeft") go(S.index - 1);
    else if (e.key === "Escape") close();
  });

  new ResizeObserver(settle).observe(root);
  settle();
}
