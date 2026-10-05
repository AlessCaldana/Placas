import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/messages";

export async function getLocalePreference(): Promise<Locale | null> {
  const store = await cookies();
  const value = store.get("placa_locale")?.value;
  return isLocale(value) ? value : null;
}

export async function getRequestLocale(): Promise<Locale> {
  return (await getLocalePreference()) ?? "it";
}
