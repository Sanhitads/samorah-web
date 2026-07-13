import { NextResponse } from "next/server";
import { getSessionUser, updateProfile } from "@/services/accountService";

/** POST /api/account/profile { fullName?, marketingConsent? } — edit own profile. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  return NextResponse.json(await updateProfile(user.id, { fullName: body.fullName, marketingConsent: body.marketingConsent }));
}
