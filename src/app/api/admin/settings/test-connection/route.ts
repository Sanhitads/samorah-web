import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getSettlementSummary } from "@/services/razorpaySettlementService";
import { connectionResult, outcomeFromSettlement, type ConnectionOutcome } from "@/lib/settings/connectionTest";

/**
 * POST /api/admin/settings/test-connection?provider=razorpay — a READ-ONLY provider connection test (S2B).
 * Reuses the existing `razorpaySettlementService` (a GET to the Razorpay Settlements API) — no payment/order
 * creation, no settlement mutation, no webhook trigger, no customer data, no side effects. Result is mapped
 * to the frozen S1A severity + diagnostic-code + recommended-action model. Time-bounded → "timeout".
 * S2B is Razorpay only; email test-send is intentionally deferred.
 */
export const runtime = "nodejs";
const TIMEOUT_MS = 6000;

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const provider = new URL(request.url).searchParams.get("provider");
  if (provider !== "razorpay") return NextResponse.json({ error: "Only the Razorpay connection test is available in S2B." }, { status: 400 });

  const timeout = new Promise<ConnectionOutcome>((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS));
  let outcome: ConnectionOutcome;
  try {
    outcome = await Promise.race([getSettlementSummary().then(outcomeFromSettlement), timeout]);
  } catch {
    outcome = "unavailable";
  }
  return NextResponse.json(connectionResult(outcome));
}
