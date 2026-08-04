"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackSelectItem } from "@/lib/analytics/events";

/**
 * Navigation link with CTR instrumentation (Phase 3 · analytics). A thin client island so a SERVER
 * component (e.g. Footer) can keep rendering while each link fires the canonical GA4 `select_item`
 * event via the existing consent-gated pipeline — item_id = the destination (stable across reorder),
 * so no per-item schema/identity is needed. Renders <a> for external links, next/link otherwise.
 */
export function TrackedNavLink({ list, itemName, href, external, className, rel, target, children }: {
  list: string; itemName: string; href: string; external?: boolean;
  className?: string; rel?: string; target?: string; children: ReactNode;
}) {
  const onClick = () => trackSelectItem(list, { item_id: href, item_name: itemName });
  return external ? (
    <a href={href} className={className} target={target ?? "_blank"} rel={rel ?? "noopener noreferrer"} onClick={onClick}>{children}</a>
  ) : (
    <Link href={href} className={className} rel={rel} target={target} onClick={onClick}>{children}</Link>
  );
}
