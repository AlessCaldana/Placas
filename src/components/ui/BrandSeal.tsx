import { useId } from "react";

// "Il Sigillo": round retro seal used as the shop logo.
// `full` carries the name around the ring; `compact` is for small sizes
// (header, admin, icons) where the ring text would not be readable.
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
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  if (variant === "compact") {
    return (
      <svg className="brand-seal" viewBox="0 0 64 64" width={size} height={size} {...a11y}>
        <circle cx="32" cy="32" r="31" fill="#2f6f6a" />
        <circle cx="32" cy="32" r="27.5" fill="none" stroke="#d9a23a" strokeWidth="1.2" />
        <circle cx="32" cy="32" r="21" fill="#f3ead7" />
        <text x="32" y="39.5" textAnchor="middle" fontFamily="'Instrument Serif', Georgia, serif" fontSize="22" fill="#2b2a26">PF</text>
        <rect x="26" y="43" width="4" height="1.6" fill="#2f6f6a" />
        <rect x="30" y="43" width="4" height="1.6" fill="#fffdf7" />
        <rect x="34" y="43" width="4" height="1.6" fill="#c4602f" />
      </svg>
    );
  }

  return (
    <svg className="brand-seal" viewBox="0 0 240 240" width={size} height={size} {...a11y}>
      <defs>
        <path id={ringId} d="M120,120 m-86,0 a86,86 0 1,1 172,0 a86,86 0 1,1 -172,0" />
      </defs>
      <circle cx="120" cy="120" r="114" fill="#2f6f6a" />
      <circle cx="120" cy="120" r="106" fill="none" stroke="#d9a23a" strokeWidth="2" />
      <circle cx="120" cy="120" r="68" fill="#f3ead7" />
      <circle cx="120" cy="120" r="62" fill="none" stroke="#d9a23a" strokeWidth="1.5" />
      <text fontFamily="'DM Sans Variable', 'DM Sans', sans-serif" fontWeight="700" fontSize="17" letterSpacing="5" fill="#f3ead7">
        <textPath href={`#${ringId}`}>PFDECO · DECORATIVE ITALIANE ·</textPath>
      </text>
      <text x="120" y="139" textAnchor="middle" fontFamily="'Instrument Serif', Georgia, serif" fontSize="62" fill="#2b2a26">PF</text>
      <rect x="99" y="150" width="14" height="4" fill="#2f6f6a" />
      <rect x="113" y="150" width="14" height="4" fill="#fffdf7" />
      <rect x="127" y="150" width="14" height="4" fill="#c4602f" />
      <g fill="#d9a23a">
        <circle cx="120" cy="84" r="2.5" />
        <circle cx="108" cy="87" r="1.8" />
        <circle cx="132" cy="87" r="1.8" />
      </g>
    </svg>
  );
}
