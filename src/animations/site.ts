import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ======================================================================
   UNIFRAME — luxury scroll engine
   Attribute vocabulary (all optional, all progressive-enhancement):
     data-preloader            first-visit curtain with counter
     data-hero                 pinned hero; children: data-hero-frame,
                               data-hero-media, data-hero-late
     data-split                masked word-by-word headline reveal
     data-scrub-text           words light up as you scroll (manifesto)
     data-reveal               fade + rise (inside data-reveal-group → stagger)
     data-img-reveal           clip-path unveil + inner scale settle
     data-parallax="0.2"       vertical drift of an oversized child
     data-chapters             sticky multi-chapter pin; children:
                               data-chapter-text, data-chapter-img
     data-hscroll              pinned horizontal gallery; child data-hscroll-track
     data-counter="1500"       count-up number
     data-line-draw            hairline drawing in
   ====================================================================== */

const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, ctx: ParentNode = document) =>
  Array.from(ctx.querySelectorAll<T>(sel));

let lenis: Lenis | null = null;

/* ---------- Smooth scroll ---------- */
function initLenis() {
  if (reduceMotion) return;
  lenis = new Lenis({
    duration: 1.25,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  (window as any).__lenis = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // In-page anchors glide instead of jump.
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"], a[href^="/#"]');
    if (!a) return;
    const hash = a.hash;
    if (!hash || (a.pathname !== location.pathname && a.pathname !== "/")) return;
    const target = document.querySelector<HTMLElement>(hash);
    if (target) {
      e.preventDefault();
      lenis!.scrollTo(target, { offset: -40, duration: 1.6 });
    }
  });
}

/* ---------- Text splitting (words, masked) ---------- */
function splitWords(el: HTMLElement, masked: boolean) {
  const words: HTMLElement[] = [];
  const walk = (node: Node, parent: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? "").split(/(\s+)/);
        parts.forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            parent.appendChild(document.createTextNode(" "));
            return;
          }
          const inner = document.createElement("span");
          inner.className = masked ? "split-inner" : "split-word";
          inner.textContent = part;
          words.push(inner);
          if (masked) {
            const mask = document.createElement("span");
            mask.className = "split-mask";
            mask.appendChild(inner);
            parent.appendChild(mask);
          } else {
            inner.style.display = "inline-block";
            parent.appendChild(inner);
          }
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const clone = (child as HTMLElement).cloneNode(false) as HTMLElement;
        parent.appendChild(clone);
        if (clone.tagName === "BR") return;
        walk(child, clone);
      }
    });
  };
  const frag = document.createElement("div");
  walk(el, frag);
  el.setAttribute("aria-label", el.textContent?.replace(/\s+/g, " ").trim() ?? "");
  el.innerHTML = "";
  while (frag.firstChild) el.appendChild(frag.firstChild);
  el.querySelectorAll("span").forEach((s) => s.setAttribute("aria-hidden", "true"));
  return words;
}

/* ---------- Individual effects ---------- */
function initSplitHeadlines() {
  $$("[data-split]").forEach((el) => {
    const words = splitWords(el, true);
    el.style.visibility = "visible";
    const delay = parseFloat(el.dataset.splitDelay ?? "0");
    gsap.set(words, { yPercent: 115 });
    ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () =>
        gsap.to(words, {
          yPercent: 0,
          duration: 1.35,
          ease: "expo.out",
          stagger: 0.045,
          delay,
        }),
    });
  });
}

function initScrubText() {
  $$("[data-scrub-text]").forEach((el) => {
    const words = splitWords(el, false);
    gsap.set(words, { opacity: 0.14 });
    // Inside a stacked panel the text is lit by the time the panel docks.
    const panel = el.closest<HTMLElement>("[data-panel]");
    const dwell = panel?.nextElementSibling?.classList.contains("uf-dwell") ? (panel.nextElementSibling as HTMLElement) : null;
    gsap.to(words, {
      opacity: 1,
      ease: "none",
      stagger: 0.12,
      scrollTrigger: panel
        ? dwell
          ? { trigger: panel, start: "top 70%", endTrigger: dwell, end: "top 38%", scrub: 0.6 }
          : { trigger: panel, start: "top 72%", end: "top 6%", scrub: 0.6 }
        : { trigger: el, start: "top 78%", end: "bottom 42%", scrub: 0.6 },
    });
  });
}

