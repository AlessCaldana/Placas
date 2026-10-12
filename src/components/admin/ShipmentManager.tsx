"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { ShipmentOrder } from "@/lib/services/shipments";
import { CARRIERS, type CarrierId } from "@/lib/shipping-carriers";
import { customerWhatsappLink } from "@/lib/whatsapp";
import { translate } from "@/messages";

type Tab = "toShip" | "shipped";
type ShipmentPayload = { carrier: CarrierId; trackingNumber: string; trackingUrl?: string };
type FieldErrors = Partial<Record<"carrier" | "trackingNumber" | "trackingUrl", string>>;

const TABS: Tab[] = ["toShip", "shipped"];
// Same rules as src/lib/validators/shipment.ts, checked here to warn early.
const TRACKING_NUMBER = /^[A-Za-z0-9 -]{4,64}$/;
const HAS_ALPHANUMERIC = /[A-Za-z0-9]/;
const MAX_TRACKING_URL_LENGTH = 500;
// A fixed time zone keeps server and browser rendering the same date.
const DATE_TIME_ZONE = "Europe/Rome";

// Public site address used in the status link sent to customers.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
const PLACEHOLDER = /\{(\w+)\}/g;

const cardId = (orderId: string) => `shipment-${orderId}`;
const tabId = (tab: Tab) => `shipments-tab-${tab}`;

function timeOf(value: string | null, fallback: number): number {
  return value ? new Date(value).getTime() : fallback;
}

/** Oldest payment first, as the server sends them. */
function sortToShip(orders: ShipmentOrder[]): ShipmentOrder[] {
  return [...orders].sort(
    (a, b) => timeOf(a.paidAt, Number.MAX_SAFE_INTEGER) - timeOf(b.paidAt, Number.MAX_SAFE_INTEGER),
  );
}

/** Latest shipment first. */
function sortShipped(orders: ShipmentOrder[]): ShipmentOrder[] {
  return [...orders].sort((a, b) => timeOf(b.shippedAt, 0) - timeOf(a.shippedAt, 0));
}

function normalizeTrackingNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isHttpsUrl(value: string): boolean {
  if (!value || value.length > MAX_TRACKING_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const subscribeToNothing = () => () => {};

/** Site address: the configured one, or the current origin once in the browser. */
function useSiteOrigin(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    () => SITE_URL || window.location.origin,
    () => SITE_URL,
  );
}

/**
 * Message telling the customer the order left, in the language they bought in.
 * Lines whose data is missing (tracking link, status page) are left out.
 */
function shippedMessage(order: ShipmentOrder, shopName: string, origin: string): string {
  const text = (key: string) => translate(order.locale, key);
  const firstName = order.customerName.trim().split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    name: firstName,
    order: order.orderNumber,
    carrier: order.carrier !== "other" && order.carrierName ? order.carrierName : text("whatsapp.carrierFallback"),
    code: order.trackingNumber ?? "",
    trackingUrl: order.trackingUrl ?? "",
    statusUrl: origin ? `${origin}/traccia-ordine?ordine=${encodeURIComponent(order.orderNumber)}` : "",
    shop: shopName,
  };
  return text(firstName ? "whatsapp.shippedMessage" : "whatsapp.shippedMessageNoName")
    .split("\n")
    .filter((line) => [...line.matchAll(PLACEHOLDER)].every(([, key]) => key === "name" || values[key]))
    .map((line) => line.replace(PLACEHOLDER, (match, key: string) => values[key] ?? match))
    .join("\n");
}

function isCarrierId(value: string | null): value is CarrierId {
  return CARRIERS.some((carrier) => carrier.id === value);
}

/** The clicked button may disappear after an action, so focus moves to a card. */
function focusCard(orderId: string | undefined, fallbackSelector: string) {
  requestAnimationFrame(() => {
    const target = orderId ? document.getElementById(cardId(orderId)) : null;
    (target ?? document.querySelector<HTMLElement>(fallbackSelector))?.focus();
  });
}

