import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA build (only needed if you run `npm run build`; dev uses the Vite server).
    adapter: adapter({ fallback: 'index.html' })
  }
};

export default config;
