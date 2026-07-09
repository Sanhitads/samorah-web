import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  createAsset, updateAsset, deleteAsset, adjustStock,
  createProfile, updateProfile, deleteProfile,
  createPkgRule, updatePkgRule, togglePkgRule, deletePkgRule,
  type AssetInput, type ProfileInput, type PkgRuleInput,
} from "@/services/packagingService";

/**
 * POST /api/admin/packaging { action, ... } — packaging CRUD (assets · profiles ·
 * rules · stock). Logistics config → shipping.configure. Actions:
 * asset.{create,update,delete,adjust} · profile.{create,update,delete} · rule.{create,update,toggle,delete}
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("shipping.configure");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the shipping.configure capability." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const a = staff.userId ?? undefined;
  const needId = () => { if (!body.id) throw new Error("id required"); return body.id as string; };

  try {
    switch (body.action) {
      case "asset.create": return NextResponse.json(await createAsset(body.asset as AssetInput, a));
      case "asset.update": return NextResponse.json(await updateAsset(needId(), body.asset as AssetInput, a));
      case "asset.delete": return NextResponse.json(await deleteAsset(needId(), a));
      case "asset.adjust": return NextResponse.json(await adjustStock(needId(), Number(body.delta), body.reason, a));
      case "profile.create": return NextResponse.json(await createProfile(body.profile as ProfileInput, a));
      case "profile.update": return NextResponse.json(await updateProfile(needId(), body.profile as ProfileInput, a));
      case "profile.delete": return NextResponse.json(await deleteProfile(needId(), a));
      case "rule.create": return NextResponse.json(await createPkgRule(body.rule as PkgRuleInput, a));
      case "rule.update": return NextResponse.json(await updatePkgRule(needId(), body.rule as PkgRuleInput, a));
      case "rule.toggle": return NextResponse.json(await togglePkgRule(needId(), Boolean(body.active), a));
      case "rule.delete": return NextResponse.json(await deletePkgRule(needId(), a));
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
