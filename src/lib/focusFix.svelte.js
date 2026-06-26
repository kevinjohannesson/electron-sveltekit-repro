// Centralized Windows dialog focus-fix.
//
// Monkey-patches window.alert/confirm/prompt ONCE so every call site is covered
// automatically — no need to sprinkle refocus() after each dialog. Install it at
// renderer startup (see src/hooks.client.js).
//
// The exported `focusFix` is reactive ($state) only so the test harness UI can
// toggle it live; in a real app you would just hardcode the behaviour.

export const focusFix = $state({
  apply: true,          // master on/off (for A/B testing the bug)
  method: 'blurFocus'   // 'webContentsFocus' | 'relayout' | 'blurFocus'
});

let installed = false;

export function installFocusFix() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  for (const name of ['alert', 'confirm', 'prompt']) {
    const original = window[name].bind(window);
    window[name] = (...args) => {
      const result = original(...args);
      // window.native is the preload IPC bridge; absent in a plain browser.
      if (focusFix.apply) window.native?.refocus(focusFix.method);
      return result;
    };
  }
}
