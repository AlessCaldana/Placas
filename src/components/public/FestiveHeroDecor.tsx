import type { ReactNode } from "react";
import type { FestivityId } from "@/lib/festivities";

/**
 * Light decoration of the home hero during a festivity: inline SVG only, hidden from
 * screen readers, drawn behind the hero text and carousel. A repeated string runs along
 * the top edge and a few small pieces sit in the free space at the bottom (the hero
 * padding), so nothing covers the copy, the buttons or the plates. Colours come from the
 * --festive-* variables set by [data-festivity] in globals.css; movement only happens
 * without prefers-reduced-motion.
 */
export function FestiveHeroDecor({ festivity }: { festivity: FestivityId }) {
  const Decor = decorations[festivity];
  return (
    <div className={`festive-decor is-${festivity}`} aria-hidden="true">
      <Decor />
    </div>
  );
}

/** Pattern repeated along the top edge of the hero (no distortion at any width). */
function TopString({ id, width, children }: { id: string; width: number; children: ReactNode }) {
  return (
    <svg className="festive-string" focusable="false">
      <defs>
        <pattern id={id} width={width} height="56" patternUnits="userSpaceOnUse">
          {children}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Small absolutely positioned piece; `className` sets its place and size in CSS. */
function Piece({ className, viewBox, children }: { className: string; viewBox: string; children: ReactNode }) {
  return (
    <svg className={`festive-piece ${className}`} viewBox={viewBox} focusable="false">
      {children}
    </svg>
  );
}

const heartPath =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54Z";
const starPath = "M12 1.5l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 8.7l7.1-.6Z";

function Bat() {
  return (
    <path d="M24 9c-1.3 0-2.2-.9-2.6-2.2L20.5 8 19 6.4c-.6 2.4-2.6 4.3-5.4 4.6 1.7.6 2.9 2 3.1 3.9-1.8-1.3-4-1.6-6-.6.2-2.6-1.6-4.6-4.2-4.9C9.3 8.9 13 6.2 16.6 6.8 15.2 4.3 12.5 2.8 9.6 3 13.4.6 18.5 1.6 21 5.3l.9-1.6.9 1.2.9-1.2.9 1.6c2.5-3.7 7.6-4.7 11.4-2.3-2.9-.2-5.6 1.3-7 3.8 3.6-.6 7.3 2.1 10.1 3.5-2.6.3-4.4 2.3-4.2 4.9-2-1-4.2-.7-6 .6.2-1.9 1.4-3.3 3.1-3.9-2.8-.3-4.8-2.2-5.4-4.6L29 8l-.9-1.2C27.7 8.1 26.8 9 25.5 9Z" />
  );
}

function Pumpkin({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M30 10c0-4 2-7 6-8" fill="none" stroke="#4f6b2a" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="30" cy="30" rx="27" ry="20" style={{ fill: "var(--festive-accent)" }} />
      <ellipse cx="30" cy="30" rx="15" ry="20" fill="#c9601f" />
      <ellipse cx="30" cy="30" rx="6" ry="20" style={{ fill: "var(--festive-accent)" }} />
      <path d="M19 26l5-5 5 5Zm12 0 5-5 5 5ZM18 34c4 5 20 5 24 0l-4 1-2-2-3 3-3-3-3 3-3-3-2 2Z" fill="#2a1408" />
    </g>
  );
}

function Snowflake() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />
      <path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5M3.4 10.4l3.4-.9-.9-3.4M20.6 13.6l-3.4.9.9 3.4M5.9 17.9l.9-3.4-3.4-.9M18.1 6.1l-.9 3.4 3.4.9" />
    </g>
  );
}

