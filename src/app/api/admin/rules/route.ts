import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { createRule, updateRule, toggleRule, deleteRule, testRules, type RuleInput } from "@/services/rulesAdminService";

/**
 * POST /api/admin/rules { action, ... } — business rules CRUD + dry-run.
 * Config action → rules.manage. action ∈ create|update|toggle|delete|test.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("rules.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the rules.manage capability." }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const actor = staff.userId ?? undefined;
  try {
    switch (body.action) {
      case "create":
        return NextResponse.json(await createRule(body.rule as RuleInput, actor));
      case "update":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await updateRule(body.id, body.rule as RuleInput, actor));
      case "toggle":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await toggleRule(body.id, Boolean(body.active), actor));
      case "delete":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await deleteRule(body.id, actor));
      case "test":
        return NextResponse.json({ ok: true, results: await testRules(body.context ?? {}) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
