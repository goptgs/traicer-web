import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export const dynamic = "force-static";

const paths = ["", "/pricing", "/help", "/skill"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: `${site.url}${path}`,
    lastModified: site.updated,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
