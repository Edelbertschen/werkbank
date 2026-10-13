// Splash aus index.html ausblenden, sobald die Oberfläche steht.
// Mindestdauer, damit er nicht nur aufblitzt – in Testbauten ohne Wartezeit.
const MIN_MS = import.meta.env.VITE_WB_TEST ? 0 : 700;

export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, MIN_MS - performance.now());
  setTimeout(() => {
    requestAnimationFrame(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    });
  }, wait);
}
