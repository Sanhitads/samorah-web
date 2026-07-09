import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getMyAddresses } from "@/services/accountService";
import { AddressBook } from "@/components/account/AddressBook";

export const metadata: Metadata = { title: "Your Addresses", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountAddressesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/addresses");
  const addresses = await getMyAddresses(user.id);

  return (
    <main className="acc">
      <header className="acc__head">
        <p className="acc__eyebrow"><Link href="/account" className="text-link">← Account</Link></p>
        <h1 className="acc__title">Your addresses</h1>
      </header>
      <AddressBook addresses={addresses} />
    </main>
  );
}
