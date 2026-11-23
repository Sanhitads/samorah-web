"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface PdpVariantState {
  selectedVariantId: string | null;
  setSelectedVariantId: (id: string | null) => void;
}

const PdpVariantContext = createContext<PdpVariantState | null>(null);

/**
 * Shares the currently-selected variant between the two PDP client islands: the purchase panel WRITES it
 * on every vessel/size change, and the gallery READS it to swap to that vessel+size's photos. Wrapping is
 * optional — without a provider the hook returns an inert default, so the panel and gallery still render
 * standalone (the editor preview, unit tests) exactly as before.
 */
export function PdpVariantProvider({
  defaultVariantId,
  children,
}: {
  defaultVariantId: string | null;
  children: ReactNode;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId);
  const value = useMemo(() => ({ selectedVariantId, setSelectedVariantId }), [selectedVariantId]);
  return <PdpVariantContext.Provider value={value}>{children}</PdpVariantContext.Provider>;
}

const INERT: PdpVariantState = { selectedVariantId: null, setSelectedVariantId: () => {} };

/** Current PDP variant selection. Returns an inert default when no provider is present. */
export function usePdpVariant(): PdpVariantState {
  return useContext(PdpVariantContext) ?? INERT;
}