export function ShipmentManager({
  initialToShip,
  initialShipped,
  shopName,
}: {
  initialToShip: ShipmentOrder[];
  initialShipped: ShipmentOrder[];
  /** Shop name signed at the end of the customer message. */
  shopName: string;
}) {
  const { t, locale } = useLocale();
  const [toShip, setToShip] = useState(initialToShip);
  const [shipped, setShipped] = useState(initialShipped);
  const [tab, setTab] = useState<Tab>("toShip");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // Order just marked as shipped, offered for a WhatsApp notice under the confirmation.
  const [justShipped, setJustShipped] = useState<ShipmentOrder | null>(null);
  const [orderToUndo, setOrderToUndo] = useState<ShipmentOrder | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState("");
  const undoDialog = useRef<HTMLDialogElement>(null);

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DATE_TIME_ZONE,
  });
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const money = (cents: number) => currency.format(cents / 100);
  const fill = (key: string, values: Record<string, string>) =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
  const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");
  const carrierLabel = (order: ShipmentOrder) =>
    order.carrier === "other" ? t("admin.shipments.carrierOther") : order.carrierName ?? "—";
  const orders = tab === "toShip" ? toShip : shipped;

  function removeEverywhere(orderId: string) {
    setToShip((current) => current.filter((item) => item.id !== orderId));
    setShipped((current) => current.filter((item) => item.id !== orderId));
  }

  function selectTab(next: Tab, moveFocus = false) {
    setTab(next);
    setEditingId(null);
    if (moveFocus) requestAnimationFrame(() => document.getElementById(tabId(next))?.focus());
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.indexOf(tab);
    let next: Tab | null = null;
    if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
    else if (event.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (event.key === "Home") next = TABS[0];
    else if (event.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    selectTab(next, true);
  }

  /** Saves the shipment; returns the message to show in the form, or null when done. */
  async function saveShipment(order: ShipmentOrder, payload: ShipmentPayload): Promise<string | null> {
    if (busyId) return null;
    const wasShipped = order.shippedAt !== null;
    setBusyId(order.id);
    setNotice("");
    setJustShipped(null);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/shipment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 404) {
        removeEverywhere(order.id);
        setEditingId(null);
        setError(t("admin.shipments.errorNotFound"));
        focusCard(undefined, ".shipment-panel");
        return null;
      }
      if (response.status === 400) return t("admin.shipments.errorInvalid");
      if (response.status === 503) return t("admin.database.unavailable");
      if (!response.ok) return t("admin.shipments.errorSave");
      const saved = (await response.json()) as ShipmentOrder;
      const index = toShip.findIndex((item) => item.id === saved.id);
      const remaining = toShip.filter((item) => item.id !== saved.id);
      setToShip(remaining);
      setShipped((current) => sortShipped([saved, ...current.filter((item) => item.id !== saved.id)]));
      setEditingId(null);
      setJustShipped(wasShipped ? null : saved);
      setNotice(
        fill(wasShipped ? "admin.shipments.updatedDone" : "admin.shipments.shippedDone", {
          number: saved.orderNumber,
        }),
      );
      if (wasShipped) {
        focusCard(saved.id, ".shipment-panel");
      } else {
        focusCard(remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.id, ".shipment-empty");
      }
      return null;
    } catch {
      return t("admin.shipments.errorSave");
    } finally {
      setBusyId(null);
    }
  }

  function askUndo(order: ShipmentOrder) {
    setOrderToUndo(order);
    setUndoError("");
    undoDialog.current?.showModal();
  }

  async function confirmUndo() {
    if (!orderToUndo || undoing) return;
    const order = orderToUndo;
    setUndoing(true);
    setUndoError("");
    setNotice("");
    setJustShipped(null);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/shipment`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        setUndoError(t(response.status === 503 ? "admin.database.unavailable" : "admin.shipments.errorUndo"));
        return;
      }
      const index = shipped.findIndex((item) => item.id === order.id);
      const remaining = shipped.filter((item) => item.id !== order.id);
      setShipped(remaining);
      if (response.ok) {
        const restored = (await response.json()) as ShipmentOrder;
        setToShip((current) => sortToShip([...current.filter((item) => item.id !== restored.id), restored]));
        setNotice(fill("admin.shipments.undoneDone", { number: restored.orderNumber }));
      } else {
        // 404: the order is gone (or no longer paid), so the list simply catches up.
        setToShip((current) => current.filter((item) => item.id !== order.id));
        setError(t("admin.shipments.errorNotFound"));
      }
      setEditingId(null);
      undoDialog.current?.close();
      focusCard(remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.id, ".shipment-empty");
    } catch {
      setUndoError(t("admin.shipments.errorUndo"));
    } finally {
      setUndoing(false);
    }
  }

  return (
    <>
      <div className="shipment-tabs" role="tablist" aria-label={t("admin.shipments.tabs")}>
        {TABS.map((item) => {
          const selected = tab === item;
          const count = item === "toShip" ? toShip.length : shipped.length;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              id={tabId(item)}
              aria-selected={selected}
              aria-controls="shipments-panel"
              tabIndex={selected ? 0 : -1}
              className={selected ? "shipment-tab active" : "shipment-tab"}
              onClick={() => selectTab(item)}
              onKeyDown={onTabKeyDown}
            >
              {fill(item === "toShip" ? "admin.shipments.tabToShip" : "admin.shipments.tabShipped", {
                n: String(count),
              })}
            </button>
          );
        })}
      </div>

      <p className="review-admin-notice" role="status">{notice}</p>
      {justShipped && (
        <div className="shipment-callout">
          <p>{t("admin.shipments.notifyPrompt")}</p>
          <CustomerNotify order={justShipped} shopName={shopName} />
        </div>
      )}
      {error && <p className="field-error review-admin-error" role="alert">{error}</p>}

      <div
        className="shipment-panel"
        id="shipments-panel"
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        tabIndex={-1}
      >
        {orders.length === 0 ? (
          <section className="admin-card">
            <p className="shipment-empty" tabIndex={-1}>
              {t(tab === "toShip" ? "admin.shipments.emptyToShip" : "admin.shipments.emptyShipped")}
            </p>
          </section>
        ) : (
          <ul className="shipment-list">
            {orders.map((order) => {
              const busy = busyId === order.id;
              const editing = editingId === order.id;
              return (
                <li key={order.id}>
                  <OrderCard order={order} busy={busy} formatDate={formatDate} money={money} fill={fill}>
                    {tab === "toShip" ? (
                      <ShipmentForm
                        order={order}
                        busy={busy}
                        locked={Boolean(busyId)}
                        onSave={(payload) => saveShipment(order, payload)}
                      />
                    ) : editing ? (
                      <ShipmentForm
                        order={order}
                        busy={busy}
                        locked={Boolean(busyId)}
                        editing
                        onSave={(payload) => saveShipment(order, payload)}
                        onCancel={() => {
                          setEditingId(null);
                          focusCard(order.id, ".shipment-panel");
                        }}
                      />
                    ) : (
                      <div className="shipment-tracking">
                        <dl className="shipment-meta">
                          <div>
                            <dt>{t("admin.shipments.carrier")}</dt>
                            <dd>{carrierLabel(order)}</dd>
                          </div>
                          <div>
                            <dt>{t("admin.shipments.trackingNumber")}</dt>
                            <dd className="shipment-code">{order.trackingNumber ?? "—"}</dd>
                          </div>
                          <div>
                            <dt>{t("admin.shipments.shippedDate")}</dt>
                            <dd>
                              {order.shippedAt ? (
                                <time dateTime={order.shippedAt}>{formatDate(order.shippedAt)}</time>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                        </dl>
                        <div className="shipment-actions">
                          <CustomerNotify order={order} shopName={shopName} />
                          {order.trackingUrl && (
                            <a
                              className="btn btn-line"
                              href={order.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("admin.shipments.openTracking")}
                              <span className="sr-only"> {t("admin.shipments.newTab")}</span>
                              <Icon name="arrow" size={17} />
                            </a>
                          )}
                          <button
                            type="button"
                            className="btn btn-line"
                            disabled={busy || Boolean(busyId)}
                            onClick={() => setEditingId(order.id)}
                          >
                            {t("admin.shipments.edit")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={busy || Boolean(busyId)}
                            onClick={() => askUndo(order)}
                          >
                            {t("admin.shipments.undo")}
                          </button>
                        </div>
                      </div>
                    )}
                  </OrderCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <dialog
        ref={undoDialog}
        className="admin-dialog"
        aria-labelledby="undo-shipment-title"
        aria-describedby="undo-shipment-warning"
        onClose={() => setOrderToUndo(null)}
        onCancel={(event) => {
          if (undoing) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !undoing) event.currentTarget.close();
        }}
      >
        <h2 id="undo-shipment-title">{t("admin.shipments.undoTitle")}</h2>
        <p id="undo-shipment-warning">
          {orderToUndo ? fill("admin.shipments.undoWarning", { number: orderToUndo.orderNumber }) : ""}
        </p>
        {undoError && <p className="field-error" role="alert">{undoError}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-line"
            onClick={() => undoDialog.current?.close()}
            disabled={undoing}
          >
            {t("admin.shipments.keepShipment")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void confirmUndo()}
            disabled={undoing}
            aria-busy={undoing}
          >
            {t(undoing ? "admin.shipments.undoing" : "admin.shipments.confirmUndo")}
          </button>
        </div>
      </dialog>
    </>
  );
}

function OrderCard({
  order,
  busy,
  formatDate,
  money,
  fill,
  children,
}: {
  order: ShipmentOrder;
  busy: boolean;
  formatDate: (value: string | null) => string;
  money: (cents: number) => string;
  fill: (key: string, values: Record<string, string>) => string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const titleId = `${cardId(order.id)}-title`;
  const addressId = `${cardId(order.id)}-address`;
  const label = [order.customerName, order.address].filter(Boolean).join("\n");

  return (
    <article
      className="admin-card shipment-card"
      id={cardId(order.id)}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-busy={busy}
    >
      <header className="shipment-card-head">
        <div>
          <h2 className="shipment-number" id={titleId}>{order.orderNumber || "—"}</h2>
          <p className="shipment-paid">
            {order.paidAt ? (
              <time dateTime={order.paidAt}>{fill("admin.shipments.paidOn", { date: formatDate(order.paidAt) })}</time>
            ) : (
              t("admin.shipments.paidUnknown")
            )}
          </p>
        </div>
        <div className="shipment-badges">
          {order.status === "NEEDS_REVIEW" && (
            <span className="status pending">{t("admin.shipments.needsReview")}</span>
          )}
          {order.shippedAt && <span className="status published">{t("admin.shipments.shipped")}</span>}
        </div>
      </header>

      <div className="shipment-card-body">
        <section className="shipment-address" aria-labelledby={addressId}>
          <h3 id={addressId}>{t("admin.shipments.address")}</h3>
          {order.address ? (
            <>
              <address>
                {order.customerName && <strong>{order.customerName}</strong>}
                <span>{order.address}</span>
              </address>
              <CopyButton text={label} label={t("admin.shipments.copyAddress")} />
            </>
          ) : (
            <p className="shipment-missing">{t("admin.shipments.noAddress")}</p>
          )}
        </section>

        <div className="shipment-details">
          <dl className="shipment-meta">
            <div>
              <dt>{t("admin.shipments.customer")}</dt>
              <dd>{order.customerName || "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.shipments.email")}</dt>
              <dd>
                {order.customerEmail ? (
                  <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>{t("admin.shipments.phone")}</dt>
              <dd>
                {order.customerPhone ? (
                  <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>{t("admin.shipments.received")}</dt>
              <dd>
                <b>{money(order.productsCents + order.shippingCents)}</b>
                <small className="shipment-breakdown">
                  {fill("admin.shipments.receivedDetail", {
                    products: money(order.productsCents),
                    shipping: money(order.shippingCents),
                  })}
                </small>
              </dd>
            </div>
          </dl>
          <div className="shipment-items">
            <h3>{t("admin.shipments.products")}</h3>
            <ul>
              {order.items.map((item, index) => (
                <li key={`${item.referenceCode}-${index}`}>
                  <span className="shipment-qty">{item.quantity} ×</span>
                  <span>
                    {item.name}
                    {item.referenceCode && (
                      <small>{fill("admin.shipments.reference", { code: item.referenceCode })}</small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {children}
    </article>
  );
}

/** WhatsApp link with the shipping notice, or an email fallback when there is no usable phone. */
function CustomerNotify({ order, shopName }: { order: ShipmentOrder; shopName: string }) {
  const { t } = useLocale();
  const hintId = useId();
  const origin = useSiteOrigin();
  const message = shippedMessage(order, shopName, origin);
  const whatsapp = customerWhatsappLink(order.customerPhone, message);
  const forOrder = t("admin.shipments.forOrder").replace("{number}", order.orderNumber);

  if (whatsapp) {
    return (
      <a className="btn btn-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
        <Icon name="chat" size={17} />
        {t("admin.shipments.notifyWhatsapp")}
        <span className="sr-only"> {forOrder} {t("admin.shipments.newTab")}</span>
      </a>
    );
  }

  const subject = translate(order.locale, "whatsapp.shippedSubject").replace("{order}", order.orderNumber);
  const mailto = order.customerEmail
    ? `mailto:${order.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        message.replace(/\n/g, "\r\n"),
      )}`
    : null;

  return (
    <div className="shipment-notify">
      <button type="button" className="btn btn-whatsapp" disabled aria-describedby={hintId}>
        <Icon name="chat" size={17} />
        {t("admin.shipments.notifyWhatsapp")}
      </button>
      <p className="shipment-notify-help">
        <span id={hintId}>{t("admin.shipments.noPhone")}</span>
        {mailto && (
          <a href={mailto}>
            {t("admin.shipments.notifyEmail")}
            <span className="sr-only"> {forOrder}</span>
          </a>
        )}
      </p>
    </div>
  );
}

function ShipmentForm({
  order,
  busy,
  locked,
  editing = false,
  onSave,
  onCancel,
}: {
  order: ShipmentOrder;
  /** This order is being saved. */
  busy: boolean;
  /** Another save is in progress: wait before sending a new one. */
  locked: boolean;
  editing?: boolean;
  onSave: (payload: ShipmentPayload) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const [carrier, setCarrier] = useState<CarrierId | "">(isCarrierId(order.carrier) ? order.carrier : "");
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(order.carrier === "other" ? order.trackingUrl ?? "" : "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const carrierRef = useRef<HTMLSelectElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) carrierRef.current?.focus();
  }, [editing]);

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!carrier) found.carrier = t("admin.shipments.errorCarrier");
    const number = normalizeTrackingNumber(trackingNumber);
    if (!TRACKING_NUMBER.test(number) || !HAS_ALPHANUMERIC.test(number)) {
      found.trackingNumber = t("admin.shipments.errorTrackingNumber");
    }
    if (carrier === "other" && !isHttpsUrl(trackingUrl.trim())) {
      found.trackingUrl = t("admin.shipments.errorTrackingUrl");
    }
    return found;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const found = validate();
    setErrors(found);
    setFormError("");
    if (found.carrier) return carrierRef.current?.focus();
    if (found.trackingNumber) return numberRef.current?.focus();
    if (found.trackingUrl) return urlRef.current?.focus();
    if (!carrier) return;
    const payload: ShipmentPayload = {
      carrier,
      trackingNumber: normalizeTrackingNumber(trackingNumber),
      ...(carrier === "other" ? { trackingUrl: trackingUrl.trim() } : {}),
    };
    const message = await onSave(payload);
    if (message) setFormError(message);
  }

  const errorId = (field: keyof FieldErrors) => `${id}-${field}-error`;

  return (
    <form className="shipment-form" onSubmit={(event) => void submit(event)} noValidate aria-busy={busy}>
      <div className="shipment-form-fields">
        <label>
          {t("admin.shipments.carrier")}
          <select
            ref={carrierRef}
            value={carrier}
            required
            aria-invalid={Boolean(errors.carrier)}
            aria-describedby={errors.carrier ? errorId("carrier") : undefined}
            onChange={(event) => {
              setCarrier(isCarrierId(event.target.value) ? event.target.value : "");
              setErrors((current) => ({ ...current, carrier: undefined, trackingUrl: undefined }));
            }}
          >
            <option value="">{t("admin.shipments.chooseCarrier")}</option>
            {CARRIERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id === "other" ? t("admin.shipments.carrierOther") : item.name}
              </option>
            ))}
          </select>
          {errors.carrier && <span className="shipment-field-error" id={errorId("carrier")}>{errors.carrier}</span>}
        </label>
        <label>
          {t("admin.shipments.trackingNumber")}
          <input
            ref={numberRef}
            type="text"
            value={trackingNumber}
            required
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={Boolean(errors.trackingNumber)}
            aria-describedby={errors.trackingNumber ? errorId("trackingNumber") : undefined}
            onChange={(event) => {
              setTrackingNumber(event.target.value);
              setErrors((current) => ({ ...current, trackingNumber: undefined }));
            }}
          />
          {errors.trackingNumber && (
            <span className="shipment-field-error" id={errorId("trackingNumber")}>{errors.trackingNumber}</span>
          )}
        </label>
        {carrier === "other" && (
          <label className="shipment-url-field">
            {t("admin.shipments.trackingUrl")}
            <input
              ref={urlRef}
              type="url"
              inputMode="url"
              value={trackingUrl}
              required
              maxLength={MAX_TRACKING_URL_LENGTH}
              placeholder="https://"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.trackingUrl)}
              aria-describedby={`${id}-url-hint${errors.trackingUrl ? ` ${errorId("trackingUrl")}` : ""}`}
              onChange={(event) => {
                setTrackingUrl(event.target.value);
                setErrors((current) => ({ ...current, trackingUrl: undefined }));
              }}
            />
            <span className="shipment-hint" id={`${id}-url-hint`}>{t("admin.shipments.trackingUrlHint")}</span>
            {errors.trackingUrl && (
              <span className="shipment-field-error" id={errorId("trackingUrl")}>{errors.trackingUrl}</span>
            )}
          </label>
        )}
      </div>
      {formError && <p className="field-error" role="alert">{formError}</p>}
      <div className="shipment-actions">
        {editing && (
          <button type="button" className="btn btn-line" onClick={onCancel} disabled={locked}>
            {t("admin.shipments.cancelEdit")}
          </button>
        )}
        <button type="submit" className="btn btn-gold" disabled={locked} aria-busy={busy}>
          <Icon name={editing ? "check" : "truck"} size={18} />
          {t(busy ? "admin.shipments.saving" : editing ? "admin.shipments.saveChanges" : "admin.shipments.markShipped")}
        </button>
      </div>
    </form>
  );
}
