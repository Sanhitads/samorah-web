/**
 * Microsoft Clarity provider (review point 17) — heatmaps, session recordings, rage/dead
 * clicks, scroll depth. Clarity auto-captures sessions once loaded; we additionally tag
 * key funnel milestones (custom events) + set a couple of dimensions so recordings are
 * filterable. No PII is ever passed (review point 10).
 */
import { analyticsConfig, analyticsDebug, hasClarity } from "./config";
import type { AnalyticsProvider, AnalyticsEvent, EventParams } from "./types";

type Clarity = (...args: unknown[]) => void;
function clarityFn(): Clarity | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { clarity?: Clarity }).clarity;
}

// Milestones worth tagging in a recording so you can filter to sessions that converted.
const TAGGED: ReadonlySet<AnalyticsEvent> = new Set<AnalyticsEvent>([
  "add_to_cart", "begin_checkout", "purchase", "payment_failed", "search", "add_to_wishlist",
]);

export const clarity: AnalyticsProvider = {
  name: "clarity",
  get enabled() {
    return hasClarity();
  },
  pageView() {
    // Clarity tracks navigation on its own — nothing to fire per route.
  },
  event(name: AnalyticsEvent, _params: EventParams) {
    if (!TAGGED.has(name)) return;
    const c = clarityFn();
    if (!c) return;
    c("event", name);
    if (analyticsDebug) console.debug("[clarity]", name);
  },
};

/** The inline Clarity loader snippet (injected once, after consent). */
export function clarityInitScript(): string {
  const id = analyticsConfig.clarityId;
  return `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`;
}
