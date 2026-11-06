import type { MetadataRoute } from "next";
import { productionUrl, setupPaths } from "./site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...Object.values(setupPaths)].map((path) => ({
    url: new URL(path, productionUrl).href,
  }));
}
