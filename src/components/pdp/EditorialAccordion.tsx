"use client";

import { useState } from "react";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { EditorialAccordionSettings } from "@/lib/productEditorial";

/**
 * EditorialAccordion (block, client) — collapsed details (Care · Shipping ·
 * Ingredients). A single quiet column, one panel open at a time. Reusable for
 * any product's fine print.
 */
export function EditorialAccordion({ settings }: SectionComponentProps) {
  const s = settings as unknown as EditorialAccordionSettings;
  const [open, setOpen] = useState<number | null>(null);
  if (!s.items?.length) return null;

  return (
    <div className="eaccordion">
      {s.items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.title} className="eaccordion__item" data-open={isOpen}>
            <button
              type="button"
              className="eaccordion__header"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.title}</span>
              <span className="eaccordion__icon" aria-hidden="true" />
            </button>
            <div className="eaccordion__panel">
              <p className="eaccordion__text">{item.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
