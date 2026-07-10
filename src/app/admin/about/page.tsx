import type { Metadata } from "next";
import { PageBuilderScreen } from "@/components/admin/PageBuilderScreen";

export const metadata: Metadata = { title: "About", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AboutBuilderPage() {
  return <PageBuilderScreen pageKey="about" />;
}
