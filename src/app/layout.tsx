import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import "@/styles/motion.css";
import "@/styles/product-card.css";
import "@/styles/chapter-sections.css";
import "@/styles/air-sections.css";
import "@/styles/product-page.css";
import "@/styles/pdp-editorial.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { buildThemeStylesheet } from "@/platform/themeStylesheet";

// Fonts from the prototype design system (BRD §4.3), loaded via next/font.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Samorah — Luxury Handmade Scented Candles",
    template: "%s · Samorah",
  },
  description:
    "Editorial luxury candles, handmade in India. Fragrance stories steeped in memory, ritual, and craft.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable}`}>
      <body>
        {/* Design-system theme tokens, generated from src/platform/theme.ts.
            React 19 hoists this <style> (precedence) into <head>. */}
        <style href="samorah-themes" precedence="high">
          {buildThemeStylesheet()}
        </style>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
