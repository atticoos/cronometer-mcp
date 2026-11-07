import type { MetadataRoute } from "next";
import { privacyPath, productionUrl, setupPaths } from "./site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...Object.values(setupPaths), privacyPath].map((path) => ({
    url: new URL(path, productionUrl).href,
  }));
}
