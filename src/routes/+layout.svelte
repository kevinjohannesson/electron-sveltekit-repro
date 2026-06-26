<script>
  let { children } = $props();
</script>

<nav>
  <a href="/">Home</a>
  <a href="/form">Form (beforeunload)</a>
</nav>

<main>
  {@render children()}
</main>

<style>
  :global(body) {
    font-family: system-ui, sans-serif;
    margin: 0;
  }
  nav {
    display: flex;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: #1e1e2e;
  }
  nav a {
    color: #cdd6f4;
    text-decoration: none;
  }
  main {
    padding: 1.5rem;
  }
</style>
