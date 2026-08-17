/**
 * Ambient Lighting Engine — Light Source model (Phase 3.0, architecture only; no runtime behavior).
 *
 * A LightSource is the generic authority for a light: WHERE it originates, how bright, what colour — and
 * (per the Light Source Ownership Contract) WHETHER it exists at all. The renderer consumes any LightSource
 * and never knows which. Flame is ONE implementation among Static / Campaign / Custom; none are instantiated
 * or given behaviour in Phase 3.0 — these are the typed shapes only.
 *
 * Light Source Ownership Contract: the source is the sole authority for existence. If `isAvailable()` is
 * false, the renderer disappears gracefully. Drivers only MODULATE an existing source; they never create a
 * light, and never keep rendering once the source is unavailable.
 */
export interface LightSource {
  /** Discriminant for the source implementation. */
  readonly kind: string;
  /** The sole authority for whether the light exists (Light Source Ownership Contract). */
  isAvailable(): boolean;
  /** Origin in the light's coordinate space (container-relative CSS %). */
  getPosition(): { x: string; y: string };
  /** Base intensity 0–1. */
  getIntensity(): number;
  /** Warm-light colour (token / CSS var). */
  getColor(): string;
}

/** A fixed, hand-placed source (constant position/intensity/colour). */
export interface StaticLightSource extends LightSource {
  readonly kind: "static";
}

/** The canonical source — light originates from the flame; available only while the flame is lit. */
export interface FlameLightSource extends LightSource {
  readonly kind: "flame";
}

/** A campaign / CMS-driven source (position/intensity/colour from a campaign profile). */
export interface CampaignLightSource extends LightSource {
  readonly kind: "campaign";
}

/** An experience-defined source (arbitrary rules owned by the experience). */
export interface CustomLightSource extends LightSource {
  readonly kind: "custom";
}

/** Any concrete source. */
export type AnyLightSource = StaticLightSource | FlameLightSource | CampaignLightSource | CustomLightSource;
