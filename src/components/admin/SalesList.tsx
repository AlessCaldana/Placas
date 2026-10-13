"use client";

import { useState, type KeyboardEvent } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { AdminOrder, AdminOrderBilling } from "@/lib/services/orders";

/** Order as sent from the server page: dates already turned into ISO strings. */
export type SalesOrder = Omit<AdminOrder, "paidAt"> & { paidAt: string | null };

type Filter = "all" | "invoice";

const FILTERS: Filter[] = ["all", "invoice"];
// A fixed time zone keeps server and browser rendering the same date.
const DATE_TIME_ZONE = "Europe/Rome";
const EMPTY = "—";

const tabId = (filter: Filter) => `sales-tab-${filter}`;

export function SalesList({ orders }: { orders: SalesOrder[] }) {
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState<Filter>("all");

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: DATE_TIME_ZONE,
  });
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const money = (cents: number) => currency.format(cents / 100);
  const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : EMPTY);
  const fill = (key: string, values: Record<string, string>) =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));

  const withInvoice = orders.filter((order) => order.invoiceRequested);
  const visible = filter === "invoice" ? withInvoice : orders;

  /** "eu_vat" gets a readable name; any other Stripe type is shown as its code. */
  const taxIdTypeLabel = (type: string) =>
    type === "eu_vat" ? t("admin.sales.taxIdEuVat") : type.toUpperCase();

  const taxIdText = (billing: AdminOrderBilling) => {
    if (!billing.taxId) return EMPTY;
    return billing.taxIdType ? `${billing.taxId} (${taxIdTypeLabel(billing.taxIdType)})` : billing.taxId;
  };

  /** Plain multi-line text to paste into the invoicing software. */
  const invoiceText = (order: SalesOrder, billing: AdminOrderBilling) =>
    [
      `${t("admin.sales.businessName")}: ${billing.businessName || EMPTY}`,
      `${t("admin.sales.taxIdShort")}: ${taxIdText(billing)}`,
      `${t("admin.sales.billingAddress")}: ${billing.address || EMPTY}`,
      `${t("admin.sales.email")}: ${order.customerEmail || EMPTY}`,
      `${t("admin.sales.orderNumber")}: ${order.orderNumber || EMPTY}`,
      `${t("admin.orders.date")}: ${formatDate(order.paidAt)}`,
      `${t("admin.sales.amount")}: ${money(order.totalCents)}`,
    ].join("\n");

  function selectFilter(next: Filter, moveFocus = false) {
    setFilter(next);
    if (moveFocus) requestAnimationFrame(() => document.getElementById(tabId(next))?.focus());
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = FILTERS.indexOf(filter);
    let next: Filter | null = null;
    if (event.key === "ArrowRight") next = FILTERS[(index + 1) % FILTERS.length];
    else if (event.key === "ArrowLeft") next = FILTERS[(index - 1 + FILTERS.length) % FILTERS.length];
    else if (event.key === "Home") next = FILTERS[0];
    else if (event.key === "End") next = FILTERS[FILTERS.length - 1];
    if (!next) return;
    event.preventDefault();
    selectFilter(next, true);
  }

  if (orders.length === 0) {
    return (
      <section className="admin-card">
        <p>{t("admin.orders.empty")}</p>
      </section>
    );
  }

  return (
    <>
      <p className="sales-invoice-note" role="note">{t("admin.sales.invoiceNote")}</p>

      <div className="shipment-tabs" role="tablist" aria-label={t("admin.sales.filterLabel")}>
        {FILTERS.map((item) => {
          const selected = filter === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              id={tabId(item)}
              aria-selected={selected}
              aria-controls="sales-panel"
              tabIndex={selected ? 0 : -1}
              className={selected ? "shipment-tab active" : "shipment-tab"}
              onClick={() => selectFilter(item)}
              onKeyDown={onTabKeyDown}
            >
              {item === "all"
                ? t("admin.sales.filterAll")
                : fill("admin.sales.filterInvoice", { n: String(withInvoice.length) })}
            </button>
          );
        })}
      </div>

      <section className="admin-card table-card" id="sales-panel" role="tabpanel" aria-labelledby={tabId(filter)}>
        {visible.length === 0 ? (
          <p className="sales-empty">{t("admin.sales.invoiceEmpty")}</p>
        ) : (
          <div className="table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.sales.order")}</th>
                  <th scope="col">{t("admin.orders.customer")}</th>
                  <th scope="col">{t("admin.orders.products")}</th>
                  <th scope="col">{t("admin.orders.shipping")}</th>
                  <th scope="col">{t("admin.orders.toReceive")}</th>
                  <th scope="col">{t("admin.orders.status")}</th>
                </tr>
              </thead>
              {visible.map((order) => (
                <tbody key={order.id} className={order.invoiceRequested ? "sales-order has-invoice" : "sales-order"}>
                  <tr>
                    <td data-label={t("admin.sales.order")}>
                      <b className="sales-order-number">{order.orderNumber || EMPTY}</b>
                      <br />
                      <small>{formatDate(order.paidAt)}</small>
                      {order.invoiceRequested && (
                        <>
                          <br />
                          <span className="status invoice">{t("admin.sales.invoiceRequested")}</span>
                        </>
                      )}
                    </td>
                    <td data-label={t("admin.orders.customer")} className="sales-customer">
                      <b>{order.customerName || EMPTY}</b>
                      <br />
                      <small>{order.customerEmail}</small>
                      {order.customerPhone && (
                        <>
                          <br />
                          <small>
                            {t("admin.sales.phone")} <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>
                          </small>
                        </>
                      )}
                      <br />
                      <small>{order.address}</small>
                    </td>
                    <td data-label={t("admin.orders.products")}>
                      {order.items.map((item) => (
                        <div key={item.referenceCode}>
                          {item.quantity} × {item.name} <small>({item.referenceCode})</small>
                        </div>
                      ))}
                    </td>
                    <td data-label={t("admin.orders.shipping")}>{money(order.shippingCents)}</td>
                    <td data-label={t("admin.orders.toReceive")}>
                      <b>{money(order.productsCents + order.shippingCents)}</b>
                    </td>
                    <td data-label={t("admin.orders.status")}>
                      <span className={`status ${order.status === "PAID" ? "published" : "unavailable"}`}>
                        {t(order.status === "PAID" ? "admin.orders.paid" : "admin.orders.needsReview")}
                      </span>
                      {order.reviewReason && (
                        <>
                          <br />
                          <small>{order.reviewReason}</small>
                        </>
                      )}
                    </td>
                  </tr>
                  {order.invoiceRequested && order.billing && (
                    <tr className="sales-billing-row">
                      <td colSpan={6}>
                        <section
                          className="sales-billing"
                          aria-label={fill("admin.sales.billingFor", { order: order.orderNumber || EMPTY })}
                        >
                          <h3>{t("admin.sales.billingTitle")}</h3>
                          <dl>
                            <div>
                              <dt>{t("admin.sales.businessName")}</dt>
                              <dd>{order.billing.businessName || EMPTY}</dd>
                            </div>
                            <div>
                              <dt>{t("admin.sales.taxId")}</dt>
                              <dd>{taxIdText(order.billing)}</dd>
                            </div>
                            <div>
                              <dt>{t("admin.sales.billingAddress")}</dt>
                              <dd>{order.billing.address || EMPTY}</dd>
                            </div>
                          </dl>
                          <CopyButton
                            text={invoiceText(order, order.billing)}
                            label={t("admin.sales.copyInvoice")}
                            className="btn btn-dark copy-button"
                          />
                        </section>
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>
    </>
  );
}
