import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // Pin to IPv4 so wait-on (tcp:127.0.0.1:5173) and Electron agree.
    // Vite's default 'localhost' can bind to IPv6 ::1 only, which makes
    // an IPv4 wait-on check hang forever.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
});
