// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://eliteigcse.com',
  output: 'static',
  build: {
    assets: '_astro',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