function initReveals() {
  $$("[data-reveal]").forEach((el) => {
    const group = el.closest<HTMLElement>("[data-reveal-group]");
    const sibs = group ? $$("[data-reveal]", group) : [el];
    const i = Math.max(0, sibs.indexOf(el));
    const dist = el.dataset.reveal === "fade" ? 0 : 36;
    gsap.set(el, { opacity: 0, y: dist });
    ScrollTrigger.create({
      trigger: group ?? el,
      start: "top 86%",
      once: true,
      onEnter: () =>
        gsap.to(el, { opacity: 1, y: 0, duration: 1.2, delay: Math.min(i, 8) * 0.09, ease: "power3.out" }),
    });
  });
}

function initImageReveals() {
  $$("[data-img-reveal]").forEach((el) => {
    const inner = el.querySelector<HTMLElement>("img, video");
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: "top 92%", end: "top 25%", scrub: 0.7 },
    });
    tl.fromTo(el, { clipPath: "inset(14% 14% 14% 14%)" }, { clipPath: "inset(0% 0% 0% 0%)", ease: "none" }, 0);
    if (inner) tl.fromTo(inner, { scale: 1.3 }, { scale: 1, ease: "none" }, 0);
  });
}

function initParallax() {
  // Each [data-parallax] child is oversized inside an overflow-hidden parent;
  // it drifts exactly its own slack so no edge is ever exposed.
  $$("[data-parallax]").forEach((el) => {
    const parent = el.parentElement ?? el;
    const slack = () => {
      const ratio = el.offsetHeight / Math.max(1, parent.offsetHeight);
      return Math.max(0, ((ratio - 1) / ratio) * 100);
    };
    gsap.fromTo(
      el,
      { yPercent: 0 },
      {
        yPercent: () => -slack(),
        ease: "none",
        scrollTrigger: { trigger: parent, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true },
      }
    );
  });
}

function initLineDraw() {
  $$("[data-line-draw]").forEach((el) => {
    gsap.set(el, { scaleX: 0 });
    ScrollTrigger.create({
      trigger: el,
      start: "top 92%",
      once: true,
      onEnter: () => gsap.to(el, { scaleX: 1, duration: 1.6, ease: "power3.inOut" }),
    });
  });
}

function initCounters() {
  $$("[data-counter]").forEach((el) => {
    const target = parseFloat(el.dataset.counter ?? "0");
    if (Number.isNaN(target)) return;
    const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
    const obj = { v: 0 };
    el.textContent = fmt(0);
    ScrollTrigger.create({
      trigger: el,
      start: "top 90%",
      once: true,
      onEnter: () =>
        gsap.to(obj, { v: target, duration: 2.2, ease: "power3.out", onUpdate: () => (el.textContent = fmt(obj.v)) }),
    });
  });
}

/* Pinned hero: a small framed "window" opens to the full view as you scroll. */
function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  const frame = hero.querySelector<HTMLElement>("[data-hero-frame]");
  const media = hero.querySelector<HTMLElement>("[data-hero-media]");
  const late = $$("[data-hero-late]", hero);
  const title = hero.querySelector<HTMLElement>("[data-hero-title]");
  if (!frame) return;

  const mm = gsap.matchMedia();
  mm.add("(min-width: 0px)", () => {
    gsap.set(late, { opacity: 0, y: 30 });
    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: hero, start: "top top", end: "+=140%", scrub: 0.8, pin: true, anticipatePin: 1 },
    });
    // Explicit fromTo: browsers serialise symmetric insets in shorthand, which
    // GSAP would otherwise mis-merge with the four-value end state.
    tl.fromTo(frame, { clipPath: "inset(24% 32% 24% 32%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1 }, 0);
    if (media) tl.fromTo(media, { scale: 1.45 }, { scale: 1, duration: 1 }, 0);
    if (title) tl.to(title, { yPercent: -14, duration: 1 }, 0);
    tl.to(late, { opacity: 1, y: 0, stagger: 0.12, duration: 0.4 }, 0.65);
  });
}

/* Drifting columns: [data-drift] slides between data-drift-from and -to (% of its own
   height) as its section passes through the viewport. */
function initDrift() {
  $$("[data-drift]").forEach((el) => {
    const from = parseFloat(el.dataset.driftFrom ?? "0");
    const to = parseFloat(el.dataset.driftTo ?? "-20");
    const root = el.closest<HTMLElement>("[data-drift-root]") ?? el.parentElement ?? el;
    gsap.fromTo(
      el,
      { yPercent: from },
      { yPercent: to, ease: "none", scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: 0.8 } }
    );
  });
}

