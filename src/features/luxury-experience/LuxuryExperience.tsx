"use client";

import { useEffect, useRef, useState } from "react";
import { resolveExperienceConfig } from "./engine/config";
import { detectMotionTier } from "./engine/capability";
import { reportExperience } from "./engine/reporting";
import { ExperienceBoundary } from "./engine/ExperienceBoundary";
import { INTRO_TOTAL_MS, REDUCED_TOTAL_MS } from "./engine/motion.tokens";
import { IntroExperience } from "./experiences/intro/IntroExperience";
import { shouldPlayIntro, markIntroSeen, INTRO_STORAGE_KEY } from "./experiences/intro/useIntroGate";

const config = resolveExperienceConfig();

/**
 * Pre-paint gate (runs before hydration). Hides the overlay for returning visitors and marks the
 * reduced tier for reduced-motion / low-power devices, BEFORE first paint — so there is no flash.
 * React still renders the overlay deterministically, so there is no hydration mismatch either.
 */
const PRE_PAINT = `(function(){try{
var K=${JSON.stringify(INTRO_STORAGE_KEY)},V=${JSON.stringify(config.version)},R=${config.replayAfterDays == null ? "null" : config.replayAfterDays};
var play=true,s=localStorage.getItem(K);
if(s){try{var o=JSON.parse(s);if(o.v===V){if(R==null)play=false;else if(Date.now()-(o.t||0)<R*864e5)play=false;}}catch(e){}}
var e=document.documentElement;
if(!play){e.setAttribute('data-lux-skip','1');return;}
try{if(matchMedia('(prefers-reduced-motion: reduce)').matches||(navigator.hardwareConcurrency||8)<=2||(navigator.deviceMemory||8)<=1)e.setAttribute('data-lux-tier','reduced');}catch(x){}
}catch(e){}})();`;

/**
 * The single mounted component. Lifecycle: render deterministically (overlay) → gate on the client →
 * play (or dismiss) → report → unmount. Everything cleans up on unmount. If disabled (config flag or
 * env kill switch) it renders nothing at all.
 */
export function LuxuryExperience() {
  const [mounted, setMounted] = useState(true); // deterministic server + first client render → no mismatch
  const timers = useRef<number[]>([]);
  const done = useRef(false);

  useEffect(() => {
    if (!config.enabled) return void setMounted(false);
    if (!shouldPlayIntro(config)) return void setMounted(false);
    const tier = detectMotionTier();
    if (tier === "off") return void setMounted(false);

    reportExperience("viewed", { tier });
    markIntroSeen(config);

    const dismiss = (phase: "completed" | "skipped") => {
      if (done.current) return;
      done.current = true;
      reportExperience(phase);
      setMounted(false);
    };

    const duration = tier === "reduced" ? REDUCED_TOTAL_MS : INTRO_TOTAL_MS;
    timers.current.push(window.setTimeout(() => dismiss("completed"), duration + 80));
    timers.current.push(window.setTimeout(() => dismiss("completed"), config.failsafeMs)); // hard failsafe

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss("skipped"); };
    window.addEventListener("keydown", onKey);

    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
      window.removeEventListener("keydown", onKey);
      const el = document.documentElement;
      el.removeAttribute("data-lux-skip");
      el.removeAttribute("data-lux-tier");
    };
  }, []);

  // Disabled (config or env kill switch) → nothing, on both server and client (deterministic).
  if (!config.enabled || !mounted) return null;

  const skip = () => {
    if (done.current) return;
    done.current = true;
    reportExperience("skipped");
    setMounted(false);
  };

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      <ExperienceBoundary onError={() => setMounted(false)}>
        <IntroExperience text={config.brandMark.text} onSkip={skip} />
      </ExperienceBoundary>
    </>
  );
}
