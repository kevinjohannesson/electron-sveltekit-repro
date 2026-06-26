# Hotfix handoff: Windows Electron — inputs unfocusable after `confirm`/`alert`

**Audience:** Claude Code working in the production Electron app.
**This repo** is a minimal, verified reproduction of the bug and the fix described below. Apply the **hotfix** for the imminent release; defer the **sustainable fix** to next cycle.

---

## 1. The bug

On **Windows only**, after a native `window.confirm()` / `window.alert()` / `window.prompt()`
(or a synchronous `dialog.showMessageBox`), the renderer loses keyboard focus:
clicking a text input focuses it, then it **immediately blurs**, so the user cannot type.
It persists app-wide until the window is re-activated (opening DevTools, alt-tab away and
back, or restarting the app all clear it). **Not reproducible on macOS/Linux.**

**Root cause:** the native dialog runs a nested OS message loop and takes window
activation; on dismiss, Windows does not restore activation/keyboard focus to the
renderer's web contents. Long-standing Electron bug — see
electron/electron [#19977](https://github.com/electron/electron/issues/19977),
[#31917](https://github.com/electron/electron/issues/31917),
[#20821](https://github.com/electron/electron/issues/20821),
[#18646](https://github.com/electron/electron/issues/18646),
[#41602](https://github.com/electron/electron/issues/41602); proposed fix
PR [#50770](https://github.com/electron/electron/pull/50770) is open/unmerged.

> The dialog is the trigger — **not** any router/navigation hook. Any native dialog reproduces it.
>
> **A/B tested in this reproduction, the ONLY strategy that reliably restored input focus was a
> window-level `blur()` + `focus()` — the one that causes the flash.** `webContents.focus()`
> alone, and `webContents.focus()` + a relayout (`setZoomFactor`) nudge, were both tried and do
> **not** reliably fix it. Do not re-litigate the flash-free options; they were tested and failed.

---

## 2. The hotfix to apply (this release)

Re-activate the window with `blur()+focus()` after each native dialog, triggered from the
renderer over IPC, and installed **globally by monkey-patching** the dialog functions so that
**none of the existing call sites change**.

> Why this and not replacing the dialogs: the app has ~19 `confirm` + ~4 `alert` call sites,
> none using `await`. Converting them to async (the real fix) is a larger, riskier change with
> a dangerous failure mode (a missed `await` makes `if (confirm(...))` always truthy → the
> action proceeds as if confirmed). That is deferred to next cycle (§5). The monkey-patch is
> O(1) regardless of call-site count and changes zero call sites.

### Piece 1 — Main process IPC handler
Add wherever the app creates its `BrowserWindow` (e.g. `main.js` / `background.js`):

```js
const { ipcMain, BrowserWindow } = require('electron');

// Windows-only: after a native dialog the renderer can't focus inputs until the
// window is re-activated. blur()+focus() forces the activation cycle that restores it.
ipcMain.on('focus-fix', (event) => {
  if (process.platform !== 'win32') return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.blur();
  win.focus();
});
```

### Piece 2 — Preload bridge
**Add `refocus` to the app's EXISTING `contextBridge.exposeInMainWorld` bridge — do not create a
second bridge.** Example, if the app already exposes `window.api`:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ...existing methods...
  refocus: () => ipcRenderer.send('focus-fix'),
});
```

> If the app has **no** preload at all (unlikely): create one and point
> `webPreferences.preload` at it on the window(s) that show dialogs.

### Piece 3 — Renderer monkey-patch
Run **once, as early as possible** in the renderer entry point (before any dialog can fire).
Adjust the bridge name (`window.api`) to match Piece 2.

```js
// Install once at renderer startup.
(function installDialogFocusFix() {
  if (typeof window === 'undefined') return;
  const bridge = window.api; // <-- match the preload bridge name from Piece 2
  if (!bridge || typeof bridge.refocus !== 'function') return;

  for (const name of ['alert', 'confirm', 'prompt']) {
    const original = window[name].bind(window);
    window[name] = (...args) => {
      const result = original(...args); // native dialog still runs, unchanged
      bridge.refocus();                 // re-activate the window afterward
      return result;                    // preserves boolean/string return value
    };
  }
})();
```

That's it — all `confirm`/`alert`/`prompt` call sites now self-heal with no edits.

---

## 3. Tradeoffs of the `blur()+focus()` hotfix — verify each in the real codebase

This re-activation cycle is the only reliable fix (see §1), but it has side effects. Each item
below is something **to actively check in the production codebase** before shipping.

### A. Spurious `blur`/`focus`/`visibilitychange` events ← the main go/no-go gate
`blur()+focus()` fires **real** window blur/focus events; the renderer may also see DOM
`blur`/`focus` and `visibilitychange`. Any logic hanging off those runs spuriously on every
dialog dismiss.
- **Check:** grep for `'blur'`, `'focus'`, `browser-window-blur`, `browser-window-focus`,
  `visibilitychange`, `onblur`, `onfocus`.
- **Look especially for:** autosave-on-blur, "paused while unfocused" (video/timers/games),
  polling pause/resume, presence / "away" status, analytics, **security auto-lock or
  logout-on-blur** (can create a lock loop), dimming overlays.
- **Mitigate:** gate/debounce that logic, or set a short-lived "ignore the next blur/focus" flag
  in the renderer immediately before calling `refocus()`.
- **If this grep is clean, the hotfix is safe to ship.**

### B. Native dialogs the renderer monkey-patch does NOT cover
The Piece-3 patch only wraps renderer `window.confirm/alert/prompt`. The same bug is triggered by
**main-process** native dialogs, which won't be fixed automatically.
- **Check:** grep for `dialog.showMessageBoxSync`, `dialog.showMessageBox`, `showOpenDialogSync`,
  `showSaveDialogSync`, `showErrorBox`, and any third-party libs that open native dialogs.
- **Mitigate:** after those, run the same `win.blur(); win.focus()` in main (win32-guarded), or
  prefer the **async** dialog variants (async `showMessageBox` does not trigger the bug).

### C. Multi-window / always-on-top z-order
`blur()` deactivates at the OS level; with multiple or always-on-top/floating windows it can
reshuffle activation or z-order.
- **Check:** how many `BrowserWindow`s exist; any `alwaysOnTop`, child windows, or custom modals.
- **Mitigate:** the handler scopes to the sender's window via `fromWebContents`; test multi-window
  flows (e.g. a dialog opened from a secondary window).

### D. Windows focus-steal restriction / taskbar flash
Windows' `SetForegroundWindow` rules mean `focus()` can occasionally just flash the taskbar button
instead of re-activating, if foreground changed during the blur.
- **Check:** any code that opens other apps/windows around dialogs. Rare in practice (the app is
  foreground at dismiss).

### E. Lost caret / text selection
The window-level cycle restores window focus, not the specific element/caret/selection.
- **Check:** flows where a `confirm` fires mid-edit and the user expects the caret/selection to
  survive. Usually acceptable (user re-clicks); if critical, save/restore selection around the dialog.

### F. Fullscreen / kiosk
`blur()` can cause a visible state blip in fullscreen or kiosk mode.
- **Check:** `kiosk: true` / `fullscreen: true` usage; test the dialog flow there.

### G. Accessibility / screen readers
Synthetic focus changes can disrupt assistive tech (focus announcements / tracking).
- **Check:** if a11y is in scope, test with a screen reader (NVDA on Windows).

### H. The flash itself (cosmetic)
Brief titlebar deactivate→reactivate on every dismiss.
- **Check:** framed vs frameless — near-invisible if `frame: false`; do not change framing on
  release eve if risky. Accepted cost otherwise.

---

## 4. Gotchas / notes

- Keep the `process.platform !== 'win32'` guard in **main** so macOS/Linux are untouched
  (the IPC still fires there but no-ops — harmless).
- Expect a brief **window flash** on dialog dismiss (titlebar deactivate→reactivate). It is
  cosmetic and the accepted cost. It is near-invisible on a frameless (`frame: false`) window —
  but do **not** change window framing on release eve if risky.
- The monkey-patch must run after the preload bridge exists (it always does — preload runs
  before page scripts) and at the true renderer entry, before the first dialog.

---

## 5. DO NOT do this for the release — sustainable fix for NEXT cycle

The proper fix is to stop using native dialogs (eliminates the root cause; flash-free).
Two equivalent routes: an in-DOM modal "polyfill" that overrides `window.confirm/alert/prompt`,
or an async `dialog.showMessageBox` over IPC. **Both require call sites to become `async`/`await`.**

- **4 `alert` sites:** nearly drop-in (return value unused; just note it no longer blocks code after it).
- **19 `confirm` sites:** convert each to `await confirm(...)`, make the enclosing function `async`,
  and audit the callers for the async ripple. Full QA of all 19 flows.
- **Danger to guard against:** a missed `await` → `if (Promise)` is always truthy → the confirmed
  branch always runs (e.g. "delete?" always deletes). Add a lint rule / careful review.
- After the migration ships, **remove the blur/focus hotfix** (Pieces 1–3).

---

## 6. Second symptom: the app can't be closed (separate cause + 1-line fix)

**Symptom:** the app can't be closed via the title-bar X, taskbar right-click → Close, or Alt+F4 —
and **no dialog appears**. The blur+focus hotfix does not affect this (different layer).

**Root cause (proven by logging the close path — NOT related to the focus bug):**
the app's `beforeunload` "unsaved changes" guards veto the unload (correct). But **by default,
Electron silently refuses to close and shows no dialog when a renderer `beforeunload` guard vetoes —
unless the main process handles the `webContents` `will-prevent-unload` event.** With no such handler,
the veto just becomes "window won't close, no prompt." (Note: `window.confirm` is also *suppressed*
during the unload phase and returns `false`, so any guard that relies on it always vetoes — which is
why removing the guards "fixes" closing but loses the warning.)

X / taskbar-Close / Alt+F4 all behave identically because they all route through the same
`WM_CLOSE` → Electron `'close'` → renderer `beforeunload` path.

**The fix — add ONE handler in the main process. Change none of your `beforeunload` guards.**

Use the **async** `dialog.showMessageBox` (not `showMessageBoxSync`). A sync dialog is itself a native
modal and re-triggers the focus bug on Cancel (and patching that with a timed `blur()/focus()` is a
race — fragile on slow/large apps and slow machines). The async dialog avoids the focus bug entirely:

```js
// MAIN process, where you create the window
const { dialog } = require('electron');

let quitting = false;
let prompting = false;
win.webContents.on('will-prevent-unload', (event) => {
  if (quitting) { event.preventDefault(); return; } // already confirmed -> allow close
  if (prompting) return;                             // a prompt is already open
  prompting = true;
  dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Quit',
    message: 'Are you sure you want to quit?',
    detail: 'Unsaved changes will be lost.'
  }).then(({ response }) => {
    prompting = false;
    if (response === 1) { quitting = true; win.close(); } // re-trigger; flag lets it through
  });
});
```

How it works: when a guard vetoes the unload, `will-prevent-unload` fires. We do **not** `preventDefault`
immediately, so the window stays open while we ask asynchronously (no focus bug). On **Quit** we set a
flag and call `win.close()` again — `will-prevent-unload` fires once more, the flag lets us `preventDefault`
(= allow the unload), and the window closes. On **Cancel** nothing happens and the window stays. Default
is "Cancel" (accidental Esc/close won't lose data). Works regardless of how the guards veto
(`returnValue` or `confirm`), so **you don't touch the ~19 call sites**, and there's **no timer**.

- ❌ Do **not** use `showMessageBoxSync` here — it re-triggers the focus bug on Cancel and a timed
  blur/focus to patch it is a race condition.
- ❌ Do **not** use `win.destroy()` as the default close handler — it bypasses the unsaved-changes guards.
  (Here we re-trigger the *guarded* `win.close()`, so the guards still run; the flag just lets it through.)

**UX note (consistency):** the close prompt is an OS-native message box, while in-app
route-change prompts use `window.confirm` (OK/Cancel) — they look different because `window.confirm`
can't run during a real close. Unifying them means moving everything to one custom in-DOM modal — which
is the same as the §5 sustainable fix and *also* eliminates the focus bug (no native dialogs left).

**Repro confirmation:** on `/form` with the guard on, click X → you get the Quit dialog and Quit
closes the app; the 19-style guards are untouched.

## 7. Verify (on Windows)

1. Run the app on Windows.
2. Trigger any `confirm`/`alert`, dismiss it.
3. Click a text input and type → it must work. (You'll see a brief window flash on dismiss.)
4. Sanity-check a flow that uses a `confirm` return value still branches correctly.

See this repo's `src/routes/form/+page.svelte`, `electron/main.cjs`, and `electron/preload.cjs`
for a working end-to-end implementation (with a toggle to A/B the bug).
