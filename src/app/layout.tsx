import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/config/site";
import { inter, rajdhani } from "@/fonts/fonts";
import { organizationJsonLd } from "@/lib/seo";
import "./globals.css";

const ogImage = {
  url: "/og/traicer-og.png",
  width: 1200,
  height: 630,
  alt: site.tagline,
} as const;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  applicationName: site.name,
  title: {
    default: "TrAIcer — AI-powered shot tracing",
    template: "%s — TrAIcer",
  },
  description: site.description,
  authors: [{ name: site.publisher }],
  creator: site.publisher,
  publisher: site.publisher,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: site.url,
    siteName: site.name,
    title: "TrAIcer — AI-powered shot tracing",
    description: site.description,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrAIcer — AI-powered shot tracing",
    description: site.description,
    images: [ogImage.url],
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: "/brand/logos/favicon.ico" },
      { url: "/brand/logos/traicer-icon-light-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/logos/traicer-icon-light-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/brand/logos/traicer-icon-light-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${rajdhani.variable} ${inter.variable}`}>
      <body>
        <JsonLd data={organizationJsonLd} />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
