import { useId } from "react";
import type { Locale } from "@/messages";

// Drawn flags: Windows browsers do not show flag emoji (they print "IT", "FR"...).
// Every flag fills a 3:2 box; decorative, the language name is always next to it.

const stripes: Record<Exclude<Locale, "en">, { vertical: boolean; colors: string[]; weights?: number[] }> = {
  it: { vertical: true, colors: ["#009246", "#ffffff", "#ce2b37"] },
  fr: { vertical: true, colors: ["#0055a4", "#ffffff", "#ef4135"] },
  es: { vertical: false, colors: ["#aa151b", "#f1bf00", "#aa151b"], weights: [1, 2, 1] },
  nl: { vertical: false, colors: ["#ae1c28", "#ffffff", "#21468b"] },
  de: { vertical: false, colors: ["#000000", "#dd0000", "#ffce00"] },
};

export function Flag({ locale, height = 14 }: { locale: Locale; height?: number }) {
  const clipId = useId();
  const width = Math.round((height * 3) / 2);
  const common = {
    className: "flag",
    width,
    height,
    "aria-hidden": true,
    focusable: false,
  } as const;

  if (locale === "en") {
    // Union Jack, cropped to 3:2.
    return (
      <svg {...common} viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice">
        <clipPath id={clipId}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clipId})`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </svg>
    );
  }

  const { vertical, colors, weights = [1, 1, 1] } = stripes[locale];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const length = vertical ? 3 : 2;
  const sizes = weights.map((weight) => (weight / total) * length);
  const starts = sizes.map((_, index) => sizes.slice(0, index).reduce((sum, size) => sum + size, 0));
  return (
    <svg {...common} viewBox="0 0 3 2">
      {colors.map((color, index) => {
        const rect = vertical
          ? { x: starts[index], y: 0, width: sizes[index], height: 2 }
          : { x: 0, y: starts[index], width: 3, height: sizes[index] };
        return <rect key={index} {...rect} fill={color} />;
      })}
    </svg>
  );
}