/* Gallery: the side cards start tucked behind the centre card and spread out
   to their places as you scroll — nearest cards first. */
function initGallerySpread() {
  const strip = document.querySelector<HTMLElement>("[data-gal-strip]");
  if (!strip) return;
  const panel = strip.closest<HTMLElement>("[data-gallery]");
  const dwell: HTMLElement | null = null;
  const cards = $$("[data-gal-card]", strip);
  const mid = Math.floor(cards.length / 2);
  const mm = gsap.matchMedia();
  mm.add("(min-width: 1024px)", () => {
    const centre = (el: HTMLElement) => el.offsetLeft + el.offsetWidth / 2;
    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      scrollTrigger: {
        trigger: panel ?? strip,
        start: "top 82%",
        ...(dwell ? { endTrigger: dwell, end: "top 42%" } : { end: "top 8%" }),
        scrub: 0.8,
        invalidateOnRefresh: true,
      },
    });
    cards.forEach((c, i) => {
      if (i === mid) return;
      const d = Math.abs(i - mid);
      tl.fromTo(
        c,
        { x: () => centre(cards[mid]) - centre(c), scale: 0.55, opacity: 0 },
        { x: 0, scale: 1, opacity: 1, duration: 0.75 },
        (d - 1) * 0.16
      );
    });
    tl.fromTo(cards[mid], { scale: 0.9 }, { scale: 1, duration: 0.5, ease: "power2.out" }, 0);
  });
}

/* Z-index stack: each [data-panel] is CSS-sticky; as the next one slides over
   it, the one beneath recedes (scales back and dims). Desktop layout only. */
function initStack() {
  const mm = gsap.matchMedia();
  mm.add("(min-width: 1024px) and (min-height: 760px)", () => {
    const panels = $$("[data-panel]");
    panels.forEach((panel) => {
      // The next panel slides over this one (skipping the empty dwell runway).
      let trigger = panel.nextElementSibling as HTMLElement | null;
      if (trigger?.classList.contains("uf-dwell")) trigger = trigger.nextElementSibling as HTMLElement | null;
      if (!trigger) return;
      gsap.fromTo(
        panel,
        { scale: 1, filter: "brightness(1)" },
        {
          scale: 0.93,
          filter: "brightness(0.35)",
          transformOrigin: "50% 0%",
          ease: "none",
          scrollTrigger: { trigger, start: "top bottom", end: "top top", scrub: true },
        }
      );
    });
  });
}

/* Sticky chapters: one image wipes over the next while the copy swaps. */
function initChapters() {
  $$("[data-chapters]").forEach((wrap) => {
    const texts = $$("[data-chapter-text]", wrap);
    const imgs = $$("[data-chapter-img]", wrap);
    const dots = $$("[data-chapter-dot]", wrap);
    const n = texts.length;
    if (n < 2) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {
      gsap.set(texts, { opacity: (i) => (i === 0 ? 1 : 0), y: (i) => (i === 0 ? 0 : 50) });
      gsap.set(dots, { opacity: (i) => (i === 0 ? 1 : 0.3) });
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: { trigger: wrap, start: "top top", end: `+=${(n - 1) * 100 + 20}%`, scrub: 0.8, pin: true },
      });
      for (let i = 1; i < n; i++) {
        tl.to(texts[i - 1], { opacity: 0, y: -50, duration: 0.35 }, i - 0.6)
          .fromTo(imgs[i], { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9 }, i - 0.55)
          .fromTo(imgs[i].querySelector("img"), { scale: 1.25 }, { scale: 1, duration: 0.9 }, i - 0.55)
          .to(texts[i], { opacity: 1, y: 0, duration: 0.45 }, i - 0.3)
          .to(dots[i - 1], { opacity: 0.3, duration: 0.3 }, i - 0.3)
          .to(dots[i], { opacity: 1, duration: 0.3 }, i - 0.3);
      }
      tl.to({}, { duration: 0.3 }); // hold the last chapter
    });
  });
}