function Egg({ x, y, rotate, fill, stripe }: { x: number; y: number; rotate: number; fill: string; stripe: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate} 14 18)`}>
      <path d="M14 0C6 0 0 12 0 21c0 8 6 15 14 15s14-7 14-15C28 12 22 0 14 0Z" fill={fill} />
      <path d="M1 17c4 3 8-3 13 0s9 3 13 0M.5 25c4 3 9-2 13.5 0s9 3 13.5 0" fill="none" stroke={stripe} strokeWidth="2.4" />
    </g>
  );
}

function Flower({ x, y, petal }: { x: number; y: number; petal: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M14 26v20" stroke="#4f7a3a" strokeWidth="2.4" />
      <path d="M14 38c-5-1-8-5-8-9 5 0 8 4 8 9Z" fill="#6f9a48" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse key={angle} cx="14" cy="8" rx="5" ry="8" fill={petal} transform={`rotate(${angle} 14 16)`} />
      ))}
      <circle cx="14" cy="16" r="4.5" fill="#f5bd45" />
    </g>
  );
}

function Halloween() {
  return (
    <>
      <TopString id="festive-string-halloween" width={128}>
        <path d="M0 4q64 22 128 0" fill="none" stroke="#f3ead766" strokeWidth="1.5" />
        <path d="M18 9h22l-11 18Z" style={{ fill: "var(--festive-accent)" }} />
        <path d="M53 14h22l-11 18Z" fill="#1c0e12" stroke="#f3ead740" />
        <path d="M88 9h22l-11 18Z" style={{ fill: "var(--festive-accent-2)" }} />
      </TopString>
      <Piece className="festive-cobweb" viewBox="0 0 100 100">
        <g fill="none" stroke="#f3ead7" strokeOpacity="0.5" strokeWidth="1.2">
          <path d="M100 0 0 100M100 0 30 100M100 0 0 30M100 0 62 100M100 0 0 62" />
          <path d="M80 0q4 16 20 20M60 0q6 32 40 40M38 0q8 50 62 62M16 0q10 72 84 84" />
        </g>
      </Piece>
      <Piece className="festive-bat is-one" viewBox="0 0 46 18"><Bat /></Piece>
      <Piece className="festive-bat is-two" viewBox="0 0 46 18"><Bat /></Piece>
      <Piece className="festive-bat is-three" viewBox="0 0 46 18"><Bat /></Piece>
      <Piece className="festive-corner is-left" viewBox="0 0 110 64">
        <Pumpkin x={0} y={8} />
        <Pumpkin x={56} y={26} scale={0.62} />
      </Piece>
      <Piece className="festive-corner is-right" viewBox="0 0 64 64">
        <Pumpkin x={2} y={8} scale={0.95} />
      </Piece>
    </>
  );
}

function Christmas() {
  return (
    <>
      <TopString id="festive-string-christmas" width={160}>
        <path d="M0 4q80 40 160 0" fill="none" style={{ stroke: "var(--festive-accent)" }} strokeWidth="7" strokeLinecap="round" />
        <path d="M0 4q80 40 160 0" fill="none" stroke="#7cc08a" strokeWidth="2" strokeDasharray="3 7" />
        <circle cx="40" cy="27" r="5.5" fill="#d83a3a" />
        <circle cx="80" cy="33" r="5.5" style={{ fill: "var(--festive-accent-2)" }} />
        <circle cx="120" cy="27" r="5.5" fill="#f3ead7" />
      </TopString>
      <Piece className="festive-flake is-one" viewBox="0 0 24 24"><Snowflake /></Piece>
      <Piece className="festive-flake is-two" viewBox="0 0 24 24"><Snowflake /></Piece>
      <Piece className="festive-flake is-three" viewBox="0 0 24 24"><Snowflake /></Piece>
      <Piece className="festive-star is-one" viewBox="0 0 24 24"><path d={starPath} style={{ fill: "var(--festive-accent-2)" }} /></Piece>
      <Piece className="festive-star is-two" viewBox="0 0 24 24"><path d={starPath} style={{ fill: "var(--festive-accent-2)" }} /></Piece>
    </>
  );
}

function NewYear() {
  const confetti = ["#e0a526", "#e8833a", "#f3ead7", "#d9658a", "#6fb3a8"];
  return (
    <>
      <TopString id="festive-string-new-year" width={140}>
        <path d="M0 10c12 16 24-8 36 6s24-8 36 6 24-8 36 6 22-6 32 4" fill="none" style={{ stroke: "var(--festive-accent)" }} strokeWidth="2.4" />
        <path d="M0 26c14 12 26-10 40 2s26-10 40 2 26-10 40 2 14-4 20 0" fill="none" stroke="#d9658a" strokeWidth="2" />
        <rect x="18" y="36" width="5" height="9" fill="#f3ead7" transform="rotate(24 20 40)" />
        <rect x="64" y="40" width="5" height="9" fill="#6fb3a8" transform="rotate(-30 66 44)" />
        <rect x="108" y="34" width="5" height="9" style={{ fill: "var(--festive-accent)" }} transform="rotate(50 110 38)" />
      </TopString>
      {confetti.map((color, index) => (
        <Piece key={color} className={`festive-confetti is-${index + 1}`} viewBox="0 0 10 16">
          <rect width="10" height="16" rx="1.5" fill={color} />
        </Piece>
      ))}
      <Piece className="festive-corner is-right" viewBox="0 0 64 64">
        <path d="M6 58c18-6 10-26 26-30s14-18 28-22" fill="none" style={{ stroke: "var(--festive-accent)" }} strokeWidth="3" strokeLinecap="round" />
        <path d="M2 40c14 0 12-16 26-16s16-12 30-14" fill="none" stroke="#d9658a" strokeWidth="2.4" strokeLinecap="round" />
      </Piece>
    </>
  );
}

function Epiphany() {
  return (
    <>
      <TopString id="festive-string-epiphany" width={120}>
        <path d="M0 4q60 18 120 0" fill="none" stroke="#f3ead766" strokeWidth="1.5" />
        <path d="M30 10v8M90 10v8" stroke="#f3ead766" strokeWidth="1" />
        <path d={starPath} style={{ fill: "var(--festive-accent-2)" }} transform="translate(22 17) scale(0.7)" />
        <path d={starPath} fill="#f3ead7" transform="translate(84 17) scale(0.5)" />
      </TopString>
      <Piece className="festive-broom" viewBox="0 0 120 44">
        <path d="M6 30 84 12" stroke="#8a5a32" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M80 13l30-12-4 12 10 2-8 6 10 6-14-1 4 10-20-14Z" fill="#e0a526" />
        <path d="M84 12l6 11M92 10l8 12" stroke="#a5752c" strokeWidth="1.5" />
        <path d={starPath} fill="#f3ead7" transform="translate(0 4) scale(0.45)" opacity="0.9" />
        <path d={starPath} style={{ fill: "var(--festive-accent-2)" }} transform="translate(18 30) scale(0.35)" />
      </Piece>
      <Piece className="festive-corner is-left" viewBox="0 0 48 64">
        <path d="M10 4h22v30l10 10c4 4 4 12-2 15s-10 1-14-3L12 42c-2-2-2-4-2-6Z" fill="#c4473a" />
        <path d="M8 2h26v10H8Z" fill="#f3ead7" />
        <path d="M14 22h14M14 30h14" stroke="#f3ead7" strokeWidth="2" strokeDasharray="3 3" />
      </Piece>
      <Piece className="festive-star is-one" viewBox="0 0 24 24"><path d={starPath} style={{ fill: "var(--festive-accent-2)" }} /></Piece>
      <Piece className="festive-star is-two" viewBox="0 0 24 24"><path d={starPath} fill="#f3ead7" /></Piece>
    </>
  );
}

function Valentines() {
  return (
    <>
      <TopString id="festive-string-valentines" width={110}>
        <path d="M0 4q55 18 110 0" fill="none" stroke="#f3ead766" strokeWidth="1.5" />
        <path d="M28 9v5M78 10v5" stroke="#f3ead766" strokeWidth="1" />
        <path d={heartPath} style={{ fill: "var(--festive-accent)" }} transform="translate(18 10) scale(0.85)" />
        <path d={heartPath} fill="#f2a1b5" transform="translate(70 11) scale(0.7)" />
      </TopString>
      <Piece className="festive-heart is-one" viewBox="0 0 24 24"><path d={heartPath} style={{ fill: "var(--festive-accent)" }} /></Piece>
      <Piece className="festive-heart is-two" viewBox="0 0 24 24"><path d={heartPath} fill="#f2a1b5" /></Piece>
      <Piece className="festive-heart is-three" viewBox="0 0 24 24"><path d={heartPath} style={{ fill: "var(--festive-accent)" }} /></Piece>
      <Piece className="festive-heart is-four" viewBox="0 0 24 24"><path d={heartPath} fill="#f2a1b5" /></Piece>
    </>
  );
}

function Easter() {
  return (
    <>
      <TopString id="festive-string-easter" width={120}>
        <path d="M0 4q60 18 120 0" fill="none" stroke="#f3ead780" strokeWidth="1.5" />
        <path d="M10 8h22l-11 18Z" fill="#f5d58a" />
        <path d="M49 12h22l-11 18Z" fill="#a8d8c0" />
        <path d="M88 8h22l-11 18Z" fill="#f2b8c6" />
      </TopString>
      <Piece className="festive-corner is-left" viewBox="0 0 96 48">
        <Egg x={0} y={10} rotate={-12} fill="#f5d58a" stripe="#e8833a" />
        <Egg x={30} y={6} rotate={6} fill="#a8d8c0" stripe="#2f6f6a" />
        <Egg x={62} y={12} rotate={16} fill="#f2b8c6" stripe="#a5523e" />
      </Piece>
      <Piece className="festive-corner is-right" viewBox="0 0 64 64">
        <Flower x={2} y={14} petal="#f3ead7" />
        <Flower x={32} y={10} petal="#f2b8c6" />
      </Piece>
    </>
  );
}

const decorations: Record<FestivityId, () => ReactNode> = {
  halloween: Halloween,
  christmas: Christmas,
  new_year: NewYear,
  epiphany: Epiphany,
  valentines: Valentines,
  easter: Easter,
};
