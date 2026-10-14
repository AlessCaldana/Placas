/**
 * Seventies "sunset stripes" of the home hero: four parallel bands that rise from the
 * bottom edge, bend to the right and run behind the plate carousel to the right edge.
 * Drawn 1:1 in pixels (viewBox = desktop size); CSS scales the whole box on small screens.
 */
const width = 2400;
const height = 1600;
const stripeWidth = 18;
const step = 24; // stripe width + gap
const outerRadius = 104;
const firstLine = stripeWidth / 2;
const bendCenter = firstLine + outerRadius;
// Outer (left / top) to inner (right / bottom), light to dark like a sunset.
const colors = ["#f3ead7", "#e0a526", "#e8833a", "#5a3220"];

export function HeroStripes({ standalone = false }: { standalone?: boolean }) {
  return (
    <svg
      className={standalone ? "hero-stripes is-standalone" : "hero-stripes"}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      {colors.map((color, index) => {
        const line = firstLine + index * step;
        const radius = outerRadius - index * step;
        return (
          <path
            key={color}
            d={`M${line} ${height}V${bendCenter}A${radius} ${radius} 0 0 1 ${bendCenter} ${line}H${width}`}
            fill="none"
            stroke={color}
            strokeWidth={stripeWidth}
          />
        );
      })}
    </svg>
  );
}
