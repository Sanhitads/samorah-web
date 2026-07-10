import type { Metadata } from "next";
import { PageBuilderScreen } from "@/components/admin/PageBuilderScreen";

export const metadata: Metadata = { title: "Journal", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function JournalBuilderPage() {
  return <PageBuilderScreen pageKey="journal" />;
}
