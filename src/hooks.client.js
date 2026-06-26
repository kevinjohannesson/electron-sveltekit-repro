import { installFocusFix } from '$lib/focusFix.svelte.js';

// Runs once when the client app boots — the SvelteKit equivalent of a renderer
// entry point. Patches the native dialogs before any of them can be shown.
installFocusFix();
