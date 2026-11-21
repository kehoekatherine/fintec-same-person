import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import { themeBootScript } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: "Watchlist Screening Desk",
  description:
    "Watchlist Screening Desk compares each customer with a watchlist hit and shows closeness, bias, and confidence. Not a live watchlist and not a regulatory filing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Script id="theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
