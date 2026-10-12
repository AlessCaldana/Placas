"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useLocale } from "./LocaleProvider";

type CopyState = "idle" | "copied" | "failed";

const FEEDBACK_MS = 2500;

/** Copies without the Clipboard API (plain http on a local network, older browsers). */
function copyWithSelection(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context: try the selection fallback.
    }
  }
  return copyWithSelection(text);
}

/** Button that copies `text` and announces the result to screen readers. */
export function CopyButton({
  text,
  label,
  className = "btn btn-line copy-button",
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { t } = useLocale();
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  async function copy() {
    const copied = await copyText(text);
    setState(copied ? "copied" : "failed");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), FEEDBACK_MS);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void copy()} data-state={state}>
        <Icon name={state === "copied" ? "check" : "copy"} size={17} />
        {state === "copied" ? t("copy.copied") : state === "failed" ? t("copy.failed") : label}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? t("copy.copied") : state === "failed" ? t("copy.failed") : ""}
      </span>
    </>
  );
}
