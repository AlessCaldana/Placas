"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import type { PublicCatalogProduct } from "@/lib/services/products";
import { translate, type Locale } from "@/messages";

export function ProductDetailsDialog({
  product,
  locale,
  quantityInCart,
  onClose,
  onAddToCart,
  onPrevious,
  onNext,
  position,
  whatsappHref,
}: {
  product: PublicCatalogProduct;
  locale: Locale;
  quantityInCart: number;
  onClose: () => void;
  onAddToCart: () => void;
  /** Browse the products listed on the page without closing the dialog. */
  onPrevious?: () => void;
  onNext?: () => void;
  position?: { index: number; total: number };
  /** WhatsApp chat with a message about this product already written. */
  whatsappHref?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ignoreNextCloseEvent = useRef(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!product.id) return;
    const key = `placa-product-view:${product.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // If storage is unavailable, count this dialog opening.
    }
    void fetch(`/api/catalog/products/${product.id}/view`, { method: "POST", keepalive: true });
  }, [product.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const closeNativeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      ignoreNextCloseEvent.current = true;
      dialog.close();
    }
  };

  const closeDialog = () => {
    closeNativeDialog();
    onClose();
  };

  const addProductToCart = () => {
    closeNativeDialog();
    onAddToCart();
  };

  const t = (key: string) => translate(locale, key);
  const canBrowse = Boolean(onPrevious && onNext && position && position.total > 1);
  const atStockLimit = product.quantity !== null && quantityInCart >= product.quantity;
  const addDisabled = !product.available || atStockLimit;
  const addLabel = !product.available
    ? t("featured.unavailable")
    : atStockLimit
      ? t("cart.maxReached")
      : t("cart.add");
  const imageAreaHeight = "min(620px, calc(100vh - 80px))";
  const styles = {
    dialog: {
      position: "fixed" as const,
      top: "50%",
      left: "50%",
      right: "auto",
      bottom: "auto",
      width: "min(1000px, calc(100% - 36px))",
      maxWidth: "none",
      maxHeight: "min(760px, calc(100% - 36px))",
      padding: 0,
      border: "2px solid #5a3220",
      borderRadius: 18,
      background: "var(--paper)",
      color: "var(--ink)",
      boxShadow: "6px 6px 0 #e0a526, 0 28px 100px #0005",
      transform: "translate(-50%, -50%)",
      fontFamily: '"DM Sans Variable", "DM Sans", system-ui, sans-serif',
    },
    layout: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      minHeight: 530,
    },
    // Same height for every product, so the dialog does not jump while browsing.
    image: {
      position: "relative" as const,
      width: "100%",
      height: imageAreaHeight,
      minHeight: 0,
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      background: product.imageUrl ? "#ebe0c9" : "linear-gradient(135deg, #b8432a, #7a2230)",
    },
    photo: {
      display: "block",
      width: "100%",
      height: "100%",
      minHeight: 0,
      maxHeight: "none",
      objectFit: "contain" as const,
      padding: "68px 76px",
      boxSizing: "border-box" as const,
    },
    copy: { padding: "62px 48px 42px", overflow: "auto", maxHeight: imageAreaHeight, boxSizing: "border-box" as const },
    arrow: {
      position: "absolute" as const,
      top: "50%",
      zIndex: 2,
      width: 46,
      height: 46,
      marginTop: -23,
      display: "grid",
      placeItems: "center",
      padding: 0,
      border: "2px solid #5a3220",
      borderRadius: "50%",
      background: "#fbf7eee6",
      color: "var(--ink)",
      boxShadow: "0 6px 18px #2b2a2626",
      cursor: "pointer",
    },
    position: {
      position: "absolute" as const,
      bottom: 16,
      left: "50%",
      zIndex: 1,
      transform: "translateX(-50%)",
      padding: "6px 12px",
      borderRadius: 999,
      background: "#3d2216d9",
      color: "#fff",
      font: '700 11px/1 "DM Sans Variable", "DM Sans", system-ui, sans-serif',
      letterSpacing: ".06em",
      whiteSpace: "nowrap" as const,
    },
  } as const;
  const details = [
    [t("product.category"), product.path],
    [t("product.size"), product.size],
    product.referenceCode && [t("product.reference"), product.referenceCode],
    product.brand && [t("product.brand"), product.brand],
    product.model && [t("product.model"), product.model],
    product.material && [t("product.material"), product.material],
  ].filter((item): item is [string, string] => Boolean(item));

  return (
    <dialog
      className="product-dialog"
      style={styles.dialog}
      ref={dialogRef}
      aria-labelledby="product-dialog-title"
      onKeyDown={(event) => {
        if (!canBrowse) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onPrevious?.();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onNext?.();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
      onClose={() => {
        if (ignoreNextCloseEvent.current) {
          ignoreNextCloseEvent.current = false;
          return;
        }
        onClose();
      }}
    >
      <button className="product-dialog-close" type="button" onClick={closeDialog} aria-label={t("product.close")} style={{ position: "absolute", zIndex: 2, top: 12, right: 12, width: 42, height: 42, border: "2px solid #5a3220", borderRadius: "50%", background: "var(--paper)", color: "#3d2216", fontSize: 28, lineHeight: 1, cursor: "pointer" }}>
        ×
      </button>
      <div className="product-dialog-layout" style={styles.layout}>
        <div
          className={`product-dialog-image tone-${product.tone}${product.imageUrl ? " has-image" : ""}`}
          style={styles.image}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            const end = event.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (!canBrowse || start === null || end === undefined || Math.abs(end - start) < 50) return;
            if (end < start) onNext?.();
            else onPrevious?.();
          }}
        >
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} style={styles.photo} />
          ) : (
            <span aria-hidden="true">{product.name.charAt(0)}</span>
          )}
          <span className={`product-status ${!product.available ? "is-unavailable" : "is-available"}`} style={{ position: "absolute", top: 18, left: 18, zIndex: 1, padding: "8px 12px", borderRadius: 999, background: !product.available ? "#f6dcd3" : "#f5d58a", color: !product.available ? "#7a2230" : "#5a3220", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
            {t(product.available ? "featured.available" : "featured.unavailable")}
          </span>
          {canBrowse && position && (
            <>
              <button className="product-dialog-arrow is-previous" type="button" onClick={onPrevious} aria-label={t("product.previous")} style={{ ...styles.arrow, left: 14 }}>
                <span style={{ display: "grid", transform: "rotate(180deg)" }}><Icon name="arrow" size={20} /></span>
              </button>
              <button className="product-dialog-arrow is-next" type="button" onClick={onNext} aria-label={t("product.next")} style={{ ...styles.arrow, right: 14 }}>
                <Icon name="arrow" size={20} />
              </button>
              <span className="product-dialog-position" aria-live="polite" style={styles.position}>
                {t("product.position").replace("{n}", String(position.index + 1)).replace("{total}", String(position.total))}
              </span>
            </>
          )}
        </div>
        <div className="product-dialog-copy" style={styles.copy}>
          <small style={{ color: "var(--muted)", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>{product.path}</small>
          <h2 id="product-dialog-title" style={{ margin: "10px 0 12px", font: "400 clamp(26px, 3vw, 36px)/1.15 var(--ff-display)", fontSynthesis: "none", letterSpacing: 0, color: "#3d2216", overflowWrap: "break-word" }}>{product.name}</h2>
          <p className="product-dialog-price" style={{ margin: "0 0 28px", color: "#a63a24", fontSize: 20, fontWeight: 700 }}>{product.price}</p>
          <h3 style={{ margin: "22px 0 8px", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>{t("product.description")}</h3>
          <p className="product-dialog-description" style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-line" }}>{product.description.trim() || t("product.noDescription")}</p>
          <h3 style={{ margin: "22px 0 8px", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>{t("product.information")}</h3>
          <dl className="product-details-list" style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
            {details.map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 18, padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}><dt style={{ color: "var(--muted)" }}>{label}</dt><dd style={{ margin: 0, textAlign: "right" }}>{value}</dd></div>
            ))}
          </dl>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 24 }}>
            <button className="product-dialog-contact" type="button" onClick={addProductToCart} disabled={addDisabled} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 48, padding: "0 20px", border: 0, borderRadius: 10, background: addDisabled ? "#8a8577" : "#b8432a", boxShadow: addDisabled ? "none" : "3px 3px 0 #5a3220", color: "white", font: "600 13px 'DM Sans Variable', sans-serif", cursor: addDisabled ? "not-allowed" : "pointer", opacity: addDisabled ? 0.75 : 1 }}>{addLabel}</button>
            {whatsappHref && (
              <a className="product-dialog-whatsapp" href={whatsappHref} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 48, padding: "0 18px", border: "2px solid #5a3220", borderRadius: 10, color: "#3d2216", font: "600 13px 'DM Sans Variable', sans-serif", textDecoration: "none" }}>
                <Icon name="chat" size={17} />
                {t("product.askWhatsapp")}
              </a>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
