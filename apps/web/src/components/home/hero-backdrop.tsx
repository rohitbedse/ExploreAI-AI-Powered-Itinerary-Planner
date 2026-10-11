/**
 * Decorative hero layers behind the page content: a dotted grid and film grain that fade out
 * toward the edges. (The moving aurora blobs live in the global <Aurora/> so every page shares them.)
 * Static markup only, so it costs nothing at runtime after first paint.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="hero-backdrop">
      <div className="dot-grid" />
      <div className="noise" />
    </div>
  );
}
