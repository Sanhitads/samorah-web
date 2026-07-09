import { NextResponse } from "next/server";
import { getSessionUser, createAddress, updateAddress, deleteAddress, setDefaultAddress, type AddressInput } from "@/services/accountService";

/** POST /api/account/addresses { action, ... } — the caller's own address book.
 *  Auth required; every op is scoped to the session user (ownership enforced). */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "create": return NextResponse.json(await createAddress(user.id, body.address as AddressInput));
      case "update":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await updateAddress(user.id, body.id, body.address as AddressInput));
      case "delete":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await deleteAddress(user.id, body.id));
      case "setDefault":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await setDefaultAddress(user.id, body.id));
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
