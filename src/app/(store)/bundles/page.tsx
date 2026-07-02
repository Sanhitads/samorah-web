import type { Metadata } from "next";
import { getBundleCandles } from "@/services/bundleService";
import { BundleBuilder } from "@/components/bundle/BundleBuilder";

/**
 * Bundle builder — `/bundle`. "Build Your Collection": pick any three candles
 * and save 15%. Server-fetches the eligible candles (real variants → real
 * prices) and hands them to the client composer. ISR so the catalogue stays
 * fresh; the composition + cart wiring is client-side.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Build Your Collection", // layout applies the "· Samorah" template
  description:
    "Compose a set of three candles and save 15% — a curated atmosphere, as personal as the rooms you live in.",
  openGraph: {
    title: "Build Your Collection · Samorah",
    description: "Choose any three candles and save 15% on your signature set.",
    type: "website",
  },
};

export default async function BundleRoute() {
  let candles = [] as Awaited<ReturnType<typeof getBundleCandles>>;
  try {
    candles = await getBundleCandles();
  } catch {
    candles = [];
  }

  return (
    <main className="bundle" data-theme="warm-ivory">
      <header className="bundle-hero">
        <div className="bundle-hero__art img-fill grad-bundle" aria-hidden="true" />
        <div className="bundle-hero__scrim" aria-hidden="true" />
        <div className="bundle-hero__inner">
          <p className="bundle-hero__eyebrow">Curated Atmospheres</p>
          <h1 className="bundle-hero__title">
            Build Your
            <br />
            Collection
          </h1>
          <p className="bundle-hero__lede">
            Choose any three candles and save 15%. A composition as personal as the rooms you live in.
          </p>
        </div>
      </header>

      {candles.length >= 3 ? (
        <BundleBuilder candles={candles} />
      ) : (
        <p className="bundle-empty">
          Our candles are being restocked. Please check back soon to compose your set.
        </p>
      )}
    </main>
  );
}
