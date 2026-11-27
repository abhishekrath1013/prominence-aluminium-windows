// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://uniframe.com',
  devToolbar: { enabled: false },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // The component viewer loads its 3D code lazily, so in dev Vite would only discover three.js and friends when a visitor
    // scrolls to them, re-bundle mid-session and answer the page's old requests with "504 Outdated Optimize Dep" —
    // which showed up as "3D preview needs WebGL". Listing them here bundles them once, up front.
    optimizeDeps: {
      include: [
        'three',
        'three/examples/jsm/loaders/GLTFLoader.js',
        'three/examples/jsm/loaders/DRACOLoader.js',
        'three/examples/jsm/loaders/EXRLoader.js',
        'gsap',
        'gsap/ScrollTrigger',
        'lenis',
      ],
    },
  },
  image: {
    responsiveStyles: true,
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Manrope',
      // One sans-serif family for the whole site (display headings included).
      cssVariable: '--font-sans-raw',
      weights: ['200', '300', '400', '500', '600', '700'],
    },
    {
      // Headline face of the Aluminium homepage rebuild (hero, feature cards, "built like a vault").
      provider: fontProviders.google(),
      name: 'Poppins',
      cssVariable: '--font-poppins-raw',
      weights: ['200', '300', '400', '500', '600', '700', '800'],
    },
  ],
});
