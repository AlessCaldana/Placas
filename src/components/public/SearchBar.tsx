"use client";

import { Icon } from "@/components/ui/Icon";
import type { Locale } from "@/messages";
import { translate } from "@/messages";

export function SearchBar({
  locale,
  value,
  onChange,
  onSubmit,
}: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  /** Runs when the visitor presses Enter or the search button. */
  onSubmit?: () => void;
}) {
  return (
    <form
      className="search-bar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <Icon name="search" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={translate(locale, "search.placeholder")}
        aria-label={translate(locale, "search.label")}
      />
      <button type="submit">{translate(locale, "search.button")}</button>
    </form>
  );
}
