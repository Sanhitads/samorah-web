import type { Metadata } from "next";
import { PageBuilderScreen } from "@/components/admin/PageBuilderScreen";

export const metadata: Metadata = { title: "Homepage", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function HomepageBuilderPage() {
  return <PageBuilderScreen pageKey="homepage" />;
}
