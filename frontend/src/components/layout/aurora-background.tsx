/**
 * Fixed, non-interactive backdrop: two soft violet/cyan blooms plus a faint
 * grid. This is what gives the glass panels something to refract.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />

      <div className="animate-aurora absolute -top-1/3 -left-1/4 h-[70vmax] w-[70vmax] rounded-full bg-brand-600/25 blur-[120px]" />
      <div
        className="animate-aurora absolute top-1/4 -right-1/4 h-[60vmax] w-[60vmax] rounded-full bg-brand-400/20 blur-[130px]"
        style={{ animationDelay: "-8s" }}
      />
      <div
        className="animate-aurora absolute -bottom-1/3 left-1/3 h-[50vmax] w-[50vmax] rounded-full bg-chart-2/15 blur-[140px]"
        style={{ animationDelay: "-16s" }}
      />

      {/* Faint grid to add texture behind the glass. */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />
    </div>
  );
}
