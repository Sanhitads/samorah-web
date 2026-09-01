"use client";

import { useState } from "react";
import { DeviceSessions } from "./DeviceSessions";

/** Tabbed security panel — "Devices" (active devices + sign-out-others) and "Recent sign-ins"
 *  (login history) share one card instead of stacking, so a long history never pushes the
 *  device controls off-screen. Purely presentational; the actual actions live in DeviceSessions. */
type Login = { browser: string | null; device: string | null; provider?: string | null; country?: string | null; createdAt: string };
type Device = { deviceId: string; label: string | null; lastActiveAt: string };

const PROVIDER_LABEL: Record<string, string> = { google: "Google", email: "Email" };
const ago = (v: string) => { const d = (Date.now() - new Date(v).getTime()) / 86400000; return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)} days ago`; };

export function SessionsTabs({ devices, logins }: { devices: Device[]; logins: Login[] }) {
  const [tab, setTab] = useState<"devices" | "signins">("devices");
  return (
    <div className="acc-tabs">
      <div className="acc-tabs__bar" role="tablist" aria-label="Devices and sign-ins">
        <button type="button" role="tab" aria-selected={tab === "devices"} className={`acc-tab${tab === "devices" ? " acc-tab--on" : ""}`} onClick={() => setTab("devices")}>
          Devices{devices.length ? ` (${devices.length})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "signins"} className={`acc-tab${tab === "signins" ? " acc-tab--on" : ""}`} onClick={() => setTab("signins")}>
          Recent sign-ins{logins.length ? ` (${logins.length})` : ""}
        </button>
      </div>

      <div className="acc-tabs__panel" role="tabpanel">
        {tab === "devices" ? (
          <DeviceSessions devices={devices} />
        ) : logins.length ? (
          <ul className="acc-sessions">
            {logins.map((l, i) => (
              <li key={i} className="acc-sessions__row">
                <span className="acc-sessions__dev">{l.browser ?? "Unknown browser"} · {l.device ?? "device"}</span>
                <span className="acc-sessions__meta">{PROVIDER_LABEL[l.provider ?? ""] ?? "email"}{l.country ? ` · ${l.country}` : ""}</span>
                <span className="acc-sessions__when">{ago(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="acc__note">No recent sign-ins recorded.</p>
        )}
      </div>
    </div>
  );
}
