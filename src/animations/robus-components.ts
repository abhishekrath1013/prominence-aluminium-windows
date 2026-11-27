import { gsap } from "gsap";
import layout from "../data/robus40-layout.json";
import { robusComponents as comps } from "../data/robus-components";
import type { PartViewer } from "./part-viewer";

/* ==========================================================================
   "Inside the frame" — Robus 40 component showcase.

     • the window  – a photo-real still seen straight on, always shown whole.
       Idle: centred. Open: it moves to the right, and the part being shown
       appears through a frosted patch of the frame with a ring around its spot.
     • the part    – live 3D (part-viewer.ts) on the left, swaying slowly. It
       flies there from its spot on the window. If 3D can't start, its still
       photo is shown instead.
   Where the window goes is dictated by a placeholder element in the page, so
   the layout stays in CSS.
   ========================================================================== */

/** where the window picture is: its top-left corner on screen, at s screen px per image px */
interface View {
  x: number;
  y: number;
  s: number;
}

const W = layout.width;
const H = layout.height;

export function mountRobusComponents(root: HTMLElement) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = (s: number) => (reduce ? 0.01 : s);

  const win = $("[data-rx-win]");
  const vpFrame = $("[data-rx-vp-frame]");
  const stage = $("[data-rx-stage]");
  const model = $("[data-rx-model]");
  const host = $("[data-rx-3d]");
  const hint = $("[data-rx-hint]");
  const spots = $$("[data-rx-spot]");
  const dots = $$("[data-rx-dot]");
  const stills = $$<HTMLImageElement>("[data-rx-still]");
  const items = $$("[data-rx-item]");
  const chips = $$<HTMLButtonElement>("[data-rx-chip]");
  const countEl = root.querySelector<HTMLElement>("[data-rx-count]");

  const S = { open: false, index: 0 };
  let visible = false;

  /* ---------------- the window ---------------- */
  const view: View = { x: 0, y: 0, s: 0.1 };

  function relRect(el: HTMLElement) {
    const base = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, cx: r.left - base.left + r.width / 2, cy: r.top - base.top + r.height / 2 };
  }

  /** the whole window, as large as its place allows */
  function target(): View {
    const vp = relRect(vpFrame);
    const s = Math.min(vp.w / W, vp.h / H);
    return { x: vp.cx - (W * s) / 2, y: vp.cy - (H * s) / 2, s };
  }

  function apply() {
    win.style.width = `${W * view.s}px`;
    win.style.height = `${H * view.s}px`;
    win.style.transform = `translate3d(${view.x}px, ${view.y}px, 0)`;
    win.style.setProperty("--s", view.s.toFixed(4));
    win.dataset.placed = "";
  }

  let move: gsap.core.Tween | null = null;
  function moveTo(to: View, seconds: number) {
    move?.kill();
    move = gsap.to(view, { ...to, duration: dur(seconds), ease: "power3.inOut", onUpdate: apply });
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
    // once open, the ring marks the part, so its dot would only cover it up
    dots.forEach((el, k) => el.classList.toggle("is-current", S.open && k === i));
  }

  /* ---------------- the 3D part ---------------- */
  let viewer: Promise<PartViewer | null> | null = null;
  /** loaded only when the visitor gets near the section, so the 3D library doesn't slow the page down */
  function getViewer() {
    viewer ??= import("./part-viewer")
      .then((m) => m.createPartViewer(host, comps.map((c) => c.id)))
      .catch((e) => {
        console.warn("3D view unavailable, showing photos instead:", e);
        return null;
      });
    return viewer;
  }

  const running = () => S.open && visible && !document.hidden;
  const refreshRun = () => viewer?.then((v) => v?.run(running()));
  document.addEventListener("visibilitychange", refreshRun);

  function useStill(i: number | null) {
    stills.forEach((img, k) => (img.hidden = k !== i));
    host.hidden = i !== null;
    hint.hidden = i !== null;
  }

  /** the part leaves its place on the window and settles on the stage */
  let turn = 0;
  async function present(i: number, to: View, delay: number) {
    const mine = ++turn;
    gsap.killTweensOf(model);
    gsap.set(model, { opacity: 0 });
    const started = performance.now();

    const v = await getViewer();
    if (mine !== turn) return;
    let shown = false;
    if (v) {
      try {
        useStill(null);
        await v.show(i);
        shown = true;
      } catch (e) {
        console.warn("3D model failed to load:", e);
      }
      if (mine !== turn) return;
      v.run(running());
    }
    if (!shown) useStill(i);

    const [x, y, w, h] = layout.parts[comps[i].id as keyof typeof layout.parts].where;
    const st = relRect(stage);
    const dx = to.x + (x + w / 2) * to.s - st.cx;
    const dy = to.y + (y + h / 2) * to.s - st.cy;
    const waited = (performance.now() - started) / 1000;
    gsap.fromTo(
      model,
      { x: dx, y: dy, scale: 0.1, opacity: 0 },
      { x: 0, y: 0, scale: 1, opacity: 1, duration: dur(1.1), delay: dur(Math.max(0, delay - waited)), ease: "power3.out" }
    );
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

  /* ---------------- navigation ---------------- */
  function go(i: number, first = false) {
    S.index = (i + comps.length) % comps.length;
    showItem(S.index, !first);
    const to = target();
    if (first) moveTo(to, 1.2);
    light(S.index);
    present(S.index, to, first ? 0.75 : 0.15);
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
    turn++;
    root.dataset.state = "idle";
    light(null);
    refreshRun();
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
  dots.forEach((b) => preview(b, Number(b.dataset.rxDot)));

  new IntersectionObserver(
    ([en]) => {
      visible = en.isIntersecting;
      refreshRun();
    },
    { threshold: 0.01 }
  ).observe(root);
  // get the 3D ready shortly before the section scrolls into view
  const near = new IntersectionObserver(
    ([en]) => {
      if (!en.isIntersecting) return;
      near.disconnect();
      getViewer();
    },
    { rootMargin: "100% 0px" }
  );
  near.observe(root);

  addEventListener("keydown", (e) => {
    if (!S.open || !visible) return;
    if (e.key === "ArrowRight") go(S.index + 1);
    else if (e.key === "ArrowLeft") go(S.index - 1);
    else if (e.key === "Escape") close();
  });

  new ResizeObserver(settle).observe(root);
  settle();
}
