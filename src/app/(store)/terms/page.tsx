import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/config/legalContent";

const content = LEGAL["terms"];
export const metadata: Metadata = { title: content.title, description: content.intro };

export default function Page() {
  return <LegalPage {...content} />;
}
