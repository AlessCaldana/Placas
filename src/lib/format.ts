const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export const eur = (value: number): string => euro.format(value);
export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
