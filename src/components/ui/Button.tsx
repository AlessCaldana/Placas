import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Kind = "dark" | "light" | "line" | "gold";

export function ButtonLink({
  href,
  kind = "dark",
  icon,
  children,
}: {
  href: string;
  kind?: Kind;
  icon?: IconName;
  children: ReactNode;
}) {
  const className = `btn btn-${kind}`;
  const content = (
    <>
      {children}
      {icon && <Icon name={icon} size={18} />}
    </>
  );
  if (/^https?:/.test(href)) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return (
    <Link className={className} href={href}>
      {content}
    </Link>
  );
}
