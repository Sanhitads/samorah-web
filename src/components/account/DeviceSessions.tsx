"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/account/device";

/** Device/session controls (review point 2). "Sign out other devices" revokes every
 *  OTHER Supabase session (scope:'others'); this device stays signed in. */
export function DeviceSessions({ devices }: { devices: { deviceId: string; label: string | null; lastActiveAt: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const thisDevice = typeof window !== "undefined" ? getDeviceId() : "";
  const ago = (v: string) => { const d = (Date.now() - new Date(v).getTime()) / 86400000; return d < 1 ? "active today" : d < 2 ? "active yesterday" : `active ${Math.floor(d)} days ago`; };

  const signOutOthers = async () => {
    setBusy(true); setMsg("");
    try {
      await createClient().auth.signOut({ scope: "others" });
      await fetch("/api/account/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "logout" }) }).catch(() => {});
      setMsg("Signed out of all other devices."); router.refresh();
    } catch { setMsg("Couldn't sign out other devices."); }
    setBusy(false);
  };

  return (
    <div>
      {devices.length ? (
        <ul className="acc-sessions">
          {devices.map((d) => (
            <li key={d.deviceId} className="acc-sessions__row">
              <span className="acc-sessions__dev">{d.label ?? "Device"}{d.deviceId === thisDevice ? <span className="acc-badge acc-badge--ok">This device</span> : null}</span>
              <span className="acc-sessions__when">{ago(d.lastActiveAt)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="acc__note">No other devices recorded.</p>}
      <div style={{ marginTop: 12 }}>
        <button type="button" className="acc-btn" disabled={busy} onClick={signOutOthers}>Sign out other devices</button>
        {msg ? <span className="acc-msg acc-msg--ok" style={{ marginLeft: 10 }}>{msg}</span> : null}
      </div>
    </div>
  );
}
