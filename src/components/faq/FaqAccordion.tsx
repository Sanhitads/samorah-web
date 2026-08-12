"use client";

import { useEffect, useState } from "react";
import { groupBody } from "@/lib/cms/pageContent";

export interface FaqCategory { category: string; items: { q: string; a: string }[] }

const STORAGE_KEY = "samorah:faq-open";

/**
 * Minimal editorial FAQ accordion — one question open at a time, ARIA disclosure pattern
 * (button `aria-expanded` + `aria-controls`; panel `aria-labelledby`), keyboard accessible
 * (native <button>), subtle grid-rows height animation, +/− only. The open question is
 * remembered in sessionStorage so it survives navigation within a session.
 */
export function FaqAccordion({ categories }: { categories: FaqCategory[] }) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try { const s = sessionStorage.getItem(STORAGE_KEY); if (s) setOpen(s); } catch { /* private mode */ }
  }, []);

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = cur === id ? null : id;
      try { next ? sessionStorage.setItem(STORAGE_KEY, next) : sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return next;
    });

  return (
    <div className="faq">
      {categories.map((cat, ci) => (
        <section key={ci} className="faq__cat" aria-labelledby={`faq-cat-${ci}`}>
          <h2 id={`faq-cat-${ci}`} className="faq__cat-title">{cat.category}</h2>
          <ul className="faq__list">
            {cat.items.map((it, qi) => {
              const id = `faq-${ci}-${qi}`;
              const isOpen = open === id;
              return (
                <li key={qi} className="faq__item">
                  <h3 className="faq__q-h">
                    <button
                      type="button"
                      className="faq__q"
                      id={`${id}-q`}
                      aria-expanded={isOpen}
                      aria-controls={`${id}-a`}
                      onClick={() => toggle(id)}
                    >
                      <span className="faq__q-text">{it.q}</span>
                      <span className="faq__icon" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                    </button>
                  </h3>
                  <div
                    id={`${id}-a`}
                    role="region"
                    aria-labelledby={`${id}-q`}
                    aria-hidden={!isOpen}
                    className="faq__a"
                    data-open={isOpen ? "1" : "0"}
                  >
                    <div className="faq__a-inner">
                      {groupBody(it.a.split("\n")).map((block, j) =>
                        block.type === "list" ? (
                          <ul key={j} className="legal__list">
                            {block.items.map((x, k) => <li key={k} className="legal__list-item">{x}</li>)}
                          </ul>
                        ) : (
                          <p key={j} className="legal__p">{block.text}</p>
                        ),
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
