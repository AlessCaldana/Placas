// Datos de contacto. El número es un PLACEHOLDER hasta que el propietario lo configure
// (Etapa 9: Impostazioni). Se puede fijar ya con NEXT_PUBLIC_WHATSAPP_NUMBER.
export const site = {
  name: "PLACA",
  tagline: "Decorative Italiane",
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "390000000000",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
};

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${site.whatsappNumber}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
