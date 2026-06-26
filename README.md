# electron-sveltekit-repro

Minimal SvelteKit + Electron repro for a `beforeNavigate` confirm bug.

## Run

```bash
npm run dev
```

This starts the SvelteKit dev server and, once port 5173 is up, launches Electron
pointing at it (`concurrently` runs both; closing Electron stops Vite).

## Routes

- `/` — plain page, no guard.
- `/form` — registers a `beforeNavigate` hook that calls `window.confirm(...)`.
  Several dummy two-way-bound inputs (`bind:value` / `bind:checked`) live here.

## The bug under test

On `/form`, click a nav link (or reload / close the window) to fire `beforeNavigate`:

- **OK / Leave** → `confirm()` returns `true` → navigation proceeds.
- **Cancel** → `confirm()` returns `false` → handler calls `navigation.cancel()`,
  which blocks the navigation.

Note: `beforeNavigate` fires on client-side SPA route changes **and** on real
unload (reload / close). For an actual unload, `navigation.willUnload` is `true`
and `cancel()` is subject to browser/Electron limits — check `navigation.type`
if you need to distinguish the two cases.