/* Horizontal gallery: vertical scroll drives a sideways track (desktop). */
function initHorizontal() {
  $$("[data-hscroll]").forEach((sec) => {
    const track = sec.querySelector<HTMLElement>("[data-hscroll-track]");
    if (!track) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 900px)", () => {
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth + 120);
      gsap.to(track, {
        x: () => -dist(),
        ease: "none",
        scrollTrigger: {
          trigger: sec,
          start: "top top",
          end: () => `+=${dist()}`,
          pin: true,
          scrub: 0.9,
          invalidateOnRefresh: true,
        },
      });
      const bar = sec.querySelector<HTMLElement>("[data-hscroll-bar]");
      if (bar) {
        gsap.fromTo(
          bar,
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            scrollTrigger: { trigger: sec, start: "top top", end: () => `+=${dist()}`, scrub: true },
          }
        );
      }
    });
  });
}

/* ---------- Chrome: progress, header, cursor ---------- */
function initChrome() {
  const bar = document.createElement("div");
  bar.className = "uf-progress";
  document.body.appendChild(bar);
  gsap.to(bar, {
    scaleX: 1,
    ease: "none",
    scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.2 },
  });

  const header = document.querySelector<HTMLElement>("[data-header]");
  if (header) {
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        const y = self.scroll();
        header.classList.toggle("is-solid", y > 60);
        const menuOpen = header.classList.contains("is-open");
        const hide = self.direction === 1 && y > 500 && !menuOpen;
        header.classList.toggle("is-hidden", hide);
      },
    });
  }

  if (!reduceMotion && finePointer) {
    root.classList.add("uf-custom-cursor");
    const c = document.createElement("div");
    c.className = "uf-cursor";
    document.body.appendChild(c);
    const pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const tgt = { ...pos };
    addEventListener("mousemove", (e) => {
      tgt.x = e.clientX;
      tgt.y = e.clientY;
      c.classList.add("is-visible");
    });
    gsap.ticker.add(() => {
      pos.x += (tgt.x - pos.x) * 0.2;
      pos.y += (tgt.y - pos.y) * 0.2;
      c.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    });
    document.addEventListener("mouseover", (e) => {
      const hit = (e.target as HTMLElement).closest("a, button, [data-cursor]");
      c.classList.toggle("is-hover", !!hit);
    });
    document.addEventListener("mouseleave", () => c.classList.remove("is-visible"));
  }
}

/* ---------- Preloader ---------- */
function runPreloader(): Promise<void> {
  const pre = document.querySelector<HTMLElement>("[data-preloader]");
  if (!pre) return Promise.resolve();
  let seen = false;
  try {
    seen = sessionStorage.getItem("uf-intro") === "1";
  } catch {}
  if (seen || reduceMotion) {
    pre.hidden = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      sessionStorage.setItem("uf-intro", "1");
    } catch {}
    lenis?.stop();
    const count = pre.querySelector<HTMLElement>("[data-preloader-count]");
    const logo = pre.querySelector<HTMLElement>("[data-preloader-logo]");
    const line = pre.querySelector<HTMLElement>("[data-preloader-line]");
    const obj = { v: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        pre.hidden = true;
        lenis?.start();
        resolve();
      },
    });
    tl.fromTo(logo, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1, ease: "power3.out" })
      .to(obj, { v: 100, duration: 1.7, ease: "power2.inOut", onUpdate: () => count && (count.textContent = String(Math.round(obj.v)).padStart(3, "0")) }, 0.2)
      .fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 1.7, ease: "power2.inOut" }, 0.2)
      .to(logo, { opacity: 0, y: -20, duration: 0.5, ease: "power2.in" }, 2.0)
      .to(pre, { yPercent: -100, duration: 1.15, ease: "expo.inOut" }, 2.1);
  });
}

/* ---------- Boot ---------- */
async function boot() {
  initLenis();
  // Hard failsafe — content must never stay hidden.
  const failsafe = window.setTimeout(() => root.classList.add("uf-ready"), 6000);

  await runPreloader();

  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {}

  if (reduceMotion) {
    $$("[data-counter]").forEach((el) => (el.textContent = Number(el.dataset.counter).toLocaleString("en-IN")));
    root.classList.add("uf-ready");
    window.clearTimeout(failsafe);
    initChrome();
    return;
  }

  initHero();
  initStack();
  initGallerySpread();
  initDrift();
  initChapters();
  initHorizontal();
  initSplitHeadlines();
  initScrubText();
  initReveals();
  initImageReveals();
  initParallax();
  initLineDraw();
  initCounters();
  initChrome();

  root.classList.add("uf-ready");
  window.clearTimeout(failsafe);
  ScrollTrigger.refresh();
  addEventListener("load", () => ScrollTrigger.refresh());
}

boot();
