/**
 * Fixed non-interactive backdrop — three aurora orbs in muted crimson/violet/slate
 * that slowly drift in opposite phases, plus a very faint angled grid for texture.
 * Purposely low-intensity so glass panels read as matte frosted, not neon.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base coat */}
      <div className="absolute inset-0 bg-background" />

      {/* Primary orb — crimson, upper left, slow drift */}
      <div
        className="animate-aurora transform-gpu will-change-transform absolute -top-[30%] -left-[20%] h-[75vmax] w-[75vmax] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(184,16,42,0.09) 0%, rgba(184,16,42,0.03) 50%, transparent 70%)",
          filter: "blur(140px)",
        }}
      />

      {/* Secondary orb — deep violet, center-right, offset phase */}
      <div
        className="animate-aurora transform-gpu will-change-transform absolute top-[20%] -right-[20%] h-[60vmax] w-[60vmax] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(90,20,80,0.07) 0%, rgba(60,10,60,0.02) 50%, transparent 70%)",
          filter: "blur(160px)",
          animationDelay: "-9s",
        }}
      />

      {/* Tertiary orb — slate-blue, lower center, long delay */}
      <div
        className="animate-aurora transform-gpu will-change-transform absolute -bottom-[25%] left-[30%] h-[55vmax] w-[55vmax] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(20,25,60,0.08) 0%, rgba(10,12,40,0.02) 50%, transparent 70%)",
          filter: "blur(155px)",
          animationDelay: "-18s",
        }}
      />

      {/* Subtle accent — warm crimson near top-right for vibrancy */}
      <div
        className="animate-aurora transform-gpu will-change-transform absolute top-[5%] right-[15%] h-[30vmax] w-[30vmax] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(184,16,42,0.05) 0%, transparent 70%)",
          filter: "blur(100px)",
          animationDelay: "-5s",
        }}
      />

      {/* Angled grid — very faint, adds matte tactility */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.022) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Vignette — blend into edges */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#060608_100%)]" />

      {/* Bottom fade for seamless content merge */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
