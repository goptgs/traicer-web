import type { Metadata } from "next";
import { site } from "@/config/site";

const ogImage = {
  url: "/og/traicer-og.png",
  width: 1200,
  height: 630,
  alt: site.tagline,
} as const;

type PageMetaInput = {
  title: string;
  description: string;
  path: string;
  /** Use the title as written, without the site template. */
  absoluteTitle?: boolean;
  noindex?: boolean;
};

export function pageMeta({
  title,
  description,
  path,
  absoluteTitle = false,
  noindex = false,
}: PageMetaInput): Metadata {
  const url = path === "/" ? site.url : `${site.url}${path}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path === "/" ? site.url : path },
    robots: noindex
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: site.name,
      locale: site.locale,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
  };
}

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  url: site.url,
  logo: `${site.url}/brand/logos/traicer-icon-dark-180.png`,
  description: site.description,
  parentOrganization: {
    "@type": "Organization",
    name: site.publisher,
  },
};
