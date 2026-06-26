<script>
  import { beforeNavigate } from '$app/navigation';
  import { focusFix } from '$lib/focusFix.svelte.js';

  // Several dummy two-way bound fields.
  let name = $state('');
  let email = $state('');
  let notes = $state('');
  let count = $state(0);
  let agree = $state(false);

  // NOTE: there are intentionally NO refocus() calls in this file. The fix is
  // installed once globally (src/hooks.client.js -> installFocusFix) by
  // monkey-patching window.confirm/alert/prompt, so every call site below is
  // covered automatically. The toggle/method UI just drives the shared config.

  /**
   * Fires before any navigation away from this page: clicking a SPA link,
   * back/forward, goto(), or a real unload (reload / close). Calling
   * navigation.cancel() blocks it.
   *   - confirm() === true  (OK / Leave)   -> do nothing -> navigation proceeds
   *   - confirm() === false (Cancel)        -> navigation.cancel() -> blocked
   */
  beforeNavigate((navigation) => {
    const leave = window.confirm('You have unsaved changes. Leave anyway?');
    if (!leave) {
      navigation.cancel();
    }
  });

  // --- Isolation test: fire a native dialog WITHOUT any navigation ---------
  // If inputs break after these too, the native dialog is the cause (not beforeNavigate).
  function testConfirm() {
    window.confirm('Native confirm() — now try typing in an input.');
  }
  function testAlert() {
    window.alert('Native alert() — now try typing in an input.');
  }
  function testPrompt() {
    window.prompt('Native prompt() — now try typing in an input.');
  }
</script>

<h1>Form (route 2)</h1>
<p>
  Click a nav link (or reload / close) to trigger <code>beforeNavigate</code>.
  Picking <strong>Cancel</strong> in the confirm blocks the navigation.
</p>

<section class="probe">
  <h2>Dialog isolation test</h2>
  <p>Fire a native dialog with no navigation, dismiss it, then try typing below.</p>
  <div class="btn-row">
    <button type="button" onclick={testConfirm}>window.confirm()</button>
    <button type="button" onclick={testAlert}>window.alert()</button>
    <button type="button" onclick={testPrompt}>window.prompt()</button>
  </div>
  <label class="patch">
    <input
      type="checkbox"
      checked={focusFix.apply}
      onchange={(e) => (focusFix.apply = e.currentTarget.checked)}
    />
    Apply focus-fix patch (global monkey-patch) — uncheck to reproduce the bug
  </label>
  <label class="patch">
    Method
    <select
      value={focusFix.method}
      onchange={(e) => (focusFix.method = e.currentTarget.value)}
      disabled={!focusFix.apply}
    >
      <option value="webContentsFocus">webContents.focus() — no flash, may not fix</option>
      <option value="relayout">webContents.focus() + relayout — no flash</option>
      <option value="blurFocus">blur + focus — flashes, most reliable</option>
    </select>
  </label>
</section>

<form>
  <label>Name <input bind:value={name} /></label>
  <label>Email <input type="email" bind:value={email} /></label>
  <label>Notes <textarea rows="3" bind:value={notes}></textarea></label>
  <label>Count <input type="number" bind:value={count} /></label>
  <label class="check"><input type="checkbox" bind:checked={agree} /> Agree</label>
</form>

<h2>Live bound state</h2>
<pre>{JSON.stringify({ name, email, notes, count, agree }, null, 2)}</pre>

<style>
  .probe {
    margin: 1rem 0 1.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #fafafa;
  }
  .btn-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .patch {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    font-size: 0.9rem;
  }
  button {
    padding: 0.45rem 0.8rem;
    font: inherit;
    cursor: pointer;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 360px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  input,
  textarea {
    padding: 0.4rem;
    font: inherit;
  }
  pre {
    background: #f4f4f4;
    padding: 0.75rem;
    border-radius: 6px;
  }
</style>
