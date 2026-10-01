/* Reveals each card and the footer once, as it scrolls into view.
   The page is complete without this file; styles hide nothing unless it can run. */
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('js') || !('IntersectionObserver' in window) ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.classList.add('motion');
  let first = true; // items already on screen at load wait for the heading sequence
  const order = (a, b) => (a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1);
  const io = new IntersectionObserver((entries) => {
    const base = first ? 500 : 0;
    first = false;
    entries.filter((e) => e.isIntersecting).sort(order).forEach((e, i) => {
      e.target.style.setProperty('--d', base + i * 70 + 'ms');
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.app-card, footer').forEach((el) => io.observe(el));
})();
