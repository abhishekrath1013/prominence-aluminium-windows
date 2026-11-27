# Prominance — Aluminium Windows

Marketing site for Prominance / Uniframe aluminium window, door and facade systems. Astro 7, Tailwind CSS v4, GSAP + ScrollTrigger and Lenis smooth scroll.

## Design system

- **Type:** Poppins for headlines, Manrope for everything else (loaded through Astro fonts in `astro.config.mjs`).
- **Colour:** dark grounds, brand blue `#076EA1` for numbers and primary panels, Prominance green `#429B46` as the accent.
- **Pieces:** frosted glass cards (`.pg-glass`), blue index numbers (`.pg-num`), the blue/green button (`.btn-pg`), masked line reveals (`.ln`) — all in `src/styles/global.css`.

## Structure

```text
src/
  pages/            index (homepage), products, product pages, about-us, contact-us, insights (blog + articles), projects, ...
  components/home/  homepage sections: Hero, Unique, Promise (statement/factory/21-day), Vault, HomeNav
  components/       InnerNav, PageHero, ProductCard/List/Detail, ArticleCard, Configurator (window wall), RobusComponents (window photo + 3D parts), ContactCta, Footer
  animations/       site.ts (smooth scroll, reveals, stacked panels), home.ts (homepage entrances), configurator.ts, robus-components.ts, part-viewer.ts (the 3D component)
  data/             products, finishes, projects, insights + articles (blog text), company, robus-components
  assets/home/      homepage photography and cut-outs (optimised at build time)
public/
  media/robus40/    window images, fallback part photos and studio.exr (3D lighting, CC0 from Poly Haven) for "Inside the frame"
  models/robus40/   c1-c9 GLB: the 3D components (decoded by public/draco); frame.glb and manifest.json are no longer used
tools/              render_robus40.py (renders the window and part stills from the Blender source) + compose_robus40.mjs (web images);
                    export_robus40.py exports the GLB models
```

## Homepage scroll behaviour

Each section is one screen tall; its 1326-px design stage is scaled to fit the screen height and pinned to the left/right edges. Only the hero and "Unique solutions" stack (`.uf-stack` / `data-panel`); entrances in `src/animations/home.ts` replay every time a section scrolls into view.

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | install dependencies |
| `npm run dev` | dev server at `localhost:4321` |
| `npm run build` | production build to `./dist` |
| `npm run preview` | preview the build |
