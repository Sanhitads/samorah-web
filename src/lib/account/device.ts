/**
 * Stable per-device id (review point 2). Generated once and kept in localStorage, so a
 * browser is recognisable across sessions for the device/sessions list. Not a security
 * token — purely for "this device" labelling + last-active tracking.
 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem("samorah_device");
    if (!id) { id = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)); localStorage.setItem("samorah_device", id); }
    return id;
  } catch { return "unknown"; }
}
