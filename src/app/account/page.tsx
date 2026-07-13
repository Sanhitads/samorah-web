import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getMyOrders, getAccountProfile } from "@/services/accountService";
import { AccountSettings } from "@/components/account/AccountSettings";
import { DeviceSessions } from "@/components/account/DeviceSessions";

/** Account center — the customer's home. Middleware gates /account (auth). */
export const metadata: Metadata = { title: "Your Account", robots: { index: false } };
export const dynamic = "force-dynamic";

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const fmt = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const ago = (v: string) => { const d = (Date.now() - new Date(v).getTime()) / 86400000; return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)} days ago`; };
const PROVIDER_LABEL: Record<string, string> = { google: "Google", email: "Email" };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  const [profile, recent] = await Promise.all([getAccountProfile(user.id), getMyOrders(user.id, 3)]);
  const name = profile?.fullName || user.email.split("@")[0];
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const providerLabel = PROVIDER_LABEL[profile?.provider ?? ""] ?? "Email";

  return (
    <main className="acc">
      {/* Profile header */}
      <header className="acc__profile">
        <div className="acc__avatar">
          {profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : <span>{initials}</span>}
        </div>
        <div className="acc__profile-meta">
          <p className="acc__eyebrow">Your Account</p>
          <h1 className="acc__title">{name}</h1>
          <p className="acc__sub">
            {user.email}
            {profile?.emailVerified ? <span className="acc-badge acc-badge--ok">✓ Verified</span> : <span className="acc-badge acc-badge--warn">Verify email</span>}
            <span className="acc-badge">Signed in with {providerLabel}</span>
          </p>
          {profile?.lastLoginAt ? <p className="acc__note">Last sign-in {ago(profile.lastLoginAt)} · via {PROVIDER_LABEL[profile.lastLoginProvider ?? ""] ?? "email"}</p> : null}
        </div>
      </header>

      {/* Loyalty */}
      <section className="acc__loyalty">
        <div><span className="acc__loyalty-v">{profile?.loyaltyPoints ?? 0}</span><span className="acc__loyalty-l">Reward points</span></div>
        <div><span className="acc__loyalty-v" style={{ textTransform: "capitalize" }}>{profile?.loyaltyTier ?? "bronze"}</span><span className="acc__loyalty-l">Tier</span></div>
        <div><span className="acc__loyalty-v">{profile?.createdAt ? fmt(profile.createdAt) : "—"}</span><span className="acc__loyalty-l">Member since</span></div>
      </section>

      <nav className="acc__nav" aria-label="Account">
        <Link href="/account/orders" className="acc__card"><span className="acc__card-title">Orders</span><span className="acc__card-sub">Track & review past orders</span></Link>
        <Link href="/account/addresses" className="acc__card"><span className="acc__card-title">Addresses</span><span className="acc__card-sub">Manage delivery details</span></Link>
        <Link href="/wishlist" className="acc__card"><span className="acc__card-title">Wishlist</span><span className="acc__card-sub">Saved fragrances</span></Link>
      </nav>

      {/* Recent orders */}
      <section className="acc__section">
        <div className="acc__section-head">
          <h2 className="acc__section-title">Recent orders</h2>
          {recent.length ? <Link href="/account/orders" className="text-link">View all</Link> : null}
        </div>
        {recent.length ? (
          <ul className="acc__orders">
            {recent.map((o) => (
              <li key={o.orderNumber}>
                <Link href={`/account/orders/${o.orderNumber}`} className="acc__order">
                  <span className="acc__order-no">{o.orderNumber}</span>
                  <span className="acc__order-meta">{fmt(o.placedAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}</span>
                  <span className="acc__order-status" data-s={o.status}>{o.status}</span>
                  <span className="acc__order-total">{money(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="acc__empty">No orders yet. <Link href="/shop" className="text-link">Begin with the collection →</Link></p>}
      </section>

      {/* Profile & preferences */}
      <section className="acc__section">
        <div className="acc__section-head"><h2 className="acc__section-title">Profile & preferences</h2></div>
        <AccountSettings initialName={profile?.fullName ?? ""} initialConsent={profile?.marketingConsent ?? false} />
      </section>

      {/* Connected accounts */}
      <section className="acc__section">
        <div className="acc__section-head"><h2 className="acc__section-title">Connected accounts</h2></div>
        <div className="acc-connected">
          {["google", "email"].map((p) => {
            const linked = profile?.providers?.includes(p);
            return (
              <div key={p} className="acc-connected__row">
                <span>{PROVIDER_LABEL[p] ?? p}</span>
                {linked ? <span className="acc-badge acc-badge--ok">Connected</span> : <span className="acc-badge">Not linked</span>}
              </div>
            );
          })}
          {profile?.providers?.includes("email") ? <div className="acc-connected__row"><span>Password</span><Link href="/account/update-password" className="text-link">Change password</Link></div> : null}
        </div>
      </section>

      {/* Devices & sessions */}
      <section className="acc__section">
        <div className="acc__section-head"><h2 className="acc__section-title">Devices & sessions</h2></div>
        <DeviceSessions devices={profile?.devices ?? []} />
        {profile?.logins?.length ? (
          <>
            <p className="acc__note" style={{ marginTop: 16 }}>Recent sign-ins</p>
            <ul className="acc-sessions">
              {profile.logins.map((l, i) => (
                <li key={i} className="acc-sessions__row">
                  <span className="acc-sessions__dev">{l.browser} · {l.device}</span>
                  <span className="acc-sessions__meta">{PROVIDER_LABEL[l.provider ?? ""] ?? "email"}{l.country ? ` · ${l.country}` : ""}</span>
                  <span className="acc-sessions__when">{ago(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </main>
  );
}
