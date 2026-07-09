"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { BoardPriority } from "@/services/fulfillmentService";

/** Shared POST → /context helper: fires, then refreshes the RSC tree. */
function useContextPost() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/fulfillment/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };
  return { post, disabled: busy || pending };
}

/** Close a popover when clicking outside it. */
function useOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return ref;
}

const PRIORITY_LABEL: Record<BoardPriority, string> = { normal: "Normal", high: "High", urgent: "Urgent", vip: "VIP" };
const PRIORITIES: BoardPriority[] = ["normal", "high", "urgent", "vip"];

export function PriorityControl({ orderNumber, priority }: { orderNumber: string; priority: BoardPriority }) {
  const { post, disabled } = useContextPost();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div className="bc-pop" ref={ref}>
      <button type="button" className="bc-prio" data-p={priority} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {PRIORITY_LABEL[priority]}
      </button>
      {open ? (
        <div className="bc-menu">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className="bc-menu__item"
              disabled={disabled}
              onClick={() => { post({ orderNumber, priority: p }); setOpen(false); }}
            >
              <span className="bc-prio" data-p={p}>{PRIORITY_LABEL[p]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AssigneeControl({ orderNumber, assigneeName }: { orderNumber: string; assigneeName: string | null }) {
  const { post, disabled } = useContextPost();
  if (assigneeName) {
    return (
      <span className="bc-owner">
        <span className="bc-owner__name" title={assigneeName}>{assigneeName}</span>
        <button type="button" className="bc-owner__clear" disabled={disabled} title="Unassign" onClick={() => post({ orderNumber, clearAssignee: true })}>×</button>
      </span>
    );
  }
  return (
    <button type="button" className="bc-assign" disabled={disabled} onClick={() => post({ orderNumber, assignToMe: true })}>
      Assign to me
    </button>
  );
}

const DERIVED = new Set(["Gift", "COD"]); // auto tags — not operator-editable
const OPS_PRESET = ["Fragile", "Express", "Replacement", "Wholesale"];

export function TagsControl({ orderNumber, tags }: { orderNumber: string; tags: string[] }) {
  const { post, disabled } = useContextPost();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(() => setOpen(false));
  const opsActive = tags.filter((t) => !DERIVED.has(t));
  const toggle = (t: string) => {
    const next = opsActive.includes(t) ? opsActive.filter((x) => x !== t) : [...opsActive, t];
    post({ orderNumber, tags: next });
  };
  return (
    <span className="bc-tags" ref={ref}>
      {tags.map((t) => (
        <span key={t} className="bc-tag" data-derived={DERIVED.has(t) ? "1" : "0"}>{t}</span>
      ))}
      <button type="button" className="bc-tag-add" disabled={disabled} title="Edit tags" onClick={() => setOpen((o) => !o)}>＋</button>
      {open ? (
        <div className="bc-menu bc-menu--tags">
          {OPS_PRESET.map((t) => (
            <button key={t} type="button" className="bc-menu__item" disabled={disabled} onClick={() => toggle(t)}>
              <span className="bc-check">{opsActive.includes(t) ? "✓" : ""}</span> {t}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
