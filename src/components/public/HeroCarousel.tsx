"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Icon } from "@/components/ui/Icon";
import { HeroStripes } from "@/components/public/HeroStripes";
import type { HeroProduct } from "@/lib/services/products";
import { translate, type Locale } from "@/messages";

/** Time each plate stays in front before the next one comes forward. */
const slideInterval = 4200;
/** Plates whose photo is requested ahead of time: the front one and the two behind it. */
const preloadAhead = 2;

/**
 * Each card takes the shape of its photo (width / height), so the photo fills it with
 * `cover` without cutting the plate. Kept within this range so no card becomes a sliver.
 */
const minRatio = 0.55;
const maxRatio = 2.4;
/** Shape used until the photo has loaded (the photo is shown whole meanwhile). */
const defaultRatio = 2 / 3;

function photoRatio(image: HTMLImageElement): number | null {
  const { naturalWidth, naturalHeight } = image;
  if (!naturalWidth || !naturalHeight) return null;
  const ratio = Math.min(maxRatio, Math.max(minRatio, naturalWidth / naturalHeight));
  // Rounded so re-measuring the same photo never triggers a new render.
  return Math.round(ratio * 1000) / 1000;
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const getPageVisible = () => document.visibilityState === "visible";
// On the server nothing moves: autoplay starts after hydration.
const getServerReducedMotion = () => true;
const getServerPageVisible = () => false;

function upcoming(index: number, count: number) {
  return Array.from({ length: preloadAhead + 1 }, (_, step) => (index + step) % count);
}

/** Position of a plate in the pile relative to the one in front. */
function slideState(index: number, active: number, count: number) {
  const offset = (index - active + count) % count;
  if (offset === 0) return "is-current";
  if (offset === 1) return "is-next";
  if (offset === 2 && count > 3) return "is-after";
  if (offset === count - 1) return "is-previous";
  return "is-hidden";
}

export function HeroCarousel({
  products,
  locale,
  paused = false,
  onSelect,
}: {
  products: HeroProduct[];
  locale: Locale;
  /** Stops autoplay while something else (e.g. the product dialog) is open. */
  paused?: boolean;
  onSelect: (product: HeroProduct) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const count = products.length;
  const [active, setActive] = useState(0);
  // Photos are only requested once their plate is about to be shown.
  const [requested, setRequested] = useState(() => new Set(upcoming(0, count)));
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Shape of each photo, known once it has loaded.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const pageVisible = useSyncExternalStore(subscribeVisibility, getPageVisible, getServerPageVisible);
  const canAutoplay = count > 1 && !reducedMotion;
  const playing = canAutoplay && pageVisible && !hovered && !focused && !stopped && !paused;
  const current = Math.min(active, count - 1);

  const show = useCallback(
    (index: number) => {
      const next = (index + count) % count;
      setActive(next);
      setRequested((loaded) => {
        const missing = upcoming(next, count).filter((item) => !loaded.has(item));
        return missing.length ? new Set([...loaded, ...missing]) : loaded;
      });
    },
    [count],
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => show(current + 1), slideInterval);
    return () => window.clearTimeout(timer);
  }, [playing, current, show]);

  const measure = useCallback((id: string, image: HTMLImageElement | null) => {
    if (!image?.complete) return;
    const ratio = photoRatio(image);
    if (ratio) setRatios((known) => (known[id] === ratio ? known : { ...known, [id]: ratio }));
  }, []);

  if (!count) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (count < 2) return;
    if (event.key === "ArrowRight") show(current + 1);
    else if (event.key === "ArrowLeft") show(current - 1);
    else return;
    event.preventDefault();
  };
  const onPointer = (event: PointerEvent<HTMLDivElement>, inside: boolean) => {
    if (event.pointerType === "mouse") setHovered(inside);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };
  const currentProduct = products[current];

  return (
    <div
      className="hero-carousel"
      role="region"
      aria-roledescription={t("hero.carousel.roledescription")}
      aria-label={t("hero.carousel.label")}
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => onPointer(event, true)}
      onPointerLeave={(event) => onPointer(event, false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      <HeroStripes />
      <div className="hero-carousel-stage" aria-live={playing ? "off" : "polite"}>
        {products.map((product, index) => {
          const isCurrent = index === current;
          const ratio = ratios[product.id];
          return (
            <div
              key={product.id}
              className={`hero-slide ${slideState(index, current, count)}`}
              style={{ "--plate-ratio": ratio ?? defaultRatio } as CSSProperties}
              role="group"
              aria-roledescription={t("hero.carousel.slide")}
              aria-label={t("product.position").replace("{n}", String(index + 1)).replace("{total}", String(count))}
              aria-hidden={!isCurrent}
              inert={!isCurrent}
            >
              <button
                className={ratio ? "hero-plate is-measured" : "hero-plate"}
                type="button"
                onClick={() => onSelect(product)}
                aria-label={t("hero.carousel.open").replace("{name}", product.name)}
              >
                {requested.has(index) && (
                  <img
                    src={product.imageUrl}
                    alt={product.altText}
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "low"}
                    decoding="async"
                    draggable={false}
                    // The ref covers photos already loaded before hydration (no load event then).
                    ref={(image) => measure(product.id, image)}
                    onLoad={(event) => measure(product.id, event.currentTarget)}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="hero-carousel-caption" aria-hidden="true">
        <span key={currentProduct.id}>
          <small>{currentProduct.referenceCode}</small>
          {currentProduct.name}
        </span>
      </p>

      {count > 1 && (
        <div className="hero-carousel-controls">
          <button
            className="hero-carousel-arrow is-previous"
            type="button"
            onClick={() => show(current - 1)}
            aria-label={t("hero.carousel.previous")}
          >
            <Icon name="arrow" size={18} />
          </button>
          <div className="hero-carousel-dots">
            {products.map((product, index) => (
              <button
                key={product.id}
                type="button"
                className="hero-carousel-dot"
                onClick={() => show(index)}
                aria-label={t("hero.carousel.goTo").replace("{n}", String(index + 1))}
                aria-current={index === current ? "true" : undefined}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            className="hero-carousel-arrow is-next"
            type="button"
            onClick={() => show(current + 1)}
            aria-label={t("hero.carousel.next")}
          >
            <Icon name="arrow" size={18} />
          </button>
          {canAutoplay && (
            <button
              className="hero-carousel-arrow is-toggle"
              type="button"
              onClick={() => setStopped((value) => !value)}
              aria-label={t(stopped ? "hero.carousel.play" : "hero.carousel.pause")}
            >
              <Icon name={stopped ? "play" : "pause"} size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
