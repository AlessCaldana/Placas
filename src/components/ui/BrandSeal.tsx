import { useId } from "react";

// "Il Sigillo": round 70s seal used as the shop logo — a sunset of stripes
// (mustard, orange, red, burgundy) inside a brown ring, with "PF" in front.
// `full` carries the name around the ring; `compact` is for small sizes
// (header, admin, icons) where the ring text would not be readable.
const DISPLAY_FONT = "Shrikhand, 'Cooper Black', Georgia, serif";
const SUNSET = ["#e0a526", "#e8833a", "#b8432a", "#7a2230"];

export function BrandSeal({
  size = 40,
  variant = "compact",
  label,
}: {
  size?: number;
  variant?: "full" | "compact";
  /** Accessible name; omit when the seal sits next to visible text. */
  label?: string;
}) {
  const ringId = useId();
  const clipId = useId();
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  if (variant === "compact") {
    return (
      <svg className="brand-seal" viewBox="0 0 64 64" width={size} height={size} {...a11y}>
        <defs>
          <clipPath id={clipId}>
            <circle cx="32" cy="32" r="25" />
          </clipPath>
        </defs>
        <circle cx="32" cy="32" r="31.5" fill="#3d2216" />
        <circle cx="32" cy="32" r="27.6" fill="none" stroke="#e0a526" strokeWidth="1.6" />
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="64" height="64" fill="#f3ead7" />
          {SUNSET.map((color, index) => (
            <rect key={color} x="0" y={36 + index * 5} width="64" height={index === 3 ? 12 : 3.6} fill={color} />
          ))}
        </g>
        <text x="32" y="34" textAnchor="middle" fontFamily={DISPLAY_FONT} fontSize="19" fill="#3d2216">PF</text>
      </svg>
    );
  }

  return (
    <svg className="brand-seal" viewBox="0 0 240 240" width={size} height={size} {...a11y}>
      <defs>
        <path id={ringId} d="M120,120 m-90,0 a90,90 0 1,1 180,0 a90,90 0 1,1 -180,0" />
        <clipPath id={clipId}>
          <circle cx="120" cy="120" r="72" />
        </clipPath>
      </defs>
      <circle cx="120" cy="120" r="116" fill="#3d2216" />
      <circle cx="120" cy="120" r="108" fill="none" stroke="#e0a526" strokeWidth="3" />
      <circle cx="120" cy="120" r="78" fill="none" stroke="#e0a526" strokeWidth="3" />
      <text fontFamily="'DM Sans Variable', 'DM Sans', sans-serif" fontWeight="700" fontSize="17" letterSpacing="5" fill="#f3ead7">
        <textPath href={`#${ringId}`}>PFDECO · DECORATIVE ITALIANE ·</textPath>
      </text>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="240" height="240" fill="#f3ead7" />
        {SUNSET.map((color, index) => (
          <rect key={color} x="0" y={132 + index * 16} width="240" height={index === 3 ? 60 : 11} fill={color} />
        ))}
      </g>
      <text x="120" y="128" textAnchor="middle" fontFamily={DISPLAY_FONT} fontSize="62" fill="#3d2216">PF</text>
    </svg>
  );
}
