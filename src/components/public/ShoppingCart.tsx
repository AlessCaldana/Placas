"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { PublicCatalogProduct } from "@/lib/services/products";
import { whatsappLink } from "@/lib/site";
import { translate, type Locale } from "@/messages";
import { canChangeCartQuantity } from "@/lib/cart";
import type { ShippingCountry } from "@/lib/payments/shipping";

export type CartItem = { product: PublicCatalogProduct; quantity: number };

export function ShoppingCart({
  items,
  locale,
  whatsappNumber,
  shippingCountries,
  paymentsEnabled,
  onChangeQuantity,
  onRemove,
}: {
  items: CartItem[];
  locale: Locale;
  whatsappNumber: string;
  shippingCountries: ShippingCountry[];
  paymentsEnabled: boolean;
  onChangeQuantity: (productId: string, change: number) => void;
  onRemove: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<ShippingCountry | "">(
    shippingCountries.includes("IT") ? "IT" : shippingCountries[0] ?? "",
  );
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const canPay = paymentsEnabled && shippingCountries.length > 0;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const t = (key: string) => translate(locale, key);
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotalCents = items.reduce((total, item) => total + item.product.priceCents * item.quantity, 0);

  const changeQuantity = (productId: string, change: number) => {
    const item = items.find((current) => current.product.id === productId);
    if (item && items.length === 1 && item.quantity + change <= 0 && dialogRef.current?.open) {
      dialogRef.current.close();
    }
    onChangeQuantity(productId, change);
  };

  const removeItem = (productId: string) => {
    if (items.length === 1 && dialogRef.current?.open) dialogRef.current.close();
    onRemove(productId);
  };

  const pay = async () => {
    if (!country || paying) return;
    setPaying(true);
    setPayError("");
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        country,
        locale,
      }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (response?.ok && result?.url) {
      window.location.assign(result.url);
      return;
    }
    const errorKey: Record<string, string> = {
      insufficient_stock: "checkout.errorStock",
      product_unavailable: "checkout.errorUnavailable",
      shipping_unavailable: "checkout.errorShipping",
      maintenance: "maintenance.apiError",
    };
    setPayError(t(errorKey[result?.error ?? ""] ?? "checkout.errorGeneric"));
    setPaying(false);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  if (!items.length) return null;

  const message = [
    t("cart.messageIntro"),
    ...items.map(({ product, quantity }) =>
      `• ${product.name} — ${t("product.reference")}: ${product.referenceCode || t("cart.referenceUnavailable")} — ${t("cart.quantity")}: ${quantity}`,
    ),
  ].join("\n");

  return (
    <>
      <button className="cart-floating-button" type="button" onClick={() => setOpen(true)} aria-label={`${t("cart.open")}: ${itemCount}`}>
        <Icon name="bag" size={21} />
        <span>{t("cart.open")}</span>
        <b>{itemCount}</b>
      </button>
      <dialog
        className="cart-dialog"
        ref={dialogRef}
        aria-labelledby="cart-dialog-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="cart-dialog-header">
          <div><small>{t("cart.label")}</small><h2 id="cart-dialog-title">{t("cart.title")}</h2></div>
          <button type="button" className="product-dialog-close" onClick={() => setOpen(false)} aria-label={t("product.close")}>×</button>
        </div>
        <div className="cart-items">
          {items.map(({ product, quantity }) => (
            <article className="cart-item" key={product.id}>
              {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className={`cart-item-placeholder tone-${product.tone}`} aria-hidden="true">{product.name.charAt(0)}</span>}
              <div className="cart-item-copy">
                <b>{product.name}</b>
                <small>{t("product.reference")}: {product.referenceCode || t("cart.referenceUnavailable")}</small>
                <strong>{product.price}</strong>
              </div>
              <div className="cart-item-actions">
                <div className="cart-quantity" aria-label={t("cart.quantity")}>
                  <button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label={t("cart.decrease")}>−</button>
                  <span>{quantity}</span>
                  <button type="button" onClick={() => changeQuantity(product.id, 1)} aria-label={t("cart.increase")} disabled={!canChangeCartQuantity(product.quantity, quantity, 1)}>+</button>
                </div>
                <button className="cart-remove" type="button" onClick={() => removeItem(product.id)}>{t("cart.remove")}</button>
              </div>
            </article>
          ))}
        </div>
        <div className="cart-checkout">
          <div className="cart-summary">
            <span>{t("cart.subtotal")} · {itemCount} {t(itemCount === 1 ? "cart.item" : "cart.items")}</span>
            <strong>{formatEuro(subtotalCents, locale)}</strong>
          </div>
          {canPay && (
            <>
              <label className="cart-country">
                <span>{t("checkout.country")}</span>
                <span className="cart-select">
                  <Icon name="globe" size={17} />
                  <select value={country} onChange={(event) => setCountry(event.currentTarget.value as ShippingCountry)} disabled={paying}>
                    {shippingCountries.map((code) => (
                      <option key={code} value={code}>{countryName(code, locale)}</option>
                    ))}
                  </select>
                </span>
              </label>
              <p className="cart-checkout-note">{t("checkout.note")}</p>
              {payError && <p className="cart-checkout-error" role="alert">{payError}</p>}
              <button className="cart-pay" type="button" onClick={pay} disabled={paying || !country} aria-busy={paying}>
                {paying ? <span className="cart-spinner" aria-hidden="true" /> : <Icon name="card" size={19} />}
                <span>{paying ? t("checkout.redirecting") : t("checkout.pay")}</span>
                {!paying && <Icon name="arrow" size={17} />}
              </button>
              <p className="cart-secure"><Icon name="lock" size={13} />{t("checkout.secure")}</p>
              <div className="cart-or"><span>{t("checkout.or")}</span></div>
            </>
          )}
          <a className={canPay ? "cart-whatsapp is-secondary" : "cart-whatsapp"} href={whatsappLink(message, whatsappNumber)} target="_blank" rel="noreferrer">
            <Icon name="chat" size={18} />{t("cart.checkout")}
          </a>
        </div>
      </dialog>
    </>
  );
}

function countryName(code: ShippingCountry, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function formatEuro(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}
