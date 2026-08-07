"use client";
import { Fragment } from "react";
import { BundleBuilder } from "@/components/bundle/BundleBuilder";
import { resolveTokens, type BundleConfig } from "@/lib/bundleConfig";
import type { BundleCandle } from "@/lib/bundle";
import type { BundleController } from "@/store/bundleController";

/**
 * BundlePageView — the ONE shared Bundle renderer used by BOTH the live /bundles route and the future
 * Admin preview. It is presentation-only: all copy comes from `config` (tokens resolved), the catalogue
 * from `candles`, and every commerce interaction from the injected `controller`. Live vs preview differ
 * ONLY by which controller is supplied — never by a second implementation.
 */
function Heading({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {l}
        </Fragment>
      ))}
    </>
  );
}

export function BundlePageView({
  config,
  candles,
  controller,
}: {
  config: BundleConfig;
  candles: BundleCandle[];
  controller: BundleController;
}) {
  return (
    <main className="bundle" data-theme="warm-ivory">
      <header className="bundle-hero">
        <div className="bundle-hero__art img-fill grad-bundle" aria-hidden="true" />
        <div className="bundle-hero__scrim" aria-hidden="true" />
        <div className="bundle-hero__inner">
          <p className="bundle-hero__eyebrow">{config.hero.eyebrow}</p>
          <h1 className="bundle-hero__title">
            <Heading text={config.hero.heading} />
          </h1>
          <p className="bundle-hero__lede">{resolveTokens(config.hero.body)}</p>
        </div>
      </header>

      <p className="bundle-discovery">
        {config.strip.map((s, i) => (
          <Fragment key={i}>
            {i > 0 ? (
              <span className="bundle-discovery__sep" aria-hidden="true">
                ·
              </span>
            ) : null}
            <span>{s}</span>
          </Fragment>
        ))}
      </p>

      {candles.length >= 3 ? (
        <BundleBuilder candles={candles} config={config} controller={controller} />
      ) : (
        <p className="bundle-empty">
          Our candles are being restocked. Please check back soon to compose your set.
        </p>
      )}
    </main>
  );
}
