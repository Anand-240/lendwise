import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/screen", "/apply", "/status", "/how-it-works", "/results", "/about", "/faq", "/contact", "/privacy", "/terms"];
  return routes.map((r) => ({
    url: `${SITE_URL}${r}`,
    lastModified: new Date(),
    changeFrequency: r === "" ? "weekly" : "monthly",
    priority: r === "" ? 1 : r === "/screen" ? 0.9 : 0.6,
  }));
}
