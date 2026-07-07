"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { INDIAN_STATES } from "@/config/commerce";

/**
 * StateSelect — a searchable combobox over the 28 states + 8 UTs. Type to filter,
 * click (or Enter) to choose; Escape / outside-click closes. Editorial styling
 * matches the checkout fields (hairline underline, serif value). Falls back to a
 * plain read of `value` when closed so it reads like the other fields.
 */
export function StateSelect({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (state: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? INDIAN_STATES.filter((s) => s.toLowerCase().includes(q)) : [...INDIAN_STATES];
  }, [query]);

  const choose = (s: string) => {
    onChange(s);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="state-select" ref={ref}>
      <input
        className="checkout-field__input state-select__input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Search state…"
        value={open ? query : value}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && filtered[active]) {
            e.preventDefault();
            choose(filtered[active]);
          }
        }}
      />
      {open ? (
        <ul className="state-select__list" role="listbox">
          {filtered.length ? (
            filtered.map((s, i) => (
              <li key={s} role="option" aria-selected={s === value}>
                <button
                  type="button"
                  className="state-select__option"
                  data-active={i === active}
                  data-selected={s === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus; choose before blur
                    choose(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))
          ) : (
            <li className="state-select__empty">No match</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
