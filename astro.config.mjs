import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://sustainablesolutions.stanford.edu',
  integrations: [react(), mdx(), sitemap()],
  // The Tools sheet lists the mining explorer as water-mining.
  redirects: {
    '/tools/water-mining': '/tools/mining-water',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
