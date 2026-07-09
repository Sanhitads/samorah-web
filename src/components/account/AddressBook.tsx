"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Address } from "@/services/accountService";

type Form = { id?: string; fullName: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string; isDefault: boolean };
const blank: Form = { fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false };
const toForm = (a: Address): Form => ({ id: a.id, fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault });

export function AddressBook({ addresses }: { addresses: Address[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Form | null>(null);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/account/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return false; }
      startTransition(() => router.refresh());
      return true;
    } catch { setBusy(false); setErr("Network error"); return false; }
  };

  const save = async (f: Form) => {
    if (!f.fullName.trim() || !f.line1.trim() || !f.city.trim() || !f.state.trim() || !f.pincode.trim()) { setErr("Please complete the required fields."); return; }
    const address = { fullName: f.fullName, phone: f.phone, line1: f.line1, line2: f.line2 || undefined, city: f.city, state: f.state, pincode: f.pincode, isDefault: f.isDefault };
    if (await post(f.id ? { action: "update", id: f.id, address } : { action: "create", address })) setEdit(null);
  };

  return (
    <div className="acc-addr">
      <div className="acc-addr__top">
        <button type="button" className="btn btn-dark" onClick={() => { setErr(""); setEdit({ ...blank }); }}>Add address</button>
        {pending ? <span className="acc-addr__saving">saving…</span> : null}
        {err && !edit ? <span className="acc-addr__err">{err}</span> : null}
      </div>

      <ul className="acc-addr__list">
        {addresses.map((a) => (
          <li key={a.id} className="acc-addr__card">
            {a.isDefault ? <span className="acc-addr__default">Default</span> : null}
            <p className="acc-addr__name">{a.fullName}</p>
            <p className="acc-addr__lines">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
            <div className="acc-addr__ops">
              <button type="button" className="text-link" onClick={() => { setErr(""); setEdit(toForm(a)); }}>Edit</button>
              {!a.isDefault ? <button type="button" className="text-link" disabled={busy} onClick={() => post({ action: "setDefault", id: a.id })}>Set default</button> : null}
              <button type="button" className="text-link acc-addr__del" disabled={busy} onClick={() => post({ action: "delete", id: a.id })}>Remove</button>
            </div>
          </li>
        ))}
        {addresses.length === 0 ? <li className="acc__empty">No saved addresses yet.</li> : null}
      </ul>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.id ? "Edit address" : "Add address"}</h2>
            <label className="acc-field"><span>Full name</span><input value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></label>
            <label className="acc-field"><span>Phone</span><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <label className="acc-field"><span>Address line 1</span><input value={edit.line1} onChange={(e) => setEdit({ ...edit, line1: e.target.value })} /></label>
            <label className="acc-field"><span>Address line 2</span><input value={edit.line2} onChange={(e) => setEdit({ ...edit, line2: e.target.value })} /></label>
            <div className="acc-field-row">
              <label className="acc-field"><span>City</span><input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></label>
              <label className="acc-field"><span>State</span><input value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })} /></label>
              <label className="acc-field"><span>PIN</span><input value={edit.pincode} onChange={(e) => setEdit({ ...edit, pincode: e.target.value })} /></label>
            </div>
            <label className="acc-check"><input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} /><span>Set as default</span></label>
            {err ? <p className="acc-addr__err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn btn-dark" disabled={busy} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
