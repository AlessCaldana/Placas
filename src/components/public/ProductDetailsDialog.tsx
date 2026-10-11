"use client";

import { useEffect, useRef } from "react";
import type { PublicCatalogProduct } from "@/lib/services/products";
import { translate, type Locale } from "@/messages";

export function ProductDetailsDialog({
  product,
  locale,
  quantityInCart,
  onClose,
  onAddToCart,
}: {
  product: PublicCatalogProduct;
  locale: Locale;
  quantityInCart: number;
  onClose: () => void;
  onAddToCart: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ignoreNextCloseEvent = useRef(false);

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
  const atStockLimit = product.quantity !== null && quantityInCart >= product.quantity;
  const addDisabled = !product.available || atStockLimit;
  const addLabel = !product.available
    ? t("featured.unavailable")
    : atStockLimit
      ? t("cart.maxReached")
      : t("cart.add");
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
      border: "1px solid var(--line)",
      background: "var(--paper)",
      color: "var(--ink)",
      boxShadow: "0 28px 100px #0005",
      transform: "translate(-50%, -50%)",
      fontFamily: '"DM Sans Variable", "DM Sans", system-ui, sans-serif',
    },
    layout: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      minHeight: 530,
    },
    image: {
      position: "relative" as const,
      width: "100%",
      minHeight: 530,
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      background: product.imageUrl ? "#ebe0c9" : "linear-gradient(135deg, #755b48, #263c39)",
    },
    photo: {
      display: "block",
      width: "100%",
      height: "100%",
      minHeight: 0,
      maxHeight: 650,
      objectFit: "contain" as const,
      padding: 68,
      boxSizing: "border-box" as const,
    },
    copy: { padding: "62px 48px 42px", overflow: "auto" },
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
      <button className="product-dialog-close" type="button" onClick={closeDialog} aria-label={t("product.close")} style={{ position: "absolute", zIndex: 2, top: 12, right: 12, width: 42, height: 42, border: "1px solid var(--line)", borderRadius: "50%", background: "var(--paper)", color: "var(--ink)", fontSize: 28, lineHeight: 1, cursor: "pointer" }}>
        ×
      </button>
      <div className="product-dialog-layout" style={styles.layout}>
        <div className={`product-dialog-image tone-${product.tone}${product.imageUrl ? " has-image" : ""}`} style={styles.image}>
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} style={styles.photo} />
          ) : (
            <span aria-hidden="true">{product.name.charAt(0)}</span>
          )}
          <span className={`product-status ${!product.available ? "is-unavailable" : "is-available"}`} style={{ position: "absolute", top: 18, left: 18, zIndex: 1, padding: "8px 12px", borderRadius: 999, background: !product.available ? "#f6e1d5" : "#dcebe7", color: !product.available ? "#a9471c" : "#2f6f6a", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
            {t(product.available ? "featured.available" : "featured.unavailable")}
          </span>
        </div>
        <div className="product-dialog-copy" style={styles.copy}>
          <small style={{ color: "var(--muted)", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>{product.path}</small>
          <h2 id="product-dialog-title" style={{ margin: "10px 0", font: "400 clamp(34px, 4vw, 48px)/1.02 'Instrument Serif', Georgia, serif", letterSpacing: "-.035em" }}>{product.name}</h2>
          <p className="product-dialog-price" style={{ margin: "0 0 28px", fontSize: 19, fontWeight: 700 }}>{product.price}</p>
          <h3 style={{ margin: "22px 0 8px", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>{t("product.description")}</h3>
          <p className="product-dialog-description" style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-line" }}>{product.description.trim() || t("product.noDescription")}</p>
          <h3 style={{ margin: "22px 0 8px", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>{t("product.information")}</h3>
          <dl className="product-details-list" style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
            {details.map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 18, padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}><dt style={{ color: "var(--muted)" }}>{label}</dt><dd style={{ margin: 0, textAlign: "right" }}>{value}</dd></div>
            ))}
          </dl>
          <button className="product-dialog-contact" type="button" onClick={addProductToCart} disabled={addDisabled} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 48, marginTop: 24, padding: "0 20px", border: 0, background: addDisabled ? "#a89f8c" : "var(--ink)", color: "white", font: "600 13px 'DM Sans Variable', sans-serif", cursor: addDisabled ? "not-allowed" : "pointer", opacity: addDisabled ? 0.75 : 1 }}>{addLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
