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
  },
  image: {
    responsiveStyles: true,
  },
  fonts: [
    {
      // Refined high-contrast display serif for the luxury editorial voice.
      provider: fontProviders.google(),
      name: 'Cormorant Garamond',
      cssVariable: '--font-display-raw',
      weights: ['300', '400', '500'],
      styles: ['normal', 'italic'],
    },
    {
      provider: fontProviders.google(),
      name: 'Manrope',
      cssVariable: '--font-sans-raw',
      weights: ['300', '400', '500', '600', '700'],
    },
  ],
});
