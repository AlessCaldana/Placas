// Datos de contacto. El número es un PLACEHOLDER hasta que el propietario lo configure
// (Etapa 9: Impostazioni). Se puede fijar ya con NEXT_PUBLIC_WHATSAPP_NUMBER.
export const site = {
  name: "PFdeco",
  tagline: "Decorative Italiane",
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "390000000000",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
};

export function whatsappLink(message?: string, whatsappNumber = site.whatsappNumber): string {
  const base = `https://wa.me/${whatsappNumber}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Pre-filled first message, so the shop knows why the visitor is writing. */
export function whatsappGreeting(
  t: (key: string) => string,
  shopName: string,
  product?: { name: string; referenceCode?: string },
): string {
  if (!product) return t("whatsapp.generalMessage").replace("{shop}", shopName);
  return t("whatsapp.productMessage")
    .replace("{shop}", shopName)
    .replace("{name}", product.name)
    .replace("{code}", product.referenceCode ?? "—");
}
